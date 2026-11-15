/**
 * ARGOLET Sentinel trong HeartOS — mặt tiền ghép các chủ thể A, G, Ve, K/H, R, B, J, AI.
 * Ứng dụng (A) chỉ gọi protect/read/revoke; mọi bản rõ được bảo vệ đi qua Ve (A2),
 * DEK chỉ đi qua cổng cấp khóa (3.13) và kết quả được niêm phong cho client đã xác minh (A8).
 */
import type { JsonStore, ObjectStore } from '../storage';
import { analyze, checkExecution, type Analysis, type Proposal } from './ai';
import { exportPub, genEcdhKey, openSealed, sealTo, thumbprint } from './crypto';
import { fromB64, fromUtf8, randomId, utf8 } from './encoding';
import { Enclave, Platform, Verifier, measure, type CodeIdentity } from './enclave';
import { KeyGate } from './gate';
import { Directory, GrantService } from './grant';
import { Hsm } from './hsm';
import { IncidentMachine } from './incident';
import { Journal, type JournalInput } from './journal';
import { RecoveryVault } from './recovery';
import { changeFirmware, defaultSources, healthTest, sampleStream, tryOpenGate, type EntropySource, type StreamMode } from './source';
import { StateService } from './state';
import type { DirectoryEntry, ObjectMeta, Operation, ReadResult, StoredObject, TraceStep } from './types';
import { CoreVault } from './vault';

export interface SentinelOptions {
  json: JsonStore;
  objects: ObjectStore;
  tenant: string;
  directory: DirectoryEntry[];
  now?: () => number;
  /** Tiền tố khóa lưu trữ — cho phép sandbox Replay tách biệt khỏi Live. */
  prefix?: string;
  code?: CodeIdentity;
}

export interface ProtectInput {
  subject: string;
  objectId: string;
  type: string;
  label: string;
  data: Record<string, unknown>;
  viewers: string[];
  purposes: string[];
  expiresAt?: number;
  canary?: boolean;
  version?: number;
}

export interface ReadInput {
  subject: string;
  objectId: string;
  purpose: string;
  fields?: string[];
  workload?: string;
  operation?: Extract<Operation, 'read'>;
  claimedRole?: string;
}

export const VE_CODE: CodeIdentity = { name: 'heartos-core-vault', version: '1.4.0', debug: false, tcb: 7 };

export class Sentinel {
  readonly tenant: string;
  readonly now: () => number;
  journal!: Journal;
  R!: StateService;
  directory!: Directory;
  G!: GrantService;
  H!: Hsm;
  platform!: Platform;
  verifier!: Verifier;
  Ve!: Enclave;
  gate!: KeyGate;
  vault!: CoreVault;
  recovery!: RecoveryVault;
  incident!: IncidentMachine;
  sources: EntropySource[] = [];
  private client!: { priv: CryptoKey; pub: string; thumb: string };
  private listeners = new Set<() => void>();
  private ver = 0;
  private lastSpikeAt = 0;
  lastAnalysis?: Analysis;

  private constructor(private opts: SentinelOptions) {
    this.tenant = opts.tenant;
    this.now = opts.now ?? Date.now;
  }

  static async create(opts: SentinelOptions): Promise<Sentinel> {
    const s = new Sentinel(opts);
    await s.init();
    return s;
  }

  private k(name: string) {
    return (this.opts.prefix ?? '') + name;
  }

