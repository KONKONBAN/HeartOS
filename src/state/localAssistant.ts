import { addressOf } from '../core/family/carewatch';
import { dosesOn, MEAL_TEXT } from '../core/family/meds';
import { nextOccurrence } from '../core/family/recurrence';
import { getApp } from './store';
import type { Member } from './types';

export interface LocalReply {
  reply: string;
  action?: { label: string; to: string };
}

export const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const WEEKDAY = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clock = (t: number) => {
  const d = new Date(t);
  return `${d.getHours()} giờ${d.getMinutes() ? ` ${String(d.getMinutes()).padStart(2, '0')}` : ''}`;
};
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} và ${xs[xs.length - 1]}`);

function todayLines(me: Member, now: number) {
  const app = getApp();
  const lines: string[] = [];
  const tasks = app.tasks.filter((t) => (t.assignee === me.id || t.target === me.id) && t.status !== 'done' && sameDay(t.remindAt, now));
  for (const t of tasks.sort((a, b) => a.remindAt - b.remindAt)) {
    const name = (id?: string) => app.members.find((m) => m.id === id)?.name;
    const who = t.kind === 'call' && t.target ? (t.assignee !== me.id ? `${name(t.assignee) ?? 'người nhà'} gọi hỏi thăm` : `gọi hỏi thăm ${name(t.target) ?? 'người nhà'}`) : t.title.toLowerCase();
    lines.push(`${who} lúc ${clock(t.remindAt)}${t.remindAt < now ? ', chưa làm' : ''}`);
  }
  for (const r of app.rituals.filter((x) => x.participants.includes(me.id))) {
    const at = nextOccurrence(r.recurrence, new Date(new Date(now).setHours(0, 0, 0, 0)), r.skip).getTime();
    if (sameDay(at, now)) lines.push(`${r.name.toLowerCase()} lúc ${clock(at)}`);
  }
  for (const i of app.invitations.filter((x) => x.status === 'delivered' && x.recipients.includes(me.id) && x.receipts[me.id] !== 'declined')) lines.push(`${i.occasion.toLowerCase()}`);
  const doses = dosesOn(app.medications.filter((m) => m.memberId === me.id), app.medLogs, new Date(now), now).filter((d) => d.state === 'later' || d.state === 'due' || d.state === 'missed');
  for (const d of doses) lines.push(`uống ${d.med.name} lúc ${d.time}${d.state === 'missed' ? ', đã quá giờ' : ''}`);
  return lines;
}

function medLines(me: Member, now: number) {
  const app = getApp();
  const doses = dosesOn(app.medications.filter((m) => m.memberId === me.id), app.medLogs, new Date(now), now);
  return doses.map((d) => {
    const meal = MEAL_TEXT[d.med.meal];
    const state = { taken: 'đã uống rồi', skipped: 'đã bỏ qua', due: 'đến giờ uống', missed: 'chưa uống, đã quá giờ', later: 'chưa tới giờ' }[d.state];
    return `${d.med.name} ${d.med.dose}${meal ? ` ${meal}` : ''} lúc ${d.time}, ${state}`;
  });
}

export function localReply(text: string, me: Member, now = Date.now()): LocalReply | null {
  const app = getApp();
  const t = plain(text);
  const a = addressOf(me);
  const You = cap(a.you);
  const simple = me.mode === 'simple';
  const maps = simple ? '/s/maps' : '/f/maps';

  if (/(may gio|bay gio la|gio la may|hom nay (la )?thu|thu may|ngay bao nhieu|ngay may|hom nay ngay)/.test(t)) {
    const d = new Date(now);
    return { reply: `Dạ, bây giờ là ${clock(now)}, ${WEEKDAY[d.getDay()]} ngày ${d.getDate()} tháng ${d.getMonth() + 1} ạ.` };
  }
  const command = /^(nhac|tao viec|hen|soan|moi)/.test(t);
  if (/(thuoc|uong thuoc)/.test(t) && !/(them|nhap|ke don)/.test(t) && !command) {
    const lines = medLines(me, now);
    if (!lines.length) return { reply: `Dạ, hôm nay ${a.you} chưa có lịch uống thuốc nào trong máy ạ.`, action: simple ? undefined : { label: 'Nhắc uống thuốc', to: '/f/meds' } };
    return { reply: `Dạ, hôm nay ${a.you} có ${lines.length} liều thuốc: ${list(lines)}.`, action: simple ? undefined : { label: 'Mở lịch thuốc', to: '/f/meds' } };
  }
  if (/(hom nay|lich|viec gi|lam gi|co gi|ke hoach|sap toi)/.test(t) && !command) {
    const lines = todayLines(me, now);
    if (!lines.length) return { reply: `Dạ, hôm nay ${a.you} chưa có việc gì cần làm ạ. ${You} nghỉ ngơi cho khỏe nhé.` };
    return { reply: `Dạ, hôm nay ${a.you} có ${list(lines)} ạ.`, action: { label: 'Xem lịch hôm nay', to: simple ? '/s/today' : '/f/tasks' } };
  }
  const call = command ? null : t.match(/(?:goi|gọi)\s+(?:dien\s+)?(?:cho\s+)?(.+)/);
  if (call) {
    const want = call[1].replace(/(\s+(giup|giup toi|giup ba|giup me|giup ong|di|nhe|voi|nha|con|chau|em|ngay|lien))+$/, '').trim();
    const words = want.split(' ');
    const pool = app.members.filter((x) => x.id !== me.id && x.phone);
    const m =
      pool.find((x) => ` ${want} `.includes(` ${plain(x.name)} `)) ??
      pool.find((x) => words.includes(plain(x.name).split(' ').pop() ?? '#')) ??
      (want.length >= 3 ? pool.find((x) => plain(x.relation).includes(want)) : undefined);
    if (m) return { reply: `Dạ, ${a.me} mở cuộc gọi cho ${m.name} nhé. ${You} bấm nút Gọi là được ạ.`, action: { label: `Gọi ${m.name}`, to: simple ? `/s/call/${m.id}` : `/f/member/${m.id}` } };
    if (/^(nguoi nha|con chau|ai do|ai)$/.test(want) || !want) return { reply: `Dạ, ${a.you} muốn gọi cho ai ạ? Trong nhà có ${list(app.members.filter((x) => x.id !== me.id && x.phone && x.role !== 'carer').map((x) => x.name))}.`, action: { label: 'Gọi người thân', to: simple ? '/s/call' : '/f/members' } };
  }
  if (/(ve nha|duong ve|nha minh o dau)/.test(t) && app.household?.home) {
    const h = app.household.home;
    return { reply: `Dạ, ${a.me} mở chỉ đường về nhà cho ${a.you} nhé.`, action: { label: 'Chỉ đường về nhà', to: `${maps}/dir?to=${h.lat.toFixed(6)},${h.lng.toFixed(6)}&name=${encodeURIComponent('Nhà')}&mode=walk` } };
  }
  if (/(benh vien|phong kham|di kham)/.test(t)) {
    const h = app.hospitals.find((x) => x.lat && x.lng);
    if (h) return { reply: `Dạ, bệnh viện gần nhà là ${h.name}, ${h.address}. ${cap(a.me)} mở chỉ đường nhé.`, action: { label: 'Chỉ đường tới bệnh viện', to: `${maps}/dir?to=${h.lat!.toFixed(6)},${h.lng!.toFixed(6)}&name=${encodeURIComponent(h.name)}&mode=moto` } };
  }
  if (/(cam on|cám ơn|thank)/.test(t)) return { reply: `Dạ, không có gì ạ. Cần gì ${a.you} cứ gọi ${a.me} nhé.` };
  if (/^(xin )?chao|^alo|^con oi|^chau oi|^tro ly oi/.test(t)) return { reply: `Dạ, ${a.me} chào ${a.you} ạ. ${You} cần ${a.me} giúp gì không ạ?` };
  if (/(buon|co don|nho (con|chau)|met qua|khong ngu duoc)/.test(t)) {
    const kin = app.members.filter((x) => x.id !== me.id && x.phone && x.role !== 'carer' && x.role !== 'child');
    return { reply: `Dạ, ${a.me} thương ${a.you} lắm. ${You} có muốn gọi cho ${kin[0]?.name ?? 'người thân'} nói chuyện một chút không ạ?`, action: kin[0] ? { label: `Gọi ${kin[0].name}`, to: simple ? `/s/call/${kin[0].id}` : `/f/member/${kin[0].id}` } : undefined };
  }
  return null;
}

export function helpLine(me: Member) {
  const a = addressOf(me);
  return `Dạ, ${a.me} chưa hiểu rõ ý ${a.you}. ${cap(a.you)} có thể hỏi: hôm nay có việc gì, thuốc hôm nay, mấy giờ rồi, gọi cho người nhà, hoặc đường về nhà ạ.`;
}
