import type { JsonStore } from '../storage';
import { sha256Hex } from './encoding';
import type { ObjectMeta, StoredObject } from './types';

export class CoreVault {
  private objects: Record<string, StoredObject>;
  private listeners = new Set<() => void>();

  constructor(private store: JsonStore, private key = 'sentinel.vault') {
    this.objects = store.get<Record<string, StoredObject>>(key) ?? {};
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    this.store.set(this.key, this.objects);
    this.listeners.forEach((l) => l());
  }

  get(objectId: string): StoredObject | undefined {
    return this.objects[objectId];
  }

  meta(objectId: string): ObjectMeta | undefined {
    return this.objects[objectId]?.meta;
  }

  list(tenant?: string): StoredObject[] {
    return Object.values(this.objects).filter((o) => !tenant || o.meta.tenant === tenant);
  }

  commit(obj: StoredObject) {
    this.objects[obj.meta.objectId] = obj;
    this.persist();
  }

  updateAcl(objectId: string, patch: Partial<Pick<ObjectMeta, 'viewers' | 'purposes' | 'expiresAt'>>) {
    const o = this.objects[objectId];
    if (!o) return;
    o.meta = { ...o.meta, ...patch };
    this.persist();
  }

  tamper(objectId: string, kind: 'ciphertext' | 'swap-version') {
    const o = this.objects[objectId];
    if (!o) return;
    if (kind === 'ciphertext') {
      const c = o.ciphertext;
      const i = Math.floor(c.length / 2);
      o.ciphertext = c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
    } else {
      o.meta = { ...o.meta, version: o.meta.version + 1 };
    }
    this.persist();
  }

  remove(objectId: string) {
    delete this.objects[objectId];
    this.persist();
  }

  replaceAll(objs: StoredObject[]) {
    this.objects = Object.fromEntries(objs.map((o) => [o.meta.objectId, o]));
    this.persist();
  }

  async ciphertextHash(o: StoredObject) {
    return sha256Hex(`${o.iv}|${o.ciphertext}|${o.blob.kekVersion}|${o.blob.wrapped}`);
  }
}
