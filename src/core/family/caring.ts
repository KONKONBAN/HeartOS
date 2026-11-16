import * as z from 'zod/v4';
import { cleanText } from '../ai/types';
import { generate, hasBannedSymbols, looksVietnamese, STYLE_RULES, type GenConfig } from '../ai/structured';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface GenResult<T> {
  data: T;
  ai: boolean;
  checks: Check[];
  fellBack?: string;
}

function textChecks(texts: string[], lang: 'vi' | 'en' = 'vi'): Check[] {
  const all = texts.join(' ');
  return [
    { name: 'Đúng cấu trúc', ok: true, detail: 'Khớp lược đồ JSON' },
    { name: lang === 'vi' ? 'Tiếng Việt có dấu' : 'Ngôn ngữ', ok: lang === 'en' || looksVietnamese(all), detail: lang === 'vi' ? (looksVietnamese(all) ? 'Đạt' : 'Thiếu dấu tiếng Việt') : 'Tiếng Anh' },
    { name: 'Không ký hiệu lạ', ok: !hasBannedSymbols(all), detail: hasBannedSymbols(all) ? 'Có ký hiệu cần bỏ' : 'Đạt' },
  ];
}

async function withFallback<T>(cfg: GenConfig | null, run: (c: GenConfig) => Promise<T>, texts: (t: T) => string[], local: () => T, fix: (t: T) => T, lang: 'vi' | 'en' = 'vi'): Promise<GenResult<T>> {
  if (cfg) {
    try {
      const raw = fix(await run(cfg));
      const checks = textChecks(texts(raw), lang);
      if (checks.every((c) => c.ok)) return { data: raw, ai: true, checks };
      return { data: local(), ai: false, checks, fellBack: `Bản của trợ lý chưa đạt kiểm tra (${checks.filter((c) => !c.ok).map((c) => c.name.toLowerCase()).join(', ')}), dùng mẫu sẵn.` };
    } catch (e) {
      return { data: local(), ai: false, checks: textChecks(texts(local()), lang), fellBack: `Chưa gọi được trợ lý AI (${(e as Error).message}), dùng mẫu sẵn trên thiết bị.` };
    }
  }
  return { data: local(), ai: false, checks: textChecks(texts(local()), lang) };
}

const clip = (s: string, n: number) => {
  const t = cleanText(s.trim().replace(/\s+/g, ' '));
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '.' : t;
};

export const RephraseSchema = z.object({ variants: z.array(z.object({ label: z.string(), text: z.string() })) });
export type Rephrase = z.infer<typeof RephraseSchema>;
export type Situation = 'disagree' | 'remind' | 'sorry' | 'thanks';

export const SITUATIONS: { value: Situation; label: string }[] = [
  { value: 'disagree', label: 'Bất đồng' },
  { value: 'remind', label: 'Nhắc nhở' },
  { value: 'sorry', label: 'Xin lỗi' },
  { value: 'thanks', label: 'Cảm ơn' },
];

export interface RephraseFacts {
  text: string;
  situation: Situation;
  to: { name: string; relation: string; address: string };
  from: { name: string; selfRef: string };
}

function localRephrase(f: RephraseFacts): Rephrase {
  const a = f.to.address || f.to.name;
  const A = a.charAt(0).toUpperCase() + a.slice(1);
  const me = f.from.selfRef || 'con';
  const core = f.text.trim().replace(/[.!?]+$/, '');
  const softCore = core.charAt(0).toLowerCase() + core.slice(1);
  const open: Record<Situation, string> = {
    disagree: `${A} ơi, ${me} hiểu ${a} lo cho cả nhà. ${me.charAt(0).toUpperCase() + me.slice(1)} chỉ muốn nói thật lòng là ${softCore}. Mình cùng bàn thêm nhé.`,
    remind: `${A} ơi, ${me} nhắc nhẹ một chút: ${softCore} nhé. Cảm ơn ${a} nhiều.`,
    sorry: `${A} ơi, ${me} xin lỗi ${a}. ${core.charAt(0).toUpperCase() + core.slice(1)}. ${me.charAt(0).toUpperCase() + me.slice(1)} sẽ để ý hơn.`,
    thanks: `${A} ơi, ${me} cảm ơn ${a} thật nhiều vì ${softCore}.`,
  };
  return {
    variants: [
      { label: 'Nhẹ nhàng', text: open[f.situation] },
      { label: 'Ngắn gọn', text: `${A} ơi, ${softCore} nhé.` },
      { label: 'Lễ phép', text: `${me.charAt(0).toUpperCase() + me.slice(1)} thưa ${a}, ${softCore} ạ.` },
    ],
  };
}

