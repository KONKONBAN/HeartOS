import { useEffect, useMemo, useState } from 'react';
import { clockOf, describeHabit, feedbackAfter, learn, suggestions, type Habit, type HabitEvent, type HabitSuggestion } from '../core/family/habits';
import { randomId } from '../core/sentinel/encoding';
import type { Actor } from '../core/smarthome/engine';
import { describeDesired } from '../core/smarthome/engine';
import { getHome } from './services';
import { getApp, memberName, useApp } from './store';

const MAX_EVENTS = 3000;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function record(list: HabitEvent[]) {
  if (!list.length) return;
  useApp.getState().set((s) => {
    s.habits.events.push(...list);
    if (s.habits.events.length > MAX_EVENTS) s.habits.events.splice(0, s.habits.events.length - MAX_EVENTS);
  });
}

function observeTasks() {
  const app = getApp();
  if (!app.habits.enabled) return;
  const since = app.habits.cursor.task;
  const done = app.tasks.filter((t) => t.status === 'done' && (t.doneAt ?? 0) > since);
  if (!done.length) return;
  const events: HabitEvent[] = done.map((t) =>
    t.kind === 'call' && t.target
      ? { who: t.assignee, kind: 'call', key: `call:${t.target}`, label: `gọi hỏi thăm ${memberName(t.target)}`, at: t.doneAt!, payload: { target: t.target } }
      : { who: t.assignee, kind: 'task', key: `task:${norm(t.title)}`, label: t.title.charAt(0).toLowerCase() + t.title.slice(1), at: t.doneAt! },
  );
  record(events);
  useApp.getState().set((s) => void (s.habits.cursor.task = Math.max(...done.map((t) => t.doneAt ?? 0))));
}

function observeCommands() {
  const app = getApp();
  if (!app.habits.enabled) return;
  const home = getHome();
  const since = app.habits.cursor.cmd;
  const fresh = home.s.commands.filter((c) => c.at > since && c.source === 'user' && c.status !== 'rejected' && c.status !== 'failed' && app.members.some((m) => m.id === c.by));
  if (!fresh.length) return;
  const events: HabitEvent[] = [];
  for (const c of fresh) {
    const d = home.device(c.deviceId);
    if (!d || !Object.keys(c.desired).length) continue;
    const parts = Object.entries(c.desired).filter(([k]) => ['on', 'locked', 'open', 'position', 'target'].includes(k));
    if (!parts.length) continue;
    const key = `${d.id}:${parts.map(([k, v]) => `${k}=${v}`).join(',')}`;
    events.push({ who: c.by, kind: 'device', key, label: `${describeDesired(Object.fromEntries(parts))} ${d.name}`, at: c.at, payload: { deviceId: d.id, desired: JSON.stringify(Object.fromEntries(parts)) } });
  }
  record(events);
  useApp.getState().set((s) => void (s.habits.cursor.cmd = Math.max(...fresh.map((c) => c.at))));
}

const today = () => new Date().toDateString();

function notifyDue() {
  const app = getApp();
  if (!app.habits.enabled || !app.session.actingAs) return;
  const me = app.session.actingAs;
  const habits = learn(app.habits.events, Date.now(), forgottenSet());
  const list = suggestions({ habits, events: app.habits.events, feedback: app.habits.feedback, me, automated: isAutomated }).filter((s) => s.type !== 'automate');
  const home = getHome();
  for (const s of list) {
    if (app.habits.notified[s.id] === today()) continue;
    home.notify(s.title, `${s.meta}. Mở HeartOS để làm ngay hoặc bỏ qua.`, 'info', '/f');
    useApp.getState().set((st) => void (st.habits.notified[s.id] = today()));
  }
}

function forgottenSet() {
  return new Set(Object.entries(getApp().habits.feedback).filter(([, f]) => f.forgotten).map(([k]) => k));
}

function isAutomated(h: Habit) {
  const p = h.payload;
  if (!p?.deviceId) return false;
  return getHome().s.rules.some((r) => r.trigger.type === 'time' && r.actions.some((a) => a.type === 'device' && a.deviceId === p.deviceId));
}

let started = false;
export function startHabits() {
  if (started) return;
  started = true;
  useApp.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks) observeTasks();
  });
  getHome().subscribe(() => observeCommands());
  setInterval(notifyDue, 60_000);
  setTimeout(notifyDue, 8000);
}

