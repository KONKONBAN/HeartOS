export type LngLat = [number, number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const out: LngLat[] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

export function cumulative(line: LngLat[]) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]));
  return cum;
}

function toXY(p: LngLat, ref: LngLat): [number, number] {
  return [rad(p[0] - ref[0]) * Math.cos(rad(ref[1])) * R, rad(p[1] - ref[1]) * R];
}

export interface Snap {
  segment: number;
  t: number;
  point: LngLat;
  dist: number;
  along: number;
}

export function snapToLine(line: LngLat[], cum: number[], p: LngLat, from = 0, to = line.length - 1): Snap {
  let best: Snap = { segment: 0, t: 0, point: line[0], dist: Infinity, along: 0 };
  const start = Math.max(0, Math.min(from, line.length - 2));
  const end = Math.max(start + 1, Math.min(to, line.length - 1));
  for (let i = start; i < end; i++) {
    const a = line[i];
    const b = line[i + 1];
    const [bx, by] = toXY(b, a);
    const [px, py] = toXY(p, a);
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const dx = px - t * bx;
    const dy = py - t * by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < best.dist) {
      const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      best = { segment: i, t, point, dist, along: cum[i] + (cum[i + 1] - cum[i]) * t };
    }
  }
  return best;
}

export function pointAlong(line: LngLat[], cum: number[], meters: number): LngLat {
  if (meters <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= meters) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (meters - cum[i - 1]) / seg;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
  }
  return line[line.length - 1];
}

export function sliceAlong(line: LngLat[], cum: number[], from: number, to: number): LngLat[] {
  const total = cum[cum.length - 1] ?? 0;
  const a = Math.max(0, Math.min(from, total));
  const b = Math.max(a, Math.min(to, total));
  const out: LngLat[] = [pointAlong(line, cum, a)];
  for (let i = 0; i < line.length; i++) if (cum[i] > a && cum[i] < b) out.push(line[i]);
  out.push(pointAlong(line, cum, b));
  return out;
}

export function headingAlong(line: LngLat[], cum: number[], at: number, ahead = 20): number {
  const total = cum[cum.length - 1] ?? 0;
  const from = Math.min(at, Math.max(0, total - ahead));
  return bearing(pointAlong(line, cum, from), pointAlong(line, cum, Math.min(total, from + ahead)));
}

export function bboxOf(points: LngLat[]): [LngLat, LngLat] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [[w, s], [e, n]];
}

export function parseLatLng(s: string | null | undefined): LngLat | null {
  if (!s) return null;
  const m = s.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

export const latLngText = (p: LngLat) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`;

export function fmtDistance(m: number) {
  if (!Number.isFinite(m)) return '';
  if (m < 50) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

export function fmtDuration(s: number) {
  if (!Number.isFinite(s)) return '';
  const min = Math.round(s / 60);
  if (min < 1) return 'Dưới 1 phút';
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} giờ ${rest} phút` : `${h} giờ`;
}

export function fmtClock(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DIRS = ['bắc', 'đông bắc', 'đông', 'đông nam', 'nam', 'tây nam', 'tây', 'tây bắc'];

export function compassWord(b: number) {
  return DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8];
}