  private async init() {
    const { json, objects } = this.opts;
    this.journal = new Journal(json, this.k('sentinel.journal'), 800, this.now);
    this.R = new StateService(json, this.k('sentinel.R'), this.now);
    this.vault = new CoreVault(json, this.k('sentinel.vault'));
    this.recovery = new RecoveryVault(json, this.now, this.k('sentinel.recovery'));
    this.incident = new IncidentMachine(json, this.now, this.k('sentinel.incident'));
    this.directory = new Directory(this.opts.directory);
    this.H = new Hsm(objects, this.now);
    await this.H.load(this.tenant);
    this.platform = await new Platform().init();
    this.G = await new GrantService(this.directory, this.R, (id) => this.vault.meta(id), this.now).init();
    this.verifier = new Verifier(this.now);
    await this.verifier.trustPlatform(this.platform.publicKey);
    const code = this.opts.code ?? VE_CODE;
    this.verifier.allowCode({ measurement: await measure(code), codeName: code.name, codeVersion: code.version, minTcb: 6, revoked: false });
    this.Ve = await new Enclave(this.platform, code, this.now).init(this.G.publicKey);
    this.gate = await new KeyGate(this.H, this.verifier, this.R, this.now).init(this.G.publicKey);
    const kp = await genEcdhKey();
    const pub = await exportPub(kp.publicKey);
    this.client = { priv: kp.privateKey, pub, thumb: await thumbprint(pub) };
    this.sources = json.get<EntropySource[]>(this.k('sentinel.sources')) ?? defaultSources();
    // Sau khởi động lại, KEK có thể được tạo mới (môi trường không giữ IndexedDB) — bản mã cũ không mở được.
    for (const sub of [this.journal, this.R, this.vault, this.recovery, this.incident]) sub.subscribe(() => this.bump());
    await this.log({ kind: 'session', actor: 'A', summary: `Sentinel khởi động · epoch ${this.R.epoch(this.tenant)} · KEK v${this.H.status(this.tenant).activeVersion}`, epoch: this.R.epoch(this.tenant) });
  }

  // ---------- quan sát ----------
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get version() {
    return this.ver;
  }
  private bump() {
    this.ver++;
    this.listeners.forEach((l) => l());
  }
  log(e: JournalInput) {
    return this.journal.append(e);
  }
  epoch() {
    return this.R.epoch(this.tenant);
  }

  private async session(trace: TraceStep[]) {
    const t0 = this.now();
    const challenge = this.verifier.challenge();
    const ses = await this.Ve.openSession(challenge);
    trace.push({ actor: 'Ve', label: 'Tạo khóa phiên trong vùng và báo cáo chứng thực', ok: true, detail: `${ses.sessionId} · measurement ${this.Ve.measurement.slice(0, 12)}…`, ms: this.now() - t0 });
    // Client kiểm chứng thực trước khi niêm phong dữ liệu cho vùng (A8).
    const v = await this.verifier.verify(ses.attestation, { consume: false });
    trace.push({ actor: 'Verifier', label: 'Xác minh chứng thực: gốc ký, measurement, TCB, debug, tính mới', ok: v.ok, detail: v.ok ? `khóa nhận ${v.recipient?.slice(0, 12)}…` : v.reasons.join(' ') });
    return { ses, recipient: v.recipient ?? (await thumbprint(ses.pub)), attOk: v.ok };
  }

