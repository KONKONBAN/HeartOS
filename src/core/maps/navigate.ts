import { haversine, snapToLine, type LngLat } from './geo';
import type { Route, RouteStep } from './route';

export interface NavProgress {
  segment: number;
  snapped: LngLat;
  offBy: number;
  offRoute: boolean;
  along: number;
  stepIndex: number;
  next: RouteStep | null;
  toNext: number;
  remaining: number;
  remainingTime: number;
  arrived: boolean;
}

export function stepAt(route: Route, segment: number) {
  for (let i = route.steps.length - 1; i >= 0; i--) if (route.steps[i].start <= segment) return i;
  return 0;
}

export function progress(route: Route, pos: LngLat, accuracy: number, prevSegment = 0): NavProgress {
  const back = Math.max(0, prevSegment - 3);
  let snap = snapToLine(route.coords, route.cum, pos, back, route.coords.length - 1);
  if (snap.dist > 60 && back > 0) {
    const all = snapToLine(route.coords, route.cum, pos);
    if (all.dist < snap.dist) snap = all;
  }
  const total = route.cum[route.cum.length - 1] || route.distance;
  const stepIndex = stepAt(route, snap.segment);
  const next = route.steps[stepIndex + 1] ?? null;
  const toNext = next ? Math.max(0, route.cum[Math.min(next.start, route.cum.length - 1)] - snap.along) : Math.max(0, total - snap.along);
  const remaining = Math.max(0, total - snap.along);
  const ratio = total > 0 ? remaining / total : 0;
  const end = route.coords[route.coords.length - 1];
  const threshold = Math.max(35, Math.min(80, accuracy * 1.5));
  return {
    segment: snap.segment,
    snapped: snap.point,
    offBy: snap.dist,
    offRoute: snap.dist > threshold,
    along: snap.along,
    stepIndex,
    next,
    toNext,
    remaining,
    remainingTime: route.duration * ratio,
    arrived: remaining < 20 || haversine(pos, end) < Math.max(20, Math.min(40, accuracy)),
  };
}

export function voiceCue(p: NavProgress, mode: Route['mode'], spokenKeys: Set<string>): { key: string; far: boolean } | null {
  if (!p.next) return null;
  const idx = p.stepIndex + 1;
  const fast = mode === 'car' || mode === 'motorbike';
  const farAt = fast ? 300 : 120;
  const nearAt = fast ? 60 : 25;
  if (p.toNext <= nearAt && !spokenKeys.has(`${idx}:near`)) return { key: `${idx}:near`, far: false };
  if (p.toNext <= farAt && p.toNext > nearAt * 1.5 && !spokenKeys.has(`${idx}:far`)) return { key: `${idx}:far`, far: true };
  return null;
}
