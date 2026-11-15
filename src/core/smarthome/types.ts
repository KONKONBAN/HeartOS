export type RoomId = 'living' | 'kitchen' | 'door' | 'hall' | 'bedroom' | 'laundry';
export type HouseholdRole = 'admin' | 'member' | 'child' | 'carer';
export type HomeMode = 'home' | 'away' | 'night';

export interface Room {
  id: RoomId;
  name: string;
  short: string;
  rect: { x: number; y: number; w: number; h: number };
  sensing: ('radar' | 'thermal' | 'door' | 'leak' | 'smoke' | 'camera')[];
  lastSignal: number;
  stale?: boolean;
}

export type DeviceKind =
  | 'hub'
  | 'light'
  | 'plug'
  | 'door'
  | 'smoke'
  | 'leak'
  | 'radar'
  | 'thermal'
  | 'camera'
  | 'sos'
  | 'siren'
  | 'valve'
  | 'lock'
  | 'ac'
  | 'curtain'
  | 'ups'
  | 'generator'
  | 'router';

export const ACTUATORS: DeviceKind[] = ['light', 'plug', 'siren', 'valve', 'lock', 'ac', 'curtain', 'camera'];

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  room: RoomId;
  model: string;
  firmware: string;
  online: boolean;
  paired: boolean;
  essential?: boolean;
  battery?: number;
  lastSeen: number;
  confirmedAt?: number;
  state: Record<string, string | number | boolean>;
  controlRoles: HouseholdRole[];
  zoneLocked: boolean;
  latencyMs: number;
}

export type CommandStatus = 'queued' | 'sent' | 'awaiting' | 'acked' | 'failed' | 'rejected' | 'expired' | 'cancelled';

export interface Command {
  id: string;
  deviceId: string;
  action: string;
  params?: Record<string, string | number | boolean>;
  desired: Record<string, string | number | boolean>;
  by: string;
  byName: string;
  at: number;
  sentAt?: number;
  ackAt?: number;
  status: CommandStatus;
  via: 'lan' | 'cloud';
  reason?: string;
  source: 'user' | 'scene' | 'automation' | 'guardian';
}

export interface SceneAction {
  deviceId: string;
  action: string;
  params?: Record<string, string | number | boolean>;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  icon: string;
  actions: SceneAction[];
}

export type Trigger =
  | { type: 'sensor'; deviceId: string; event: 'open' | 'leak' | 'smoke' | 'motion' | 'sos' }
  | { type: 'guardian'; event: 'fall_suspected' }
  | { type: 'power'; event: 'mains_lost' | 'mains_restored' }
  | { type: 'net'; event: 'internet_lost' | 'internet_restored' }
  | { type: 'time'; at: string };

export interface Condition {
  timeBetween?: [string, string];
  mode?: HomeMode;
}

export type RuleAction =
  | { type: 'device'; deviceId: string; action: string; params?: Record<string, string | number | boolean> }
  | { type: 'notify'; text: string; severity: 'info' | 'warning' | 'critical' }
  | { type: 'incident'; kind: IncidentKind; priority: 'P1' | 'P2' | 'P3' }
  | { type: 'shed' }
  | { type: 'mode'; mode: HomeMode };

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
  trigger: Trigger;
  condition?: Condition;
  actions: RuleAction[];
  lastFired?: number;
  fireCount: number;
}

export interface PowerState {
  mains: 'on' | 'off';
  voltage: number;
  ups: { battery: number; loadW: number; charging: boolean };
  generator: 'standby' | 'cranking' | 'running' | 'cooldown';
  ats: 'mains' | 'battery' | 'generator';
  lastChange: number;
  nextAt?: number;
  history: { at: number; text: string }[];
}

export interface NetState {
  lan: boolean;
  internet: boolean;
  changedAt: number;
}

export type IncidentKind = 'sos' | 'fall' | 'smoke' | 'leak' | 'door' | 'power';
export type StepState = 'done' | 'active' | 'unknown' | 'todo' | 'failed';

export interface Evidence {
  kind: 'radar' | 'thermal' | 'button' | 'smoke' | 'leak' | 'door' | 'human';
  at: number;
  summary: string;
  ref: string;
}

export interface HomeIncident {
  id: string;
  kind: IncidentKind;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  room: RoomId;
  createdAt: number;
  status: 'verifying' | 'open' | 'assigned' | 'handover' | 'closed';
  steps: {
    local: { state: StepState; at?: number };
    remote: { state: StepState; at?: number; note?: string };
    helper: { state: StepState; at?: number; by?: string };
    handover: { state: StepState; at?: number };
  };
  evidence: Evidence[];
  assignee?: string;
  personId?: string;
  personName?: string;
  personPhone?: string;
  location?: { lat: number; lng: number; accuracy: number; at: number };
  destination?: { facilityId: string; gate: string; etaMin: number; computedAt: number; confirmedAt: number; confirmedBy: string; name?: string; address?: string };
  timeline: { at: number; text: string; by: string }[];
  closedReason?: string;
}

export interface Notice {
  id: string;
  at: number;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  link?: string;
}

export interface RadarTarget {
  id: number;
  x: number;
  y: number;
  speed: number;
  room: RoomId;
}

export interface ThermalFrame {
  w: 32;
  h: 24;
  data: number[];
  min: number;
  max: number;
  at: number;
}

export interface PairingSession {
  code: string;
  startedAt: number;
  expiresAt: number;
  step: 'scan' | 'button' | 'zone' | 'done' | 'expired';
  kind?: DeviceKind;
  deviceModel?: string;
}
