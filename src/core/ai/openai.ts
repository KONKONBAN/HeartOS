import type OpenAI from 'openai';
import * as z from 'zod/v4';
import { AiError, OPENAI_SAFE, type AiTool, type TurnInput, type TurnResult } from './types';

type InputItem = OpenAI.Responses.ResponseInputItem;

async function client(key: string, baseURL?: string) {
  const { default: Sdk } = await import('openai');
  return { Sdk, c: new Sdk({ apiKey: key, baseURL, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 }) };
}

type Json = { type?: string | string[]; properties?: Record<string, Json>; required?: string[]; enum?: unknown[]; items?: Json; additionalProperties?: boolean; [k: string]: unknown };

export function strictSchema(schema: Json): Json {
  if (schema.type !== 'object' || !schema.properties) return schema;
  const required = new Set(schema.required ?? []);
  const properties: Record<string, Json> = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    let p: Json = v.type === 'object' ? strictSchema(v) : { ...v };
    if (!required.has(k)) {
      const t = p.type;
      p = { ...p, type: Array.isArray(t) ? [...t, 'null'] : t ? [t, 'null'] : undefined };
      if (p.enum) p.enum = [...p.enum, null];
      if (!p.type) delete p.type;
    }
    properties[k] = p;
  }
  const { $schema: _s, ...rest } = schema as Json & { $schema?: string };
  void _s;
  return { ...rest, properties, required: Object.keys(properties), additionalProperties: false };
}

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
}

function toolDefs(tools: AiTool[]): OpenAI.Responses.FunctionTool[] {
  return tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: strictSchema(z.toJSONSchema(t.schema, { target: 'draft-7' }) as Json), strict: true }));
}

const REASONING = /^(gpt-5|gpt-6|o\d)/;

function mapError(Sdk: typeof OpenAI, e: unknown, managed?: boolean): AiError {
  if (e instanceof AiError) return e;
  if (managed && e instanceof Sdk.APIError && !(e instanceof Sdk.APIUserAbortError)) {
    const st = e.status ?? 0;
    if (st === 401 || st === 403) return new AiError('Thiết bị chưa được máy chủ trợ lý chấp nhận.', 'auth', 'openai');
    if (st === 429) return new AiError(e.message.replace(/^\d+\s*/, '') || 'Trợ lý đang quá tải, thử lại sau ít phút.', 'rate', 'openai');
    if (st === 404) return new AiError('Máy chủ trợ lý chưa bật dịch vụ này.', 'model', 'openai');
    if (e instanceof Sdk.APIConnectionError) return new AiError('Không kết nối được máy chủ trợ lý. Kiểm tra mạng.', 'network', 'openai');
    return new AiError(`Máy chủ trợ lý báo lỗi ${st}`, st >= 500 ? 'server' : 'bad_request', 'openai');
  }
  if (e instanceof Sdk.APIUserAbortError) return new AiError('Đã dừng.', 'aborted', 'openai');
  if (e instanceof Sdk.AuthenticationError || e instanceof Sdk.PermissionDeniedError) return new AiError('Khóa API OpenAI không hợp lệ hoặc chưa được cấp quyền.', 'auth', 'openai');
  if (e instanceof Sdk.NotFoundError) return new AiError('Tài khoản chưa dùng được mô hình ChatGPT đã chọn.', 'model', 'openai');
  if (e instanceof Sdk.RateLimitError) return new AiError('ChatGPT đang giới hạn số yêu cầu hoặc tài khoản hết hạn mức.', 'rate', 'openai');
  if (e instanceof Sdk.BadRequestError) {
    const code = (e as { code?: string | null }).code;
    if (code === 'model_not_found') return new AiError('Tài khoản chưa dùng được mô hình ChatGPT đã chọn.', 'model', 'openai');
    return new AiError(`ChatGPT từ chối yêu cầu: ${e.message}`, 'bad_request', 'openai');
  }
  if (e instanceof Sdk.InternalServerError) return new AiError('Máy chủ ChatGPT đang bận.', 'server', 'openai');
  if (e instanceof Sdk.APIConnectionError) return new AiError('Không kết nối được ChatGPT. Kiểm tra mạng.', 'network', 'openai');
  if (e instanceof Sdk.APIError) return new AiError(`ChatGPT báo lỗi ${e.status ?? ''}: ${e.message}`, (e.status ?? 500) >= 500 ? 'server' : 'bad_request', 'openai');
  return new AiError((e as Error)?.message ?? 'Lỗi không rõ', 'network', 'openai');
}

