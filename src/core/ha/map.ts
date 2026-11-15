import type { Device, DeviceKind, HouseholdRole, Room, RoomId } from '../smarthome/types';
import type { HaState } from './client';

export interface HaService {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

export interface HaScene {
  id: string;
  name: string;
  entity: string;
}

export interface HaAutomation {
  id: string;
  name: string;
  entity: string;
  enabled: boolean;
  lastTriggered?: number;
}

export interface RadarTargetRaw {
  x: number;
  y: number;
  speed: number;
}

export interface HaSnapshot {
  devices: Device[];
  rooms: Room[];
  scenes: HaScene[];
  automations: HaAutomation[];
  radar: Record<string, RadarTargetRaw[]>;
}

const UNASSIGNED: RoomId = 'chua-gan-phong';

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'phong'
  );
}

function shortName(n: string) {
  if (n.length <= 16) return n;
  const cut = n.slice(0, 16);
  return cut.includes(' ') ? cut.replace(/\s+\S*$/, '') : cut;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
};

function nameOf(s: HaState) {
  return String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '));
}

function kindOf(s: HaState): DeviceKind | null {
  const [domain] = s.entity_id.split('.');
  const dc = String(s.attributes.device_class ?? '');
  const label = `${s.entity_id} ${nameOf(s)}`.toLowerCase();
  switch (domain) {
    case 'light':
      return 'light';
    case 'lock':
      return 'lock';
    case 'cover':
      return 'curtain';
    case 'climate':
      return 'ac';
    case 'valve':
      return 'valve';
    case 'siren':
      return 'siren';
    case 'camera':
      return 'camera';
    case 'switch':
      if (/siren|còi|coi bao|alarm/.test(label)) return 'siren';
      if (/valve|van nuoc|van nước|van tổng|van tong/.test(label)) return 'valve';
      return 'plug';
    case 'binary_sensor':
      if (['smoke', 'gas', 'carbon_monoxide'].includes(dc)) return 'smoke';
      if (dc === 'moisture') return 'leak';
      if (['door', 'window', 'garage_door', 'opening'].includes(dc)) return 'door';
      if (/sos|panic|khẩn cấp|khan cap/.test(label)) return 'sos';
      if (['motion', 'occupancy', 'presence'].includes(dc)) return 'radar';
      return null;
    case 'sensor':
      if (/mlx90640|thermal|anh nhiet|ảnh nhiệt/.test(label) && String(s.attributes.unit_of_measurement ?? '').includes('°')) return 'thermal';
      if (/\bups\b|ups_/.test(label) && dc === 'battery') return 'ups';
      return null;
    default:
      return null;
  }
}

function stateOf(kind: DeviceKind, s: HaState): Device['state'] {
  const a = s.attributes;
  const on = s.state === 'on';
  switch (kind) {
    case 'light': {
      const b = num(a.brightness);
      const k = num(a.color_temp_kelvin) ?? (num(a.color_temp) ? Math.round(1_000_000 / num(a.color_temp)!) : undefined);
      const st: Device['state'] = { on, brightness: b === undefined ? (on ? 100 : 0) : Math.round((b / 255) * 100) };
      if (k) st.temp = k < 3300 ? 'warm' : k < 5000 ? 'neutral' : 'cool';
      return st;
    }
    case 'plug':
      return { on, powerW: num(a.current_power_w) ?? num(a.power) ?? 0 };
    case 'siren':
      return { on };
    case 'lock':
      return { locked: s.state === 'locked' };
    case 'curtain':
      return { position: num(a.current_position) ?? (s.state === 'open' ? 100 : 0) };
    case 'ac':
      return { on: s.state !== 'off' && s.state !== 'unavailable', target: num(a.temperature) ?? 26, current: num(a.current_temperature) ?? 0, mode: s.state };
    case 'valve':
      return { open: s.state === 'open' || s.state === 'on' };
    case 'smoke':
      return { smoke: on };
    case 'leak':
      return { wet: on };
    case 'door':
      return { open: on };
    case 'sos':
      return { pressed: on };
    case 'radar':
      return { targets: on ? 1 : 0, presence: on };
    case 'thermal':
      return { maxC: num(s.state) ?? 0 };
    case 'ups':
      return { battery: num(s.state) ?? 0 };
    case 'camera':
      return { on: s.state !== 'unavailable', streaming: s.state === 'streaming' };
    default:
      return {};
  }
}

