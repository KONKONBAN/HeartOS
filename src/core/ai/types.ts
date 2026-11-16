import type * as z from 'zod/v4';

export type AiProvider = 'claude' | 'openai';

export interface AiTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<string> | string;
}

export function defineTool<S extends z.ZodType>(t: AiTool<S>): AiTool {
  return t as unknown as AiTool;
}

export interface TurnInput {
  key: string;
  model: string;
  system: string;
  history: unknown[];
  user: string;
  tools: AiTool[];
  onText: (delta: string) => void;
  onTool?: (name: string) => void;
  signal?: AbortSignal;
  baseURL?: string;
  managed?: boolean;
}

export interface TurnResult {
  history: unknown[];
  text: string;
  model: string;
  stop: 'done' | 'refusal' | 'length';
  fellBackModel?: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'rate' | 'model' | 'network' | 'server' | 'refused' | 'aborted' | 'bad_request',
    public provider: AiProvider,
  ) {
    super(message);
  }
  get retryable() {
    return this.kind === 'network' || this.kind === 'server' || this.kind === 'rate' || this.kind === 'model';
  }
}

export const PROVIDER_NAME: Record<AiProvider, string> = { claude: 'Claude', openai: 'ChatGPT' };

export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Mặc định, thông minh và cân bằng chi phí' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Nhanh, rẻ hơn' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Nhanh nhất, rẻ nhất' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', note: 'Mạnh nhất, chi phí cao nhất' },
];

export const OPENAI_PREFERRED = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6.1-terra', 'gpt-5.6-sol', 'gpt-5.5', 'gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.4', 'gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1'];

export const OPENAI_DEFAULT = 'gpt-6-astra';
export const OPENAI_SAFE = 'gpt-5.5';

export function isChatModel(id: string) {
  if (!/^(gpt-|o\d|chatgpt-)/.test(id)) return false;
  return !/(audio|realtime|transcribe|tts|image|embedding|search|codex|cyber|deep-research|rosalind|daybreak|instruct|moderation|computer|whisper|dall-e|\d{4}-\d{2}-\d{2}|preview|-pro\b|-pro-)/.test(id);
}

export function rankOpenAiModels(ids: string[]) {
  const chat = [...new Set(ids.filter(isChatModel))];
  const rank = (id: string) => {
    const i = OPENAI_PREFERRED.indexOf(id);
    return i === -1 ? 100 : i;
  };
  return chat.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
}

const SYMBOLS: [RegExp, string][] = [
  [/\s*·\s*/g, ', '],
  [/\s*[→⇒⟶]\s*/g, ' sang '],
  [/…/g, '.'],
  [/\.{3,}/g, '.'],
  [/\s+[–—]\s+/g, ', '],
  [/[–—]/g, '-'],
];

export function cleanText(s: string) {
  let out = s;
  for (const [re, rep] of SYMBOLS) out = out.replace(re, rep);
  return out.replace(/ ,/g, ',').replace(/,\s*,/g, ',');
}
