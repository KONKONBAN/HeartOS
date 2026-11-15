/**
 * Guardian — ghép radar và ảnh nhiệt theo cặp vùng để phát hiện "nghi ngã".
 * Nguyên tắc: tín hiệu chỉ là quan sát; chưa đủ bằng chứng thì giữ trạng thái "đang xác minh",
 * không tự kết luận và không tự gọi dịch vụ khẩn cấp.
 */
import type { Blob } from '../smarthome/sensors';
import type { RadarTarget } from '../smarthome/types';

export interface FusionInput {
  /** Lịch sử tốc độ mục tiêu radar (cm/s) trong ~10 giây gần nhất, mới nhất ở cuối. */
  speedHistory: number[];
  stillSeconds: number;
  blob: Blob | null;
  frameHeight: number;
}

export interface FusionResult {
  score: number;
  level: 'none' | 'watch' | 'suspected';
  cues: { name: string; value: string; weight: number; hit: boolean }[];
}

export const FALL_THRESHOLD = 0.6;
export const WATCH_THRESHOLD = 0.35;

export function fuse(inp: FusionInput): FusionResult {
  const peak = Math.max(0, ...inp.speedHistory);
  const last = inp.speedHistory.slice(-3);
  const settled = last.length > 0 && last.every((v) => v < 8);
  const radarDrop = peak > 120 && settled;
  const lying = !!inp.blob && inp.blob.aspect > 1.6;
  const low = !!inp.blob && inp.blob.centroidY > inp.frameHeight * 0.66;
  const still = Math.min(1, inp.stillSeconds / 15);
  const cues = [
    { name: 'Radar: tăng tốc đột ngột rồi đứng yên', value: `đỉnh ${peak} cm/s`, weight: 0.35, hit: radarDrop },
    { name: 'Nhiệt: vệt nằm ngang', value: inp.blob ? `tỉ lệ ${inp.blob.aspect.toFixed(2)}` : 'không thấy vệt', weight: 0.35, hit: lying },
    { name: 'Nhiệt: vệt thấp trong khung', value: inp.blob ? `tâm y ${inp.blob.centroidY.toFixed(1)}/${inp.frameHeight}` : '—', weight: 0.15, hit: low },
    { name: 'Thời gian bất động', value: `${Math.round(inp.stillSeconds)} s`, weight: 0.15, hit: still >= 1 },
  ];
  const score = (radarDrop ? 0.35 : 0) + (lying ? 0.35 : 0) + (low ? 0.15 : 0) + 0.15 * still;
  return { score: Math.round(score * 100) / 100, level: score >= FALL_THRESHOLD ? 'suspected' : score >= WATCH_THRESHOLD ? 'watch' : 'none', cues };
}

export function summarizeTargets(t: RadarTarget[]) {
  return t.map((x) => `#${x.id} (${(x.x / 1000).toFixed(1)}, ${(x.y / 1000).toFixed(1)}) m · ${x.speed} cm/s`).join(' · ');
}