async function run(input: TurnInput, model: string): Promise<TurnResult> {
  const { Sdk, c } = await client(input.key, input.baseURL);
  const tools = toolDefs(input.tools);
  const items: InputItem[] = [...(input.history as InputItem[]), { role: 'user', content: input.user }];
  let text = '';
  try {
    for (let round = 0; round < 8; round++) {
      const stream = c.responses.stream(
        {
          model,
          instructions: input.system,
          input: items,
          tools,
          store: false,
          include: ['reasoning.encrypted_content'],
          parallel_tool_calls: true,
          ...(!input.managed && REASONING.test(model) && { reasoning: { effort: 'low' } }),
        },
        { signal: input.signal },
      );
      stream.on('response.output_text.delta', (e) => {
        text += e.delta;
        input.onText(e.delta);
      });
      const resp = await stream.finalResponse();
      const refusal = resp.output.some((o) => o.type === 'message' && o.content.some((p) => p.type === 'refusal'));
      if (refusal) return { history: input.history, text: text || resp.output_text, model: resp.model, stop: 'refusal' };
      items.push(...(resp.output as unknown as InputItem[]));
      const calls = resp.output.filter((o) => o.type === 'function_call') as unknown as OpenAI.Responses.ResponseFunctionToolCall[];
      if (!calls.length) {
        return { history: items, text: text || resp.output_text, model: resp.model, stop: resp.status === 'incomplete' ? 'length' : 'done' };
      }
      const outputs = await Promise.all(
        calls.map(async (call): Promise<InputItem> => {
          const tool = input.tools.find((t) => t.name === call.name);
          let output: string;
          if (!tool) output = `Không có công cụ ${call.name}.`;
          else {
            let args: unknown;
            try {
              args = stripNulls(JSON.parse(call.arguments || '{}'));
            } catch {
              args = null;
            }
            const parsed = tool.schema.safeParse(args);
            if (!parsed.success) output = JSON.stringify({ INVALID_INPUT: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
            else {
              input.onTool?.(call.name);
              try {
                output = await tool.run(parsed.data);
              } catch (err) {
                output = `Lỗi: ${(err as Error).message}`;
              }
            }
          }
          return { type: 'function_call_output', call_id: call.call_id, output };
        }),
      );
      items.push(...outputs);
      if (text && !text.endsWith('\n')) {
        text += '\n\n';
        input.onText('\n\n');
      }
    }
    throw new AiError('Trợ lý gọi công cụ quá nhiều lần trong một lượt.', 'server', 'openai');
  } catch (e) {
    throw mapError(Sdk, e, input.managed);
  }
}

export async function openaiTurn(input: TurnInput): Promise<TurnResult> {
  try {
    return await run(input, input.model);
  } catch (e) {
    if (e instanceof AiError && e.kind === 'model' && !input.managed && input.model !== OPENAI_SAFE && !input.signal?.aborted) {
      const r = await run(input, OPENAI_SAFE);
      return { ...r, fellBackModel: r.model };
    }
    throw e;
  }
}

export async function openaiModels(key: string): Promise<string[]> {
  const { Sdk, c } = await client(key);
  try {
    const ids: string[] = [];
    for await (const m of c.models.list()) ids.push(m.id);
    return ids;
  } catch (e) {
    throw mapError(Sdk, e);
  }
}

export function openaiHistoryFromTranscript(turns: { from: 'user' | 'assistant'; text: string }[]): InputItem[] {
  return turns.filter((t) => t.text.trim()).map((t) => ({ role: t.from === 'user' ? 'user' : 'assistant', content: t.text }) as InputItem);
}