export function useHabits(me: string) {
  const events = useApp((s) => s.habits.events);
  const feedback = useApp((s) => s.habits.feedback);
  const enabled = useApp((s) => s.habits.enabled);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const forgotten = useMemo(() => new Set(Object.entries(feedback).filter(([, f]) => f.forgotten).map(([k]) => k)), [feedback]);
  const habits = useMemo(() => (enabled ? learn(events, Date.now(), forgotten) : []), [events, forgotten, enabled, tick]);
  const due = useMemo(() => (enabled ? suggestions({ habits, events, feedback, me, automated: isAutomated }) : []), [habits, events, feedback, me, enabled, tick]);
  return { habits, due, enabled };
}

export function habitContext(me: string) {
  const app = getApp();
  if (!app.habits.enabled) return [];
  const habits = learn(app.habits.events, Date.now(), forgottenSet());
  return habits
    .filter((h) => h.who === me || h.kind === 'device')
    .slice(0, 8)
    .map((h) => `${memberName(h.who)} ${describeHabit(h)} (độ tin ${Math.round(h.confidence * 100)}%)`);
}

function feedback(id: string, accepted: boolean) {
  useApp.getState().set((s) => void (s.habits.feedback[id] = feedbackAfter(s.habits.feedback[id], accepted)));
}

export function dismissHabit(s: HabitSuggestion) {
  feedback(s.habit.id, false);
}

export function forgetHabit(id: string) {
  useApp.getState().set((s) => {
    s.habits.feedback[id] = { ...(s.habits.feedback[id] ?? { accepted: 0, dismissed: 0 }), forgotten: true };
    const [who, kind, key] = id.split('|');
    s.habits.events = s.habits.events.filter((e) => !(e.who === who && e.kind === kind && e.key === key));
  });
}

export function acceptHabit(s: HabitSuggestion, meId: string): string {
  const app = getApp();
  const me = app.members.find((m) => m.id === meId);
  if (!me) return '';
  const actor: Actor = { id: me.id, name: me.name, role: me.role };
  const h = s.habit;
  const home = getHome();
  feedback(h.id, true);
  if (s.type === 'automate' && h.payload?.deviceId) {
    home.addRule({ name: `${h.label.charAt(0).toUpperCase() + h.label.slice(1)} lúc ${clockOf(h.minute)}`, description: 'Do trợ lý gợi ý từ thói quen của gia đình', enabled: true, trigger: { type: 'time', at: clockOf(h.minute) }, actions: [{ type: 'device', deviceId: String(h.payload.deviceId), action: 'set', params: JSON.parse(String(h.payload.desired)) }] });
    return `Đã tạo lịch tự động lúc ${clockOf(h.minute)}. Xem trong Luật tự động.`;
  }
  if (h.kind === 'device' && h.payload?.deviceId) {
    const cmd = home.sendCommand(String(h.payload.deviceId), 'set', JSON.parse(String(h.payload.desired)), actor, 'user');
    return cmd.status === 'rejected' || cmd.status === 'failed' ? cmd.reason ?? 'Chưa gửi được lệnh.' : 'Đã gửi lệnh, chờ thiết bị xác nhận.';
  }
  if (h.kind === 'call' && h.payload?.target) {
    const m = app.members.find((x) => x.id === h.payload!.target);
    if (m?.phone) location.href = `tel:${m.phone}`;
    return m?.phone ? `Đang gọi ${m.name}.` : 'Người này chưa có số điện thoại.';
  }
  const d = new Date();
  d.setHours(Math.floor(h.minute / 60), h.minute % 60, 0, 0);
  if (d.getTime() < Date.now()) d.setTime(Date.now() + 10 * 60_000);
  useApp.getState().set((st) => void st.tasks.unshift({ id: randomId('t', 6), title: h.label.charAt(0).toUpperCase() + h.label.slice(1), place: '', note: 'Nhắc theo thói quen', kind: 'chore', assignee: me.id, visibleTo: [me.id], remindAt: d.getTime(), status: 'accepted', createdBy: me.id, createdAt: Date.now() }));
  return `Đã nhắc lúc ${clockOf(d.getHours() * 60 + d.getMinutes())}.`;
}
