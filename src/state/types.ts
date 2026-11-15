import type { DraftResult, InviteDraft } from '../core/family/genai';
import type { Recurrence } from '../core/family/recurrence';
import type { Window } from '../core/family/calendar';
import type { HouseholdRole } from '../core/smarthome/types';

export type UiMode = 'simple' | 'family';
export type Lang = 'vi' | 'en';

export interface Member {
  id: string;
  name: string;
  short: string;
  relation: string;
  role: HouseholdRole;
  mode: UiMode;
  lang: Lang;
  phone: string;
  color: string;
  address: string;
  selfRef: string;
  guardian?: string;
  expiresAt?: number;
}

export interface Session {
  signedIn: boolean;
  email: string;
  passkey?: { id: string; createdAt: number; kind: 'webauthn' | 'device-key' };
  expo?: boolean;
  householdId: string | null;
  mode: UiMode | null;
  actingAs: string;
  startedAt: number;
}

export interface CalendarShare {
  memberId: string;
  windows: Window[];
  viewers: string[];
  shared: boolean;
  quietFrom: string;
  version: number;
}

export type InviteStatus = 'draft' | 'queued' | 'delivered' | 'blocked' | 'snoozed' | 'dismissed';

export interface Invitation {
  id: string;
  occasion: string;
  slot: { start: number; end: number };
  tz: string;
  place: string;
  hostId: string;
  recipients: string[];
  draft: InviteDraft;
  gen: Pick<DraftResult, 'provider' | 'model' | 'checks' | 'fellBack' | 'ms'>;
  status: InviteStatus;
  createdAt: number;
  approvedAt?: number;
  approvedBy?: string;
  approvedEpoch?: number;
  approvalId?: string;
  deliveredAt?: number;
  blockedReason?: string;
  receipts: Record<string, 'pending' | 'accepted' | 'declined' | 'later'>;
  history: { at: number; text: string }[];
}

export interface Task {
  id: string;
  title: string;
  place: string;
  note: string;
  kind: 'chore' | 'call';
  assignee: string;
  target?: string;
  visibleTo: string[];
  remindAt: number;
  status: 'open' | 'accepted' | 'scheduled' | 'done';
  createdBy: string;
  createdAt: number;
  doneAt?: number;
}

export interface Ritual {
  id: string;
  name: string;
  recurrence: Recurrence;
  participants: string[];
  skip: string[];
  note: string;
  createdAt: number;
  memoryIds: string[];
  overrideNext?: { time: string; scope: 'once' | 'series' };
}

export interface Memory {
  id: string;
  title: string;
  kind: 'story' | 'photo';
  narrator: string;
  createdAt: number;
  durationSec?: number;
  lang: Lang;
  image?: string;
  audioKey?: string;
  objectId: string;
  viewers: string[];
  retention: string;
  derivedAllowed: boolean;
  ritualId?: string;
  shared: boolean;
}

export interface FundGoal {
  id: string;
  name: string;
  target: number;
  managerId: string;
}

export interface Contribution {
  id: string;
  goalId: string;
  amount: number;
  by: string;
  at: number;
  objectId: string;
  visibleTo: string[];
}

export type PermScope = 'calendar' | 'memory' | 'camera' | 'location';

export interface Permission {
  id: string;
  scope: PermScope;
  title: string;
  subtitle: string;
  ownerId: string;
  viewers: string[];
  purpose: string;
  expiresAt?: number;
  status: 'granted' | 'revoked';
  objectId?: string;
}

export interface SyncDevice {
  id: string;
  name: string;
  ownerId: string;
  online: boolean;
}

export interface SyncJob {
  id: string;
  permissionId: string;
  title: string;
  version: number;
  at: number;
  devices: { deviceId: string; status: 'applied' | 'pending'; at?: number; oldExpiry?: number }[];
}

export interface CameraSession {
  id: string;
  deviceId: string;
  startedAt: number;
  expiresAt: number;
  grantId?: string;
  status: 'active' | 'ended';
  endedAt?: number;
  by: string;
}

export interface Prefs {
  assistantLang: 'vi-VN' | 'en-US';
  voiceLang: 'vi-VN' | 'en-US';
  readAloud: boolean;
  largeText: boolean;
  claudeEnabled: boolean;
  claudeKey: string;
  claudeModel: string;
  notifications: boolean;
  quietFrom: string;
}

export interface ChatMsg {
  id: string;
  from: 'user' | 'assistant';
  text: string;
  at: number;
  action?: { label: string; to: string };
}
