import type { HouseholdEntity, HouseholdInfo, HouseholdOp } from '../core/hublink/protocol';
import { buf, fromB64, toB64 } from '../core/sentinel/encoding';
import type { HomeIncident } from '../core/smarthome/types';
import { toast } from '../lib/ui-store';
import { blobs, getHome, getSentinel, json, syncDirectory } from './services';
import { getApp, memberName } from './store';
import type { CalendarShare, Contribution, FundGoal, Hospital, Invitation, Member, Memory, Permission, Ritual, Task } from './types';

const SENT_KEY = 'hublink.sent';

interface SentState {
  household: string;
  hashes: Record<string, string>;
}

interface Item {
  entity: HouseholdEntity;
  id: string;
  data: unknown;
  aud?: string[];
}

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const hashOf = (data: unknown) => fnv(JSON.stringify(data ?? null));
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && !x.startsWith('svc-')))];

function loadSent(): SentState {
  const id = getApp().household?.id ?? '';
  const s = json.get<SentState>(SENT_KEY);
  return s && s.household === id ? s : { household: id, hashes: {} };
}

function saveSent(s: SentState) {
  json.set(SENT_KEY, s);
}

function items(): Map<string, Item> {
  const a = getApp();
  const out = new Map<string, Item>();
  if (!a.household || a.household.demo) return out;
  out.set('household', { entity: 'household', id: a.household.id, data: { id: a.household.id, name: a.household.name, tz: a.household.tz } satisfies HouseholdInfo });
  for (const m of a.members) out.set(`member:${m.id}`, { entity: 'member', id: m.id, data: m });
  for (const c of a.calendars) out.set(`calendar:${c.memberId}`, { entity: 'calendar', id: c.memberId, data: c, aud: uniq([c.memberId, ...c.viewers]) });
  for (const t of a.tasks) out.set(`task:${t.id}`, { entity: 'task', id: t.id, data: t, aud: uniq([t.createdBy, t.assignee, t.target, ...t.visibleTo]) });
  for (const i of a.invitations) out.set(`invitation:${i.id}`, { entity: 'invitation', id: i.id, data: i, aud: uniq([i.hostId, ...i.recipients]) });
  for (const r of a.rituals) out.set(`ritual:${r.id}`, { entity: 'ritual', id: r.id, data: r });
  for (const m of a.memories) out.set(`memory:${m.id}`, { entity: 'memory', id: m.id, data: m, aud: uniq([m.narrator, ...m.viewers]) });
  for (const g of a.goals) out.set(`goal:${g.id}`, { entity: 'goal', id: g.id, data: g });
  for (const c of a.contributions) {
    const goal = a.goals.find((g) => g.id === c.goalId);
    out.set(`contribution:${c.id}`, { entity: 'contribution', id: c.id, data: c, aud: uniq([c.by, goal?.managerId, ...c.visibleTo]) });
  }
  for (const p of a.permissions) out.set(`permission:${p.id}`, { entity: 'permission', id: p.id, data: p });
  for (const h of a.hospitals) out.set(`hospital:${h.id}`, { entity: 'hospital', id: h.id, data: h });
  for (const inc of getHome().s.incidents) out.set(`incident:${inc.id}`, { entity: 'incident', id: inc.id, data: inc });
  return out;
}

const RANK: Partial<Record<HouseholdEntity, number>> = { household: 0, member: 1 };

async function memorySecret(m: Memory) {
  const r = await getSentinel().read<Record<string, unknown>>({ subject: m.narrator, objectId: m.objectId, purpose: 'memory.view' });
  if (!r.ok || !r.data) return undefined;
  const secret: { data: Record<string, unknown>; audio?: { iv: string; ct: string; type: string } } = { data: r.data };
  if (m.audioKey) {
    const rec = await blobs.get<{ iv: string; ct: ArrayBuffer; type: string }>(m.audioKey);
    if (rec) secret.audio = { iv: rec.iv, ct: toB64(rec.ct), type: rec.type };
  }
  return secret;
}

async function fundSecret(c: Contribution) {
  const r = await getSentinel().read<Record<string, unknown>>({ subject: c.by, objectId: c.objectId, purpose: 'fund.view' });
  return r.ok && r.data ? r.data : undefined;
}

export async function collectOps(): Promise<HouseholdOp[]> {
  const a = getApp();
  if (!a.household || a.household.demo) return [];
  const sent = loadSent();
  const by = a.session.actingAs;
  const now = Date.now();
  const ops: HouseholdOp[] = [];
  const current = items();
  for (const [key, it] of current) {
    const h = hashOf(it.data);
    if (sent.hashes[key] === h) continue;
    let data: unknown = it.data;
    if (it.entity === 'memory') data = { ...(it.data as Memory), _secret: await memorySecret(it.data as Memory) };
    if (it.entity === 'contribution') data = { ...(it.data as Contribution), _secret: await fundSecret(it.data as Contribution) };
    ops.push({ key, entity: it.entity, id: it.id, data, ts: now, by, aud: it.aud });
  }
  for (const key of Object.keys(sent.hashes)) {
    if (current.has(key)) continue;
    const [entity, id] = key.includes(':') ? (key.split(/:(.+)/) as [HouseholdEntity, string]) : ['household' as HouseholdEntity, key];
    ops.push({ key, entity, id, data: null, ts: now, by });
  }
  return ops.sort((x, y) => (RANK[x.entity] ?? 2) - (RANK[y.entity] ?? 2));
}

function strip(data: unknown) {
  if (!data || typeof data !== 'object') return data;
  const { _secret, ...rest } = data as Record<string, unknown>;
  void _secret;
  return rest;
}

