export interface JsonStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  del(key: string): void;
}

export interface ObjectStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function memoryJsonStore(): JsonStore {
  const m = new Map<string, string>();
  return {
    get: (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined),
    set: (k, v) => void m.set(k, JSON.stringify(v)),
    del: (k) => void m.delete(k),
  };
}

export function memoryObjectStore(): ObjectStore {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => m.get(k) as never,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
}

export function indexedObjectStore(dbName = 'heartos', storeName = 'objects'): ObjectStore {
  if (typeof indexedDB === 'undefined') return memoryObjectStore();
  let dbp: Promise<IDBDatabase> | null = null;
  const fallback = memoryObjectStore();
  let broken = false;
  const open = () => {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  };
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const r = fn(t.objectStore(storeName));
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
    });
  };
  const guard = async <T>(op: () => Promise<T>, alt: () => Promise<T>) => {
    if (broken) return alt();
    try {
      return await op();
    } catch {
      broken = true;
      return alt();
    }
  };
  return {
    get: (k) => guard(() => tx('readonly', (s) => s.get(k)), () => fallback.get(k)),
    set: (k, v) => guard(() => tx<void>('readwrite', (s) => s.put(v, k)).then(() => undefined), () => fallback.set(k, v)),
    del: (k) => guard(() => tx<void>('readwrite', (s) => s.delete(k)).then(() => undefined), () => fallback.del(k)),
    keys: () => guard(() => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String)), () => fallback.keys()),
  };
}
