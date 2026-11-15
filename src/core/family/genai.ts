import * as z from 'zod/v4';
import { enTime, fromMin, viTime, type Slot } from './calendar';

export const InviteSchema = z.object({
  occasion: z.string().min(2).max(80),
  slot: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), tz: z.string() }),
  messages: z
    .array(
      z.object({
        recipientId: z.string(),
        lang: z.enum(['vi', 'en']),
        text: z.string().min(4).max(240),
      }),
    )
    .min(1),
});

export type InviteDraft = z.infer<typeof InviteSchema>;

export interface Recipient {
  id: string;
  name: string;
  address: string;
  lang: 'vi' | 'en';
}

export interface InviteFacts {
  occasion: string;
  slot: Slot;
  tz: string;
  host: string;
  hostSelf: string;
  place: string;
  recipients: Recipient[];
  tone: 'warm' | 'short' | 'formal';
}

export interface DraftResult {
  draft: InviteDraft;
  provider: 'local' | 'claude';
  model?: string;
  checks: { name: string; ok: boolean; detail: string }[];
  fellBack?: string;
  ms: number;
}

const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function localDraft(f: InviteFacts): InviteDraft {
  const vi = viTime(f.slot.start);
  const en = enTime(f.slot.start);
  const today = f.slot.start >= 17 * 60 ? 'tối nay' : f.slot.start >= 12 * 60 ? 'chiều nay' : 'hôm nay';
  return {
    occasion: f.occasion,
    slot: { start: fromMin(f.slot.start), end: fromMin(f.slot.end), tz: f.tz },
    messages: f.recipients.map((r) => {
      if (r.lang === 'en') {
        const t = f.tone === 'formal' ? `You are warmly invited to ${f.occasion.toLowerCase()} at ${en} today, at ${f.place}.` : f.tone === 'short' ? `Dinner at ${en} tonight?` : `Dinner with the family at ${en} tonight?`;
        return { recipientId: r.id, lang: 'en' as const, text: t };
      }
      const cap = r.address.charAt(0).toUpperCase() + r.address.slice(1);
      const t =
        f.tone === 'formal'
          ? `${f.hostSelf.charAt(0).toUpperCase() + f.hostSelf.slice(1)} kính mời ${r.address} dùng bữa cơm cùng cả nhà lúc ${vi} ${today} tại ${f.place}.`
          : f.tone === 'short'
            ? `${cap} ơi, ${today} ăn cơm lúc ${vi.replace(/ (sáng|trưa|chiều|tối)$/, '')} nhé?`
            : `${cap} ơi, ${today} cả nhà ăn cơm lúc ${vi.replace(/ (sáng|trưa|chiều|tối)$/, '')} nhé?`;
      return { recipientId: r.id, lang: 'vi' as const, text: t };
    }),
  };
}

