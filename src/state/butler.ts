import { useEffect, useMemo, useState } from 'react';
import { dosesOn, doseText, daysLeft, lowStock, type Dose, type Medication } from '../core/family/meds';
import { nextOccurrence } from '../core/family/recurrence';
import type { HabitSuggestion } from '../core/family/habits';
import { randomId } from '../core/sentinel/encoding';
import { hhmm, isToday } from '../lib/format';
import { speak } from '../lib/media';
import { acceptHabit, dismissHabit, useHabits } from './habits';
import { getHome, getSentinel, useHome } from './services';
import { getApp, memberName, useApp } from './store';
import type { Member } from './types';

export type ButlerKind = 'incident' | 'med' | 'med-missed' | 'med-stock' | 'habit' | 'task' | 'ritual' | 'call' | 'device';

export interface ButlerItem {
  id: string;
  kind: ButlerKind;
  priority: number;
  title: string;
  meta: string;
  primary?: { label: string; run: () => string | void };
  to?: string;
  dismissible: boolean;
}

const dayKey = () => new Date().toDateString();

export function markDose(med: Medication, due: number, status: 'taken' | 'skipped', by: string) {
  useApp.getState().set((s) => {
    if (s.medLogs.some((l) => l.medId === med.id && l.due === due)) return;
    s.medLogs.push({ medId: med.id, due, status, at: Date.now(), by });
    if (s.medLogs.length > 2000) s.medLogs.splice(0, s.medLogs.length - 2000);
    const m = s.medications.find((x) => x.id === med.id);
    if (m && status === 'taken' && m.stock !== null) m.stock = Math.max(0, m.stock - m.perDose);
  });
  void getSentinel().log({ kind: 'note', actor: 'A', summary: `${memberName(med.memberId)} ${status === 'taken' ? 'đã uống' : 'bỏ qua'} ${med.name} liều ${hhmm(due)}` });
}

function dismissItem(id: string) {
  useApp.getState().set((s) => void (s.butlerSeen[id] = dayKey()));
}

function medItems(me: Member, now: number): ButlerItem[] {
  const app = getApp();
  const out: ButlerItem[] = [];
  const doses = dosesOn(app.medications, app.medLogs, new Date(now), now);
  for (const d of doses) {
    const mine = d.med.memberId === me.id;
    const caring = d.med.caregivers.includes(me.id);
    if (d.state === 'due' && mine) out.push({ id: `med:${d.med.id}:${d.due}`, kind: 'med', priority: 95, title: `Đến giờ uống thuốc: ${d.med.name}`, meta: `${d.med.dose}${d.med.meal !== 'any' ? `, ${d.med.meal === 'after' ? 'sau ăn' : 'trước ăn'}` : ''}, lúc ${d.time}`, primary: { label: 'Đã uống', run: () => (markDose(d.med, d.due, 'taken', me.id), 'Đã ghi nhận uống thuốc.') }, dismissible: false });
    else if (d.state === 'missed' && mine && d.due > now - 6 * 3600_000) out.push({ id: `medm:${d.med.id}:${d.due}`, kind: 'med-missed', priority: 90, title: `Chưa uống ${d.med.name} lúc ${d.time}`, meta: 'Nếu đã uống thì bấm Đã uống. Không uống bù gấp đôi khi chưa hỏi bác sĩ.', primary: { label: 'Đã uống', run: () => (markDose(d.med, d.due, 'taken', me.id), 'Đã ghi nhận.') }, dismissible: true });
    else if (d.state === 'missed' && caring && d.due > now - 6 * 3600_000) out.push({ id: `medc:${d.med.id}:${d.due}`, kind: 'med-missed', priority: 88, title: `${memberName(d.med.memberId)} chưa uống ${d.med.name}`, meta: `Liều ${d.time}, quá ${Math.round((now - d.due) / 60000)} phút. Gọi nhắc nhẹ nhàng nhé.`, primary: callAction(d.med.memberId), dismissible: true });
  }
  for (const m of app.medications.filter((x) => (x.memberId === me.id || x.caregivers.includes(me.id)) && lowStock(x))) {
    out.push({ id: `stock:${m.id}`, kind: 'med-stock', priority: 55, title: `Sắp hết ${m.name}`, meta: `Còn ${m.stock} ${m.dose.replace(/^\d+\s*/, '') || 'viên'}, đủ khoảng ${daysLeft(m)} ngày${m.memberId !== me.id ? ` cho ${memberName(m.memberId)}` : ''}. Nên mua thêm.`, to: me.mode === 'simple' ? undefined : '/f/meds', dismissible: true });
  }
  return out;
}

