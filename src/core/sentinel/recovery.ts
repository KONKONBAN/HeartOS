/**
 * B — Recovery Vault và quy trình phục hồi có kiểm soát (§3.11, §4.5, I6, I9, I10).
 *  - Checkpoint gồm bản sao ciphertext + manifest (đối tượng đã commit, phiên bản khóa, băm bản mã).
 *  - Khóa lưu giữ (retention): quyền vận hành không xóa được bản phục hồi (I6).
 *  - Rà soát trước phục hồi: 1) kiểm manifest, 2) cô lập tiến trình cũ + chứng thực môi trường mới,
 *    3) đưa vào phục vụ — cần người có thẩm quyền; áp chính sách hiện hành, không hạ epoch (I10).
 */
import type { JsonStore } from '../storage';
import { canonical, sha256Hex } from './encoding';
import type { CoreVault } from './vault';
import type { StoredObject } from './types';

export interface ManifestEntry {
  objectId: string;
  version: number;
  kekVersion: number;
  ctHash: string;
}

export interface Checkpoint {
  id: string;
  tenant: string;
  createdAt: number;
  createdBy: string;
  epochAtCheckpoint: number;
  manifest: ManifestEntry[];
  manifestHash: string;
  retentionUntil: number;
  copies: StoredObject[];
  status: 'sealed' | 'verified' | 'restored' | 'corrupt';
}

export type StepState = 'todo' | 'running' | 'ok' | 'fail' | 'waiting';

export interface RecoveryRun {
  checkpointId: string;
  startedAt: number;
  steps: { id: 1 | 2 | 3; title: string; detail: string; state: StepState; note?: string }[];
  approvals: { by: string; role: string; at: number }[];
  appliedEpoch?: number;
  finishedAt?: number;
}

export class RecoveryVault {
  private cps: Checkpoint[];
  private runs: RecoveryRun[];
  private listeners = new Set<() => void>();

  constructor(private store: JsonStore, private now: () => number = Date.now, private key = 'sentinel.recovery') {
    this.cps = store.get<Checkpoint[]>(key) ?? [];
    this.runs = store.get<RecoveryRun[]>(key + '.runs') ?? [];
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    this.store.set(this.key, this.cps);
    this.store.set(this.key + '.runs', this.runs);
    this.listeners.forEach((l) => l());
  }

  list() {
    return this.cps;
  }
  get(id: string) {
    return this.cps.find((c) => c.id === id);
  }
  latestRun() {
    return this.runs[this.runs.length - 1];
  }

  async createCheckpoint(vault: CoreVault, tenant: string, by: string, epoch: number, retentionDays = 30): Promise<Checkpoint> {
    const objs = vault.list(tenant);
    const manifest: ManifestEntry[] = [];
    for (const o of objs) {
      manifest.push({ objectId: o.meta.objectId, version: o.meta.version, kekVersion: o.blob.kekVersion, ctHash: await vault.ciphertextHash(o) });
    }
    const n = this.cps.reduce((m, c) => Math.max(m, Number(c.id.split('-')[1]) || 0), 13) + 1;
    const cp: Checkpoint = {
      id: `RV-${String(n).padStart(3, '0')}`,
      tenant,
      createdAt: this.now(),
      createdBy: by,
      epochAtCheckpoint: epoch,
      manifest,
      manifestHash: await sha256Hex(canonical(manifest)),
      retentionUntil: this.now() + retentionDays * 86400_000,
      copies: JSON.parse(JSON.stringify(objs)),
      status: 'sealed',
    };
    this.cps.push(cp);
    this.persist();
    return cp;
  }

  /** I6: tài khoản vận hành không phá được bản phục hồi đang trong hạn lưu giữ. */
  requestDelete(id: string, actorRole: string, secondApprover?: string): { ok: boolean; reason: string } {
    const cp = this.get(id);
    if (!cp) return { ok: false, reason: 'Không có checkpoint.' };
    if (cp.retentionUntil > this.now()) return { ok: false, reason: `Khóa lưu giữ tới ${new Date(cp.retentionUntil).toLocaleDateString('vi-VN')} — không xóa được, kể cả với quyền vận hành.` };
    if (actorRole !== 'recovery-admin' || !secondApprover) return { ok: false, reason: 'Cần quyền quản trị phục hồi riêng và người duyệt thứ hai.' };
    this.cps = this.cps.filter((c) => c.id !== id);
    this.persist();
    return { ok: true, reason: 'Đã xóa sau hạn lưu giữ với hai người duyệt.' };
  }

