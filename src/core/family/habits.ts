export type HabitKind = 'device' | 'task' | 'call';

export interface HabitEvent {
  who: string;
  kind: HabitKind;
  key: string;
  label: string;
  at: number;
  payload?: Record<string, string | number | boolean>;
}

export interface Habit {
  id: string;
  who: string;
  kind: HabitKind;
  key: string;
  label: string;
  minute: number;
  weekday: number | null;
  days: number;
  confidence: number;
  lastAt: number;
  payload?: Record<string, string | number | boolean>;
}

export interface HabitFeedback {
  accepted: number;
  dismissed: number;
  snoozeUntil?: number;
  forgotten?: boolean;
}

export interface HabitSuggestion {
  id: string;
  type: 'upcoming' | 'missed' | 'automate';
  habit: Habit;
  title: string;
  meta: string;
  score: number;
}

const DAY = 86400_000;
export const WEEKDAY_NAMES = ['Chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy'];

const minuteOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.round(minute % 60)).padStart(2, '0')}`;

function cluster(items: { m: number; day: string; t: number }[], tol: number) {
  let best = { center: 0, days: new Set<string>(), hits: [] as typeof items };
  for (const c of items) {
    const near = items.filter((x) => Math.abs(x.m - c.m) <= tol);
    const days = new Set(near.map((x) => x.day));
    if (days.size > best.days.size) best = { center: near.reduce((a, x) => a + x.m, 0) / near.length, days, hits: near };
  }
  return best;
}

export function learn(events: HabitEvent[], now = Date.now(), forgotten: Set<string> = new Set()): Habit[] {
  const recent = events.filter((e) => e.at > now - 35 * DAY && e.at <= now);
  const groups = new Map<string, HabitEvent[]>();
  for (const e of recent) {
    const g = `${e.who}|${e.kind}|${e.key}`;
    if (!forgotten.has(g)) groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  const out: Habit[] = [];
  for (const [id, list] of groups) {
    if (list.length < 3) continue;
    const items = list.map((e) => ({ m: minuteOf(e.at), day: dayKey(e.at), t: e.at }));
    const first = Math.min(...list.map((e) => e.at));
    const last = list.reduce((a, b) => (b.at > a.at ? b : a));
    const daily = cluster(items, 45);
    const weekdays = new Set(daily.hits.map((h) => new Date(h.t).getDay()));
    const spanDays = Math.max(3, Math.min(14, Math.ceil((now - first) / DAY)));
    const recentDays = new Set(daily.hits.filter((h) => h.t > now - spanDays * DAY).map((h) => h.day));
    if (daily.days.size >= 3 && weekdays.size >= 3) {
      out.push({ id, who: last.who, kind: last.kind, key: last.key, label: last.label, minute: Math.round(daily.center), weekday: null, days: daily.days.size, confidence: Math.min(1, recentDays.size / spanDays), lastAt: last.at, payload: last.payload });
      continue;
    }
    let bestWeekly: Habit | null = null;
    for (let w = 0; w < 7; w++) {
      const sub = items.filter((x) => new Date(x.t).getDay() === w);
      if (sub.length < 3) continue;
      const c = cluster(sub, 60);
      const weeks = Math.max(3, Math.min(5, Math.ceil((now - first) / (7 * DAY))));
      if (c.days.size >= 3) {
        const h: Habit = { id, who: last.who, kind: last.kind, key: last.key, label: last.label, minute: Math.round(c.center), weekday: w, days: c.days.size, confidence: Math.min(1, c.days.size / weeks), lastAt: last.at, payload: last.payload };
        if (!bestWeekly || h.days > bestWeekly.days) bestWeekly = h;
      }
    }
    if (bestWeekly) out.push(bestWeekly);
  }
  return out.filter((h) => h.confidence >= 0.4).sort((a, b) => b.confidence - a.confidence);
}

export function describeHabit(h: Habit) {
  return `${h.label} khoảng ${clockOf(h.minute)} ${h.weekday === null ? 'hằng ngày' : `mỗi ${WEEKDAY_NAMES[h.weekday]}`}`;
}

export function suggestions(p: { habits: Habit[]; events: HabitEvent[]; feedback: Record<string, HabitFeedback>; me: string; now?: number; automated?: (h: Habit) => boolean }): HabitSuggestion[] {
  const now = p.now ?? Date.now();
  const today = startOfDay(now);
  const nowMin = minuteOf(now);
  const out: HabitSuggestion[] = [];
  for (const h of p.habits) {
    if (h.who !== p.me) continue;
    const fb = p.feedback[h.id] ?? { accepted: 0, dismissed: 0 };
    if (fb.forgotten) continue;
    const weight = h.confidence * (1 + 0.1 * Math.min(5, fb.accepted) - 0.25 * Math.min(3, fb.dismissed));
    if (weight < 0.3) continue;
    const appliesToday = h.weekday === null || new Date(now).getDay() === h.weekday;
    const doneToday = p.events.some((e) => e.who === h.who && e.key === h.key && e.kind === h.kind && e.at >= today && e.at <= now);
    const snoozed = (fb.snoozeUntil ?? 0) > now;
    const when = `Bạn thường làm lúc ${clockOf(h.minute)} ${h.weekday === null ? 'hằng ngày' : `mỗi ${WEEKDAY_NAMES[h.weekday]}`}`;
    if (appliesToday && !doneToday && !snoozed) {
      const d = nowMin - h.minute;
      if (d >= -60 && d <= 20) out.push({ id: `${h.id}#up`, type: 'upcoming', habit: h, title: d >= 0 ? `Đến giờ ${h.label}` : `Sắp đến giờ ${h.label}`, meta: when, score: weight + 0.5 });
      else if (d > 45 && d <= 240) out.push({ id: `${h.id}#miss`, type: 'missed', habit: h, title: `Hôm nay chưa ${h.label}`, meta: when, score: weight + (h.kind === 'call' ? 0.4 : 0.2) });
    }
    if (h.kind === 'device' && h.weekday === null && h.days >= 5 && h.confidence >= 0.6 && !snoozed && !(p.automated?.(h) ?? false)) {
      out.push({ id: `${h.id}#auto`, type: 'automate', habit: h, title: `Tự động ${h.label} lúc ${clockOf(h.minute)} mỗi ngày?`, meta: `Trợ lý thấy việc này lặp lại ${h.days} ngày gần đây`, score: weight });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function feedbackAfter(fb: HabitFeedback | undefined, accepted: boolean, now = Date.now()): HabitFeedback {
  const cur = fb ?? { accepted: 0, dismissed: 0 };
  if (accepted) return { ...cur, accepted: cur.accepted + 1, snoozeUntil: startOfDay(now) + DAY };
  const dismissed = cur.dismissed + 1;
  return { ...cur, dismissed, snoozeUntil: dismissed >= 2 ? now + 14 * DAY : startOfDay(now) + DAY };
}
