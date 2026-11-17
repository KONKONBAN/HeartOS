import { hasPain, tokens } from '../guardian/verify';

export type Struggle = 'fall' | 'sos-idle' | 'med-missed' | 'speech-fail' | 'nav-loop' | 'dead-tap';

export interface NavEvent {
  path: string;
  at: number;
}

export interface TapEvent {
  x: number;
  y: number;
  at: number;
}

export interface Signals {
  now: number;
  navs: NavEvent[];
  strictNav?: boolean;
  deadTaps: TapEvent[];
  speechFails: number[];
  helpOpenSince: number | null;
  sosOpen: boolean;
  missed: { key: string; name: string; dose: string; time: string }[];
  fall: { id: string; room: string; at: number } | null;
}

export interface Detection {
  kind: Struggle;
  key: string;
  detail?: string;
}

export const COOLDOWN: Record<Struggle, number> = {
  fall: 0,
  'sos-idle': 10 * 60_000,
  'med-missed': 0,
  'speech-fail': 15 * 60_000,
  'nav-loop': 20 * 60_000,
  'dead-tap': 20 * 60_000,
};

export const URGENT: Struggle[] = ['fall', 'sos-idle'];

const NAV_WINDOW = 60_000;
const TAP_WINDOW = 3_000;
const SPEECH_WINDOW = 120_000;
export const HELP_IDLE = 25_000;

const near = (a: TapEvent, b: TapEvent) => Math.hypot(a.x - b.x, a.y - b.y) <= 60;

export function navLoop(navs: NavEvent[], now: number, strict = false) {
  const recent = navs.filter((n) => now - n.at <= NAV_WINDOW);
  if (recent.length < 6) return false;
  const unique = (list: NavEvent[]) => new Set(list.map((n) => n.path)).size;
  if (strict) return unique(recent.slice(-6)) <= 2;
  const counts = new Map<string, number>();
  for (const n of recent) counts.set(n.path, (counts.get(n.path) ?? 0) + 1);
  return unique(recent.slice(-6)) <= 3 || [...counts.values()].some((c) => c >= 4);
}

export function deadTapBurst(taps: TapEvent[], now: number) {
  const recent = taps.filter((t) => now - t.at <= TAP_WINDOW);
  if (recent.length < 4) return false;
  const last = recent[recent.length - 1];
  return recent.filter((t) => near(t, last)).length >= 4;
}

export function detect(s: Signals, recentlyAsked: (key: string, kind: Struggle) => boolean): Detection | null {
  const candidates: Detection[] = [];
  if (s.fall) candidates.push({ kind: 'fall', key: `fall:${s.fall.id}`, detail: s.fall.room });
  if (s.helpOpenSince && !s.sosOpen && s.now - s.helpOpenSince >= HELP_IDLE) candidates.push({ kind: 'sos-idle', key: 'sos-idle' });
  for (const m of s.missed) candidates.push({ kind: 'med-missed', key: `med:${m.key}`, detail: m.name });
  if (s.speechFails.filter((t) => s.now - t <= SPEECH_WINDOW).length >= 2) candidates.push({ kind: 'speech-fail', key: 'speech-fail' });
  if (navLoop(s.navs, s.now, s.strictNav)) candidates.push({ kind: 'nav-loop', key: 'nav-loop' });
  if (deadTapBurst(s.deadTaps, s.now)) candidates.push({ kind: 'dead-tap', key: 'dead-tap' });
  return candidates.find((c) => !recentlyAsked(c.key, c.kind)) ?? null;
}

export function quietHours(d: Date) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 22 || h < 6;
}

const ELDER = ['bà', 'ông', 'cô', 'chú', 'bác', 'dì', 'mẹ', 'bố', 'ba', 'má', 'cậu', 'mợ', 'thím'];
const RELATIVE = ['mẹ', 'bố', 'ba', 'má'];

export interface Address {
  you: string;
  me: string;
  name: string;
}