export function commitOps(ops: HouseholdOp[]) {
  const sent = loadSent();
  for (const op of ops) {
    if (op.data === null) delete sent.hashes[op.key];
    else sent.hashes[op.key] = hashOf(strip(op.data));
  }
  saveSent(sent);
}

function upsert<T>(list: T[], match: (x: T) => boolean, value: T | null) {
  const i = list.findIndex(match);
  if (value === null) {
    if (i >= 0) list.splice(i, 1);
  } else if (i >= 0) list[i] = value;
  else list.push(value);
}

export async function applyOps(ops: HouseholdOp[], household: HouseholdInfo | null, memberId: string | undefined) {
  const app = getApp();
  if (app.household?.demo) return;
  const set = app.set;
  if (household && (!app.household || app.household.id === household.id)) {
    set((s) => {
      s.household = { id: household.id, name: household.name, tz: household.tz, demo: false, createdAt: s.household?.createdAt ?? Date.now() };
      s.session.householdId = household.id;
      if (memberId && !s.session.actingAs) s.session.actingAs = memberId;
    });
  }
  const sentinel = getSentinel();
  const fresh: HomeIncident[] = [];
  let membersChanged = false;
  for (const op of ops) {
    const data = op.data === null ? null : strip(op.data);
    const secret = op.data && typeof op.data === 'object' ? (op.data as { _secret?: unknown })._secret : undefined;
    switch (op.entity) {
      case 'household':
        break;
      case 'member':
        membersChanged = true;
        set((s) => upsert<Member>(s.members, (m) => m.id === op.id, data as Member | null));
        break;
      case 'calendar': {
        const c = data as CalendarShare | null;
        set((s) => upsert<CalendarShare>(s.calendars, (x) => x.memberId === op.id, c));
        if (c) {
          const version = (sentinel.vault.meta(`cal-${c.memberId}`)?.version ?? 0) + 1;
          await sentinel.protect({ subject: c.memberId, objectId: `cal-${c.memberId}`, type: 'calendar.freebusy', label: `Lịch rảnh/bận của ${memberName(c.memberId)}`, data: { windows: c.windows, quietFrom: c.quietFrom, tz: 'GMT+7' }, viewers: c.shared ? c.viewers : [], purposes: ['rhythm.intersect'], version });
        }
        break;
      }
      case 'task':
        set((s) => upsert<Task>(s.tasks, (x) => x.id === op.id, data as Task | null));
        break;
      case 'invitation':
        set((s) => upsert<Invitation>(s.invitations, (x) => x.id === op.id, data as Invitation | null));
        break;
      case 'ritual':
        set((s) => upsert<Ritual>(s.rituals, (x) => x.id === op.id, data as Ritual | null));
        break;
      case 'goal':
        set((s) => upsert<FundGoal>(s.goals, (x) => x.id === op.id, data as FundGoal | null));
        break;
      case 'permission': {
        const p = data as Permission | null;
        set((s) => upsert<Permission>(s.permissions, (x) => x.id === op.id, p));
        if (p?.objectId && p.scope !== 'calendar' && sentinel.vault.meta(p.objectId)) sentinel.vault.updateAcl(p.objectId, { viewers: p.status === 'granted' ? p.viewers.filter((v) => v !== p.ownerId) : [] });
        break;
      }
      case 'hospital':
        set((s) => upsert<Hospital>(s.hospitals, (x) => x.id === op.id, data as Hospital | null));
        break;
      case 'memory': {
        const m = data as Memory | null;
        set((s) => upsert<Memory>(s.memories, (x) => x.id === op.id, m));
        const sec = secret as { data: Record<string, unknown>; audio?: { iv: string; ct: string; type: string } } | undefined;
        if (m && sec?.data) {
          const version = (sentinel.vault.meta(m.objectId)?.version ?? 0) + 1;
          await sentinel.protect({ subject: m.narrator, objectId: m.objectId, type: 'memory', label: `Ký ức, ${m.title}`, data: sec.data, viewers: m.viewers, purposes: ['memory.view'], version });
          if (m.audioKey && sec.audio) await blobs.set(m.audioKey, { iv: sec.audio.iv, ct: buf(fromB64(sec.audio.ct)), type: sec.audio.type });
        }
        if (!m) {
          const old = app.memories.find((x) => x.id === op.id);
          if (old?.audioKey) await blobs.del(old.audioKey);
        }
        break;
      }
      case 'contribution': {
        const c = data as Contribution | null;
        set((s) => upsert<Contribution>(s.contributions, (x) => x.id === op.id, c));
        if (c && secret && typeof secret === 'object') {
          const version = (sentinel.vault.meta(c.objectId)?.version ?? 0) + 1;
          await sentinel.protect({ subject: c.by, objectId: c.objectId, type: 'fund.entry', label: `Khoản tự ghi của ${memberName(c.by)}`, data: secret as Record<string, unknown>, viewers: c.visibleTo.filter((v) => v !== c.by), purposes: ['fund.view'], version });
        }
        break;
      }
      case 'incident': {
        const inc = data as HomeIncident | null;
        const known = getHome().s.incidents.some((x) => x.id === op.id);
        getHome().mergeIncident(op.id, inc);
        if (inc && !known && inc.status !== 'closed') fresh.push(inc);
        break;
      }
    }
  }
  if (membersChanged) syncDirectory(getApp().members);
  const sent = loadSent();
  for (const op of ops) {
    if (op.data === null) delete sent.hashes[op.key];
    else sent.hashes[op.key] = hashOf(strip(op.data));
  }
  saveSent(sent);
  for (const inc of fresh) toast(`${inc.title}: ${inc.timeline.at(-1)?.text ?? 'cần hỗ trợ'}`, inc.priority === 'P1' ? 'critical' : 'warning', 8000);
}

export function resetSyncState() {
  json.del(SENT_KEY);
}