const KIND_LABEL: Record<DeviceKind, string> = {
  hub: 'Hub', light: 'Đèn', plug: 'Ổ cắm', door: 'Cảm biến cửa', smoke: 'Cảm biến khói', leak: 'Cảm biến nước', radar: 'Cảm biến hiện diện', thermal: 'Cảm biến nhiệt', sos: 'Nút SOS', ups: 'UPS', generator: 'Máy phát', camera: 'Camera', curtain: 'Rèm', ac: 'Điều hòa', lock: 'Khóa cửa', valve: 'Van nước', siren: 'Còi báo động',
} as Record<DeviceKind, string>;

function modelOf(kind: DeviceKind, s: HaState) {
  const dc = String(s.attributes.device_class ?? '');
  if (kind === 'smoke' && dc === 'gas') return 'Cảm biến khí gas';
  if (kind === 'smoke' && dc === 'carbon_monoxide') return 'Cảm biến CO';
  if (kind === 'door' && dc === 'window') return 'Cảm biến cửa sổ';
  if (kind === 'radar' && dc === 'motion') return 'Cảm biến chuyển động';
  if (kind === 'thermal') return 'Cảm biến nhiệt MLX90640';
  return KIND_LABEL[kind] ?? kind;
}

const CONTROL: Partial<Record<DeviceKind, HouseholdRole[]>> = {
  light: ['admin', 'member', 'child'],
  plug: ['admin', 'member'],
  curtain: ['admin', 'member', 'child'],
  ac: ['admin', 'member'],
  valve: ['admin', 'member'],
  siren: ['admin', 'member'],
  lock: ['admin'],
  camera: ['admin'],
};

const RADAR_RE = /^sensor\.(.+)_target_(\d)_(x|y|speed)$/;

export function mapStates(states: HaState[], areas: Record<string, string>): HaSnapshot {
  const devices: Device[] = [];
  const scenes: HaScene[] = [];
  const automations: HaAutomation[] = [];
  const radarRaw: Record<string, Record<string, Partial<RadarTargetRaw>>> = {};
  const radarArea: Record<string, string> = {};
  const roomNames = new Map<RoomId, string>();
  const roomOf = (entity: string) => {
    const area = areas[entity];
    if (!area) return UNASSIGNED;
    const id = slug(area);
    roomNames.set(id, area);
    return id;
  };
  for (const s of states) {
    const [domain] = s.entity_id.split('.');
    if (domain === 'scene' || domain === 'script') {
      scenes.push({ id: s.entity_id, name: nameOf(s), entity: s.entity_id });
      continue;
    }
    if (domain === 'automation') {
      const lt = typeof s.attributes.last_triggered === 'string' ? ms(s.attributes.last_triggered) : undefined;
      automations.push({ id: s.entity_id, name: nameOf(s), entity: s.entity_id, enabled: s.state === 'on', lastTriggered: lt });
      continue;
    }
    const rm = RADAR_RE.exec(s.entity_id);
    if (rm) {
      const [, prefix, n, axis] = rm;
      const t = ((radarRaw[prefix] ??= {})[n] ??= {});
      const v = num(s.state);
      if (v !== undefined) t[axis as 'x' | 'y' | 'speed'] = v;
      if (!radarArea[prefix] && areas[s.entity_id]) radarArea[prefix] = s.entity_id;
      continue;
    }
    const kind = kindOf(s);
    if (!kind) continue;
    const battery = num(s.attributes.battery_level) ?? num(s.attributes.battery);
    devices.push({
      id: s.entity_id,
      name: nameOf(s),
      kind,
      room: roomOf(s.entity_id),
      model: modelOf(kind, s),
      firmware: '',
      online: s.state !== 'unavailable' && s.state !== 'unknown',
      paired: true,
      battery,
      lastSeen: ms(s.last_updated),
      confirmedAt: ms(s.last_changed),
      state: stateOf(kind, s),
      controlRoles: CONTROL[kind] ?? [],
      zoneLocked: false,
      latencyMs: 0,
      ha: { entity: s.entity_id, domain, features: num(s.attributes.supported_features) ?? 0, ct: Array.isArray(s.attributes.supported_color_modes) && (s.attributes.supported_color_modes as string[]).some((m) => m === 'color_temp') },
    });
  }
  const radar: Record<string, RadarTargetRaw[]> = {};
  for (const [prefix, targets] of Object.entries(radarRaw)) {
    const list = Object.values(targets)
      .filter((t) => t.x !== undefined && t.y !== undefined && (t.x !== 0 || t.y !== 0))
      .map((t) => ({ x: t.x!, y: t.y!, speed: t.speed ?? 0 }));
    const room = radarArea[prefix] ? roomOf(radarArea[prefix]) : UNASSIGNED;
    const id = `radar.${prefix}`;
    radar[room] = list;
    const existing = devices.find((d) => d.kind === 'radar' && d.room === room);
    if (existing) existing.state = { ...existing.state, targets: list.length };
    else
      devices.push({ id, name: `Radar ${prefix.replace(/_/g, ' ')}`, kind: 'radar', room, model: 'Radar mmWave LD2450', firmware: '', online: true, paired: true, lastSeen: Date.now(), state: { targets: list.length }, controlRoles: [], zoneLocked: false, latencyMs: 0, ha: { entity: id, domain: 'sensor', features: 0 } });
  }
  const ids = [...new Set(devices.map((d) => d.room))];
  const rooms: Room[] = ids.map((id, i) => {
    const ds = devices.filter((d) => d.room === id);
    const sensing = [...new Set(ds.map((d) => d.kind).filter((k): k is Room['sensing'][number] => ['radar', 'thermal', 'door', 'leak', 'smoke', 'camera'].includes(k)))];
    return {
      id,
      name: id === UNASSIGNED ? 'Chưa gán phòng' : roomNames.get(id) ?? id,
      short: shortName(id === UNASSIGNED ? 'Chưa gán phòng' : roomNames.get(id) ?? id),
      rect: { x: 4 + (i % 2) * 48, y: 4 + Math.floor(i / 2) * 32, w: 44, h: 28 },
      sensing,
      lastSignal: Math.max(0, ...ds.map((d) => d.lastSeen)),
    };
  });
  return { devices, rooms, scenes, automations, radar };
}

