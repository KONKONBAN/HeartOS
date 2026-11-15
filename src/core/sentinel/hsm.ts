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
  readonly gateIdentity = randomId('svc-key-gate', 8);
  private keks = new Map<string, KekRecord[]>();
  private ops = { generate: 0, release: 0, refused: 0 };
  private compromised = false;
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

  async rotate(tenant: string): Promise<number> {
    const list = this.keks.get(tenant) ?? [];
    list.forEach((r) => (r.state = 'decrypt-only'));
    const version = (list.reduce((m, r) => Math.max(m, r.version), 0) || 0) + 1;
    list.push({ tenant, version, key: await genKek(), createdAt: this.now(), state: 'active' });
    this.keks.set(tenant, list);
    await this.store.set(`hsm.kek.${tenant}`, list);
    return version;
  }

  async generateDataKey(caller: string, tenant: string, recipientPub: string, context: KeyContext) {
    this.assertCaller(caller);
    const kek = this.active(tenant);
    const dek = await genDek(true);
    const blob = { kekVersion: kek.version, wrapped: await wrapWithKek(dek, kek.key) };
    const forRecipient = await wrapForRecipient(dek, recipientPub, context);
    this.ops.generate++;
    const release: RecipientRelease = { wrapped: forRecipient.wrapped, ephPub: forRecipient.ephPub, context };
    return { blob, release };
  }

  async releaseForRecipient(caller: string, tenant: string, blob: { kekVersion: number; wrapped: string }, recipientPub: string, context: KeyContext) {
    this.assertCaller(caller);
    const kek = this.byVersion(tenant, blob.kekVersion);
    const dek = await unwrapWithKek(blob.wrapped, kek.key, true);
    const r = await wrapForRecipient(dek, recipientPub, context);
    this.ops.release++;
    const release: RecipientRelease = { wrapped: r.wrapped, ephPub: r.ephPub, context };
    return release;
  }

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

  markCompromised(v: boolean) {
    this.compromised = v;
  }
  get isCompromised() {
    return this.compromised;
  }
}
