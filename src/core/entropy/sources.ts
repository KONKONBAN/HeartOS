import { randomBytes } from '../sentinel/encoding';
import { aptCutoff, rctCutoff } from './math';

export const PROFILE_FIELDS = [
  ['phenomenon', 'Đối tượng và phép đo', 'Hiện tượng, đại lượng, thiết bị, phiên bản và vị trí lấy mẫu.'],
  ['blockX', 'Khối X và phép số hóa', 'Độ dài khối, cửa sổ thời gian, lượng tử hóa, pipeline và trạng thái liên quan.'],
  ['sideInfoE', 'Thông tin phụ E', 'Quan sát, điều khiển, cấu hình và dữ liệu trung gian đối phương có thể giữ.'],
  ['modelSet', 'Tập mô hình Θ', 'Các mô hình chưa loại trừ và căn cứ loại bỏ hoặc chấp nhận từng giả định.'],
  ['entropyBound', 'Cận entropy', 'Định nghĩa sử dụng, cận k, loại thông tin phụ và phạm vi hiệu lực.'],
  ['dependence', 'Phụ thuộc giữa mẫu', 'Căn cứ mô hình tương quan; không mặc định độc lập theo pixel hoặc khung.'],
  ['faultControl', 'Kiểm soát lỗi', 'Lỗi được xem xét, kiểm tra sức khỏe, tiêu chí dừng và nền RNG còn đáng tin.'],
  ['extractor', 'Trích xuất và seed', 'Họ hàm, nguồn seed, điều kiện độc lập, m và mục tiêu sai lệch ε.'],
  ['rightsData', 'Quyền và dữ liệu', 'Chủ thể được sửa, phê duyệt, thu hồi; phân loại và lưu giữ mẫu.'],
  ['integration', 'Tích hợp và vòng đời', 'Construction, ảnh hưởng thay phiên bản, căn cứ phê duyệt và điều kiện mở lại.'],
] as const;

export type ProfileKey = (typeof PROFILE_FIELDS)[number][0];
export type SourceProfile = Partial<Record<ProfileKey, string>>;

export type SourceStatus = 'approved' | 'closed' | 'degraded' | 'halted';

export interface EntropySource {
  id: string;
  name: string;
  kind: 'os' | 'research';
  hypothesis?: 'H1' | 'H2' | 'H3';
  description: string;
  status: SourceStatus;
  firmware: string;
  approvedFirmware?: string;
  assumedHPerSample: number;
  profile: SourceProfile;
  constructionEvaluated: boolean;
  approvals: { by: string; at: number }[];
  lastHealth?: HealthReport;
}

export const HYPOTHESES = {
  H1: {
    title: 'H1 · Điều chỉnh độ nhớt và tán xạ',
    text: 'Hỗn hợp có độ nhớt/tán xạ điều chỉnh được có thể làm thay đổi λ qua hình học và chuyển động; điều đó không tự xác định mức bí mật của X. Bác bỏ nếu biến động được giải thích bởi tín hiệu đối phương quan sát/điều khiển được (thuộc E).',
  },
  H2: {
    title: 'H2 · Đường thu điện của microplasma',
    text: 'Tín hiệu điện của microplasma có thể là một đường thu khác ngoài camera. Không suy luận rằng nhiệt độ cao hay trạng thái plasma luôn làm tăng cận entropy của dữ liệu đo.',
  },
  H3: {
    title: 'H3 · Phần ngẫu nhiên bổ sung giữa hai kênh',
    text: 'Hai kênh có thể đóng góp phần ngẫu nhiên bổ sung khi quan hệ phụ thuộc được mô hình hóa. Không cộng entropy hai kênh nếu không có phân tích phụ thuộc; ghép phải qua construction được thẩm định, không XOR/hash tự phát.',
  },
} as const;

export function defaultSources(): EntropySource[] {
  return [
    {
      id: 'os-csprng',
      name: 'RNG hệ điều hành (crypto.getRandomValues)',
      kind: 'os',
      description: 'Nền RNG bắt buộc trong phạm vi hiện tại; mọi khóa, nonce và mã chống dùng lại lấy từ đây.',
      status: 'approved',
      firmware: 'platform',
      approvedFirmware: 'platform',
      assumedHPerSample: 8,
      profile: {},
      constructionEvaluated: true,
      approvals: [{ by: 'Nền tảng', at: 0 }],
    },
    {
      id: 'cam-fluid',
      name: 'Camera + hỗn hợp chất lỏng',
      kind: 'research',
      hypothesis: 'H1',
      description: 'Nhánh nghiên cứu quang học. Camera hướng vào vùng cảnh xác định, không thu khuôn mặt/không gian sinh hoạt.',
      status: 'closed',
      firmware: 'cam-fw 2.4.1',
      assumedHPerSample: 2,
      profile: {
        phenomenon: 'Tán xạ ánh sáng qua hỗn hợp glycerol–nước trong ống kín; cảm biến ảnh mô-đun nghiên cứu.',
        blockX: 'Khối 64×64 pixel kênh xanh, 8 bit, trước nén.',
      },
      constructionEvaluated: false,
      approvals: [],
    },
    {
      id: 'microplasma',
      name: 'Microplasma, đường thu điện',
      kind: 'research',
      hypothesis: 'H2',
      description: 'Đường thu điện áp của buồng phóng điện vi mô. Chưa có hồ sơ thiết bị.',
      status: 'closed',
      firmware: 'adc-fw 0.9',
      assumedHPerSample: 1,
      profile: {},
      constructionEvaluated: false,
      approvals: [],
    },
  ];
}

