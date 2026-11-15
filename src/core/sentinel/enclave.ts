/**
 * Ve — Bộ thực thi trong enclave (Core Vault), Platform (gốc chứng thực phần cứng mô phỏng)
 * và Verifier — trình xác minh chứng thực (§1.6.2, §3.6.3–3.6.4, A5, A6, I7, I8).
 *
 * Mô phỏng: trên điện thoại/hub, "enclave" là một ranh giới mô-đun có khóa phiên riêng không xuất được.
 * Thuộc tính mật mã (khóa nhận, chữ ký chứng thực, unwrap DEK không xuất được, AEAD) là thật.
 */
import {
  aeadDecrypt,
  aeadEncrypt,
  exportPub,
  genEcdhKey,
  genSigningKey,
  importEcdsaPub,
  openSealed,
  sealTo,
  signObject,
  thumbprint,
  unwrapAsRecipient,
  verifyObject,
  type Sealed,
} from './crypto';
import { encodeAAD, fromUtf8, randomId, sha256Hex, utf8 } from './encoding';
import type { Attestation, AttestationReport, Grant, ObjectMeta, RecipientRelease } from './types';

/** Gốc chứng thực của nền tảng (vai trò của nhà sản xuất phần cứng). */
export class Platform {
  private keys!: CryptoKeyPair;
  publicKey = '';
  constructor(readonly name = 'HeartOS-Hub-TEE') {}
  async init() {
    this.keys = await genSigningKey();
    this.publicKey = await exportPub(this.keys.publicKey);
    return this;
  }
  /** Chỉ phần mềm chạy bên trong vùng được đo mới xin được quote với measurement của chính nó. */
  async quote(report: AttestationReport): Promise<Attestation> {
    return { report, sig: await signObject(this.keys.privateKey, report) };
  }
}

export interface AllowEntry {
  measurement: string;
  codeName: string;
  codeVersion: string;
  minTcb: number;
  revoked: boolean;
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
  recipient?: string;
}

/** Trình xác minh: nguồn chữ ký, giá trị tham chiếu, TCB, debug, tính mới, thu hồi (A6). */
export class Verifier {
  private allow = new Map<string, AllowEntry>();
  private challenges = new Map<string, number>();
  private platformKey!: CryptoKey;
  readonly maxAgeMs = 60_000;

  constructor(private now: () => number = Date.now) {}

  async trustPlatform(platformPub: string) {
    this.platformKey = await importEcdsaPub(platformPub);
  }

  allowCode(e: AllowEntry) {
    this.allow.set(e.measurement, e);
  }

  revokeCode(measurement: string) {
    const e = this.allow.get(measurement);
    if (e) e.revoked = true;
  }

  allowlist(): AllowEntry[] {
    return [...this.allow.values()];
  }

  isAccepted(measurement: string) {
    const e = this.allow.get(measurement);
    return !!e && !e.revoked;
  }

  /** Thử thách một lần, chống tái dùng bằng chứng cũ cho phiên mới. */
  challenge(): string {
    const c = randomId('chal', 12);
    this.challenges.set(c, this.now());
    return c;
  }

  async verify(att: Attestation, opts: { consume?: boolean } = {}): Promise<VerifyResult> {
    const reasons: string[] = [];
    const r = att.report;
    const sigOk = this.platformKey ? await verifyObject(this.platformKey, r, att.sig) : false;
    if (!sigOk) reasons.push('Chữ ký chứng thực không khớp gốc tin cậy của nền tảng (báo cáo bị sửa hoặc giả).');
    const entry = this.allow.get(r.measurement);
    if (!entry) reasons.push('Measurement không có trong danh sách mã được chấp nhận.');
    else {
      if (entry.revoked) reasons.push(`Mã ${entry.codeName}@${entry.codeVersion} đã bị thu hồi.`);
      if (r.tcb < entry.minTcb) reasons.push(`Mức TCB ${r.tcb} thấp hơn tối thiểu ${entry.minTcb}.`);
    }
    if (r.debug) reasons.push('Enclave đang ở chế độ debug — không được nhận DEK.');
    const issued = this.challenges.get(r.challenge);
    if (issued === undefined) reasons.push('Thử thách không do trình xác minh cấp hoặc đã dùng (bằng chứng cũ bị phát lại).');
    else if (this.now() - issued > this.maxAgeMs) reasons.push('Bằng chứng quá hạn tính mới.');
    if (this.now() - r.issuedAt > this.maxAgeMs) reasons.push('Báo cáo chứng thực đã cũ.');
    const ok = reasons.length === 0;
    if (ok && opts.consume) this.challenges.delete(r.challenge);
    return { ok, reasons, recipient: ok ? await thumbprint(r.sessionPub) : undefined };
  }
}

export interface EnclaveSession {
  sessionId: string;
  pub: string;
  priv: CryptoKey;
  attestation: Attestation;
  openedAt: number;
  ended: boolean;
}

export interface CodeIdentity {
  name: string;
  version: string;
  debug: boolean;
  tcb: number;
}

export async function measure(code: { name: string; version: string }) {
  return sha256Hex(`HOS-Ve|${code.name}|${code.version}`);
}

export class EnclaveError extends Error {}

/** Ve — kiểm tra grant, giải mã, xử lý và giới hạn đầu ra trong vùng được bảo vệ. */
export class Enclave {
  measurement = '';
  private sessions = new Map<string, EnclaveSession>();
  private grantPub!: CryptoKey;
  private outputs = 0;