  /** Ghi đối tượng mới: niêm phong cho Ve → grant ghi → cổng cấp DEK mới → AEAD trong Ve → commit. */
  async protect(input: ProtectInput): Promise<ReadResult<ObjectMeta>> {
    const trace: TraceStep[] = [];
    const meta: ObjectMeta = {
      tenant: this.tenant,
      objectId: input.objectId,
      version: input.version ?? 1,
      type: input.type,
      label: input.label,
      owner: input.subject,
      viewers: input.viewers,
      purposes: input.purposes,
      fields: Object.keys(input.data),
      createdAt: this.now(),
      expiresAt: input.expiresAt,
      canary: input.canary,
    };
    const plaintext = utf8(JSON.stringify(input.data));
    const { ses, recipient } = await this.session(trace);
    try {
      const sealed = await sealTo(ses.pub, plaintext, `input|${meta.objectId}|${ses.sessionId}`);
      trace.push({ actor: 'Client', label: 'Niêm phong dữ liệu cho khóa phiên của enclave — host chỉ chuyển tiếp bản mã', ok: true, detail: `${plaintext.length} B → ${sealed.ct.length} ký tự bản mã` });
      const out = await this.G.issueForNewObject(
        { subject: input.subject, workload: 'heartos-app', objectId: meta.objectId, operation: 'write', purpose: input.purposes[0] ?? 'store', recipient, sessionId: ses.sessionId, destination: this.client.thumb },
        meta,
        plaintext.length + 64,
      );
      if (!out.ok) {
        trace.push({ actor: 'G', label: 'Từ chối cấp grant ghi', ok: false, detail: out.reason });
        await this.log({ kind: 'grant.denied', actor: 'G', severity: 'notice', summary: `Từ chối ghi ${meta.label}: ${out.reason}`, subject: input.subject, objectId: meta.objectId, decision: 'deny' });
        return { ok: false, error: out.reason, trace };
      }
      trace.push({ actor: 'G', label: 'Ký grant ghi gắn phiên, khóa nhận và epoch', ok: true, detail: `${out.signed.grant.grantId} · epoch ${out.signed.grant.epoch}` });
      const g = await this.gate.evaluate({ signed: out.signed, attestation: ses.attestation, meta, operation: 'write' });
      trace.push({ actor: 'K', label: 'Cổng cấp khóa: Gok ∧ Aok ∧ Eok ∧ Bok', ok: g.decision.release, detail: g.decision.release ? 'HSM sinh DEK mới, trả bản bọc KEK + bản cho khóa nhận' : g.decision.reasons.join(' ') });
      if (!g.decision.release || !g.release || !g.blob) {
        await this.log({ kind: 'gate.deny', actor: 'K', severity: 'warning', summary: `Cổng từ chối cấp DEK ghi ${meta.label}`, subject: input.subject, objectId: meta.objectId, decision: 'deny', data: { reasons: g.decision.reasons.join(' | ') } });
        return { ok: false, error: g.decision.reasons.join(' '), decision: g.decision, trace };
      }
      const enc = await this.Ve.encryptRecord(ses.sessionId, out.signed, meta, sealed, g.release);
      trace.push({ actor: 'Ve', label: 'Mở dữ liệu trong vùng, mã hóa AES-256-GCM với AAD(tenant, đối tượng, phiên bản, loại)', ok: true, detail: `nonce 96 bit · ${enc.size} B` });
      const stored: StoredObject = { meta, iv: enc.iv, ciphertext: enc.ciphertext, blob: g.blob, alg: 'AES-256-GCM', size: enc.size, committedAt: this.now() };
      this.vault.commit(stored);
      this.R.settle(g.decision.reservationId!, enc.size, true);
      trace.push({ actor: 'R', label: 'Đối chiếu số byte đã đặt chỗ và đã dùng', ok: true });
      await this.log({ kind: 'vault.write', actor: 'Ve', summary: `Lưu ${meta.label} (v${meta.version}) dưới dạng bản mã`, subject: input.subject, objectId: meta.objectId, decision: 'allow', epoch: out.signed.grant.epoch, data: { grantId: out.signed.grant.grantId, bytes: enc.size, kekVersion: g.blob.kekVersion } });
      return { ok: true, data: meta, decision: g.decision, trace, grantId: out.signed.grant.grantId, bytes: enc.size };
    } finally {
      this.Ve.endSession(ses.sessionId);
    }
  }

