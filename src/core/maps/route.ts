import { endpoints, getJson } from './config';
import { compassWord, cumulative, decodePolyline, fmtDistance, haversine, type LngLat } from './geo';

export type TravelMode = 'motorbike' | 'car' | 'walk' | 'bike';

export const MODES: { id: TravelMode; label: string }[] = [
  { id: 'motorbike', label: 'Xe máy' },
  { id: 'car', label: 'Ô tô' },
  { id: 'walk', label: 'Đi bộ' },
  { id: 'bike', label: 'Xe đạp' },
];

export type Turn = 'depart' | 'straight' | 'slight-right' | 'right' | 'sharp-right' | 'uturn' | 'sharp-left' | 'left' | 'slight-left' | 'roundabout' | 'roundabout-exit' | 'merge' | 'ramp-right' | 'ramp-left' | 'keep-right' | 'keep-left' | 'ferry' | 'arrive';

export interface RouteStep {
  turn: Turn;
  text: string;
  street: string;
  distance: number;
  duration: number;
  start: number;
  end: number;
  exit?: number;
}

export interface Route {
  id: string;
  mode: TravelMode;
  distance: number;
  duration: number;
  coords: LngLat[];
  cum: number[];
  steps: RouteStep[];
  via: string;
  provider: 'valhalla' | 'osrm';
}

const COSTING: Record<TravelMode, string> = { motorbike: 'motor_scooter', car: 'auto', walk: 'pedestrian', bike: 'bicycle' };
const OSRM_PROFILE: Record<TravelMode, string> = { motorbike: 'car', car: 'car', walk: 'foot', bike: 'bike' };

export function cleanStreets(names?: string[] | null) {
  if (!names?.length) return '';
  const list = names.map((n) => n.trim()).filter(Boolean);
  const short = list.find((n) => list.some((m) => m !== n && m.toLowerCase().endsWith(' ' + n.toLowerCase())));
  return short ?? list[0] ?? '';
}

const VERB: Partial<Record<Turn, string>> = {
  straight: 'Đi thẳng',
  'slight-right': 'Rẽ nhẹ sang phải',
  right: 'Rẽ phải',
  'sharp-right': 'Rẽ gắt sang phải',
  uturn: 'Quay đầu',
  'sharp-left': 'Rẽ gắt sang trái',
  left: 'Rẽ trái',
  'slight-left': 'Rẽ nhẹ sang trái',
  merge: 'Nhập làn',
  'ramp-right': 'Đi vào nhánh bên phải',
  'ramp-left': 'Đi vào nhánh bên trái',
  'keep-right': 'Giữ bên phải',
  'keep-left': 'Giữ bên trái',
};

export function describe(turn: Turn, street: string, opts: { exit?: number; bearing?: number; side?: 'left' | 'right'; mode?: TravelMode; fallback?: string; becomes?: boolean } = {}) {
  const into = street ? ` vào ${street}` : '';
  switch (turn) {
    case 'roundabout-exit':
      return `Ra khỏi vòng xoay${into}`;
    case 'uturn':
      return `Quay đầu${street ? ` để vào ${street}` : ''}`;
    case 'keep-right':
    case 'keep-left':
      return `${VERB[turn]}${street ? ` để vào ${street}` : ''}`;
    case 'depart': {
      const dir = opts.bearing !== undefined ? ` về hướng ${compassWord(opts.bearing)}` : '';
      return `${opts.mode === 'walk' ? 'Đi bộ' : 'Đi'}${dir}${street ? ` trên ${street}` : ''}`;
    }
    case 'arrive':
      return opts.side === 'right' ? 'Nơi đến ở bên phải' : opts.side === 'left' ? 'Nơi đến ở bên trái' : 'Đã đến nơi';
    case 'roundabout':
      return `Vào vòng xoay, đi lối ra thứ ${opts.exit ?? 1}${into}`;
    case 'ferry':
      return opts.becomes ? `Rời phà${street ? `, đi tiếp vào ${street}` : ''}` : `Lên phà${street ? ` ${street}` : ''}`;
    case 'straight':
      if (opts.becomes && street) return `Tiếp tục vào ${street}`;
      return street ? `Đi thẳng trên ${street}` : 'Tiếp tục đi thẳng';
    default:
      return `${VERB[turn] ?? 'Tiếp tục'}${into}`;
  }
}