  constructor(private platform: Platform, readonly code: CodeIdentity, private now: () => number = Date.now) {}

  async init(grantServicePub: string) {
    this.measurement = await measure(this.code);
    this.grantPub = await importEcdsaPub(grantServicePub);
    return this;
  }

  /** Bước 2: tạo khóa phiên trong vùng và bằng chứng gắn khóa công khai với môi trường. */
  async openSession(challenge: string): Promise<EnclaveSession> {
    const kp = await genEcdhKey();
    const sessionId = randomId('ses', 6);
    const pub = await exportPub(kp.publicKey);
    const report: AttestationReport = {
      platform: this.platform.name,
      measurement: this.measurement,
      codeName: this.code.name,
      codeVersion: this.code.version,
      tcb: this.code.tcb,
      debug: this.code.debug,
      sessionId,
      sessionPub: pub,
      challenge,
      issuedAt: this.now(),
    };
    const attestation = await this.platform.quote(report);
    const s: EnclaveSession = { sessionId, pub, priv: kp.privateKey, attestation, openedAt: this.now(), ended: false };
    this.sessions.set(sessionId, s);
    return s;
  }

  /** Bước 8: kết thúc quyền sử dụng của phiên, loại vật liệu tạm. */
  endSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.ended = true;
      this.sessions.delete(sessionId);
    }
  }

  activeSessions() {
    return this.sessions.size;
  }

  private async checkGrant(sessionId: string, signed: { grant: Grant; sig: string }, meta: Pick<ObjectMeta, 'tenant' | 'objectId' | 'version'>, op: Grant['operation']) {
    const s = this.sessions.get(sessionId);
    if (!s || s.ended) throw new EnclaveError('Phiên enclave không tồn tại hoặc đã kết thúc.');
    const g = signed.grant;
    if (!(await verifyObject(this.grantPub, g, signed.sig))) throw new EnclaveError('Ve: chữ ký grant không hợp lệ.');
    if (g.sessionId !== sessionId) throw new EnclaveError('Ve: grant thuộc phiên khác.');
    if (g.recipient !== (await thumbprint(s.pub))) throw new EnclaveError('Ve: grant không ràng buộc với khóa phiên này.');
    if (g.tenant !== meta.tenant || g.objectId !== meta.objectId || g.version !== meta.version) throw new EnclaveError('Ve: ngữ cảnh đối tượng không khớp grant (I1).');
    if (g.operation !== op) throw new EnclaveError(`Ve: thao tác ${op} không nằm trong grant (${g.operation}).`);
    if (g.expiresAt < this.now()) throw new EnclaveError('Ve: grant đã hết hạn.');
    return s;
  }

  /**
   * Ghi: mở dữ liệu đầu vào được niêm phong cho khóa phiên, mã hóa AEAD với DEK mới nhận từ HSM.
   * DEK bản rõ không bao giờ rời Ve.
   */
  async encryptRecord(sessionId: string, signed: { grant: Grant; sig: string }, meta: ObjectMeta, sealedInput: Sealed, release: RecipientRelease) {
    const s = await this.checkGrant(sessionId, signed, meta, 'write');
    const plaintext = await openSealed(s.priv, sealedInput, `input|${meta.objectId}|${sessionId}`);
    const dek = await unwrapAsRecipient(s.priv, release.ephPub, release.wrapped, release.context);
    const aad = encodeAAD({ tenant: meta.tenant, object: meta.objectId, version: meta.version, type: meta.type });
    const out = await aeadEncrypt(dek, plaintext, aad);
    return { ...out, size: plaintext.length };
  }

  /**
   * Đọc: mở DEK gửi cho khóa phiên, xác thực AEAD (AAD phát hiện tráo ngữ cảnh), lọc trường theo grant,
   * kiểm tra kích thước theo ngân sách và niêm phong kết quả cho đích đã xác minh.
   */
  async decryptRecord(
    sessionId: string,
    signed: { grant: Grant; sig: string },
    meta: ObjectMeta,
    record: { iv: string; ciphertext: string },
    release: RecipientRelease,
    destinationPub: string,
  ): Promise<{ sealed: Sealed; bytes: number }> {
    const s = await this.checkGrant(sessionId, signed, meta, 'read');
    const g = signed.grant;
    if (g.destination !== (await thumbprint(destinationPub))) throw new EnclaveError('Ve: đích nhận không khớp grant — khóa do host tự thay không phải đích hợp lệ.');
    const dek = await unwrapAsRecipient(s.priv, release.ephPub, release.wrapped, release.context);
    const aad = encodeAAD({ tenant: meta.tenant, object: meta.objectId, version: meta.version, type: meta.type });
    let pt: Uint8Array;
    try {
      pt = await aeadDecrypt(dek, record.iv, record.ciphertext, aad);
    } catch {
      throw new EnclaveError('Ve: xác thực AEAD thất bại — bản mã hoặc ngữ cảnh đã bị tráo.');
    }
    const full = JSON.parse(fromUtf8(pt)) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const f of g.fields) if (f in full) filtered[f] = full[f];
    const outBytes = utf8(JSON.stringify(filtered));
    if (outBytes.length > g.budgetBytes) throw new EnclaveError(`Ve: đầu ra ${outBytes.length} B vượt ngân sách ${g.budgetBytes} B.`);
    const sealed = await sealTo(destinationPub, outBytes, `output|${g.grantId}`);
    this.outputs++;
    return { sealed, bytes: outBytes.length };
  }

  get outputsReleased() {
    return this.outputs;
  }
}