  /** Bước 1: kiểm manifest — đủ ciphertext, băm khớp, manifest không bị sửa. */
  async verifyManifest(id: string, vault: CoreVault): Promise<{ ok: boolean; problems: string[] }> {
    const cp = this.get(id);
    if (!cp) return { ok: false, problems: ['Không tìm thấy checkpoint'] };
    const problems: string[] = [];
    if ((await sha256Hex(canonical(cp.manifest))) !== cp.manifestHash) problems.push('Manifest đã bị sửa sau khi niêm phong.');
    for (const m of cp.manifest) {
      const copy = cp.copies.find((c) => c.meta.objectId === m.objectId);
      if (!copy) {
        problems.push(`Thiếu bản mã ${m.objectId}`);
        continue;
      }
      if ((await vault.ciphertextHash(copy)) !== m.ctHash) problems.push(`Băm bản mã ${m.objectId} không khớp manifest.`);
    }
    cp.status = problems.length ? 'corrupt' : 'verified';
    this.persist();
    return { ok: problems.length === 0, problems };
  }

  startRun(id: string): RecoveryRun {
    const run: RecoveryRun = {
      checkpointId: id,
      startedAt: this.now(),
      steps: [
        { id: 1, title: 'Kiểm điểm phục hồi', detail: 'Manifest, khóa bọc và phạm vi', state: 'todo' },
        { id: 2, title: 'Cô lập tiến trình cũ', detail: 'Kiểm định danh môi trường mới (chứng thực lại)', state: 'todo' },
        { id: 3, title: 'Đưa vào phục vụ', detail: 'Đánh giá quan sát, ca và bằng chứng — cần người có quyền', state: 'todo' },
      ],
      approvals: [],
    };
    this.runs.push(run);
    this.persist();
    return run;
  }

  updateStep(stepId: 1 | 2 | 3, state: StepState, note?: string) {
    const run = this.latestRun();
    const st = run?.steps.find((s) => s.id === stepId);
    if (st) {
      st.state = state;
      st.note = note;
      this.persist();
    }
  }

  /**
   * Bước 3: chỉ người có thẩm quyền (không phải AI) đưa vào phục vụ.
   * Áp epoch hiện hành của R (không hạ) và ACL hiện hành; khôi phục bản mã từ bản sao đã kiểm.
   */
  approveAndRestore(by: { id: string; role: string; isAI?: boolean }, vault: CoreVault, currentEpoch: number, currentAcl: (objectId: string) => StoredObject['meta'] | undefined): { ok: boolean; reason: string } {
    const run = this.latestRun();
    if (!run) return { ok: false, reason: 'Chưa bắt đầu quy trình.' };
    if (by.isAI) return { ok: false, reason: 'AI không được mở lại dịch vụ (I5) — cần người có thẩm quyền.' };
    if (!['recovery-admin', 'admin'].includes(by.role)) return { ok: false, reason: 'Vai trò không có quyền duyệt phục hồi.' };
    if (run.steps[0].state !== 'ok' || run.steps[1].state !== 'ok') return { ok: false, reason: 'Bước 1 và 2 phải đạt trước khi duyệt.' };
    const cp = this.get(run.checkpointId);
    if (!cp || cp.status !== 'verified') return { ok: false, reason: 'Checkpoint chưa được kiểm.' };
    const restored = cp.copies.map((c) => {
      const acl = currentAcl(c.meta.objectId);
      // Quyền đã thu hồi giữ nguyên hiệu lực: ACL hiện hành thay ACL trong snapshot (I10).
      return acl ? { ...c, meta: { ...c.meta, viewers: [...acl.viewers], purposes: [...acl.purposes], expiresAt: acl.expiresAt } } : c;
    });
    vault.replaceAll([...vault.list().filter((o) => o.meta.tenant !== cp.tenant), ...restored]);
    run.approvals.push({ by: by.id, role: by.role, at: this.now() });
    run.appliedEpoch = Math.max(currentEpoch, cp.epochAtCheckpoint);
    run.steps[2].state = 'ok';
    run.finishedAt = this.now();
    cp.status = 'restored';
    this.persist();
    return { ok: true, reason: `Đã đưa vào phục vụ với epoch ${run.appliedEpoch} (không hạ về ${cp.epochAtCheckpoint}).` };
  }

  /** Mô phỏng sửa manifest trái phép. */
  tamper(id: string) {
    const cp = this.get(id);
    if (cp && cp.manifest[0]) {
      cp.manifest[0] = { ...cp.manifest[0], kekVersion: cp.manifest[0].kekVersion + 7 };
      this.persist();
    }
  }

  clear() {
    this.cps = [];
    this.runs = [];
    this.persist();
  }
}
