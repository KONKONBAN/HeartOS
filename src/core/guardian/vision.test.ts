import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { judgeFallImage } from './vision';

const verdict = { person_visible: true, posture: 'lying_on_floor', fallen_likely: 0.83, notes: 'Thấy một người nằm trên sàn cạnh giường.' };
let server: Server;
let base = '';
const seen: { path: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      seen.push({ path: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      if (req.url?.includes('/responses')) {
        res.end(JSON.stringify({ id: 'resp_1', object: 'response', created_at: 1, status: 'completed', model: body.model, output: [{ type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(verdict), annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
      } else {
        res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(verdict) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

const image = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime: 'image/png' as const };

describe('AI xem ảnh camera khi nghi ngã', () => {
  it('gửi ảnh dạng khối image cho Claude và đọc kết quả có cấu trúc', async () => {
    const r = await judgeFallImage({ provider: 'claude', apiKey: 'test', model: 'claude-opus-5-5', baseURL: base }, image, 'phòng ngủ');
    expect(r.posture).toBe('lying_on_floor');
    const req = seen.find((s) => s.path.includes('/v1/messages'))!.body as { messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[] };
    const content = req.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[0].source!.media_type).toBe('image/png');
    expect(content[0].source!.data).toBe(image.base64);
    expect(content[1].type).toBe('text');
  });

  it('gửi ảnh dạng input_image cho ChatGPT', async () => {
    const r = await judgeFallImage({ provider: 'openai', apiKey: 'test', model: 'gpt-6-astra', baseURL: `${base}/v1` }, image, 'phòng ngủ');
    expect(r.fallen_likely).toBeCloseTo(0.83);
    const req = seen.find((s) => s.path.includes('/responses'))!.body as { input: { content: { type: string; image_url?: string }[] }[] };
    expect(req.input[0].content[0].type).toBe('input_image');
    expect(req.input[0].content[0].image_url).toBe(`data:image/png;base64,${image.base64}`);
  });
});
