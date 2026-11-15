import { exportPub, genSigningKey, signObject } from './crypto';
import { randomId } from './encoding';
import type { StateService } from './state';
import type { DirectoryEntry, Grant, ObjectMeta, Operation, SignedGrant } from './types';

export interface GrantRequest {
  subject: string;
  claimedRole?: string;
  claimedTenant?: string;
  workload: string;
  objectId: string;
  fields?: string[];
  operation: Operation;
  purpose: string;
  recipient: string;
  sessionId: string;
  destination: string;
  stepUp?: { approvalId: string; verified: boolean };
}

export type GrantOutcome =
  | { ok: true; signed: SignedGrant }
  | { ok: false; reason: string; code: 'unauthenticated' | 'tenant' | 'denied' | 'purpose' | 'fields' | 'expired' | 'stepup' | 'canary' | 'unknown' };

export class Directory {
  private m = new Map<string, DirectoryEntry>();
  constructor(entries: DirectoryEntry[] = []) {
    entries.forEach((e) => this.m.set(e.id, e));
  }
  get(id: string) {
    return this.m.get(id);
  }
  upsert(e: DirectoryEntry) {
    this.m.set(e.id, e);
  }
  replace(entries: DirectoryEntry[]) {
    this.m.clear();
    entries.forEach((e) => this.m.set(e.id, e));
  }
  list() {
    return [...this.m.values()];
  }
}

export class GrantService {
  private keys!: CryptoKeyPair;
  publicKey = '';
  readonly ttlMs = 60_000;
  issued = 0;
  denied = 0;

  constructor(
    private directory: Directory,
    private state: StateService,
    private lookup: (objectId: string) => ObjectMeta | undefined,
    private now: () => number = Date.now,
  ) {}

  async init() {
    this.keys = await genSigningKey();
    this.publicKey = await exportPub(this.keys.publicKey);
    return this;
  }

  decide(req: GrantRequest, meta: ObjectMeta | undefined): GrantOutcome | { ok: true; meta: ObjectMeta; subject: DirectoryEntry; fields: string[] } {
    const subject = this.directory.get(req.subject);
    if (!subject || subject.disabled) return { ok: false, code: 'unauthenticated', reason: 'Chủ thể không có trong nguồn thuộc tính hoặc đã bị vô hiệu.' };
    if (subject.expiresAt && subject.expiresAt < this.now()) return { ok: false, code: 'expired', reason: 'Quyền theo ca của chủ thể đã hết hạn.' };
    if (!meta) return { ok: false, code: 'unknown', reason: 'Đối tượng không tồn tại trong két.' };
    if (meta.canary) return { ok: false, code: 'canary', reason: 'Đối tượng mồi (canary), mọi yêu cầu là tín hiệu nghi vấn.' };
    if (subject.tenant !== meta.tenant) return { ok: false, code: 'tenant', reason: `Không đọc chéo tenant (${subject.tenant} ≠ ${meta.tenant}).` };
    if (meta.expiresAt && meta.expiresAt < this.now()) return { ok: false, code: 'expired', reason: 'Quyền lưu giữ của đối tượng đã hết hạn.' };

    const fields = req.fields?.length ? req.fields : meta.fields;
    if (fields.some((f) => !meta.fields.includes(f))) return { ok: false, code: 'fields', reason: 'Yêu cầu trường ngoài phạm vi đối tượng.' };
    if (!meta.purposes.includes(req.purpose)) return { ok: false, code: 'purpose', reason: `Mục đích "${req.purpose}" chưa được người sở hữu cho phép (purpose tự khai không đủ tạo quyền).` };

    const isOwner = meta.owner === subject.id;
    switch (req.operation) {
      case 'read':
      case 'compute':
        if (!isOwner && !meta.viewers.includes(subject.id)) return { ok: false, code: 'denied', reason: 'Chủ thể không nằm trong danh sách người xem hiện hành.' };
        break;
      case 'write':
        if (!isOwner && subject.role !== 'admin') return { ok: false, code: 'denied', reason: 'Chỉ người sở hữu hoặc quản trị hộ được ghi.' };
        break;
      case 'export':
        if (!isOwner) return { ok: false, code: 'denied', reason: 'Xuất dữ liệu chỉ dành cho người sở hữu.' };
        if (!req.stepUp?.verified) return { ok: false, code: 'stepup', reason: 'Xuất nhạy cảm cần xác minh bổ sung bằng khóa phê duyệt trên thiết bị.' };
        break;
    }
    if (subject.role === 'child' && req.operation !== 'read') return { ok: false, code: 'denied', reason: 'Hồ sơ trẻ chỉ có quyền đọc theo cấu hình người giám hộ.' };
    return { ok: true, meta, subject, fields };
  }

  async issue(req: GrantRequest, budgetBytes: number): Promise<GrantOutcome> {
    const meta = this.lookup(req.objectId);
    const d = this.decide(req, meta);
    if (!d.ok) {
      this.denied++;
      return d;
    }
    if (!('meta' in d)) return d;
    const t = this.now();
    const grant: Grant = {
      v: 1,
      grantId: randomId('grant', 6),
      subject: d.subject.id,
      workload: req.workload,
      tenant: d.meta.tenant,
      objectId: d.meta.objectId,
      version: d.meta.version,
      fields: d.fields,
      operation: req.operation,
      purpose: req.purpose,
      recipient: req.recipient,
      sessionId: req.sessionId,
      destination: req.destination,
      issuedAt: t,
      expiresAt: t + this.ttlMs,
      nonce: randomId('jti', 12),
      budgetBytes: Math.ceil(budgetBytes),
      epoch: this.state.epoch(d.meta.tenant),
    };
    this.issued++;
    return { ok: true, signed: { grant, sig: await signObject(this.keys.privateKey, grant) } };
  }

  async issueForNewObject(req: GrantRequest, meta: ObjectMeta, budgetBytes: number): Promise<GrantOutcome> {
    const subject = this.directory.get(req.subject);
    if (!subject || subject.disabled) return { ok: false, code: 'unauthenticated', reason: 'Chủ thể không xác thực.' };
    if (subject.tenant !== meta.tenant) return { ok: false, code: 'tenant', reason: 'Không ghi chéo tenant.' };
    if (subject.role === 'child' || subject.role === 'carer') return { ok: false, code: 'denied', reason: 'Vai trò không có quyền tạo đối tượng được bảo vệ.' };
    if (meta.owner !== subject.id && subject.role !== 'admin') return { ok: false, code: 'denied', reason: 'Chỉ chủ sở hữu hoặc quản trị hộ.' };
    const t = this.now();
    const grant: Grant = {
      v: 1,
      grantId: randomId('grant', 6),
      subject: subject.id,
      workload: req.workload,
      tenant: meta.tenant,
      objectId: meta.objectId,
      version: meta.version,
      fields: meta.fields,
      operation: 'write',
      purpose: req.purpose,
      recipient: req.recipient,
      sessionId: req.sessionId,
      destination: req.destination,
      issuedAt: t,
      expiresAt: t + this.ttlMs,
      nonce: randomId('jti', 12),
      budgetBytes: Math.ceil(budgetBytes),
      epoch: this.state.epoch(meta.tenant),
    };
    this.issued++;
    return { ok: true, signed: { grant, sig: await signObject(this.keys.privateKey, grant) } };
  }
}
