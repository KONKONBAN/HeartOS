import { fuse, type FusionResult } from '../guardian/fusion';
import { FACILITIES, compareRoutes, seedEdges, type FloodState, type RoadEdge } from '../guardian/routes';
import type { JsonStore } from '../storage';
import { seedDevices, seedRooms, seedRules, seedScenes } from './seed';
import { largestBlob, radarTargets, seedPeople, stepPeople, thermalFrame, type Person } from './sensors';
import type {
  AutomationRule,
  Command,
  Device,
  DeviceKind,
  Evidence,
  HomeIncident,
  HomeMode,
  HouseholdRole,
  IncidentKind,
  NetState,
  Notice,
  PairingSession,
  PowerState,
  RadarTarget,
  Room,
  RoomId,
  Scene,
  ThermalFrame,
  Trigger,
} from './types';

export interface Actor {
  id: string;
  name: string;
  role: HouseholdRole | 'system';
}

export interface HomeState {
  v: 2;
  real?: boolean;
  rooms: Room[];
  devices: Device[];
  commands: Command[];
  scenes: Scene[];
  rules: AutomationRule[];
  power: PowerState;
  net: NetState;
  mode: HomeMode;
  incidents: HomeIncident[];
  notices: Notice[];
  edges: RoadEdge[];
  pairing?: PairingSession;
  timers: { at: number; kind: 'remote_ack' | 'helper_ack' | 'pairing_expire' | 'kettle_off'; ref: string }[];
  nextIncident: number;
  energy: { at: number; w: number }[];
  helpers: { id: string; name: string }[];
  simulateHelpers: boolean;
}

export type SimEvent =
  | 'door_open'
  | 'door_close'
  | 'leak'
  | 'leak_clear'
  | 'smoke'
  | 'smoke_clear'
  | 'fall_hall'
  | 'fall_bedroom'
  | 'person_hall'
  | 'sos_living'
  | 'sos_bedroom'
  | 'mains_lost'
  | 'mains_restored'
  | 'internet_lost'
  | 'internet_restored'
  | 'laundry_restore';

const SYSTEM: Actor = { id: 'hub', name: 'HeartOS Hub', role: 'system' };
const ESSENTIAL_W = 42;

const deviceW: Partial<Record<DeviceKind, (s: Device['state']) => number>> = {
  light: (s) => (s.on ? 9 * (Number(s.brightness ?? 100) / 100) : 0),
  plug: (s) => Number(s.powerW ?? 0),
  ac: (s) => (s.on ? 720 : 0),
};

export class HomeEngine {
  s: HomeState;
  people: Person[] = seedPeople();
  frames: Partial<Record<RoomId, ThermalFrame>> = {};
  radar: Partial<Record<RoomId, RadarTarget[]>> = {};
  fusion: Partial<Record<RoomId, FusionResult>> = {};
  private speedHist: Partial<Record<RoomId, number[]>> = {};
  private listeners = new Set<() => void>();
  private ver = 0;
  private lastSensor = 0;
  private lastPersist = 0;
  private cmdSeq = 0;

  constructor(
    private store: JsonStore,
    private now: () => number = Date.now,
    private audit: (kind: 'smarthome.command' | 'guardian.event', summary: string, severity?: 'info' | 'notice' | 'warning' | 'critical') => void = () => {},
    private key = 'home.state',
  ) {
    const saved = store.get<HomeState>(key);
    this.s = saved && saved.v === 2 ? saved : HomeEngine.freshReal(now());
    if (this.s.real) this.people = [];
    this.cmdSeq = this.s.commands.length;
  }

  static freshReal(t: number): HomeState {
    return {
      v: 2,
      real: true,
      rooms: [],
      devices: [],
      commands: [],
      scenes: [],
      rules: [],
      power: { mains: 'on', voltage: 0, ups: { battery: 0, loadW: 0, charging: false }, generator: 'standby', ats: 'mains', lastChange: t, history: [] },
      net: { lan: true, internet: typeof navigator === 'undefined' ? true : navigator.onLine !== false, changedAt: t },
      mode: 'home',
      incidents: [],
      notices: [],
      edges: [],
      timers: [],
      nextIncident: 1,
      energy: [],
      helpers: [],
      simulateHelpers: false,
    };
  }

