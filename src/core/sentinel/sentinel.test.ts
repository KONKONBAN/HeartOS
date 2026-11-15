import { describe, expect, it } from 'vitest';
import { memoryJsonStore, memoryObjectStore } from '../storage';
import { canonical, encodeAAD } from './encoding';
import { TABLE_4_1, eNew } from './bounds';
import { Sentinel } from './sentinel';
import { SCENARIO_LIST, runScenario } from './threats';

const DIR = [
  { id: 'an', name: 'An', tenant: 't1', role: 'admin' as const },
  { id: 'lan', name: 'Lan', tenant: 't1', role: 'member' as const },
  { id: 'linh', name: 'Linh', tenant: 't1', role: 'member' as const },
];

async function mk() {
  return Sentinel.create({ json: memoryJsonStore(), objects: memoryObjectStore(), tenant: 't1', directory: DIR });
}

describe('encoding', () => {
  it('canonical JSON sorts keys deterministically', () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it('AAD is unambiguous', () => {
    const a = encodeAAD({ tenant: 'ab', object: 'c', version: 1, type: 'x' });
    const b = encodeAAD({ tenant: 'a', object: 'bc', version: 1, type: 'x' });
    expect(Array.from(a).join(',')).not.toBe(Array.from(b).join(','));
  });
});

describe('Sentinel read/write path', () => {
  it('protects and releases only granted fields to permitted viewers', async () => {
    const s = await mk();
    const w = await s.protect({ subject: 'lan', objectId: 'o1', type: 'memory', label: 'Bếp', data: { title: 'Bếp', body: 'bí mật' }, viewers: ['an'], purposes: ['memory.view'] });
    expect(w.ok).toBe(true);
    expect(s.vault.get('o1')!.ciphertext).not.toContain('bí mật');
    const r = await s.read<{ title: string }>({ subject: 'an', objectId: 'o1', purpose: 'memory.view', fields: ['title'] });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ title: 'Bếp' });
    expect(r.decision).toMatchObject({ Gok: true, Aok: true, Eok: true, Bok: true });
    const denied = await s.read({ subject: 'linh', objectId: 'o1', purpose: 'memory.view' });
    expect(denied.ok).toBe(false);
    const wrongPurpose = await s.read({ subject: 'an', objectId: 'o1', purpose: 'marketing' });
    expect(wrongPurpose.ok).toBe(false);
  });

  it('revocation bumps epoch and blocks further reads', async () => {
    const s = await mk();
    await s.protect({ subject: 'lan', objectId: 'o1', type: 'memory', label: 'x', data: { a: 1 }, viewers: ['an'], purposes: ['p'] });
    const e0 = s.epoch();
    const rv = await s.revoke({ actor: 'lan', objectId: 'o1', viewer: 'an', reason: 'test' });
    expect(rv.ok && rv.epoch).toBe(e0 + 1);
    expect((await s.read({ subject: 'an', objectId: 'o1', purpose: 'p' })).ok).toBe(false);
  });

  it('journal hash chain verifies', async () => {
    const s = await mk();
    await s.protect({ subject: 'lan', objectId: 'o1', type: 'memory', label: 'x', data: { a: 1 }, viewers: ['an'], purposes: ['p'] });
    await s.read({ subject: 'an', objectId: 'o1', purpose: 'p' });
    expect((await s.journal.verify()).ok).toBe(true);
  });
});

describe('cận dữ liệu phát hành mới (K2)', () => {
  it('tái lập Bảng 4.1', () => {
    expect(TABLE_4_1.map((r) => r.b0)).toEqual([0.5, 1.75, 3, 5.5, 8, 8.5]);
    expect(TABLE_4_1.map((r) => r.b1)).toEqual([1.5, 2.75, 4, 6.5, 8.5, 8.5]);
    expect(eNew({ Drem: 1, Q: 0.5, Lrem: 8, B: 1, r: 1 }, 10)).toBe(1);
  });
});

describe('threat scenarios T1–T7', () => {
  for (const sc of SCENARIO_LIST) {
    it(`${sc.id} ${sc.threat}: ${sc.title}`, async () => {
      const r = await runScenario(sc.id);
      const failed = r.steps.filter((s) => !s.ok);
      expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    });
  }
});
