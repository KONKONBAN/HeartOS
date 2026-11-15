import { describe, expect, it } from 'vitest';
import { EXAMPLE_BB, TABLE_A1, aptCutoff, hMin, maxOutputBits, rctCutoff } from './math';
import { combine, drawSeed, gatedProvider, samplesNeeded } from './provider';
import { PROFILE_FIELDS, changeFirmware, defaultSources, healthTest, sampleStream, tryOpenGate, type EntropySource } from './sources';

const research = () => defaultSources().find((s) => s.id === 'cam-fluid')!;

function approved(): EntropySource {
  const src = research();
  const profile = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, 'Mô tả đầy đủ cho hồ sơ nguồn']));
  const r = tryOpenGate({ ...src, profile, constructionEvaluated: true }, { id: 'an', human: true }, 1);
  if (!r.ok) throw new Error(r.reasons.join(' '));
  return r.source;
}

describe('toán entropy', () => {
  it('tái lập Bảng A.1 và ví dụ A.1', () => {
    expect(TABLE_A1.map((r) => r.log2d)).toEqual([-65, -129, -193]);
    expect(hMin(EXAMPLE_BB.noSideInfo)).toBeCloseTo(1);
    expect(hMin(EXAMPLE_BB.sideInfoB)).toBeCloseTo(0);
    expect(maxOutputBits(384, 2 ** -64)).toBe(256);
  });
  it('ngưỡng và phát hiện của kiểm tra sức khỏe', () => {
    expect(rctCutoff(2)).toBe(11);
    expect(aptCutoff(2)).toBeGreaterThan(128);
    const now = Date.now();
    expect(healthTest(sampleStream('normal'), 2, 'normal', now).ok).toBe(true);
    expect(healthTest(sampleStream('stuck'), 2, 'stuck', now).rct.pass).toBe(false);
    expect(healthTest(sampleStream('biased'), 2, 'biased', now).apt.pass).toBe(false);
    expect(healthTest(sampleStream('replay'), 2, 'replay', now).replay.pass).toBe(false);
  });
});

describe('cổng nguồn', () => {
  it('AI không mở được, hồ sơ thiếu thì giữ đóng', () => {
    const ai = tryOpenGate(research(), { id: 'agent', human: false, isAI: true }, 1);
    expect(ai.ok).toBe(false);
    const human = tryOpenGate(research(), { id: 'an', human: true }, 1);
    expect(human.ok).toBe(false);
  });
  it('đổi firmware làm mất hiệu lực phê duyệt', () => {
    const src = approved();
    expect(src.status).toBe('approved');
    expect(changeFirmware(src, 'cam-fw 9.9').status).toBe('closed');
  });
});

describe('ghép với CSPRNG hệ điều hành', () => {
  it('HKDF cho đầu ra xác định theo đầu vào và đúng độ dài', async () => {
    const os = new Uint8Array(32).fill(1);
    const a = await combine(os, new Uint8Array([1, 2, 3]), 32);
    const b = await combine(os, new Uint8Array([1, 2, 3]), 32);
    const c = await combine(new Uint8Array(32).fill(2), new Uint8Array([1, 2, 3]), 32);
    expect(a.length).toBe(32);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    await expect(combine(new Uint8Array(8), new Uint8Array(64), 32)).rejects.toThrow();
  });
  it('không có nguồn bổ sung thì chỉ dùng CSPRNG hệ điều hành', async () => {
    const s = await drawSeed(32);
    expect(s.bytes.length).toBe(32);
    expect(s.sources).toEqual(['os']);
    const closed = gatedProvider(research(), async (n) => sampleStream('normal', n));
    expect((await drawSeed(32, closed)).sources).toEqual(['os']);
  });
  it('nguồn đã duyệt và khỏe được ghép, nguồn lỗi bị dừng và không ảnh hưởng đầu ra', async () => {
    const good = gatedProvider(approved(), async (n) => sampleStream('normal', Math.max(n, 2048)));
    expect((await drawSeed(32, good)).sources).toEqual(['os', 'cam-fluid']);
    const health: boolean[] = [];
    const stuck = gatedProvider(approved(), async (n) => new Uint8Array(Math.max(n, 2048)).fill(7), (r) => health.push(r.ok));
    const s = await drawSeed(32, stuck);
    expect(s.sources).toEqual(['os']);
    expect(s.rejected).toBeTruthy();
    expect(health).toEqual([false]);
    expect(stuck.available()).toBe(false);
  });
  it('số mẫu thô đủ cho đầu ra cộng biên an toàn', () => {
    expect(samplesNeeded(32, 2)).toBe(160);
    expect(samplesNeeded(32, 8)).toBe(40);
  });
});