export function spoken(step: RouteStep, meters: number) {
  if (step.turn === 'arrive') return meters > 40 ? `Sau ${fmtDistance(meters).replace(' m', ' mét').replace(' km', ' ki lô mét')}, ${step.text.toLowerCase()}` : step.text;
  const lead = meters > 40 ? `Sau ${fmtDistance(meters).replace(' m', ' mét').replace(' km', ' ki lô mét')}, ` : '';
  return lead + (lead ? step.text.charAt(0).toLowerCase() + step.text.slice(1) : step.text);
}

const VALHALLA_TURN: Record<number, Turn> = {
  1: 'depart', 2: 'depart', 3: 'depart', 4: 'arrive', 5: 'arrive', 6: 'arrive', 7: 'straight', 8: 'straight',
  9: 'slight-right', 10: 'right', 11: 'sharp-right', 12: 'uturn', 13: 'uturn', 14: 'sharp-left', 15: 'left', 16: 'slight-left',
  17: 'straight', 18: 'ramp-right', 19: 'ramp-left', 20: 'ramp-right', 21: 'ramp-left', 22: 'straight', 23: 'keep-right', 24: 'keep-left',
  25: 'merge', 26: 'roundabout', 27: 'roundabout-exit', 28: 'ferry', 29: 'ferry', 37: 'merge', 38: 'merge',
};

interface ValhallaManeuver {
  type: number;
  instruction: string;
  street_names?: string[];
  begin_street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
  roundabout_exit_count?: number;
  bearing_after?: number;
}

interface ValhallaTrip {
  trip: {
    summary: { length: number; time: number };
    legs: { shape: string; maneuvers: ValhallaManeuver[] }[];
  };
}

