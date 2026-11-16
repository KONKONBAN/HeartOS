export interface Medication {
  id: string;
  memberId: string;
  name: string;
  dose: string;
  times: string[];
  weekdays: number[] | null;
  meal: 'before' | 'after' | 'any';
  note: string;
  stock: number | null;
  perDose: number;
  caregivers: string[];
  active: boolean;
  createdBy: string;
  createdAt: number;
}

export interface MedLog {
  medId: string;
  due: number;
  status: 'taken' | 'skipped';
  at: number;
  by: string;
}

export interface Dose {
  med: Medication;
  due: number;
  time: string;
  state: 'taken' | 'skipped' | 'due' | 'missed' | 'later';
  log?: MedLog;
}

export const MEAL_TEXT: Record<Medication['meal'], string> = { before: 'trước ăn', after: 'sau ăn', any: '' };

const at = (day: Date, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const DUE_WINDOW = 30 * 60_000;
export const MISSED_AFTER = 30 * 60_000;

export function dosesOn(meds: Medication[], logs: MedLog[], day: Date, now = Date.now()): Dose[] {
  const out: Dose[] = [];
  for (const med of meds) {
    if (!med.active) continue;
    if (med.weekdays && !med.weekdays.includes(day.getDay())) continue;
    for (const time of med.times) {
      const due = at(day, time);
      const log = logs.find((l) => l.medId === med.id && l.due === due);
      const state: Dose['state'] = log ? log.status : now < due - DUE_WINDOW ? 'later' : now <= due + MISSED_AFTER ? 'due' : 'missed';
      out.push({ med, due, time, state, log });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

export function doseText(d: Dose) {
  const meal = MEAL_TEXT[d.med.meal];
  return `${d.med.name}, ${d.med.dose}${meal ? `, ${meal}` : ''}`;
}

export function lowStock(med: Medication) {
  if (med.stock === null || !med.active) return false;
  const perDay = med.times.length * med.perDose * (med.weekdays ? med.weekdays.length / 7 : 1);
  return perDay > 0 && med.stock / perDay <= 5;
}

export function daysLeft(med: Medication) {
  if (med.stock === null) return null;
  const perDay = med.times.length * med.perDose * (med.weekdays ? med.weekdays.length / 7 : 1);
  return perDay > 0 ? Math.floor(med.stock / perDay) : null;
}

export function normalizeTimes(list: string[]) {
  return [...new Set(list.map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, '0')))].sort();
}