function callAction(memberId: string) {
  const m = getApp().members.find((x) => x.id === memberId);
  if (!m?.phone) return undefined;
  return { label: 'Gọi', run: () => void (location.href = `tel:${m.phone}`) };
}

function habitItem(s: HabitSuggestion, me: Member): ButlerItem {
  return { id: `habit:${s.id}`, kind: 'habit', priority: s.type === 'missed' ? 60 : s.type === 'upcoming' ? 65 : 40, title: s.title, meta: s.meta, primary: { label: s.type === 'automate' ? 'Đặt lịch' : s.habit.kind === 'call' ? 'Gọi' : s.habit.kind === 'device' ? 'Làm ngay' : 'Nhắc tôi', run: () => acceptHabit(s, me.id) }, dismissible: true };
}

function otherItems(me: Member, now: number): ButlerItem[] {
  const app = getApp();
  const home = getHome();
  const out: ButlerItem[] = [];
  for (const i of home.openIncidents()) out.push({ id: `inc:${i.id}`, kind: 'incident', priority: 100, title: i.title, meta: i.priority === 'P1' ? 'Cần xử lý ngay' : 'Đang mở', to: me.mode === 'simple' ? '/s/help' : `/f/incident/${i.id}`, dismissible: false });
  const overdue = app.tasks.filter((t) => t.assignee === me.id && t.status !== 'done' && t.remindAt < now && t.remindAt > now - 2 * 86400_000);
  if (overdue.length) out.push({ id: `task:${overdue.map((t) => t.id).join(',')}`, kind: 'task', priority: 50, title: overdue.length > 1 ? `${overdue.length} việc đã quá giờ` : `Quá giờ: ${overdue[0].title}`, meta: `Nhắc lúc ${hhmm(overdue[0].remindAt)}${isToday(overdue[0].remindAt) ? ' hôm nay' : ''}`, to: me.mode === 'simple' ? '/s/today' : '/f/tasks', dismissible: true });
  const soon = app.rituals.map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(), r.skip).getTime() })).filter((x) => x.r.participants.includes(me.id) && x.at - now < 3 * 3600_000 && x.at > now).sort((a, b) => a.at - b.at)[0];
  if (soon) out.push({ id: `rit:${soon.r.id}:${soon.at}`, kind: 'ritual', priority: 45, title: `${soon.r.name} lúc ${hhmm(soon.at)}`, meta: soon.r.note || 'Sắp tới giờ sum họp', to: me.mode === 'simple' ? '/s/today' : `/f/ritual/${soon.r.id}`, dismissible: true });
  if (me.mode !== 'simple') {
    const lastCall = (id: string) => app.tasks.filter((t) => t.kind === 'call' && t.target === id && t.status === 'done').reduce((mx, t) => Math.max(mx, t.doneAt ?? 0), 0);
    const elder = app.members.find((m) => m.id !== me.id && m.mode === 'simple' && m.phone && now - lastCall(m.id) > 3 * 86400_000);
    if (elder) out.push({ id: `call:${elder.id}`, kind: 'call', priority: 35, title: `Lâu rồi chưa gọi hỏi thăm ${elder.name}`, meta: 'Một cuộc gọi ngắn cũng làm ông bà vui cả ngày', primary: callAction(elder.id), dismissible: true });
  }
  const h = new Date(now).getHours();
  const lights = home.s.devices.filter((d) => d.kind === 'light' && d.paired && d.online && d.state.on && d.controlRoles.includes(me.role));
  if ((h >= 23 || h < 5) && lights.length) {
    const actor = { id: me.id, name: me.name, role: me.role };
    out.push({ id: `dev:night:${lights.map((l) => l.id).join(',')}`, kind: 'device', priority: 30, title: `${lights.length} đèn vẫn bật lúc khuya`, meta: lights.map((l) => l.name).join(', '), primary: { label: 'Tắt hết', run: () => (lights.forEach((l) => home.sendCommand(l.id, 'set', { on: false }, actor, 'user')), 'Đã gửi lệnh tắt đèn.') }, dismissible: true });
  }
  if (home.s.mode === 'away') {
    const ac = home.s.devices.filter((d) => d.kind === 'ac' && d.state.on && d.controlRoles.includes(me.role));
    if (ac.length) {
      const actor = { id: me.id, name: me.name, role: me.role };
      out.push({ id: `dev:away:${ac.map((d) => d.id).join(',')}`, kind: 'device', priority: 32, title: 'Vắng nhà mà điều hòa vẫn chạy', meta: ac.map((d) => d.name).join(', '), primary: { label: 'Tắt', run: () => (ac.forEach((d) => home.sendCommand(d.id, 'set', { on: false }, actor, 'user')), 'Đã gửi lệnh tắt điều hòa.') }, dismissible: true });
    }
  }
  return out;
}

