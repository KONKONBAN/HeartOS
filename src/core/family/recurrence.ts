/** Lịch lặp cho nghi thức gia đình (GMT+7, theo giờ thiết bị). */

export type Recurrence =
  | { freq: 'weekly'; weekday: number; time: string }
  | { freq: 'monthly-last'; weekday: number; time: string }
  | { freq: 'daily'; time: string };

export const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export function describe(r: Recurrence) {
  if (r.freq === 'daily') return `Mỗi ngày · ${r.time}`;
  if (r.freq === 'weekly') return `Mỗi ${WEEKDAYS[r.weekday]} · ${r.time}`;
  return `${WEEKDAYS[r.weekday]} cuối tháng · ${r.time}`;
}

function at(d: Date, time: string) {
  const [h, m] = time.split(':').map(Number);
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

export function nextOccurrence(r: Recurrence, from: Date, skip: string[] = []): Date {
  for (let i = 0; i < 400; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const cand = at(d, r.time);
    if (cand <= from) continue;
    if (skip.includes(cand.toISOString().slice(0, 10))) continue;
    if (r.freq === 'daily') return cand;
    if (cand.getDay() !== r.weekday) continue;
    if (r.freq === 'weekly') return cand;
    const nextWeek = new Date(cand);
    nextWeek.setDate(cand.getDate() + 7);
    if (nextWeek.getMonth() !== cand.getMonth()) return cand;
  }
  return from;
}

export function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