function viaOf(steps: RouteStep[]) {
  const byStreet = new Map<string, number>();
  for (const s of steps) if (s.street) byStreet.set(s.street, (byStreet.get(s.street) ?? 0) + s.distance);
  const top = [...byStreet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
  return top.length ? `qua ${top.join(' và ')}` : '';
}

function fromValhalla(t: ValhallaTrip, mode: TravelMode, idx: number): Route {
  const leg = t.trip.legs[0];
  const coords = decodePolyline(leg.shape, 6);
  const steps: RouteStep[] = leg.maneuvers.map((m) => {
    const turn = VALHALLA_TURN[m.type] ?? 'straight';
    const street = cleanStreets(m.street_names ?? m.begin_street_names);
    const side = m.type === 5 ? 'right' : m.type === 6 ? 'left' : undefined;
    return {
      turn,
      street,
      text: VALHALLA_TURN[m.type] ? describe(turn, street, { exit: m.roundabout_exit_count, bearing: m.bearing_after, side, mode, becomes: m.type === 7 || m.type === 29 }) : m.instruction?.replace(/\.$/, '').trim() || (street ? `Tiếp tục vào ${street}` : 'Tiếp tục đi theo đường'),
      distance: m.length * 1000,
      duration: m.time,
      start: m.begin_shape_index,
      end: m.end_shape_index,
      exit: m.roundabout_exit_count,
    };
  });
  return { id: `v${idx}`, mode, distance: t.trip.summary.length * 1000, duration: t.trip.summary.time, coords, cum: cumulative(coords), steps, via: viaOf(steps), provider: 'valhalla' };
}

async function valhalla(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<Route[]> {
  const body = {
    locations: [{ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] }],
    costing: COSTING[mode],
    alternates: mode === 'walk' ? 1 : 2,
    units: 'kilometers',
    language: 'vi-VN',
    directions_type: 'maneuvers',
  };
  const j = await getJson<ValhallaTrip & { alternates?: ValhallaTrip[] }>(`${endpoints().routing}/route?json=${encodeURIComponent(JSON.stringify(body))}`, signal, 20_000);
  return [j, ...(j.alternates ?? [])].map((t, i) => fromValhalla(t, mode, i));
}

interface OsrmStep {
  distance: number;
  duration: number;
  name: string;
  geometry: string;
  maneuver: { type: string; modifier?: string; exit?: number; bearing_after?: number };
}

const OSRM_MOD: Record<string, Turn> = { uturn: 'uturn', 'sharp right': 'sharp-right', right: 'right', 'slight right': 'slight-right', straight: 'straight', 'slight left': 'slight-left', left: 'left', 'sharp left': 'sharp-left' };

function osrmTurn(m: OsrmStep['maneuver']): Turn {
  if (m.type === 'depart') return 'depart';
  if (m.type === 'arrive') return 'arrive';
  if (m.type === 'roundabout' || m.type === 'rotary') return 'roundabout';
  if (m.type === 'exit roundabout' || m.type === 'exit rotary') return 'roundabout-exit';
  if (m.type === 'merge') return 'merge';
  if (m.type === 'fork' || m.type === 'off ramp' || m.type === 'on ramp') return m.modifier?.includes('left') ? (m.type === 'fork' ? 'keep-left' : 'ramp-left') : m.modifier?.includes('right') ? (m.type === 'fork' ? 'keep-right' : 'ramp-right') : 'straight';
  if (m.type === 'new name' || m.type === 'continue') return m.modifier && m.modifier !== 'straight' ? OSRM_MOD[m.modifier] ?? 'straight' : 'straight';
  return OSRM_MOD[m.modifier ?? 'straight'] ?? 'straight';
}

async function osrm(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<Route[]> {
  const url = `${endpoints().osrm}/routed-${OSRM_PROFILE[mode]}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=polyline6&steps=true&alternatives=true`;
  const j = await getJson<{ code: string; routes: { distance: number; duration: number; geometry: string; legs: { steps: OsrmStep[] }[] }[] }>(url, signal, 20_000);
  if (j.code !== 'Ok') throw new Error(`Không tìm được đường (${j.code})`);
  return j.routes.map((r, idx) => {
    const coords = decodePolyline(r.geometry, 6);
    let cursor = 0;
    const steps: RouteStep[] = r.legs[0].steps.map((s) => {
      const n = decodePolyline(s.geometry, 6).length;
      const turn = osrmTurn(s.maneuver);
      const step: RouteStep = { turn, street: s.name, text: describe(turn, s.name, { exit: s.maneuver.exit, bearing: s.maneuver.bearing_after, mode }), distance: s.distance, duration: s.duration, start: cursor, end: Math.min(coords.length - 1, cursor + Math.max(0, n - 1)), exit: s.maneuver.exit };
      cursor = step.end;
      return step;
    });
    const speed = mode === 'motorbike' ? 1.12 : 1;
    return { id: `o${idx}`, mode, distance: r.distance, duration: r.duration * speed, coords, cum: cumulative(coords), steps, via: viaOf(steps), provider: 'osrm' as const };
  });
}

export async function getRoutes(from: LngLat, to: LngLat, mode: TravelMode, signal?: AbortSignal): Promise<Route[]> {
  if (haversine(from, to) < 15) throw new Error('Điểm đi và điểm đến quá gần nhau.');
  try {
    const list = await valhalla(from, to, mode, signal);
    if (list.length) return list;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    try {
      return await osrm(from, to, mode, signal);
    } catch (e2) {
      if ((e2 as Error).name === 'AbortError') throw e2;
      throw e;
    }
  }
  return osrm(from, to, mode, signal);
}
