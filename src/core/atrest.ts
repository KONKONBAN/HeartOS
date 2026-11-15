import { buf, fromB64, fromUtf8, toB64, utf8 } from './sentinel/encoding';
import { memoryJsonStore, type JsonStore, type ObjectStore } from './storage';

export const SEALED_MARK = 'enc1:';
const AAD_PREFIX = 'heartos/atrest/v1|';

export interface KeyValueBacking {
  readonly length: number;
  key(index: number): string | null;
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

export interface AtRest {
  readonly acceptsLegacy: boolean;
  seal(name: string, plain: string): Promise<string>;
  open(name: string, stored: string): Promise<string | null>;
}

export async function openAtRest(objects: ObjectStore, keyName = 'atrest.key'): Promise<AtRest> {
  const saved = await objects.get<CryptoKey>(keyName).catch(() => undefined);
  let key: CryptoKey;
  let acceptsLegacy = false;
  if (saved instanceof CryptoKey) key = saved;
  else {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await objects.set(keyName, key);
    acceptsLegacy = true;
  }
  return {
    acceptsLegacy,
    async seal(name, plain) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: buf(utf8(AAD_PREFIX + name)) }, key, buf(utf8(plain))));
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv);
      out.set(ct, iv.length);
      return SEALED_MARK + toB64(out);
    },
    async open(name, stored) {
      if (!stored.startsWith(SEALED_MARK)) return acceptsLegacy ? stored : null;
      try {
        const raw = fromB64(stored.slice(SEALED_MARK.length));
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(raw.subarray(0, 12)), additionalData: buf(utf8(AAD_PREFIX + name)) }, key, buf(raw.subarray(12)));
        return fromUtf8(pt);
      } catch {
        return null;
      }
    },
  };
}

export function browserStorage(): KeyValueBacking | null {
  try {
    const probe = 'heartos:__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function writeQueue(backing: KeyValueBacking, atRest: AtRest) {
  const pending = new Map<string, string | null>();
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (name: string, value: string | null) => {
    pending.set(name, value);
    chain = chain.then(async () => {
      if (!pending.has(name)) return;
      const v = pending.get(name)!;
      pending.delete(name);
      try {
        if (v === null) backing.removeItem(name);
        else backing.setItem(name, await atRest.seal(name, v));
      } catch {
        return;
      }
    });
    return chain;
  };
  return { enqueue, flush: () => chain };
}

export type EncryptedJsonStore = JsonStore & { flush(): Promise<void> };

export async function encryptedJsonStore(prefix: string, atRest: AtRest, backing: KeyValueBacking | null = browserStorage()): Promise<EncryptedJsonStore> {
  if (!backing) return Object.assign(memoryJsonStore(), { flush: async () => undefined });
  const cache = new Map<string, string>();
  const queue = writeQueue(backing, atRest);
  const names: string[] = [];
  for (let i = 0; i < backing.length; i++) {
    const n = backing.key(i);
    if (n && n.startsWith(prefix)) names.push(n);
  }
  for (const n of names) {
    const stored = backing.getItem(n);
    if (stored == null) continue;
    const plain = await atRest.open(n, stored);
    if (plain == null) {
      backing.removeItem(n);
      continue;
    }
    cache.set(n.slice(prefix.length), plain);
    if (!stored.startsWith(SEALED_MARK)) void queue.enqueue(n, plain);
  }
  const del = (k: string) => {
    cache.delete(k);
    void queue.enqueue(prefix + k, null);
  };
  return {
    get(k) {
      const v = cache.get(k);
      return v == null ? undefined : JSON.parse(v);
    },
    set(k, v) {
      const s = JSON.stringify(v);
      if (s === undefined) return del(k);
      cache.set(k, s);
      void queue.enqueue(prefix + k, s);
    },
    del,
    flush: queue.flush,
  };
}

export interface AsyncStateStorage {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

export function encryptedStateStorage(atRest: () => Promise<AtRest>, backing: () => KeyValueBacking | null = browserStorage): AsyncStateStorage {
  const loaded = new Set<string>();
  let queue: ReturnType<typeof writeQueue> | null = null;
  const q = async () => {
    const b = backing();
    if (!b) return null;
    queue ??= writeQueue(b, await atRest());
    return { b, queue };
  };
  return {
    async getItem(name) {
      const ctx = await q();
      if (!ctx) {
        loaded.add(name);
        return null;
      }
      const stored = ctx.b.getItem(name);
      const plain = stored == null ? null : await (await atRest()).open(name, stored);
      if (stored != null && plain == null) ctx.b.removeItem(name);
      loaded.add(name);
      return plain;
    },
    async setItem(name, value) {
      if (!loaded.has(name)) return;
      const ctx = await q();
      if (ctx) await ctx.queue.enqueue(name, value);
    },
    async removeItem(name) {
      const ctx = await q();
      if (ctx) await ctx.queue.enqueue(name, null);
    },
  };
}