  /** Đọc: grant → chứng thực → cổng → HSM chuyển DEK cho khóa nhận → Ve giải mã, lọc trường, niêm phong cho client. */
  async read<T = Record<string, unknown>>(input: ReadInput): Promise<ReadResult<T>> {
    const trace: TraceStep[] = [];
    const stored = this.vault.get(input.objectId);
    trace.push({ actor: 'A', label: 'Ứng dụng chuyển yêu cầu có ngữ cảnh chuẩn hóa', ok: true, detail: `${input.subject} · ${input.objectId} · mục đích ${input.purpose}` });
    if (!stored) {
      trace.push({ actor: 'Ve', label: 'Không có đối tượng', ok: false });
      return { ok: false, error: 'Không có đối tượng trong két.', trace };
    }
    if (this.incident.view().restrictedSessions.includes(input.subject)) {
      trace.push({ actor: 'G', label: 'Phiên đang bị hạn chế do sự cố', ok: false });
      return { ok: false, error: 'Phiên của bạn đang bị hạn chế trong lúc xác minh sự cố.', trace };
    }
    const { ses, recipient } = await this.session(trace);
    try {
      const budget = fromB64(stored.ciphertext).length + 64;
      const out = await this.G.issue(
        { subject: input.subject, claimedRole: input.claimedRole, workload: input.workload ?? 'heartos-app', objectId: input.objectId, fields: input.fields, operation: 'read', purpose: input.purpose, recipient, sessionId: ses.sessionId, destination: this.client.thumb },
        budget,
      );
      if (!out.ok) {
        trace.push({ actor: 'G', label: 'Từ chối cấp grant', ok: false, detail: out.reason });
        await this.log({ kind: 'grant.denied', actor: 'G', severity: out.code === 'canary' ? 'critical' : 'notice', summary: `Từ chối đọc ${stored.meta.label}: ${out.reason}`, subject: input.subject, objectId: input.objectId, decision: 'deny', data: { code: out.code, purpose: input.purpose } });
        if (out.code === 'canary') {
          this.incident.signal({ kind: 'canary', evidence: [input.objectId], note: `Truy cập đối tượng mồi canary bởi ${input.subject}`, source: 'rule' });
          await this.log({ kind: 'incident.signal', actor: 'J', severity: 'critical', summary: 'Tín hiệu canary: có yêu cầu tới đối tượng mồi', subject: input.subject, objectId: input.objectId });
        }
        return { ok: false, error: out.reason, trace };
      }
      const grant = out.signed.grant;
      trace.push({ actor: 'G', label: 'Ký grant: chủ thể, đối tượng, trường, đích nhận, hạn 60 s, nonce, hạn mức, epoch', ok: true, detail: `${grant.grantId} · ${grant.fields.join(', ')} · ${grant.budgetBytes} B · epoch ${grant.epoch}` });
      const g = await this.gate.evaluate({ signed: out.signed, attestation: ses.attestation, meta: stored.meta, operation: 'read', stored });
      trace.push({ actor: 'K', label: 'Cổng cấp khóa: Gok ∧ Aok ∧ Eok ∧ Bok', ok: g.decision.release, detail: `G${tick(g.decision.Gok)} A${tick(g.decision.Aok)} E${tick(g.decision.Eok)} B${tick(g.decision.Bok)}${g.decision.release ? '' : ' · ' + g.decision.reasons.join(' ')}` });
      if (!g.decision.release || !g.release) {
        await this.log({ kind: g.decision.Bok === false && g.decision.Gok && g.decision.Aok && g.decision.Eok ? 'budget.deny' : 'gate.deny', actor: 'K', severity: 'warning', summary: `Cổng từ chối DEK cho ${stored.meta.label}`, subject: input.subject, objectId: input.objectId, decision: 'deny', epoch: grant.epoch, data: { reasons: g.decision.reasons.join(' | ') } });
        this.checkSpike();
        return { ok: false, error: g.decision.reasons.join(' '), decision: g.decision, trace };
      }
      trace.push({ actor: 'H', label: 'HSM mở bản bọc KEK và chỉ chuyển DEK cho khóa nhận đã chứng thực', ok: true, detail: 'Phản hồi không có trường bản rõ (CiphertextForRecipient)' });
      let sealedOut;
      try {
        sealedOut = await this.Ve.decryptRecord(ses.sessionId, out.signed, stored.meta, stored, g.release, this.client.pub);
      } catch (e) {
        this.R.markUnknown(g.decision.reservationId!);
        trace.push({ actor: 'Ve', label: 'Ve từ chối phát hành', ok: false, detail: (e as Error).message });
        await this.log({ kind: 'gate.deny', actor: 'Ve', severity: 'critical', summary: `Ve chặn phát hành ${stored.meta.label}: ${(e as Error).message}`, subject: input.subject, objectId: input.objectId, decision: 'deny' });
        if ((e as Error).message.includes('AEAD')) this.incident.signal({ kind: 'tamper', evidence: [input.objectId], note: 'Bản mã/ngữ cảnh bị tráo', source: 'rule' });
        return { ok: false, error: (e as Error).message, decision: g.decision, trace };
      }
      trace.push({ actor: 'Ve', label: 'Giải mã AEAD, lọc trường theo grant, niêm phong kết quả cho đích đã xác minh', ok: true, detail: `${sealedOut.bytes} B ≤ ngân sách ${grant.budgetBytes} B` });
      const pt = await openSealed(this.client.priv, sealedOut.sealed, `output|${grant.grantId}`);
      const data = JSON.parse(fromUtf8(pt)) as T;
      trace.push({ actor: 'Client', label: 'Client mở kết quả bằng khóa đích', ok: true });
      this.R.settle(g.decision.reservationId!, sealedOut.bytes, true);
      await this.log({ kind: 'vault.read', actor: 'Ve', summary: `Phát hành ${stored.meta.label} cho ${input.subject} (${input.purpose})`, subject: input.subject, objectId: input.objectId, decision: 'allow', epoch: grant.epoch, data: { grantId: grant.grantId, bytes: sealedOut.bytes, fields: grant.fields.join(',') } });
      this.checkSpike();
      return { ok: true, data, decision: g.decision, trace, grantId: grant.grantId, bytes: sealedOut.bytes };
    } finally {
      this.Ve.endSession(ses.sessionId);
    }
  }

