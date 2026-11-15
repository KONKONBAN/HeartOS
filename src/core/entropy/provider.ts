import { buf } from '../sentinel/encoding';
import { healthTest, type EntropySource, type HealthReport } from './sources';

export interface EntropyProvider {
  readonly id: string;
  readonly name: string;
  available(): boolean;
  read(length: number): Promise<Uint8Array>;
}

export interface Seed {
  bytes: Uint8Array;
  sources: string[];
  rejected?: string;
}

const COMBINE_INFO = new TextEncoder().encode('heartos/entropy/combine/v1');
const SECURITY_MARGIN_BITS = 64;

export async function combine(os: Uint8Array, extra: Uint8Array, length: number): Promise<Uint8Array> {
  if (os.length < length) throw new Error('Phần lấy từ CSPRNG hệ điều hành phải dài ít nhất bằng đầu ra');
  const ikm = new Uint8Array(os.length + extra.length);
  ikm.set(os);
  ikm.set(extra, os.length);
  const material = buf(ikm);
  ikm.fill(0);
  const key = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveBits']);
  new Uint8Array(material).fill(0);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new ArrayBuffer(32), info: buf(COMBINE_INFO) }, key, length * 8);
  return new Uint8Array(bits);
}

export async function drawSeed(length: number, extra?: EntropyProvider): Promise<Seed> {
  const os = crypto.getRandomValues(new Uint8Array(length));
  if (!extra || !extra.available()) return { bytes: os, sources: ['os'] };
  try {
    const raw = await extra.read(length);
    return { bytes: await combine(os, raw, length), sources: ['os', extra.id] };
  } catch (e) {
    return { bytes: os, sources: ['os'], rejected: (e as Error).message };
  }
}

export const samplesNeeded = (length: number, hPerSample: number) => Math.ceil((8 * length + SECURITY_MARGIN_BITS) / hPerSample);

export function sourceUsable(src: EntropySource): boolean {
  return src.kind === 'research' && src.status === 'approved' && src.approvedFirmware === src.firmware && src.constructionEvaluated && (!src.lastHealth || src.lastHealth.ok);
}

export function gatedProvider(src: EntropySource, readRaw: (samples: number) => Promise<Uint8Array>, onHealth?: (r: HealthReport) => void, now: () => number = Date.now): EntropyProvider {
  let current = src;
  return {
    id: src.id,
    name: src.name,
    available: () => sourceUsable(current),
    async read(length) {
      if (!sourceUsable(current)) throw new Error(`Nguồn ${current.name} chưa được phê duyệt hoặc đang đóng`);
      const n = samplesNeeded(length, current.assumedHPerSample);
      const samples = await readRaw(n);
      if (samples.length < n) throw new Error(`Nguồn ${current.name} trả thiếu mẫu (${samples.length}/${n})`);
      const report = healthTest(samples, current.assumedHPerSample, 'normal', now(), Math.min(512, n));
      current = { ...current, lastHealth: report, status: report.ok ? current.status : 'halted' };
      onHealth?.(report);
      if (!report.ok) throw new Error(`Nguồn ${current.name} không qua kiểm tra sức khỏe, đã dừng nhánh này`);
      return samples;
    },
  };
}