const KELVIN: Record<string, number> = { warm: 2700, neutral: 4000, cool: 6000 };

export function servicesFor(d: Device, desired: Device['state']): HaService[] {
  const entity_id = d.ha?.entity ?? d.id;
  const domain = d.ha?.domain ?? d.id.split('.')[0];
  const out: HaService[] = [];
  switch (d.kind) {
    case 'light':
      if (desired.on === false) out.push({ domain: 'light', service: 'turn_off', data: { entity_id } });
      else {
        const data: Record<string, unknown> = { entity_id };
        if (desired.brightness !== undefined) data.brightness_pct = Number(desired.brightness);
        if (typeof desired.temp === 'string' && KELVIN[desired.temp]) data.color_temp_kelvin = KELVIN[desired.temp];
        out.push({ domain: 'light', service: 'turn_on', data });
      }
      break;
    case 'plug':
    case 'siren':
      out.push({ domain: domain === 'siren' ? 'siren' : 'switch', service: desired.on ? 'turn_on' : 'turn_off', data: { entity_id } });
      break;
    case 'lock':
      out.push({ domain: 'lock', service: desired.locked ? 'lock' : 'unlock', data: { entity_id } });
      break;
    case 'curtain': {
      const pos = Number(desired.position ?? 0);
      const canPosition = ((d.ha?.features ?? 0) & 4) === 4;
      if (canPosition) out.push({ domain: 'cover', service: 'set_cover_position', data: { entity_id, position: pos } });
      else out.push({ domain: 'cover', service: pos > 0 ? 'open_cover' : 'close_cover', data: { entity_id } });
      break;
    }
    case 'ac':
      if (desired.on === false) out.push({ domain: 'climate', service: 'turn_off', data: { entity_id } });
      else if (desired.on === true) out.push({ domain: 'climate', service: 'turn_on', data: { entity_id } });
      if (desired.target !== undefined) out.push({ domain: 'climate', service: 'set_temperature', data: { entity_id, temperature: Number(desired.target) } });
      break;
    case 'valve':
      if (domain === 'valve') out.push({ domain: 'valve', service: desired.open ? 'open_valve' : 'close_valve', data: { entity_id } });
      else out.push({ domain: 'switch', service: desired.open ? 'turn_on' : 'turn_off', data: { entity_id } });
      break;
    default:
      break;
  }
  return out;
}

export function satisfies(d: Device, desired: Device['state']) {
  return Object.entries(desired).every(([k, v]) => {
    const cur = d.state[k];
    if (d.kind === 'curtain' && k === 'position' && ((d.ha?.features ?? 0) & 4) !== 4) return (Number(v) > 0) === (Number(cur) > 0);
    if (typeof v === 'number' && typeof cur === 'number') return Math.abs(cur - v) <= (k === 'brightness' || k === 'position' ? 5 : 0.5);
    return cur === v;
  });
}
