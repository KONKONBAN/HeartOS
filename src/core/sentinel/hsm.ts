/**
 * H — Ranh giới HSM và K — bộ điều phối vòng đời khóa (§1.6.1, §3.6.3, §3.8.1).
 *  - KEK theo tenant, không xuất được, có phiên bản (luân chuyển giữ ánh xạ phiên bản → dữ liệu).
 *  - Chỉ danh tính dịch vụ của cổng cấp khóa được gọi (A không có đường giải mã trực tiếp — I2, I7).
 *  - DEK chỉ rời HSM dưới dạng bọc cho KEK (lưu trữ) hoặc bọc cho khóa nhận đã chứng thực.
 */
import type { ObjectStore } from '../storage';
import { genDek, genKek, unwrapWithKek, wrapForRecipient, wrapWithKek } from './crypto';
import { randomId } from './encoding';
import type { KeyContext, RecipientRelease } from './types';

export class HsmError extends Error {}

interface KekRecord {
  tenant: string;
  version: number;
  key: CryptoKey;
  createdAt: number;
  state: 'active' | 'decrypt-only';
}

export interface HsmStatus {
  tenant: string;
  activeVersion: number;
  versions: { version: number; state: KekRecord['state']; createdAt: number }[];
  ops: { generate: number; release: number; refused: number };
}

export class Hsm {
  /** Danh tính dịch vụ duy nhất được phép gọi HSM — chỉ cổng cấp khóa nhận được giá trị này. */
  readonly gateIdentity = randomId('svc-key-gate', 8);
  private keks = new Map<string, KekRecord[]>();
  private ops = { generate: 0, release: 0, refused: 0 };
  private compromised = false;
  /** true nếu KEK vừa được tạo mới khi nạp (bản mã cũ, nếu có, không còn mở được). */
  freshlyCreated = false;

  constructor(private store: ObjectStore, private now: () => number = Date.now) {}

  async load(tenant: string) {
    const saved = await this.store.get<KekRecord[]>(`hsm.kek.${tenant}`);
    if (saved && saved.length && saved.every((r) => r.key instanceof CryptoKey)) {
      this.keks.set(tenant, saved);
    } else {
      this.freshlyCreated = true;
      await this.rotate(tenant);
    }
  }

  private assertCaller(caller: string) {
    if (caller !== this.gateIdentity) {
      this.ops.refused++;
      throw new HsmError('HSM từ chối: caller không phải danh tính dịch vụ của cổng cấp khóa (A không có quyền gọi trực tiếp).');
    }
  }

  private active(tenant: string): KekRecord {
    const list = this.keks.get(tenant);
    const rec = list?.find((r) => r.state === 'active');
    if (!rec) throw new HsmError(`Không có KEK hoạt động cho tenant ${tenant}`);
    return rec;
  }

  private byVersion(tenant: string, version: number): KekRecord {
    const rec = this.keks.get(tenant)?.find((r) => r.version === version);
    if (!rec) throw new HsmError(`Không tìm thấy KEK phiên bản ${version}`);
    return rec;
  }

  /** Luân chuyển KEK: phiên bản cũ chuyển sang chỉ-giải-mã, không hủy (giữ khả năng phục hồi). */
  async rotate(tenant: string): Promise<number> {
    const list = this.keks.get(tenant) ?? [];
    list.forEach((r) => (r.state = 'decrypt-only'));
    const version = (list.reduce((m, r) => Math.max(m, r.version), 0) || 0) + 1;
    list.push({ tenant, version, key: await genKek(), createdAt: this.now(), state: 'active' });
    this.keks.set(tenant, list);
    await this.store.set(`hsm.kek.${tenant}`, list);
    return version;
  }

  /**
   * GenerateDataKey có người nhận: trả CiphertextBlob (bọc KEK) và CiphertextForRecipient.
   * Không có trường bản rõ trong phản hồi.
   */
  async generateDataKey(caller: string, tenant: string, recipientPub: string, context: KeyContext) {
    this.assertCaller(caller);
    const kek = this.active(tenant);
    const dek = await genDek(true); // chỉ tồn tại bên trong ranh giới này
    const blob = { kekVersion: kek.version, wrapped: await wrapWithKek(dek, kek.key) };
    const forRecipient = await wrapForRecipient(dek, recipientPub, context);
    this.ops.generate++;
    const release: RecipientRelease = { wrapped: forRecipient.wrapped, ephPub: forRecipient.ephPub, context };
    return { blob, release };
  }

  /** Mở DEK đã lưu và chỉ chuyển lại cho khóa nhận đã được cổng chấp nhận. */
  async releaseForRecipient(caller: string, tenant: string, blob: { kekVersion: number; wrapped: string }, recipientPub: string, context: KeyContext) {
    this.assertCaller(caller);
    const kek = this.byVersion(tenant, blob.kekVersion);
    const dek = await unwrapWithKek(blob.wrapped, kek.key, true);
    const r = await wrapForRecipient(dek, recipientPub, context);
    this.ops.release++;
    const release: RecipientRelease = { wrapped: r.wrapped, ephPub: r.ephPub, context };
    return release;
  }

  /** Bọc lại DEK sang KEK hiện hành (quản lý khóa; không thu hồi dữ liệu đã lộ — §3.8). */
  async rewrap(caller: string, tenant: string, blob: { kekVersion: number; wrapped: string }) {
    this.assertCaller(caller);
    const old = this.byVersion(tenant, blob.kekVersion);
    const cur = this.active(tenant);
    if (old.version === cur.version) return blob;
    const dek = await unwrapWithKek(blob.wrapped, old.key, true);
    return { kekVersion: cur.version, wrapped: await wrapWithKek(dek, cur.key) };
  }

  status(tenant: string): HsmStatus {
    const list = this.keks.get(tenant) ?? [];
    return {
      tenant,
      activeVersion: list.find((r) => r.state === 'active')?.version ?? 0,
      versions: list.map((r) => ({ version: r.version, state: r.state, createdAt: r.createdAt })),
      ops: { ...this.ops },
    };
  }

  /** T7: đánh dấu thành phần gốc bị phá — các bảo đảm dựa trên H không còn hiệu lực. */
  markCompromised(v: boolean) {
    this.compromised = v;
  }
  get isCompromised() {
    return this.compromised;
  }
}