export function rephrase(cfg: GenConfig | null, f: RephraseFacts) {
  const situation = SITUATIONS.find((s) => s.value === f.situation)?.label.toLowerCase();
  return withFallback(
    cfg,
    async (c) =>
      (
        await generate(c, {
          name: 'rephrase',
          schema: RephraseSchema,
          maxTokens: 1500,
          system: `You help members of a Vietnamese multi-generation family say difficult things kindly ("lựa lời"). Keep the speaker's intent, never add facts or promises they did not make, address the listener with the given Vietnamese kinship terms, and avoid blame. Return exactly 3 variants labelled "Nhẹ nhàng", "Ngắn gọn" and "Lễ phép", each under 300 characters. ${STYLE_RULES}`,
          user: JSON.stringify({ situation, what_i_want_to_say: f.text, listener: { name: f.to.name, relation: f.to.relation, call_them: f.to.address }, speaker: { name: f.from.name, call_myself: f.from.selfRef } }),
        })
      ).data,
    (r) => r.variants.map((v) => v.text),
    () => localRephrase(f),
    (r) => ({ variants: r.variants.slice(0, 3).map((v) => ({ label: clip(v.label, 24), text: clip(v.text, 320) })).filter((v) => v.text.length > 3) }),
  );
}

export const StorySchema = z.object({ title: z.string(), summary: z.string(), caption: z.string() });
export type StoryDraft = z.infer<typeof StorySchema>;

