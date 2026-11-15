import type { RadarTarget, RoomId, ThermalFrame } from './types';

export interface Person {
  id: number;
  room: RoomId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  posture: 'standing' | 'walking' | 'lying' | 'sitting';
  stillSince?: number;
  fall?: { phase: 'walk' | 'drop' | 'down'; at: number };
}

let rngState = 0x2f6b9a1d;
function rnd() {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return ((rngState >>> 0) % 10_000) / 10_000;
}

export function seedPeople(): Person[] {
  return [
    { id: 1, room: 'living', x: -600, y: 2400, vx: 0, vy: 0, posture: 'sitting', stillSince: Date.now() },
    { id: 2, room: 'kitchen', x: 900, y: 1800, vx: 120, vy: -40, posture: 'walking' },
  ];
}

export function stepPeople(people: Person[], dt: number, now: number): Person[] {
  return people.map((p) => {
    const q = { ...p };
    if (q.fall) {
      const t = now - q.fall.at;
      if (q.fall.phase === 'walk' && t > 1500) q.fall = { phase: 'drop', at: now };
      else if (q.fall.phase === 'drop' && t > 900) {
        q.fall = { phase: 'down', at: now };
        q.posture = 'lying';
        q.stillSince = now;
      }
      if (q.fall.phase === 'walk') {
        q.vx = 600;
        q.vy = 0;
      } else if (q.fall.phase === 'drop') {
        q.vx = 1800;
        q.vy = 900;
      } else {
        q.vx = 0;
        q.vy = 0;
      }
    } else if (q.posture === 'walking') {
      q.vx += (rnd() - 0.5) * 200;
      q.vy += (rnd() - 0.5) * 200;
      q.vx = Math.max(-700, Math.min(700, q.vx));
      q.vy = Math.max(-700, Math.min(700, q.vy));
      if (rnd() < 0.03) {
        q.posture = 'standing';
        q.stillSince = now;
      }
    } else if (q.posture === 'standing' || q.posture === 'sitting') {
      q.vx = (rnd() - 0.5) * 30;
      q.vy = (rnd() - 0.5) * 30;
      if (q.posture === 'standing' && rnd() < 0.05) q.posture = 'walking';
    }
    q.x = Math.max(-2800, Math.min(2800, q.x + (q.vx * dt) / 1000));
    q.y = Math.max(300, Math.min(5800, q.y + (q.vy * dt) / 1000));
    if (q.x <= -2800 || q.x >= 2800) q.vx = -q.vx;
    if (q.y <= 300 || q.y >= 5800) q.vy = -q.vy;
    return q;
  });
}

export function radarTargets(people: Person[], room: RoomId): RadarTarget[] {
  return people
    .filter((p) => p.room === room)
    .slice(0, 3)
    .map((p) => ({ id: p.id, room, x: Math.round(p.x + (rnd() - 0.5) * 60), y: Math.round(p.y + (rnd() - 0.5) * 60), speed: Math.round(Math.hypot(p.vx, p.vy) / 10) }));
}

export function thermalFrame(people: Person[], room: RoomId, ambient: number, now: number): ThermalFrame {
  const w = 32;
  const h = 24;
  const data = new Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = ambient + (rnd() - 0.5) * 0.8 + (Math.floor(i / w) / h) * 0.6;
  for (const p of people.filter((x) => x.room === room)) {
    const cx = ((p.x + 3000) / 6000) * w;
    const lying = p.posture === 'lying';
    const sitting = p.posture === 'sitting';
    const cy = lying ? h * 0.82 : sitting ? h * 0.58 : h * 0.48;
    const sx = lying ? 5.2 : 1.6;
    const sy = lying ? 1.3 : sitting ? 2.8 : 4.4;
    const peak = 33.5 - ambient;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = ((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2;
        if (d < 9) data[y * w + x] += peak * Math.exp(-d / 2);
      }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { w: 32, h: 24, data: data.map((v: number) => Math.round(v * 10) / 10), min, max, at: now };
}

export interface Blob {
  pixels: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  aspect: number;
  centroidY: number;
  peak: number;
}

export function largestBlob(f: ThermalFrame): Blob | null {
  const sorted = [...f.data].sort((a, b) => a - b);
  const thr = sorted[Math.floor(sorted.length / 2)] + 4;
  const seen = new Uint8Array(f.w * f.h);
  let best: Blob | null = null;
  for (let i = 0; i < f.data.length; i++) {
    if (seen[i] || f.data[i] < thr) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0;
    let minX = 99, maxX = -1, minY = 99, maxY = -1, sy = 0, peak = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % f.w;
      const y = Math.floor(j / f.w);
      n++;
      sy += y;
      peak = Math.max(peak, f.data[j]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const k = ny * f.w + nx;
        if (!seen[k] && f.data[k] >= thr) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (n >= 4 && (!best || n > best.pixels)) {
      best = { pixels: n, minX, maxX, minY, maxY, aspect: (maxX - minX + 1) / (maxY - minY + 1), centroidY: sy / n, peak };
    }
  }
  return best;
}
