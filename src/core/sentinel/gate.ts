import { importEcdsaPub, thumbprint, verifyObject } from './crypto';
import { randomId } from './encoding';
import type { Verifier } from './enclave';
import type { Hsm } from './hsm';
import type { StateService } from './state';
import type { Attestation, GateDecision, KeyContext, ObjectMeta, RecipientRelease, SignedGrant, StoredObject } from './types';

export interface GateRequest {
  signed: SignedGrant;
  attestation: Attestation;
  meta: ObjectMeta;
  operation: 'read' | 'write';
  stored?: StoredObject;
}

export interface GateResult {
  decision: GateDecision;
  release?: RecipientRelease;
  blob?: { kekVersion: number; wrapped: string };
}

export class KeyGate {
  private grantPub!: CryptoKey;
  stats = { released: 0, denied: 0 };

  constructor(
    private hsm: Hsm,
    private verifier: Verifier,
    private state: StateService,
    private now: () => number = Date.now,
  ) {}

  async init(grantServicePub: string) {
    this.grantPub = await importEcdsaPub(grantServicePub);
    return this;
  }

  async evaluate(req: GateRequest): Promise<GateResult> {
    const reasons: string[] = [];
    const g = req.signed.grant;
    const r = req.attestation.report;

    let Gok = await verifyObject(this.grantPub, g, req.signed.sig);
    if (!Gok) reasons.push('Gok không đạt: chữ ký grant không do G cấp hoặc grant đã bị sửa.');
    if (Gok && g.expiresAt < this.now()) {
      Gok = false;
      reasons.push('Gok không đạt: grant đã hết hạn.');
    }
    if (Gok && (g.tenant !== req.meta.tenant || g.objectId !== req.meta.objectId || g.version !== req.meta.version)) {
      Gok = false;
      reasons.push('Gok không đạt: cổng ánh xạ grant tới đối tượng/phiên bản khác, caller không tự chọn khóa rộng hơn grant.');
    }
    if (Gok && g.operation !== req.operation) {
      Gok = false;
      reasons.push(`Gok không đạt: thao tác ${req.operation} không nằm trong grant.`);
    }

    const v = await this.verifier.verify(req.attestation, { consume: false });
    let Aok = v.ok;
    if (!v.ok) reasons.push(...v.reasons.map((x) => 'Aok không đạt: ' + x));
    if (Aok) {
      const tp = await thumbprint(r.sessionPub);
      if (tp !== g.recipient || r.sessionId !== g.sessionId) {
        Aok = false;
        reasons.push('Aok không đạt: bằng chứng môi trường không quy chiếu cùng khóa nhận/phiên với grant.');
      }
    }

    const epochNow = this.state.epoch(req.meta.tenant);
    let Eok = g.epoch === epochNow;
    if (!Eok) reasons.push(`Eok không đạt: grant mang epoch ${g.epoch}, epoch hiện hành ${epochNow}, quyền đã bị thu hồi/thay đổi.`);
    if (!this.verifier.isAccepted(r.measurement)) {
      Eok = false;
      reasons.push('Eok không đạt: mã enclave đã bị thu hồi khỏi trạng thái chấp nhận.');
    }
    if (this.hsm.isCompromised) reasons.push('Cảnh báo: H được đánh dấu bị phá (T7), kết quả cổng không còn được bảo đảm.');

    let Bok = false;
    let reservationId: string | undefined;
    if (Gok && Aok && Eok) {
      await this.verifier.verify(req.attestation, { consume: true });
      reservationId = randomId('res', 6);
      const rr = this.state.checkAndReserve(req.meta.tenant, g.nonce, g.budgetBytes, g.expiresAt, reservationId);
      Bok = rr.ok;
      if (!rr.ok) {
        reasons.push(`Bok không đạt: ${rr.detail}`);
        reservationId = undefined;
      }
    } else {
      reasons.push('Bok, không đặt chỗ vì điều kiện trước chưa thỏa.');
    }

    const release = Gok && Aok && Eok && Bok;
    const decision: GateDecision = { Gok, Aok, Eok, Bok, release, reasons, reservationId };
    if (!release) {
      this.stats.denied++;
      return { decision };
    }

    const context: KeyContext = { tenant: g.tenant, objectId: g.objectId, version: g.version, grantId: g.grantId, sessionId: g.sessionId };
    try {
      if (req.operation === 'write') {
        const out = await this.hsm.generateDataKey(this.hsm.gateIdentity, g.tenant, r.sessionPub, context);
        this.stats.released++;
        return { decision, release: out.release, blob: out.blob };
      }
      if (!req.stored) throw new Error('Thiếu bản ghi đã lưu.');
      const rel = await this.hsm.releaseForRecipient(this.hsm.gateIdentity, g.tenant, req.stored.blob, r.sessionPub, context);
      this.stats.released++;
      return { decision, release: rel };
    } catch (e) {
      if (reservationId) this.state.markUnknown(reservationId);
      return { decision: { ...decision, release: false, reasons: [...reasons, 'HSM lỗi: ' + (e as Error).message] } };
    }
  }
}