  static fresh(t: number): HomeState {
    return {
      v: 2,
      rooms: seedRooms(t),
      devices: seedDevices(t),
      commands: [],
      scenes: seedScenes(),
      rules: seedRules(),
      power: { mains: 'on', voltage: 228, ups: { battery: 78, loadW: ESSENTIAL_W, charging: true }, generator: 'standby', ats: 'mains', lastChange: t - 3600_000, history: [] },
      net: { lan: true, internet: true, changedAt: t - 3600_000 },
      mode: 'home',
      incidents: [],
      notices: [],
      edges: seedEdges(),
      timers: [],
      nextIncident: 42,
      energy: [],
      helpers: [
        { id: 'u-an', name: 'An' },
        { id: 'u-linh', name: 'Linh' },
      ],
      simulateHelpers: true,
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get version() {
    return this.ver;
  }
  private emit(persist = true) {
    this.ver++;
    if (persist) this.persist();
    this.listeners.forEach((l) => l());
  }
  private persist() {
    this.lastPersist = this.now();
    this.store.set(this.key, this.s);
  }

  device(id: string) {
    return this.s.devices.find((d) => d.id === id);
  }
  room(id: RoomId) {
    return this.s.rooms.find((r) => r.id === id)!;
  }
  openIncidents() {
    return this.s.incidents.filter((i) => i.status !== 'closed');
  }
  freshRooms() {
    return this.s.rooms.filter((r) => !r.stale && this.now() - r.lastSignal < 5 * 60_000);
  }
  essentialW() {
    return ESSENTIAL_W;
  }
  totalW() {
    return ESSENTIAL_W + this.s.devices.reduce((n, d) => n + (deviceW[d.kind]?.(d.state) ?? 0), 0);
  }

  notify(title: string, body: string, severity: Notice['severity'] = 'info', link?: string) {
    this.s.notices.unshift({ id: `ntc-${this.now()}-${Math.floor(Math.random() * 1000)}`, at: this.now(), title, body, severity, read: false, link });
    this.s.notices = this.s.notices.slice(0, 60);
  }

  markAllRead() {
    this.s.notices.forEach((n) => (n.read = true));
    this.emit();
  }

  canControl(d: Device, actor: Actor): { ok: boolean; reason?: string } {
    if (!d.paired) return { ok: false, reason: 'Thiết bị chưa ghép với hub.' };
    if (actor.role === 'system') return { ok: true };
    if (!d.controlRoles.includes(actor.role)) return { ok: false, reason: `Vai trò ${roleName(actor.role)} không có quyền điều khiển ${d.name}.` };
    return { ok: true };
  }

  sendCommand(deviceId: string, action: 'set' | 'toggle', params: Record<string, string | number | boolean>, actor: Actor, source: Command['source'] = 'user', approvalRef?: string): Command {
    const d = this.device(deviceId);
    const id = `cmd-${String(++this.cmdSeq).padStart(4, '0')}`;
    const base: Command = { id, deviceId, action, params, desired: {}, by: actor.id, byName: actor.name, at: this.now(), status: 'queued', via: 'lan', source };
    if (!d) return this.pushCmd({ ...base, status: 'rejected', reason: 'Không có thiết bị.' });
    const perm = this.canControl(d, actor);
    if (!perm.ok) return this.pushCmd({ ...base, status: 'rejected', reason: perm.reason });
    let desired: Record<string, string | number | boolean> = { ...params };
    if (action === 'toggle') {
      const k = d.kind === 'lock' ? 'locked' : d.kind === 'valve' ? 'open' : d.kind === 'camera' ? 'privacy' : 'on';
      desired = { [k]: !d.state[k] };
    }
    if (d.kind === 'lock' && desired.locked === false && actor.role !== 'system' && !approvalRef) {
      return this.pushCmd({ ...base, desired, status: 'rejected', reason: 'Mở khóa cửa cần xác nhận lại bằng khóa phê duyệt trên thiết bị.' });
    }
    if (!this.s.net.lan) return this.pushCmd({ ...base, desired, status: 'failed', reason: 'Hub mất kết nối LAN.' });
    const cmd = this.pushCmd({ ...base, desired });
    this.audit('smarthome.command', `${actor.name} điều khiển ${d.name}: ${describeDesired(desired)} (${source})`);
    return cmd;
  }

  private pushCmd(c: Command) {
    this.s.commands.unshift(c);
    this.s.commands = this.s.commands.slice(0, 120);
    this.emit();
    return c;
  }

  cancelCommand(id: string) {
    const c = this.s.commands.find((x) => x.id === id);
    if (c && ['queued', 'sent', 'awaiting'].includes(c.status)) {
      c.status = 'cancelled';
      c.reason = 'Người dùng hủy lệnh đang chờ.';
      this.emit();
    }
  }

  pendingFor(deviceId: string) {
    return this.s.commands.find((c) => c.deviceId === deviceId && ['queued', 'sent', 'awaiting'].includes(c.status));
  }

  private pumpCommands(t: number) {
    let changed = false;
    for (const c of this.s.commands) {
      if (c.status === 'queued' && t - c.at >= 250) {
        c.status = 'sent';
        c.sentAt = t;
        changed = true;
      } else if (c.status === 'sent') {
        c.status = 'awaiting';
        changed = true;
      } else if (c.status === 'awaiting') {
        const d = this.device(c.deviceId);
        if (!d) continue;
        if (d.online && t - (c.sentAt ?? c.at) >= d.latencyMs) {
          d.state = { ...d.state, ...c.desired };
          if (d.kind === 'plug') d.state.powerW = d.state.on ? plugW(d.id) : 0;
          d.confirmedAt = t;
          d.lastSeen = t;
          c.status = 'acked';
          c.ackAt = t;
          if (d.id === 'plug-kettle' && d.state.on) this.s.timers.push({ at: t + 180_000, kind: 'kettle_off', ref: d.id });
          changed = true;
        } else if (!d.online && t - c.at > 60_000) {
          c.status = 'expired';
          c.reason = 'Thiết bị không phản hồi trong 60 giây, lệnh hết hạn, trạng thái giữ nguyên.';
          changed = true;
        } else if (!d.online && !c.reason && t - c.at > 6000) {
          c.reason = 'Thiết bị ngoại tuyến, lệnh vẫn chờ, sẽ áp dụng khi thiết bị phản hồi.';
          changed = true;
        }
      }
    }
    if (changed) this.emit();
  }

  runScene(sceneId: string, actor: Actor) {
    const sc = this.s.scenes.find((x) => x.id === sceneId);
    if (!sc) return [];
    const out = sc.actions.map((a) => this.sendCommand(a.deviceId, a.action as 'set', a.params ?? {}, actor, 'scene', actor.role === 'admin' ? 'scene-admin' : undefined));
    this.audit('smarthome.command', `Chạy cảnh "${sc.name}" bởi ${actor.name}: ${out.filter((c) => c.status !== 'rejected').length}/${out.length} lệnh được nhận`);
    return out;
  }

  toggleRule(id: string) {
    const r = this.s.rules.find((x) => x.id === id);
    if (r) {
      r.enabled = !r.enabled;
      this.emit();
    }
  }

  addRule(rule: Omit<AutomationRule, 'id' | 'fireCount' | 'builtin'>) {
    this.s.rules.push({ ...rule, id: `r-${this.now()}`, builtin: false, fireCount: 0 });
    this.emit();
  }

  removeRule(id: string) {
    this.s.rules = this.s.rules.filter((r) => r.id !== id || r.builtin);
    this.emit();
  }

  private matches(t: Trigger, ev: Trigger) {
    if (t.type !== ev.type) return false;
    if (t.type === 'sensor' && ev.type === 'sensor') {
      if (t.event !== ev.event) return false;
      if (t.deviceId === ev.deviceId) return true;
      const td = this.device(t.deviceId);
      const ed = this.device(ev.deviceId);
      return !!td && !!ed && td.kind === ed.kind && ['sos', 'smoke', 'leak'].includes(td.kind);
    }
    return JSON.stringify(t) === JSON.stringify(ev);
  }

  private conditionOk(r: AutomationRule) {
    const c = r.condition;
    if (!c) return true;
    if (c.mode && c.mode !== this.s.mode) return false;
    if (c.timeBetween) {
      const d = new Date(this.now());
      const m = d.getHours() * 60 + d.getMinutes();
      const [a, b] = c.timeBetween.map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
      const inside = a <= b ? m >= a && m < b : m >= a || m < b;
      if (!inside) return false;
    }
    return true;
  }

  fire(ev: Trigger, room: RoomId, evidence?: Evidence) {
    for (const r of this.s.rules) {
      if (!r.enabled || !this.matches(r.trigger, ev) || !this.conditionOk(r)) continue;
      if (r.lastFired && this.now() - r.lastFired < 15_000 && ev.type === 'sensor' && ev.event === 'motion') continue;
      r.lastFired = this.now();
      r.fireCount++;
      for (const a of r.actions) {
        if (a.type === 'device') this.sendCommand(a.deviceId, 'set', a.params ?? {}, SYSTEM, 'automation');
        else if (a.type === 'notify') this.notify(r.name, a.text, a.severity, '/f/safe');
        else if (a.type === 'incident') this.openIncident(a.kind, a.priority, room, evidence);
        else if (a.type === 'shed') this.shedLoads();
        else if (a.type === 'mode') this.s.mode = a.mode;
      }
      this.audit('smarthome.command', `Luật "${r.name}" kích hoạt`, 'notice');
    }
    this.emit();
  }

  private shedLoads() {
    for (const d of this.s.devices) {
      if ((d.kind === 'plug' || d.kind === 'ac') && !d.essential && d.state.on) this.sendCommand(d.id, 'set', { on: false }, SYSTEM, 'automation');
    }
  }

  setMode(mode: HomeMode, actor: Actor) {
    this.s.mode = mode;
    this.audit('smarthome.command', `${actor.name} đổi chế độ nhà: ${mode}`);
    this.emit();
  }

  private openIncident(kind: IncidentKind, priority: 'P1' | 'P2' | 'P3', room: RoomId, evidence?: Evidence): HomeIncident {
    const existing = this.s.incidents.find((i) => i.status !== 'closed' && i.kind === kind && i.room === room && this.now() - i.createdAt < 10 * 60_000);
    if (existing) {
      if (evidence) existing.evidence.push(evidence);
      return existing;
    }
    const t = this.now();
    const id = `HS-${String(this.s.nextIncident++).padStart(3, '0')}`;
    const isSos = kind === 'sos' || kind === 'smoke';
    const inc: HomeIncident = {
      id,
      kind,
      priority,
      title: incidentTitle(kind, this.room(room).name),
      room,
      createdAt: t,
      status: kind === 'fall' ? 'verifying' : 'open',
      steps: {
        local: isSos ? { state: 'done', at: t } : { state: 'todo' },
        remote: isSos ? (this.s.net.internet ? { state: 'active', note: 'Đang chuyển tới nhà cung cấp' } : { state: 'unknown', note: 'Hub mất Internet, chưa rõ tình trạng gửi' }) : { state: 'todo' },
        helper: { state: isSos ? 'active' : 'todo' },
        handover: { state: 'todo' },
      },
      evidence: evidence ? [evidence] : [],
      timeline: [{ at: t, text: `Mở ca ${id}, ${priority}`, by: 'Guardian' }],
    };
    if (isSos) {
      this.sendCommand('siren', 'set', { on: true }, SYSTEM, 'guardian');
      if (this.s.net.internet) this.s.timers.push({ at: t + 1200, kind: 'remote_ack', ref: id });
      if (this.s.simulateHelpers) this.s.timers.push({ at: t + 6000, kind: 'helper_ack', ref: id });
      this.notify(inc.title, kind === 'sos' ? 'Đã phát báo tại nhà. Đang chuyển tới người thân trong danh sách hỗ trợ.' : 'Còi khói/CO kích hoạt, đã bật còi và đèn dẫn lối.', 'critical', `/f/incident/${id}`);
    } else if (kind === 'fall') {
      this.notify('Tín hiệu nghi ngã', `${this.room(room).name}: quan sát từ radar và nhiệt. Chưa đủ bằng chứng để kết luận.`, 'warning', `/f/incident/${id}`);
    } else {
      this.notify(inc.title, 'Guardian đã mở ca theo luật tự động.', 'warning', `/f/incident/${id}`);
    }
    this.s.incidents.unshift(inc);
    this.audit('guardian.event', `Mở ca ${id} (${kind}, ${priority}) tại ${this.room(room).name}`, priority === 'P1' ? 'critical' : 'warning');
    this.emit();
    return inc;
  }

  incident(id: string) {
    return this.s.incidents.find((i) => i.id === id);
  }

  sos(by: Actor, room: RoomId = 'living') {
    const inc = this.openIncident('sos', 'P1', room, { kind: 'button', at: this.now(), summary: `${by.name} gửi SOS trên ứng dụng`, ref: `sos-${this.now()}` });
    inc.timeline.push({ at: this.now(), text: `${by.name} nhấn SOS`, by: by.name });
    this.emit();
    return inc;
  }

  acceptHelp(id: string, helper: { id: string; name: string }) {
    const inc = this.incident(id);
    if (!inc || inc.status === 'closed') return;
    inc.steps.helper = { state: 'done', at: this.now(), by: helper.name };
    inc.assignee = helper.name;
    inc.status = 'assigned';
    inc.steps.handover = { state: 'active' };
    inc.timeline.push({ at: this.now(), text: `${helper.name} nhận việc hỗ trợ`, by: helper.name });
    this.notify(`${helper.name} đã nhận hỗ trợ`, `${inc.id}, ${inc.title}. Chưa có xác nhận đã đến.`, 'info', `/f/incident/${id}`);
    this.audit('guardian.event', `${inc.id}: ${helper.name} nhận việc`, 'notice');
    this.emit();
  }

  verifyFall(id: string, outcome: 'needs_help' | 'false_alarm', by: Actor) {
    const inc = this.incident(id);
    if (!inc) return;
    inc.evidence.push({ kind: 'human', at: this.now(), summary: outcome === 'needs_help' ? `${by.name} xác nhận cần hỗ trợ` : `${by.name} xác nhận không sao`, ref: by.id });
    if (outcome === 'needs_help') {
      inc.priority = 'P1';
      inc.status = 'open';
      inc.steps.local = { state: 'done', at: this.now() };
      inc.steps.remote = this.s.net.internet ? { state: 'active', note: 'Đang chuyển tới nhà cung cấp' } : { state: 'unknown', note: 'Chưa rõ tình trạng gửi' };
      inc.steps.helper = { state: 'active' };
      this.sendCommand('siren', 'set', { on: true }, SYSTEM, 'guardian');
      if (this.s.net.internet) this.s.timers.push({ at: this.now() + 1200, kind: 'remote_ack', ref: id });
      inc.timeline.push({ at: this.now(), text: `${by.name} xác nhận cần hỗ trợ, nâng lên P1`, by: by.name });
    } else {
      this.closeIncident(id, 'Đã xác minh: không có sự cố', by);
    }
    this.emit();
  }

  confirmDestination(id: string, facilityId: string, by: Actor) {
    const inc = this.incident(id);
    const f = FACILITIES.find((x) => x.id === facilityId);
    if (!inc || !f) return;
    const r = compareRoutes(this.s.edges).results.find((x) => x.facility.id === facilityId)!;
    inc.destination = { facilityId, gate: f.gate, etaMin: r.minutes, computedAt: this.now(), confirmedAt: this.now(), confirmedBy: by.name };
    inc.timeline.push({ at: this.now(), text: `Chốt đích bàn giao: ${f.name}, ${f.gate} (ETA ${r.minutes} phút)`, by: by.name });
    this.audit('guardian.event', `${inc.id}: chốt ${f.name} ${f.gate}`, 'notice');
    this.emit();
  }

  markHandover(id: string, by: Actor) {
    const inc = this.incident(id);
    if (!inc) return;
    inc.steps.handover = { state: 'done', at: this.now() };
    inc.status = 'handover';
    inc.timeline.push({ at: this.now(), text: 'Người hỗ trợ xác nhận có mặt và bàn giao', by: by.name });
    this.emit();
  }

  closeIncident(id: string, reason: string, by: Actor) {
    const inc = this.incident(id);
    if (!inc) return;
    inc.status = 'closed';
    inc.closedReason = reason;
    inc.timeline.push({ at: this.now(), text: `Đóng ca: ${reason}`, by: by.name });
    if (!this.openIncidents().some((i) => i.priority === 'P1')) {
      const siren = this.device('siren');
      if (siren?.state.on) this.sendCommand('siren', 'set', { on: false }, SYSTEM, 'guardian');
    }
    this.audit('guardian.event', `Đóng ${inc.id}: ${reason}`);
    this.emit();
  }

  setEdgeFlood(edgeId: string, flood: FloodState) {
    const e = this.s.edges.find((x) => x.id === edgeId);
    if (e) {
      e.flood = flood;
      this.emit();
    }
  }

  startPairing(code: string) {
    const t = this.now();
    this.s.pairing = { code, startedAt: t, expiresAt: t + 120_000, step: 'scan' };
    this.s.timers.push({ at: t + 120_000, kind: 'pairing_expire', ref: code });
    this.emit();
  }

  scanPairing(kind: DeviceKind, model: string) {
    if (!this.s.pairing || this.s.pairing.step !== 'scan') return;
    this.s.pairing = { ...this.s.pairing, step: 'button', kind, deviceModel: model };
    this.emit();
  }

  confirmPhysicalButton() {
    if (!this.s.pairing || this.s.pairing.step !== 'button') return false;
    if (this.now() > this.s.pairing.expiresAt) {
      this.s.pairing.step = 'expired';
      this.emit();
      return false;
    }
    this.s.pairing = { ...this.s.pairing, step: 'zone' };
    this.emit();
    return true;
  }

  completePairing(p: { name: string; room: RoomId; controlRoles: HouseholdRole[] }, actor: Actor) {
    const pr = this.s.pairing;
    if (!pr || pr.step !== 'zone' || !pr.kind) return undefined;
    const id = `${pr.kind}-${this.now().toString(36)}`;
    const dev: Device = {
      id,
      name: p.name,
      kind: pr.kind,
      room: p.room,
      model: pr.deviceModel ?? 'Thiết bị mới',
      firmware: '1.0',
      online: true,
      paired: true,
      lastSeen: this.now(),
      state: defaultState(pr.kind),
      controlRoles: p.controlRoles,
      zoneLocked: true,
      latencyMs: 700,
      battery: ['door', 'leak', 'smoke', 'sos'].includes(pr.kind) ? 100 : undefined,
    };
    this.s.devices.push(dev);
    this.s.pairing = { ...pr, step: 'done' };
    this.audit('smarthome.command', `${actor.name} ghép ${dev.name} vào vùng ${this.room(p.room).name}`, 'notice');
    this.emit();
    return dev;
  }

  cancelPairing() {
    this.s.pairing = undefined;
    this.emit();
  }

  unpair(id: string, actor: Actor) {
    const d = this.device(id);
    if (!d || d.kind === 'hub') return;
    this.s.devices = this.s.devices.filter((x) => x.id !== id);
    this.audit('smarthome.command', `${actor.name} gỡ ghép ${d.name}`, 'notice');
    this.emit();
  }

  setSimulateHelpers(v: boolean) {
    this.s.simulateHelpers = v;
    this.emit();
  }

  setDeviceOnline(id: string, online: boolean) {
    const d = this.device(id);
    if (d) {
      d.online = online;
      if (online) d.lastSeen = this.now();
      this.emit();
    }
  }

  simulate(ev: SimEvent) {
    const t = this.now();
    const ev2 = (deviceId: string, event: 'open' | 'leak' | 'smoke' | 'motion' | 'sos'): Trigger => ({ type: 'sensor', deviceId, event });
    switch (ev) {
      case 'door_open':
        this.patch('door-main', { open: true });
        this.fire(ev2('door-main', 'open'), 'door', { kind: 'door', at: t, summary: 'Cửa chính mở', ref: 'door-main' });
        break;
      case 'door_close':
        this.patch('door-main', { open: false });
        break;
      case 'leak':
        this.patch('leak-kitchen', { wet: true });
        this.fire(ev2('leak-kitchen', 'leak'), 'kitchen', { kind: 'leak', at: t, summary: 'Cảm biến nước bếp báo ướt', ref: 'leak-kitchen' });
        break;
      case 'leak_clear':
        this.patch('leak-kitchen', { wet: false });
        break;
      case 'smoke':
        this.patch('smoke-kitchen', { smoke: true, co: 58 });
        this.fire(ev2('smoke-kitchen', 'smoke'), 'kitchen', { kind: 'smoke', at: t, summary: 'Còi khói/CO bếp: khói + CO 58 ppm', ref: 'smoke-kitchen' });
        break;
      case 'smoke_clear':
        this.patch('smoke-kitchen', { smoke: false, co: 3 });
        break;
      case 'fall_hall':
      case 'fall_bedroom': {
        const room: RoomId = ev === 'fall_hall' ? 'hall' : 'bedroom';
        this.people = this.people.filter((p) => p.id !== 9);
        this.people.push({ id: 9, room, x: -1800, y: 2000, vx: 600, vy: 0, posture: 'walking', fall: { phase: 'walk', at: t } });
        this.speedHist[room] = [];
        break;
      }
      case 'person_hall':
        this.people = this.people.filter((p) => p.id !== 8);
        this.people.push({ id: 8, room: 'hall', x: -2000, y: 2500, vx: 500, vy: 0, posture: 'walking' });
        this.fire(ev2('radar-hall', 'motion'), 'hall');
        break;
      case 'sos_living':
      case 'sos_bedroom': {
        const id = ev === 'sos_living' ? 'sos-living' : 'sos-bedroom';
        const room: RoomId = ev === 'sos_living' ? 'living' : 'bedroom';
        this.patch(id, { pressed: true });
        this.fire(ev2(id, 'sos'), room, { kind: 'button', at: t, summary: `Nút SOS ${this.room(room).name} được nhấn`, ref: id });
        setTimeout(() => this.patch(id, { pressed: false }), 1500);
        break;
      }
      case 'mains_lost':
        this.s.power = { ...this.s.power, mains: 'off', voltage: 0, ats: 'battery', generator: 'cranking', lastChange: t, nextAt: t + 8000, ups: { ...this.s.power.ups, charging: false } };
        this.s.power.history.unshift({ at: t, text: 'Mất điện lưới, UPS cấp tải ưu tiên, máy phát khởi động' });
        this.fire({ type: 'power', event: 'mains_lost' }, 'hall');
        break;
      case 'mains_restored':
        this.s.power = { ...this.s.power, mains: 'on', voltage: 226, lastChange: t, nextAt: t + 6000 };
        this.s.power.history.unshift({ at: t, text: 'Điện lưới trở lại, chờ ổn định trước khi ATS chuyển về' });
        this.fire({ type: 'power', event: 'mains_restored' }, 'hall');
        break;
      case 'internet_lost':
        this.s.net = { ...this.s.net, internet: false, changedAt: t };
        this.notify('Kết nối đang gián đoạn', 'Hub mất Internet. LAN vẫn hoạt động; trạng thái gửi từ xa chưa rõ.', 'warning', '/f/offline');
        this.fire({ type: 'net', event: 'internet_lost' }, 'living');
        break;
      case 'internet_restored':
        this.s.net = { ...this.s.net, internet: true, changedAt: t };
        for (const inc of this.openIncidents()) if (inc.steps.remote.state === 'unknown') this.s.timers.push({ at: t + 1500, kind: 'remote_ack', ref: inc.id });
        this.notify('Đã có Internet', 'Hub đồng bộ lại các trạng thái chờ gửi từ xa.', 'info');
        break;
      case 'laundry_restore': {
        this.setDeviceOnline('leak-laundry', true);
        const r = this.room('laundry');
        r.stale = false;
        r.lastSignal = t;
        const d = this.device('leak-laundry');
        if (d) d.battery = 100;
        break;
      }
    }
    this.emit();
  }

  private patch(id: string, st: Device['state']) {
    const d = this.device(id);
    if (d) {
      d.state = { ...d.state, ...st };
      d.lastSeen = this.now();
    }
  }

  get real() {
    return !!this.s.real;
  }

  tick() {
    const t = this.now();
    if (this.s.real) {
      this.runTimers(t);
      if (t - this.lastSensor >= 1000) {
        this.lastSensor = t;
        this.emit(t - this.lastPersist > 5000);
      }
      return;
    }
    this.pumpCommands(t);
    this.runTimers(t);
    if (t - this.lastSensor >= 1000) {
      const dt = this.lastSensor ? t - this.lastSensor : 1000;
      this.lastSensor = t;
      this.sensorStep(dt, t);
      this.powerStep(dt, t);
      this.emit(t - this.lastPersist > 5000);
    }
  }

  private runTimers(t: number) {
    const due = this.s.timers.filter((x) => x.at <= t);
    if (!due.length) return;
    this.s.timers = this.s.timers.filter((x) => x.at > t);
    for (const tm of due) {
      if (tm.kind === 'remote_ack') {
        const inc = this.incident(tm.ref);
        if (inc && inc.status !== 'closed' && this.s.net.internet) {
          inc.steps.remote = { state: 'done', at: t, note: 'Nhà cung cấp đã tiếp nhận' };
          inc.timeline.push({ at: t, text: 'Kênh từ xa: nhà cung cấp đã tiếp nhận', by: 'Hub' });
        }
      } else if (tm.kind === 'helper_ack') {
        const inc = this.incident(tm.ref);
        if (inc && inc.steps.helper.state === 'active') this.acceptHelp(inc.id, this.s.helpers[0]);
      } else if (tm.kind === 'pairing_expire') {
        if (this.s.pairing && this.s.pairing.code === tm.ref && this.s.pairing.step !== 'done') this.s.pairing.step = 'expired';
      } else if (tm.kind === 'kettle_off') {
        const d = this.device(tm.ref);
        if (d?.state.on) this.sendCommand(d.id, 'set', { on: false }, SYSTEM, 'automation');
      }
    }
    this.emit();
  }

  private sensorStep(dt: number, t: number) {
    this.people = stepPeople(this.people, dt, t);
    const ambient = 25.5;
    for (const room of ['hall', 'living', 'bedroom'] as RoomId[]) {
      const radarDev = this.s.devices.find((d) => d.kind === 'radar' && d.room === room);
      if (!radarDev?.online) continue;
      const targets = radarTargets(this.people, room);
      this.radar[room] = targets;
      radarDev.state.targets = targets.length;
      radarDev.lastSeen = t;
      const thermDev = this.s.devices.find((d) => d.kind === 'thermal' && d.room === room);
      let blob = null;
      if (thermDev?.online || room === 'bedroom') {
        const f = thermalFrame(this.people, room, ambient, t);
        this.frames[room] = f;
        blob = largestBlob(f);
        if (thermDev) {
          thermDev.state.maxC = Math.round(f.max * 10) / 10;
          thermDev.lastSeen = t;
        }
      }
      const hist = (this.speedHist[room] ??= []);
      hist.push(targets[0]?.speed ?? 0);
      if (hist.length > 10) hist.shift();
      const lying = this.people.find((p) => p.room === room && p.posture === 'lying');
      const res = fuse({ speedHistory: hist, stillSeconds: lying?.stillSince ? (t - lying.stillSince) / 1000 : 0, blob, frameHeight: 24 });
      this.fusion[room] = res;
      if (res.level === 'suspected') {
        const already = this.s.incidents.some((i) => i.kind === 'fall' && i.room === room && i.status !== 'closed');
        if (!already) {
          this.fire({ type: 'guardian', event: 'fall_suspected' }, room, {
            kind: 'radar',
            at: t,
            summary: `Điểm ghép ${res.score}, ${res.cues.filter((c) => c.hit).map((c) => c.name).join('; ')}`,
            ref: `fusion-${room}-${t}`,
          });
          const inc = this.s.incidents.find((i) => i.kind === 'fall' && i.room === room && i.status !== 'closed');
          if (inc && blob) inc.evidence.push({ kind: 'thermal', at: t, summary: `Vệt nhiệt tỉ lệ ${blob.aspect.toFixed(2)}, đỉnh ${blob.peak.toFixed(1)}°C`, ref: `frame-${room}-${t}` });
        }
      }
      if (targets.length && room === 'hall') {
        const r = this.s.rules.find((x) => x.id === 'r-night-path');
        if (r && (!r.lastFired || t - r.lastFired > 60_000)) this.fire({ type: 'sensor', deviceId: 'radar-hall', event: 'motion' }, 'hall');
      }
    }
    for (const r of this.s.rooms) {
      if (r.stale) continue;
      const anyOnline = this.s.devices.some((d) => d.room === r.id && d.online && d.kind !== 'light' && d.kind !== 'plug');
      if (anyOnline) r.lastSignal = t;
    }
    this.s.energy.push({ at: t, w: Math.round(this.totalW()) });
    if (this.s.energy.length > 120) this.s.energy.shift();
  }

  private powerStep(dt: number, t: number) {
    const p = this.s.power;
    const sec = dt / 1000;
    p.ups.loadW = p.ats === 'mains' ? ESSENTIAL_W : p.ats === 'battery' ? ESSENTIAL_W : ESSENTIAL_W;
    if (p.ats === 'battery') p.ups.battery = Math.max(0, p.ups.battery - 0.06 * sec);
    else if (p.ups.battery < 100) p.ups.battery = Math.min(100, p.ups.battery + 0.02 * sec);
    p.ups.charging = p.ats !== 'battery' && p.ups.battery < 100;
    if (p.nextAt && t >= p.nextAt) {
      if (p.mains === 'off' && p.generator === 'cranking') {
        p.generator = 'running';
        p.ats = 'generator';
        p.nextAt = undefined;
        p.history.unshift({ at: t, text: 'Máy phát chạy ổn định, ATS chuyển sang máy phát' });
      } else if (p.mains === 'on' && p.ats !== 'mains') {
        p.ats = 'mains';
        p.generator = p.generator === 'standby' ? 'standby' : 'cooldown';
        p.nextAt = p.generator === 'cooldown' ? t + 8000 : undefined;
        p.history.unshift({ at: t, text: 'ATS chuyển về điện lưới' });
      } else if (p.generator === 'cooldown') {
        p.generator = 'standby';
        p.nextAt = undefined;
        p.history.unshift({ at: t, text: 'Máy phát làm mát xong, về chế độ chờ' });
      }
      p.history = p.history.slice(0, 20);
    }
    const ups = this.device('ups');
    if (ups) ups.state.battery = Math.round(p.ups.battery);
    const gen = this.device('generator');
    if (gen) gen.state.state = p.generator;
  }

  mergeIncident(id: string, inc: HomeIncident | null) {
    const i = this.s.incidents.findIndex((x) => x.id === id);
    if (inc === null) {
      if (i >= 0) this.s.incidents.splice(i, 1);
    } else if (i >= 0) this.s.incidents[i] = inc;
    else this.s.incidents.unshift(inc);
    this.emit(true);
  }

  reset(real = false) {
    this.s = real ? HomeEngine.freshReal(this.now()) : HomeEngine.fresh(this.now());
    this.people = real ? [] : seedPeople();
    this.frames = {};
    this.radar = {};
    this.fusion = {};
    this.emit();
  }
}

function plugW(id: string) {
  return id === 'plug-kettle' ? 1800 : id === 'plug-washer' ? 450 : 60;
}

export function roleName(r: HouseholdRole | 'system') {
  return { admin: 'Quản trị hộ', member: 'Thành viên', child: 'Thành viên trẻ', carer: 'Người hỗ trợ', system: 'Hệ thống' }[r];
}

export function describeDesired(d: Record<string, string | number | boolean>) {
  const parts: string[] = [];
  if ('on' in d) parts.push(d.on ? 'bật' : 'tắt');
  if ('brightness' in d) parts.push(`${d.brightness}%`);
  if ('temp' in d) parts.push(d.temp === 'warm' ? 'ánh sáng ấm' : d.temp === 'cool' ? 'ánh sáng lạnh' : 'trung tính');
  if ('locked' in d) parts.push(d.locked ? 'khóa' : 'mở khóa');
  if ('open' in d) parts.push(d.open ? 'mở van' : 'khóa van');
  if ('position' in d) parts.push(`rèm ${d.position}%`);
  if ('target' in d) parts.push(`${d.target}°C`);
  if ('privacy' in d) parts.push(d.privacy ? 'bật riêng tư' : 'tắt riêng tư');
  return parts.join(', ') || JSON.stringify(d);
}

function incidentTitle(kind: IncidentKind, room: string) {
  return {
    sos: `SOS ở ${room.toLowerCase()}`,
    fall: `Tín hiệu nghi ngã, ${room}`,
    smoke: `Khói/CO, ${room}`,
    leak: `Rò nước, ${room}`,
    door: `Cửa mở bất thường, ${room}`,
    power: `Sự cố điện, ${room}`,
  }[kind];
}

function defaultState(kind: DeviceKind): Device['state'] {
  switch (kind) {
    case 'light':
      return { on: false, brightness: 80, temp: 'warm' };
    case 'plug':
      return { on: false, powerW: 0 };
    case 'door':
      return { open: false };
    case 'leak':
      return { wet: false };
    case 'smoke':
      return { smoke: false, co: 2 };
    case 'sos':
      return { pressed: false };
    case 'curtain':
      return { position: 100 };
    default:
      return {};
  }
}