export function localStory(transcript: string): StoryDraft {
  const sentences = transcript.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences[0] ?? transcript;
  const words = first.replace(/[“”".,!?]/g, '').split(/\s+/).slice(0, 6).join(' ');
  const summary = sentences.slice(0, 2).join(' ');
  return { title: words.charAt(0).toUpperCase() + words.slice(1), summary, caption: clip(summary, 140) };
}

export function summarizeStoryAI(cfg: GenConfig | null, p: { transcript: string; narrator: string; lang: 'vi' | 'en' }) {
  return withFallback(
    cfg,
    async (c) =>
      (
        await generate(c, {
          name: 'story_draft',
          schema: StorySchema,
          maxTokens: 1500,
          system: `You turn a family member's spoken story into a memory draft for a Vietnamese family album. Use only what the narrator said; do not invent names, dates or places. Title under 60 characters, summary of 2 to 4 sentences under 450 characters keeping the narrator's warmth, caption under 140 characters. Write in ${p.lang === 'en' ? 'English' : 'Vietnamese'}. ${STYLE_RULES}`,
          user: JSON.stringify({ narrator: p.narrator, transcript: p.transcript.slice(0, 6000) }),
        })
      ).data,
    (r) => [r.title, r.summary, r.caption],
    () => localStory(p.transcript),
    (r) => ({ title: clip(r.title, 60), summary: clip(r.summary, 480), caption: clip(r.caption, 150) }),
    p.lang,
  );
}

export const NewsletterSchema = z.object({ title: z.string(), greeting: z.string(), sections: z.array(z.object({ heading: z.string(), body: z.string() })), closing: z.string() });
export type Newsletter = z.infer<typeof NewsletterSchema>;

export interface WeekFacts {
  household: string;
  author: string;
  weekLabel: string;
  doneTasks: { title: string; by: string }[];
  openTasks: { title: string; by: string; when: string }[];
  rituals: { name: string; when: string }[];
  memories: { title: string; by: string }[];
  invitations: { occasion: string; when: string }[];
}

function localNewsletter(f: WeekFacts): Newsletter {
  const sections: Newsletter['sections'] = [];
  if (f.doneTasks.length) sections.push({ heading: 'Việc đã xong', body: f.doneTasks.slice(0, 6).map((t) => `${t.by} đã xong việc ${t.title.toLowerCase()}.`).join(' ') });
  if (f.memories.length) sections.push({ heading: 'Ký ức mới', body: f.memories.slice(0, 5).map((m) => `${m.by} thêm "${m.title}".`).join(' ') });
  if (f.rituals.length || f.invitations.length) sections.push({ heading: 'Sắp tới', body: [...f.rituals.map((r) => `${r.name} vào ${r.when}.`), ...f.invitations.map((i) => `${i.occasion} vào ${i.when}.`)].slice(0, 6).join(' ') });
  if (f.openTasks.length) sections.push({ heading: 'Việc cần làm', body: f.openTasks.slice(0, 6).map((t) => `${t.title} (${t.by}, ${t.when}).`).join(' ') });
  if (!sections.length) sections.push({ heading: 'Tuần qua', body: 'Tuần này nhà mình chưa có nhiều cập nhật. Cả nhà nhớ gọi hỏi thăm nhau nhé.' });
  return { title: `Bản tin ${f.household}, ${f.weekLabel}`, greeting: `Cả nhà thân mến, đây là những điều đáng nhớ của ${f.household} trong tuần qua.`, sections, closing: `Thương cả nhà, ${f.author}.` };
}

export function newsletterAI(cfg: GenConfig | null, f: WeekFacts) {
  return withFallback(
    cfg,
    async (c) =>
      (
        await generate(c, {
          name: 'family_newsletter',
          schema: NewsletterSchema,
          maxTokens: 3000,
          system: `You write a short, warm weekly family newsletter ("bản tin gia đình") for a Vietnamese multi-generation household. Use only the facts given; do not invent events, health details or numbers. 2 to 4 sections with short headings, each body under 500 characters, a greeting and a closing signed by the author. ${STYLE_RULES}`,
          user: JSON.stringify(f),
        })
      ).data,
    (r) => [r.title, r.greeting, r.closing, ...r.sections.flatMap((s) => [s.heading, s.body])],
    () => localNewsletter(f),
    (r) => ({ title: clip(r.title, 80), greeting: clip(r.greeting, 300), sections: r.sections.slice(0, 5).map((s) => ({ heading: clip(s.heading, 60), body: clip(s.body, 650) })), closing: clip(r.closing, 200) }),
  );
}

export const EmpathySchema = z.object({ suggestions: z.array(z.object({ kind: z.enum(['call', 'meal', 'care', 'ritual', 'memory']), member: z.string().nullable(), text: z.string(), reason: z.string() })) });
export type Suggestion = z.infer<typeof EmpathySchema>['suggestions'][number];

export interface CareFacts {
  now: string;
  me: { name: string; relation: string };
  members: { name: string; relation: string; elder: boolean; lastCallDays: number | null; hasPhone: boolean }[];
  rituals: { name: string; when: string; inDays: number }[];
  myOpenTasks: { title: string; when: string }[];
  sharedSlotToday: string | null;
  memoriesThisMonth: number;
}

export function localEmpathy(f: CareFacts): Suggestion[] {
  const out: Suggestion[] = [];
  for (const m of f.members.filter((x) => x.elder && x.hasPhone)) {
    if (m.lastCallDays === null || m.lastCallDays >= 3) out.push({ kind: 'call', member: m.name, text: `Gọi hỏi thăm ${m.name}`, reason: m.lastCallDays === null ? 'Chưa có cuộc gọi nào được ghi lại gần đây' : `Đã ${m.lastCallDays} ngày chưa có cuộc gọi` });
  }
  if (f.sharedSlotToday) out.push({ kind: 'meal', member: null, text: 'Rủ cả nhà ăn cơm cùng nhau', reason: `Cả nhà cùng rảnh ${f.sharedSlotToday}` });
  const soon = f.rituals.find((r) => r.inDays <= 2);
  if (soon) out.push({ kind: 'ritual', member: null, text: `Chuẩn bị cho ${soon.name}`, reason: `Diễn ra ${soon.when}` });
  if (f.myOpenTasks.length) out.push({ kind: 'care', member: null, text: f.myOpenTasks[0].title, reason: `Việc của bạn, ${f.myOpenTasks[0].when}` });
  if (!f.memoriesThisMonth) out.push({ kind: 'memory', member: null, text: 'Giữ lại một kỷ niệm tháng này', reason: 'Tháng này nhà mình chưa có ký ức mới' });
  return out.slice(0, 3);
}

export function empathyAI(cfg: GenConfig | null, f: CareFacts) {
  return withFallback(
    cfg,
    async (c) =>
      (
        await generate(c, {
          name: 'care_suggestions',
          schema: EmpathySchema,
          maxTokens: 1500,
          system: `You are the empathetic rhythm helper ("AI Thấu Cảm") of a Vietnamese family app. From the facts, suggest at most 3 small, kind actions for the person using the app today: checking in on elders, sharing a meal, caring tasks, preparing a family ritual, or keeping a memory. Each text is an action under 60 characters; each reason cites a fact under 90 characters. "member" must be one of the given member names or null. Never invent facts; skip anything not supported. ${STYLE_RULES}`,
          user: JSON.stringify(f),
        })
      ).data,
    (r) => r.suggestions.flatMap((s) => [s.text, s.reason]),
    () => ({ suggestions: localEmpathy(f) }),
    (r) => ({ suggestions: r.suggestions.filter((s) => !s.member || f.members.some((m) => m.name === s.member)).slice(0, 3).map((s) => ({ ...s, text: clip(s.text, 70), reason: clip(s.reason, 110) })) }),
  );
}