  private checkSpike() {
    const b = this.R.snapshotView().bucket;
    if (b.tokens < b.capacity * 0.15 && this.now() - this.lastSpikeAt > 60_000) {
      this.lastSpikeAt = this.now();
      this.incident.signal({ kind: 'read_spike', evidence: [], note: `Bucket giải mã còn ${Math.round((b.tokens / b.capacity) * 100)}%`, source: 'rule' });
      void this.log({ kind: 'incident.signal', actor: 'R', severity: 'warning', summary: 'Đọc tăng đột biến: ngân sách giải mã dưới 15%' });
    }
  }

  // ---------- quản trị chính sách ----------

  /** Thu hồi người xem/mục đích: tăng epoch (mọi grant cũ mất hiệu lực tại cổng — I4). */
  async revoke(p: { actor: string; objectId: string; viewer?: string; purpose?: string; reason: string }) {
    const meta = this.vault.meta(p.objectId);
    if (!meta) return { ok: false as const, reason: 'Không có đối tượng.' };
    const actor = this.directory.get(p.actor);
    if (!actor || (actor.id !== meta.owner && actor.role !== 'admin')) return { ok: false as const, reason: 'Chỉ chủ sở hữu hoặc quản trị hộ được thu hồi.' };
    this.vault.updateAcl(p.objectId, {
      viewers: p.viewer ? meta.viewers.filter((v) => v !== p.viewer) : meta.viewers,
      purposes: p.purpose ? meta.purposes.filter((x) => x !== p.purpose) : meta.purposes,
    });
    const epoch = this.R.bumpEpoch(this.tenant);
    await this.log({ kind: 'policy.revoke', actor: 'G', severity: 'notice', summary: `Thu hồi ${p.viewer ? 'quyền xem của ' + p.viewer : 'mục đích ' + p.purpose} trên ${meta.label}`, subject: p.actor, objectId: p.objectId, epoch, data: { reason: p.reason } });
    return { ok: true as const, epoch };
  }

  /** Thu hồi theo phạm vi (ví dụ lịch, vị trí, camera) — chỉ tăng epoch và ghi bằng chứng. */
  async revokeScope(p: { actor: string; scope: string; target?: string; reason: string }) {
    const epoch = this.R.bumpEpoch(this.tenant);
    await this.log({ kind: 'policy.revoke', actor: 'G', severity: 'notice', summary: `Thu hồi phạm vi ${p.scope}${p.target ? ' · ' + p.target : ''}`, subject: p.actor, epoch, data: { reason: p.reason } });
    return epoch;
  }

  async addViewer(p: { actor: string; objectId: string; viewer: string }) {
    const meta = this.vault.meta(p.objectId);
    if (!meta) return false;
    const actor = this.directory.get(p.actor);
    if (!actor || (actor.id !== meta.owner && actor.role !== 'admin')) return false;
    if (!meta.viewers.includes(p.viewer)) this.vault.updateAcl(p.objectId, { viewers: [...meta.viewers, p.viewer] });
    await this.log({ kind: 'policy.change', actor: 'G', summary: `Cấp quyền xem ${meta.label} cho ${p.viewer}`, subject: p.actor, objectId: p.objectId, epoch: this.epoch() });
    return true;
  }

  // ---------- phục hồi ----------

  async checkpoint(by: string) {
    const cp = await this.recovery.createCheckpoint(this.vault, this.tenant, by, this.epoch());
    await this.log({ kind: 'recovery.checkpoint', actor: 'B', summary: `Niêm phong điểm phục hồi ${cp.id} (${cp.manifest.length} đối tượng)`, subject: by, data: { manifestHash: cp.manifestHash.slice(0, 16) } });
    return cp;
  }

