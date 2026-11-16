import type * as z from 'zod/v4';

export interface GenConfig {
  provider: 'claude' | 'openai';
  apiKey: string;
  model: string;
  baseURL?: string;
  managed?: boolean;
  neutral?: boolean;
}

export interface GenRequest<S extends z.ZodType> {
  name: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  timeoutMs?: number;
}

const FALLBACKS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-2|fable-5-1)$/;
const EFFORT = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5|fable-5|mythos-5)/;

export const STYLE_RULES = 'Write natural Vietnamese with full diacritics unless asked otherwise. Never use the characters "·", "→", "…" or long dashes; use commas and periods instead. No emoji.';

export async function generate<S extends z.ZodType>(cfg: GenConfig, req: GenRequest<S>): Promise<{ data: z.infer<S>; model: string }> {
  const timeout = req.timeoutMs ?? 45_000;
  if (cfg.provider === 'openai') {
    const [{ default: OpenAI }, { zodTextFormat }] = await Promise.all([import('openai'), import('openai/helpers/zod')]);
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, dangerouslyAllowBrowser: true, maxRetries: 1, timeout });
    const resp = await client.responses.parse({
      model: cfg.model,
      instructions: req.system,
      input: req.user,
      store: false,
      text: { format: zodTextFormat(req.schema, req.name) },
      ...(!cfg.managed && /^(gpt-5|gpt-6|o\d)/.test(cfg.model) && { reasoning: { effort: 'low' as const } }),
    });
    if (resp.output_parsed == null) throw new Error('Trợ lý AI không trả về bản nháp hợp lệ.');
    return { data: resp.output_parsed as z.infer<S>, model: resp.model };
  }
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]);
  const client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, dangerouslyAllowBrowser: true, maxRetries: 1, timeout });
  const managed = !!cfg.managed;
  const msg = await client.beta.messages.parse({
    model: cfg.model,
    max_tokens: req.maxTokens ?? 4000,
    ...(!managed && FALLBACKS.test(cfg.model) && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    output_config: { ...(!managed && EFFORT.test(cfg.model) && { effort: 'low' as const }), format: betaZodOutputFormat(req.schema) },
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Trợ lý AI từ chối yêu cầu này.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Bản nháp bị cắt do quá dài.');
  if (msg.parsed_output == null) throw new Error('Trợ lý AI không trả về bản nháp hợp lệ.');
  return { data: msg.parsed_output as z.infer<S>, model: msg.model };
}

const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function looksVietnamese(text: string) {
  const words = text.split(/\s+/).filter((w) => /[a-zà-ỹđ]/i.test(w));
  if (words.length < 3) return VI_DIACRITIC.test(text) || words.length === 0;
  const marked = words.filter((w) => VI_DIACRITIC.test(w)).length;
  return marked / words.length >= 0.2;
}

export function hasBannedSymbols(text: string) {
  return /[·→…–—]/.test(text);
}