export function profileCompleteness(p: SourceProfile) {
  const filled = PROFILE_FIELDS.filter(([k]) => (p[k] ?? '').trim().length >= 12);
  return { filled: filled.length, total: PROFILE_FIELDS.length, missing: PROFILE_FIELDS.filter(([k]) => (p[k] ?? '').trim().length < 12).map(([, l]) => l) };
}

export type GateAttempt = { ok: true; source: EntropySource } | { ok: false; reasons: string[] };

export function tryOpenGate(src: EntropySource, by: { id: string; human: boolean; isAI?: boolean }, now: number): GateAttempt {
  const reasons: string[] = [];
  if (src.kind === 'os') return { ok: false, reasons: ['Nền RNG hệ điều hành không đi qua cổng nguồn nghiên cứu.'] };
  if (by.isAI || !by.human) reasons.push('AI không được tự mở cổng nguồn hoặc tự cấp nhãn QRNG (§3.14).');
  const c = profileCompleteness(src.profile);
  if (c.filled < c.total) reasons.push(`Hồ sơ thiếu ${c.total - c.filled}/${c.total} trường: ${c.missing.join(', ')}.`);
  if (!src.constructionEvaluated) reasons.push('Construction tích hợp chưa được thẩm định, không tự sửa trạng thái nội bộ CSPRNG, không XOR/hash tự phát.');
  if (src.lastHealth && !src.lastHealth.ok) reasons.push('Lần kiểm tra sức khỏe gần nhất thất bại.');
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, source: { ...src, status: 'approved', approvedFirmware: src.firmware, approvals: [...src.approvals, { by: by.id, at: now }] } };
}

export function changeFirmware(src: EntropySource, fw: string): EntropySource {
  const invalid = src.kind === 'research' && src.status === 'approved' && src.approvedFirmware !== fw;
  return { ...src, firmware: fw, status: invalid ? 'closed' : src.status };
}

export type StreamMode = 'normal' | 'stuck' | 'biased' | 'replay';

export interface HealthReport {
  at: number;
  mode: StreamMode;
  samples: number;
  H: number;
  rct: { cutoff: number; maxRun: number; pass: boolean };
  apt: { window: number; cutoff: number; maxCount: number; pass: boolean };
  replay: { duplicateBlocks: number; pass: boolean };
  ok: boolean;
  histogram: number[];
}

export function sampleStream(mode: StreamMode, n = 2048): Uint8Array {
  const raw = randomBytes(n);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = raw[i] & 0x3f ? raw[i] & 0x0f | ((raw[i] >> 6) << 4) : 7;
  }
  if (mode === 'stuck') out.fill(out[100], 600, 600 + 220);
  if (mode === 'biased') {
    for (let i = 0; i < n; i++) if (raw[i] < 180) out[i] = 7;
    for (let i = 0; i < n; i += 512) out[i] = 7;
  }
  if (mode === 'replay') for (let b = 8; b < 20; b++) out.set(out.subarray(0, 64), b * 64);
  return out;
}

export function healthTest(samples: Uint8Array, H: number, mode: StreamMode, now: number, W = 512): HealthReport {
  const C = rctCutoff(H);
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < samples.length; i++) {
    run = samples[i] === samples[i - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  const aC = aptCutoff(H, W);
  let maxCount = 0;
  for (let s = 0; s + W <= samples.length; s += W) {
    const first = samples[s];
    let cnt = 0;
    for (let i = s; i < s + W; i++) if (samples[i] === first) cnt++;
    maxCount = Math.max(maxCount, cnt);
  }
  const seen = new Set<string>();
  let dup = 0;
  for (let s = 0; s + 64 <= samples.length; s += 64) {
    const key = Array.from(samples.subarray(s, s + 64)).join(',');
    if (seen.has(key)) dup++;
    seen.add(key);
  }
  const histogram = new Array(16).fill(0);
  samples.forEach((v) => histogram[v >> 4]++);
  const rct = { cutoff: C, maxRun, pass: maxRun < C };
  const apt = { window: W, cutoff: aC, maxCount, pass: maxCount < aC };
  const replay = { duplicateBlocks: dup, pass: dup === 0 };
  return { at: now, mode, samples: samples.length, H, rct, apt, replay, ok: rct.pass && apt.pass && replay.pass, histogram };
}