export function useButler(me: Member) {
  const { due } = useHabits(me.id);
  const meds = useApp((s) => s.medications);
  const logs = useApp((s) => s.medLogs);
  const seen = useApp((s) => s.butlerSeen);
  const tasks = useApp((s) => s.tasks);
  const home = useHome();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const items = useMemo(() => {
    const now = Date.now();
    const all = [...otherItems(me, now), ...medItems(me, now), ...due.map((s) => habitItem(s, me))];
    return all.filter((i) => !(i.dismissible && seen[i.id] === dayKey())).sort((a, b) => b.priority - a.priority);
  }, [me.id, me.mode, due, meds, logs, seen, tasks, home.s, tick]);
  const dismiss = (i: ButlerItem) => {
    if (i.id.startsWith('habit:')) {
      const s = due.find((d) => `habit:${d.id}` === i.id);
      if (s) dismissHabit(s);
    }
    dismissItem(i.id);
  };
  return { items, dismiss };
}

export function butlerContext(me: Member) {
  const now = Date.now();
  const items = [...otherItems(me, now), ...medItems(me, now)].sort((a, b) => b.priority - a.priority).slice(0, 6);
  const doses = dosesOn(getApp().medications.filter((m) => m.memberId === me.id || m.caregivers.includes(me.id)), getApp().medLogs, new Date(now), now);
  const medLines = doses.map((d: Dose) => `${memberName(d.med.memberId)}: ${doseText(d)} lúc ${d.time}, ${{ taken: 'đã uống', skipped: 'bỏ qua', due: 'đang đến giờ', missed: 'chưa uống, đã quá giờ', later: 'chưa tới giờ' }[d.state]}`);
  return { items: items.map((i) => `${i.title}. ${i.meta}`), meds: medLines };
}

let started = false;
export function startButler() {
  if (started) return;
  started = true;
  const check = () => {
    const app = getApp();
    const me = app.members.find((m) => m.id === app.session.actingAs);
    if (!me) return;
    const now = Date.now();
    for (const i of medItems(me, now)) {
      if (i.kind === 'med-stock' || app.butlerSeen[`n:${i.id}`]) continue;
      getHome().notify(i.title, i.meta, i.kind === 'med' ? 'warning' : 'info', me.mode === 'simple' ? '/s' : '/f/meds');
      if (i.kind === 'med' && me.mode === 'simple') speak(`Đến giờ uống thuốc rồi ạ. ${i.title.replace('Đến giờ uống thuốc: ', '')}, ${i.meta}.`, app.prefs.voiceLang);
      useApp.getState().set((s) => void (s.butlerSeen[`n:${i.id}`] = dayKey()));
    }
  };
  setInterval(check, 60_000);
  setTimeout(check, 6000);
}

export function newMedication(p: Omit<Medication, 'id' | 'createdAt' | 'active'>) {
  const med: Medication = { ...p, id: randomId('med', 5), active: true, createdAt: Date.now() };
  useApp.getState().set((s) => void s.medications.push(med));
  return med;
}