  async recoveryStep1(id: string) {
    this.recovery.startRun(id);
    this.recovery.updateStep(1, 'running');
    const r = await this.recovery.verifyManifest(id, this.vault);
    this.recovery.updateStep(1, r.ok ? 'ok' : 'fail', r.ok ? 'Manifest, băm bản mã và phiên bản khóa khớp' : r.problems.join(' · '));
    await this.log({ kind: 'recovery.step', actor: 'B', severity: r.ok ? 'info' : 'warning', summary: `Bước 1 kiểm điểm ${id}: ${r.ok ? 'đạt' : 'lỗi'}` });
    return r;
  }

  /** Bước 2: môi trường mới tạo khóa phiên mới và chứng thực lại trước khi nhận DEK; thử giải mã một đối tượng. */
  async recoveryStep2(id: string, sampleSubject: string) {
    this.recovery.updateStep(2, 'running');
    const cp = this.recovery.get(id);
    const sample = cp?.copies.find((c) => !c.meta.canary && (c.meta.owner === sampleSubject || c.meta.viewers.includes(sampleSubject)));
    let ok = true;
    let note = 'Chứng thực môi trường mới đạt';
    if (sample) {
      const res = await this.read({ subject: sampleSubject, objectId: sample.meta.objectId, purpose: sample.meta.purposes[0], fields: [sample.meta.fields[0]] });
      ok = res.ok;
      note = ok ? `Chứng thực lại + thử giải mã ${sample.meta.label} đạt` : 'Thử giải mã thất bại: ' + res.error;
    }
    this.recovery.updateStep(2, ok ? 'ok' : 'fail', note);
    this.recovery.updateStep(3, ok ? 'waiting' : 'todo');
    await this.log({ kind: 'recovery.step', actor: 'B', summary: `Bước 2 cô lập + chứng thực lại: ${ok ? 'đạt' : 'lỗi'}` });
    return ok;
  }

  async recoveryApprove(by: { id: string; role: string; isAI?: boolean }) {
    const r = this.recovery.approveAndRestore(by, this.vault, this.epoch(), (id) => this.vault.meta(id));
    await this.log({ kind: r.ok ? 'recovery.step' : 'recovery.denied', actor: by.isAI ? 'AI' : 'Human', severity: r.ok ? 'notice' : 'warning', summary: `Bước 3 đưa vào phục vụ: ${r.reason}`, subject: by.id });
    return r;
  }

  // ---------- AI & sự cố ----------

  async aiAnalyze(): Promise<Analysis> {
    const a = analyze(await this.journal.redactedForAI(150));
    this.lastAnalysis = a;
    for (const p of a.proposals) await this.log({ kind: 'ai.proposal', actor: 'AI', summary: `Đề xuất ${p.action} → ${p.target}`, data: { scope: p.scope, ttl: p.ttlSec, evidence: p.evidence.join(',') } });
    this.bump();
    return a;
  }

  async aiExecute(p: Proposal, humanApproved: boolean) {
    const c = checkExecution(p, { humanApproved });
    if (!c.ok) {
      await this.log({ kind: 'ai.rejected', actor: 'AI', severity: 'notice', summary: `Bộ thực thi từ chối ${p.action}: ${c.reasons.join(' ')}`, decision: 'deny' });
      return c;
    }
    if (p.action === 'revoke_session') this.incident.restrictSession(p.target);
    if (p.action === 'limit_export') this.incident.signal({ kind: 'manual', evidence: p.evidence, note: 'Giới hạn xuất theo đề xuất đã kiểm', source: 'ai' });
    if (p.action === 'deploy_canary' && !this.vault.get('canary-ledger')) {
      await this.protect({ subject: this.ownerId(), objectId: 'canary-ledger', type: 'canary', label: 'Sổ mồi (canary)', data: { note: 'decoy' }, viewers: [], purposes: ['none'], canary: true });
    }
    await this.log({ kind: 'ai.executed', actor: 'AI', severity: 'notice', summary: `Bộ thực thi chạy ${p.action} → ${p.target} (TTL ${p.ttlSec}s)`, decision: 'allow' });
    return c;
  }

  private ownerId() {
    return this.directory.list().find((d) => d.role === 'admin')?.id ?? this.directory.list()[0]?.id ?? 'admin';
  }

