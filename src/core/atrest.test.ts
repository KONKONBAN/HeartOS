import { describe, expect, it } from 'vitest';
import { SEALED_MARK, encryptedJsonStore, encryptedStateStorage, openAtRest, type KeyValueBacking } from './atrest';
import { memoryObjectStore } from './storage';

function memBacking(init: Record<string, string> = {}): KeyValueBacking & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (n) => m.get(n) ?? null,
    setItem: (n, v) => void m.set(n, v),
    removeItem: (n) => void m.delete(n),
    dump: () => Object.fromEntries(m),
  };
}

describe('mã hóa khi lưu', () => {
  it('niêm phong và mở lại, phát hiện sửa đổi và tráo tên khóa', async () => {
    const a = await openAtRest(memoryObjectStore());
    const sealed = await a.seal('heartos-app', '{"claudeKey":"sk-bi-mat"}');
    expect(sealed.startsWith(SEALED_MARK)).toBe(true);
    expect(sealed).not.toContain('sk-bi-mat');
    expect(await a.open('heartos-app', sealed)).toBe('{"claudeKey":"sk-bi-mat"}');
    expect(await a.open('heartos:khac', sealed)).toBeNull();
    const raw = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await a.open('heartos-app', raw)).toBeNull();
  });

  it('chỉ nhận dữ liệu cũ dạng rõ ở lần tạo khóa đầu tiên', async () => {
    const objects = memoryObjectStore();
    const first = await openAtRest(objects);
    expect(first.acceptsLegacy).toBe(true);
    expect(await first.open('x', '{"a":1}')).toBe('{"a":1}');
    const again = await openAtRest(objects);
    expect(again.acceptsLegacy).toBe(false);
    expect(await again.open('x', '{"a":1}')).toBeNull();
  });

  it('kho JSON lưu bản mã, mở lại được bằng cùng khóa và chuyển dữ liệu cũ sang bản mã', async () => {
    const objects = memoryObjectStore();
    const backing = memBacking({ 'heartos:legacy': '{"v":1}', 'other:keep': 'x' });
    const store = await encryptedJsonStore('heartos:', await openAtRest(objects), backing);
    expect(store.get('legacy')).toEqual({ v: 1 });
    store.set('sentinel.state', { epoch: 42, secret: 'lich-ranh' });
    for (let i = 0; i < 20; i++) store.set('counter', i);
    await store.flush();
    const dump = backing.dump();
    expect(dump['heartos:legacy'].startsWith(SEALED_MARK)).toBe(true);
    expect(dump['heartos:sentinel.state']).not.toContain('lich-ranh');
    expect(dump['other:keep']).toBe('x');
    const reopened = await encryptedJsonStore('heartos:', await openAtRest(objects), backing);
    expect(reopened.get('sentinel.state')).toEqual({ epoch: 42, secret: 'lich-ranh' });
    expect(reopened.get('counter')).toBe(19);
    reopened.del('counter');
    await reopened.flush();
    expect(backing.getItem('heartos:counter')).toBeNull();
  });

  it('bản mã không giải được bị bỏ, dữ liệu rõ chèn vào sau bị từ chối', async () => {
    const objects = memoryObjectStore();
    const backing = memBacking();
    const a = await openAtRest(objects);
    const store = await encryptedJsonStore('heartos:', a, backing);
    store.set('k', { ok: true });
    await store.flush();
    backing.setItem('heartos:injected', '{"role":"admin"}');
    backing.setItem('heartos:broken', SEALED_MARK + 'AAAA');
    const reopened = await encryptedJsonStore('heartos:', await openAtRest(objects), backing);
    expect(reopened.get('k')).toEqual({ ok: true });
    expect(reopened.get('injected')).toBeUndefined();
    expect(reopened.get('broken')).toBeUndefined();
    expect(backing.getItem('heartos:injected')).toBeNull();
  });

  it('trạng thái ứng dụng: không ghi trước khi nạp, ghi tuần tự giữ bản mới nhất', async () => {
    const objects = memoryObjectStore();
    const backing = memBacking();
    const key = openAtRest(objects);
    const storage = encryptedStateStorage(() => key, () => backing);
    await storage.setItem('heartos-app', '{"stale":true}');
    expect(backing.getItem('heartos-app')).toBeNull();
    expect(await storage.getItem('heartos-app')).toBeNull();
    const writes = Array.from({ length: 10 }, (_, i) => storage.setItem('heartos-app', JSON.stringify({ n: i })));
    await Promise.all(writes);
    const stored = backing.getItem('heartos-app')!;
    expect(stored.startsWith(SEALED_MARK)).toBe(true);
    const fresh = encryptedStateStorage(() => key, () => backing);
    expect(await fresh.getItem('heartos-app')).toBe('{"n":9}');
  });
});
