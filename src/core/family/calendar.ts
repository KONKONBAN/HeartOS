export interface Window {
  start: string;
  end: string;
}

export interface MemberWindows {
  memberId: string;
  windows: Window[];
}

export interface Slot {
  start: number;
  end: number;
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const fmtSlot = (s: Slot) => `${fromMin(s.start)}–${fromMin(s.end)}`;

function intersectTwo(a: Slot[], b: Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const x of a)
    for (const y of b) {
      const s = Math.max(x.start, y.start);
      const e = Math.min(x.end, y.end);
      if (e > s) out.push({ start: s, end: e });
    }
  return out.sort((p, q) => p.start - q.start);
}

export interface IntersectResult {
  slots: Slot[];
  best: Slot | null;
  reason?: string;
}

export function commonSlots(members: MemberWindows[], quietFrom = '20:00', minMinutes = 60, maxMinutes = 60): IntersectResult {
  if (members.length === 0) return { slots: [], best: null, reason: 'Chưa có ai chia sẻ khoảng rảnh.' };
  let acc: Slot[] = members[0].windows.map((w) => ({ start: toMin(w.start), end: toMin(w.end) }));
  for (const m of members.slice(1)) acc = intersectTwo(acc, m.windows.map((w) => ({ start: toMin(w.start), end: toMin(w.end) })));
  const quiet = toMin(quietFrom);
  const clipped = acc.map((s) => ({ start: s.start, end: Math.min(s.end, quiet) })).filter((s) => s.end - s.start >= minMinutes);
  if (!clipped.length) return { slots: [], best: null, reason: acc.length ? 'Khoảng chung bị giờ yên tĩnh cắt ngắn hơn yêu cầu.' : 'Không có khoảng rảnh chung.' };
  const first = clipped[0];
  return { slots: clipped, best: { start: first.start, end: Math.min(first.end, first.start + maxMinutes) } };
}

export function viTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 11 ? 'sáng' : h < 13 ? 'trưa' : h < 18 ? 'chiều' : 'tối';
  return `${h12} giờ${m ? ' ' + m : ''} ${part}`;
}

export function enTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
