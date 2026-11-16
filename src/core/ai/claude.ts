import type Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';
import { AiError, type AiTool, type TurnInput, type TurnResult } from './types';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-2|fable-5-1)$/;
const CURRENT_FAMILY = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5|fable-5|mythos-5)/;

async function client(key: string, baseURL?: string) {
  const { default: Sdk } = await import('@anthropic-ai/sdk');
  return { Sdk, c: new Sdk({ apiKey: key, baseURL, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 }) };
}

function toolDefs(tools: AiTool[]): Anthropic.Beta.Messages.BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema, { target: 'draft-7' }) as Anthropic.Beta.Messages.BetaTool.InputSchema,
    eager_input_streaming: true,
  }));
}

function mapError(Sdk: typeof Anthropic, e: unknown, managed?: boolean): AiError {
  if (e instanceof AiError) return e;
  const n = managed ? 'Máy chủ trợ lý' : 'Claude';
  const detail = (msg: string) => (managed ? '' : `: ${msg}`);
  if (e instanceof Sdk.APIUserAbortError) return new AiError('Đã dừng.', 'aborted', 'claude');
  if (e instanceof Sdk.AuthenticationError || e instanceof Sdk.PermissionDeniedError) return new AiError(managed ? 'Thiết bị chưa được máy chủ trợ lý chấp nhận.' : 'Khóa API Claude không hợp lệ hoặc chưa được cấp quyền.', 'auth', 'claude');
  if (e instanceof Sdk.NotFoundError) return new AiError(managed ? 'Máy chủ trợ lý chưa bật dịch vụ này.' : 'Tài khoản chưa dùng được mô hình Claude đã chọn.', 'model', 'claude');
  if (e instanceof Sdk.RateLimitError) return new AiError(managed ? e.message.replace(/^\d+\s*/, '').replace(/^\{.*"message":"([^"]+)".*$/, '$1') || 'Trợ lý đang quá tải, thử lại sau ít phút.' : 'Claude đang giới hạn số yêu cầu, thử lại sau ít phút.', 'rate', 'claude');
  if (e instanceof Sdk.BadRequestError) return new AiError(`${n} từ chối yêu cầu${detail(e.message)}`, 'bad_request', 'claude');
  if (e instanceof Sdk.InternalServerError) return new AiError(`${n} đang bận.`, 'server', 'claude');
  if (e instanceof Sdk.APIConnectionError) return new AiError(`Không kết nối được ${managed ? 'máy chủ trợ lý' : 'Claude'}. Kiểm tra mạng.`, 'network', 'claude');
  if (e instanceof Sdk.APIError) return new AiError(`${n} báo lỗi ${e.status ?? ''}${detail(e.message)}`, (e.status ?? 500) >= 500 ? 'server' : 'bad_request', 'claude');
  return new AiError((e as Error)?.message ?? 'Lỗi không rõ', 'network', 'claude');
}

export async function claudeTurn(input: TurnInput): Promise<TurnResult> {
  const { Sdk, c } = await client(input.key, input.baseURL);
  const tools = toolDefs(input.tools);
  const messages: MessageParam[] = [...(input.history as MessageParam[]), { role: 'user', content: input.user }];
  const current = !input.managed && CURRENT_FAMILY.test(input.model);
  const fallbacks = !input.managed && FALLBACK_MODELS.test(input.model);
  const betas = [...(current ? ['thinking-binding-controls-2026-08-01'] : []), ...(fallbacks ? ['server-side-fallback-2026-07-01'] : [])];
  let text = '';
  let served = input.model;
  let jsonRetries = 0;
  try {
    for (let round = 0; round < 8; round++) {
      const stream = c.beta.messages.stream(
        {
          model: input.model,
          max_tokens: 64000,
          system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
          ...(current && { thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }, output_config: { effort: 'low' } }),
          ...(fallbacks && { fallbacks: 'default' }),
          ...(betas.length && { betas }),
        },
        { signal: input.signal },
      );
      stream.on('text', (delta) => {
        text += delta;
        input.onText(delta);
      });
      let msg: Anthropic.Beta.Messages.BetaMessage;
      try {
        msg = await stream.finalMessage();
        jsonRetries = 0;
      } catch (e) {
        if (e instanceof Sdk.APIError || input.signal?.aborted || jsonRetries++ >= 2) throw e;
        continue;
      }
      served = msg.model;
      if (msg.stop_reason === 'refusal') return { history: input.history, text, model: served, stop: 'refusal' };
      const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content });
        continue;
      }
      if (msg.stop_reason === 'max_tokens' && uses.length) throw new AiError('Câu trả lời bị cắt giữa chừng.', 'server', 'claude');
      if (msg.stop_reason !== 'tool_use' || uses.length === 0) {
        messages.push({ role: 'assistant', content: msg.content });
        return { history: messages, text, model: served, stop: msg.stop_reason === 'max_tokens' ? 'length' : 'done', fellBackModel: served !== input.model ? served : undefined };
      }
      messages.push({ role: 'assistant', content: msg.content });
      const results: ToolResult[] = await Promise.all(
        uses.map(async (u): Promise<ToolResult> => {
          const tool = input.tools.find((t) => t.name === u.name);
          if (!tool) return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Không có công cụ ${u.name}.` };
          const parsed = tool.schema.safeParse(u.input);
          if (!parsed.success) return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }) };
          input.onTool?.(u.name);
          try {
            return { type: 'tool_result', tool_use_id: u.id, content: await tool.run(parsed.data) };
          } catch (err) {
            return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: (err as Error).message };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
      if (text && !text.endsWith('\n')) {
        text += '\n\n';
        input.onText('\n\n');
      }
    }
    throw new AiError('Trợ lý gọi công cụ quá nhiều lần trong một lượt.', 'server', 'claude');
  } catch (e) {
    throw mapError(Sdk, e, input.managed);
  }
}

export async function claudeModels(key: string): Promise<string[]> {
  const { Sdk, c } = await client(key);
  try {
    const ids: string[] = [];
    for await (const m of c.models.list({ limit: 100 })) ids.push(m.id);
    return ids;
  } catch (e) {
    throw mapError(Sdk, e);
  }
}

export function claudeHistoryFromTranscript(turns: { from: 'user' | 'assistant'; text: string }[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const t of turns) {
    if (!t.text.trim()) continue;
    const role = t.from === 'user' ? 'user' : 'assistant';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${t.text}`;
    else out.push({ role, content: t.text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}