  async isolate(by: { id: string; human: boolean }) {
    return this.incident.isolate(by, () => {
      this.R.bumpEpoch(this.tenant);
      this.R.setLock(this.tenant, true);
      void this.log({ kind: 'incident.state', actor: 'Human', severity: 'critical', summary: 'Cô lập: tăng epoch, khóa đường đọc trong két, chặn phiên', subject: by.id, epoch: this.epoch() });
    });
  }

  async reopen(by: { id: string; human: boolean; role: string; isAI?: boolean }) {
    const r = this.incident.reopen(by, () => {
      this.R.setLock(this.tenant, false);
      void this.log({ kind: 'incident.state', actor: 'Human', severity: 'notice', summary: 'Mở lại dịch vụ sau phục hồi có kiểm soát', subject: by.id, epoch: this.epoch() });
    });
    if (!r.ok) await this.log({ kind: 'incident.state', actor: by.isAI ? 'AI' : 'Human', severity: 'warning', summary: 'Từ chối mở lại: ' + r.reason, decision: 'deny' });
    return r;
  }

  // ---------- nguồn ngẫu nhiên ----------

  private saveSources() {
    this.opts.json.set(this.k('sentinel.sources'), this.sources);
    this.bump();
  }

  async runHealth(sourceId: string, mode: StreamMode) {
    const src = this.sources.find((s) => s.id === sourceId);
    if (!src) return undefined;
    const rep = healthTest(sampleStream(mode), src.assumedHPerSample, mode, this.now());
    src.lastHealth = rep;
    if (!rep.ok && src.kind === 'research') src.status = src.status === 'approved' ? 'degraded' : src.status === 'closed' ? 'closed' : 'degraded';
    // Trạng thái nguồn tách khỏi trạng thái xâm nhập (Hình 3.3).
    const anyBad = this.sources.some((s) => s.lastHealth && !s.lastHealth.ok);
    this.incident.setSource(anyBad ? 'degraded' : 'healthy');
    this.saveSources();
    await this.log({ kind: 'source.health', actor: 'R', severity: rep.ok ? 'info' : 'warning', summary: `Kiểm tra sức khỏe ${src.name}: ${rep.ok ? 'đạt' : 'lỗi — đóng nhánh, không phải tín hiệu xâm nhập'}`, data: { mode, rct: rep.rct.maxRun, apt: rep.apt.maxCount, dup: rep.replay.duplicateBlocks } });
    return rep;
  }

  updateProfile(sourceId: string, patch: Partial<EntropySource>) {
    this.sources = this.sources.map((s) => (s.id === sourceId ? { ...s, ...patch, profile: { ...s.profile, ...(patch.profile ?? {}) } } : s));
    this.saveSources();
  }

  setFirmware(sourceId: string, fw: string) {
    this.sources = this.sources.map((s) => (s.id === sourceId ? changeFirmware(s, fw) : s));
    this.saveSources();
  }

  async openSourceGate(sourceId: string, by: { id: string; human: boolean; isAI?: boolean }) {
    const src = this.sources.find((s) => s.id === sourceId);
    if (!src) return { ok: false as const, reasons: ['Không có nguồn'] };
    const r = tryOpenGate(src, by, this.now());
    if (r.ok) {
      this.sources = this.sources.map((s) => (s.id === sourceId ? r.source : s));
      this.saveSources();
    }
    await this.log({ kind: 'source.gate', actor: by.isAI ? 'AI' : 'Human', severity: r.ok ? 'notice' : 'info', summary: `${r.ok ? 'Mở' : 'Giữ đóng'} cổng nguồn ${src.name}`, decision: r.ok ? 'allow' : 'deny', data: { reasons: r.ok ? '' : r.reasons.join(' | ') } });
    return r;
  }

  /** Đặt lại toàn bộ trạng thái Sentinel (dùng khi đặt lại dữ liệu mẫu). */
  async resetAll() {
    this.journal.clear();
    this.R.reset();
    this.vault.replaceAll([]);
    this.recovery.clear();
    this.incident.reset();
    this.sources = defaultSources();
    this.saveSources();
    await this.H.rotate(this.tenant);
  }

  clientThumb() {
    return this.client.thumb;
  }

  newId(prefix: string) {
    return randomId(prefix, 5);
  }
}

const tick = (b: boolean) => (b ? '✓' : '✗');