export function checkDraft(raw: unknown, f: InviteFacts): { ok: boolean; draft?: InviteDraft; checks: DraftResult['checks'] } {
  const checks: DraftResult['checks'] = [];
  const parsed = InviteSchema.safeParse(raw);
  checks.push({ name: 'JSON Schema', ok: parsed.success, detail: parsed.success ? 'Đúng cấu trúc lời mời' : parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ') });
  if (!parsed.success) return { ok: false, checks };
  const d = parsed.data;
  const slotOk = d.slot.start === fromMin(f.slot.start) && d.slot.end === fromMin(f.slot.end);
  checks.push({ name: 'Khung giờ khớp dữ kiện', ok: slotOk, detail: `${d.slot.start}-${d.slot.end} / ${fromMin(f.slot.start)}-${fromMin(f.slot.end)}` });
  const ids = new Set(f.recipients.map((r) => r.id));
  const recOk = d.messages.every((m) => ids.has(m.recipientId)) && f.recipients.every((r) => d.messages.some((m) => m.recipientId === r.id));
  checks.push({ name: 'Người nhận đúng danh sách được cấp quyền', ok: recOk, detail: d.messages.map((m) => m.recipientId).join(', ') });
  const h = Math.floor(f.slot.start / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const timeWords = [`${h12} giờ`, fromMin(f.slot.start), `${h12} PM`, `${h12}PM`, `${h12}:${String(f.slot.start % 60).padStart(2, '0')}`, 'bảy giờ', 'seven'];
  const timeOk = d.messages.every((m) => timeWords.some((w) => m.text.toLowerCase().includes(w.toLowerCase())));
  checks.push({ name: 'Mỗi lời mời nêu đúng giờ', ok: timeOk, detail: timeOk ? 'Có giờ hẹn' : 'Thiếu hoặc sai giờ' });
  const langOk = d.messages.every((m) => {
    const r = f.recipients.find((x) => x.id === m.recipientId);
    return r ? r.lang === m.lang && (m.lang !== 'vi' || VI_DIACRITIC.test(m.text)) : false;
  });
  checks.push({ name: 'Ngôn ngữ theo người nhận, kiểm tiếng Việt có dấu', ok: langOk, detail: langOk ? 'Đạt' : 'Sai ngôn ngữ hoặc tiếng Việt không dấu' });
  return { ok: checks.every((c) => c.ok), draft: d, checks };
}

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export async function claudeDraft(f: InviteFacts, cfg: ClaudeConfig): Promise<{ raw: unknown; model: string }> {
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]);
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 45_000 });
  const facts = {
    occasion: f.occasion,
    slot: { start: fromMin(f.slot.start), end: fromMin(f.slot.end), tz: f.tz },
    sender: { name: f.host, selfReference: f.hostSelf },
    place: f.place,
    tone: f.tone,
    recipients: f.recipients.map((r) => ({ recipientId: r.id, addressAs: r.address, lang: r.lang })),
  };
  const msg = await client.beta.messages.parse({
    model: cfg.model,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(InviteSchema) },
    system:
      'You draft short, warm family invitations for a Vietnamese multi-generation household app. ' +
      'Write one message per recipient in that recipient\'s language (vi = natural Vietnamese with full diacritics, addressing the recipient as given in addressAs; en = natural English). ' +
      'Each message must state the start time, stay under 160 characters, and invent no facts beyond the ones provided. Copy occasion and slot exactly.',
    messages: [{ role: 'user', content: `Facts (JSON):\n${JSON.stringify(facts)}` }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Claude từ chối yêu cầu.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Phản hồi bị cắt do giới hạn độ dài.');
  return { raw: msg.parsed_output, model: msg.model };
}

export async function draftInvitation(f: InviteFacts, cfg?: ClaudeConfig | null): Promise<DraftResult> {
  const t0 = performance.now();
  if (cfg?.apiKey) {
    try {
      const { raw, model } = await claudeDraft(f, cfg);
      const c = checkDraft(raw, f);
      if (c.ok && c.draft) return { draft: c.draft, provider: 'claude', model, checks: c.checks, ms: Math.round(performance.now() - t0) };
      const local = localDraft(f);
      const lc = checkDraft(local, f);
      return { draft: local, provider: 'local', checks: lc.checks, fellBack: 'Bản AI chưa đạt kiểm dữ kiện: ' + c.checks.filter((x) => !x.ok).map((x) => x.name).join(', ') + ', dùng mẫu sẵn.', ms: Math.round(performance.now() - t0) };
    } catch (e) {
      const local = localDraft(f);
      return { draft: local, provider: 'local', checks: checkDraft(local, f).checks, fellBack: 'Không gọi được Claude (' + (e as Error).message + '), dùng mẫu sẵn trên thiết bị.', ms: Math.round(performance.now() - t0) };
    }
  }
  const local = localDraft(f);
  return { draft: local, provider: 'local', checks: checkDraft(local, f).checks, ms: Math.round(performance.now() - t0) };
}

export type AssistantIntent =
  | { kind: 'invite'; occasion: string }
  | { kind: 'task'; title: string }
  | { kind: 'story' }
  | { kind: 'sos' }
  | { kind: 'device'; on: boolean; target: string }
  | { kind: 'unknown' };

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function parseIntent(text: string): AssistantIntent {
  const t = strip(text);
  if (/(cuu|sos|cap cuu|giup voi|nga roi)/.test(t)) return { kind: 'sos' };
  if (/(moi|loi moi|an com|bua com|dinner|invite)/.test(t)) return { kind: 'invite', occasion: /chu nhat/.test(t) ? 'Bữa cơm Chủ nhật' : 'Bữa cơm cùng nhà' };
  if (/(nhac|viec|cong viec|remind|task)/.test(t)) return { kind: 'task', title: text.replace(/^(nhắc|nhac|tạo việc|tao viec)\s*/i, '').slice(0, 60) || 'Việc mới' };
  if (/(ke chuyen|loi ke|ky uc|ghi am|story)/.test(t)) return { kind: 'story' };
  const dev = t.match(/(bat|tat|turn on|turn off)\s+(den|o cam|dieu hoa|rem)\s*(.*)/);
  if (dev) return { kind: 'device', on: dev[1].startsWith('bat') || dev[1] === 'turn on', target: dev[2] + ' ' + dev[3] };
  return { kind: 'unknown' };
}

export function summarizeStory(transcript: string) {
  const sentences = transcript.split(/(?<=[.!?...])\s+/).filter(Boolean);
  const first = sentences[0] ?? transcript;
  const words = first.replace(/[“”".,!?]/g, '').split(/\s+/).slice(0, 6).join(' ');
  return { title: words.charAt(0).toUpperCase() + words.slice(1), summary: sentences.slice(0, 2).join(' '), wordCount: transcript.split(/\s+/).filter(Boolean).length };
}