export function addressOf(m: { name: string; address?: string; role?: string }): Address {
  const parts = m.name.trim().split(/\s+/);
  const first = parts[0]?.toLowerCase() ?? '';
  const given = parts[parts.length - 1] ?? 'bạn';
  if (ELDER.includes(first)) return { you: first, me: 'con', name: m.name };
  if (first === 'anh' || first === 'chị') return { you: first, me: 'em', name: m.name };
  if (m.role === 'child') return { you: given, me: 'mình', name: m.name };
  const addr = (m.address ?? '').trim().toLowerCase();
  if (addr === 'anh' || addr === 'chị') return { you: `${addr} ${given}`, me: 'em', name: m.name };
  if (ELDER.includes(addr) && !RELATIVE.includes(addr)) return { you: addr, me: 'con', name: m.name };
  return { you: given, me: 'mình', name: m.name };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const ROOM_TEXT: Record<string, string> = { living: 'phòng khách', bedroom: 'phòng ngủ', kitchen: 'bếp', bath: 'phòng tắm', hall: 'hành lang' };

export interface CheckInText {
  say: string;
  title: string;
  sub: string;
}

export function offerLine(a: Address) {
  return `Dạ, ${a.me} có thể giúp được gì không ạ?`;
}

export function checkInText(d: Detection, a: Address): CheckInText {
  const You = cap(a.you);
  const offer = offerLine(a);
  switch (d.kind) {
    case 'fall': {
      const room = ROOM_TEXT[d.detail ?? ''] ?? 'trong nhà';
      return { title: `${You} có sao không ạ?`, sub: `Cảm biến thấy có thể ${a.you} vừa bị ngã ở ${room}.`, say: `${You} ơi, ${You} có sao không ạ? ${cap(a.me)} thấy hình như ${a.you} vừa bị ngã ở ${room}. ${offer}` };
    }
    case 'sos-idle':
      return { title: `${You} cần ${a.me} gọi ai không ạ?`, sub: 'Nói hoặc bấm nút bên dưới, con báo người nhà ngay.', say: `${You} ơi, ${You} cần ${a.me} gọi cho ai không ạ? ${offer}` };
    case 'med-missed':
      return { title: `${You} đã uống thuốc chưa ạ?`, sub: `${d.detail ?? 'Thuốc'} đã quá giờ uống.`, say: `${You} ơi, đã quá giờ uống ${d.detail ?? 'thuốc'} rồi ạ. ${You} đã uống chưa ạ? ${offer}` };
    case 'speech-fail':
      return { title: `${cap(a.me)} chưa nghe rõ lời ${a.you}`, sub: `${You} cứ nói chậm lại, hoặc bấm nút bên dưới.`, say: `${cap(a.me)} xin lỗi, ${a.me} chưa nghe rõ lời ${a.you}. ${offer}` };
    case 'nav-loop':
    case 'dead-tap':
    default:
      return { title: offer, sub: `${cap(a.me)} thấy ${a.you} đang tìm gì đó. ${You} cứ nói, ${a.me} làm giúp.`, say: `${You} ơi, ${a.me} thấy ${a.you} đang tìm gì đó. ${offer}` };
  }
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NO = ['không sao', 'không cần', 'không có gì', 'không đâu', 'không ạ', 'tôi ổn', 'ổn rồi', 'ổn mà', 'ổn', 'thôi', 'khỏi', 'chưa cần', 'không'];
const YES = ['có', 'cần', 'giúp', 'giúp với', 'giúp tôi', 'ừ', 'ừm', 'vâng', 'dạ', 'được', 'đúng rồi', 'phải'];
const HELP_ME = /^(có|cần|có cần|cần giúp|có giúp|giúp|giúp giùm|giúp dùm)( (tôi|bà|ông|mẹ|bố|ba|má|mình|với|giùm|dùm|nhé|nha))*$/;
const TAKEN = ['uống rồi', 'đã uống', 'rồi', 'uống xong rồi', 'xong rồi'];
const NOT_YET = ['chưa', 'chưa uống', 'quên mất', 'quên'];
const STOP = ['thôi', 'tạm biệt', 'dừng lại', 'dừng', 'không cần nữa', 'cảm ơn con', 'cảm ơn nhé', 'cám ơn con', 'cảm ơn', 'hết rồi', 'thế thôi', 'vậy thôi', 'bye', 'stop'];
const FILLER = /^(dạ|vâng|ừ|à|ờ|này|con ơi|cháu ơi|em ơi)\s+|\s+(ạ|nhé|nha|con|cháu|em|đâu|mà)$/;

function core(text: string) {
  let t = strip(text);
  for (let i = 0; i < 3; i++) {
    const n = t.replace(FILLER, '').trim();
    if (!n || n === t) break;
    t = n;
  }
  return t;
}

const sayOneOf = (t: string, list: string[]) => list.some((w) => t === w || t.startsWith(w + ' '));

export type Reply = 'yes' | 'no' | 'taken' | 'notyet' | 'request' | 'silent';

const SUBJECT = new Set(['bà', 'ông', 'tôi', 'mẹ', 'bố', 'ba', 'má', 'con', 'cháu', 'em', 'mình', 'anh', 'chị', 'cô', 'chú', 'bác', 'dì', 'tao', 'tớ']);
const FILL = new Set(['dạ', 'vâng', 'ạ', 'nhé', 'nha', 'mà', 'đâu', 'ơi', 'này', 'à', 'ờ', 'ừ', 'thì', 'cả', 'cũng', 'vẫn', 'rồi', 'hết', 'lắm', 'đã', 'đang', 'thật', 'thực']);
const FINE = ['không sao', 'ổn', 'không cần', 'không có gì', 'không bị gì', 'không bị làm sao', 'không làm sao', 'bình thường', 'khỏe', 'khoẻ', 'không đau', 'đứng dậy được', 'tự đứng được', 'tự dậy được', 'đi được', 'không ngã', 'không bị ngã', 'khỏi', 'không cần đâu', 'không phải lo'];
const ASK = /(^| )(gọi|giúp|cứu|lấy|mở|đưa|nhờ|kêu|báo)( |$)/;

function contentTokens(text: string) {
  return tokens(text).filter((w) => !SUBJECT.has(w) && !FILL.has(w));
}

const THANKS = new Set(['cảm', 'cám', 'ơn']);

function saysFine(text: string) {
  const p = ` ${tokens(text).join(' ')} `;
  if (hasPain(text) || ASK.test(p)) return false;
  const c = contentTokens(text);
  if (!c.length) return false;
  if ((c[0] === 'không' || c[0] === 'thôi') && c.slice(1).every((w) => THANKS.has(w))) return true;
  if (c.length <= 8 && FINE.some((w) => p.includes(` ${w} `))) return true;
  return c.length <= 4 && c.every((w) => THANKS.has(w));
}

export function interpretReply(text: string, kind?: Struggle): Reply {
  const raw = strip(text);
  if (!raw) return 'silent';
  const t = core(text) || raw;
  const words = t.split(' ');
  if (kind === 'med-missed') {
    if (words.length <= 4 && TAKEN.some((w) => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w))) return 'taken';
    if (words.length <= 3 && sayOneOf(t, NOT_YET)) return 'notyet';
  }
  if (hasPain(text)) return 'request';
  if (t === 'không' || (words.length <= 3 && sayOneOf(t, NO.filter((w) => w !== 'không')))) return 'no';
  if (saysFine(text)) return 'no';
  if (YES.includes(t) || YES.includes(raw) || HELP_ME.test(t)) return 'yes';
  return 'request';
}

export function isStop(text: string) {
  const t = core(text) || strip(text);
  if (!t) return false;
  return t.split(' ').length <= 4 && STOP.some((w) => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w));
}

export function forSpeech(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/`+/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h: string, m: string) => `${Number(h)} giờ${m === '00' ? '' : ` ${m}`}`)
    .replace(/(\d)\s?mg\b/gi, '$1 mi li gam')
    .replace(/(\d)\s?ml\b/gi, '$1 mi li lít')
    .replace(/\s+/g, ' ')
    .trim();
}
