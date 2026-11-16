import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createGateway, loadConfig } from './heartos-ai-gateway.mjs';

interface Seen {
  path: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

const seen: Seen[] = [];
let failNextMessages = false;
let upstream: Server;
let gateway: Server;
let base = '';

const quiet = { log: () => undefined, warn: () => undefined, error: () => undefined };

function listen(s: Server) {
  return new Promise<string>((resolve) => s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    seen.push({ path: req.url ?? '', headers: req.headers, body });
    if (req.url?.startsWith('/v1/messages')) {
      if (failNextMessages && body.thinking) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'thinking.block_binding: Extra inputs are not permitted' } }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_secret', 'anthropic-organization-id': 'org_secret' });
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      return res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    }
    if (req.url?.startsWith('/v1/responses')) {
      if (body.model === 'gpt-new') {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'The model does not exist', code: 'model_not_found' } }));
      }
      res.writeHead(200, { 'content-type': 'application/json', 'openai-organization': 'org-secret', 'openai-project': 'proj_secret' });
      return res.end(JSON.stringify({ id: 'resp_1', model: body.model, output: [] }));
    }
    res.writeHead(404);
    res.end();
  });
  const up = await listen(upstream);
  const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-real', OPENAI_API_KEY: 'sk-real', ANTHROPIC_BASE_URL: up, OPENAI_BASE_URL: up, OPENAI_MODEL: 'gpt-new', OPENAI_FALLBACK_MODEL: 'gpt-5.5', GATEWAY_SECRET: 'test-secret', DEVICE_DAILY_LIMIT: '3', ALLOWED_ORIGINS: 'https://localhost' });
  gateway = createGateway(cfg, quiet).server;
  base = await listen(gateway);
});

afterAll(async () => {
  await new Promise((r) => gateway.close(r));
  await new Promise((r) => upstream.close(r));
});

async function register(device = 'dev-test-0001') {
  const r = await fetch(`${base}/v1/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, household: 'h-1' }) });
  return (await r.json()) as { token?: string; error?: string };
}

describe('HeartOS AI gateway', () => {
  it('trả cấu hình không lộ tên nhà cung cấp', async () => {
    const r = await fetch(`${base}/v1/config`);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ primary: 'messages', engines: { messages: true, responses: true }, activation: false });
    expect(text).not.toMatch(/claude|openai|anthropic|gpt/i);
  });

  it('cấp mã thiết bị và chặn mã giả', async () => {
    const { token } = await register();
    expect(token).toMatch(/\./);
    const fake = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': `${token}x` }, body: '{}' });
    expect(fake.status).toBe(401);
    const bad = await fetch(`${base}/v1/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: 'a b' }) });
    expect(bad.status).toBe(400);
  });

  it('chuyển tiếp messages bằng khóa thật, đặt mô hình và tham số ở máy chủ, giấu header nhà cung cấp', async () => {
    const { token } = await register('dev-test-0002');
    seen.length = 0;
    const r = await fetch(`${base}/v1/messages?beta=true`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'anthropic-version': '2026-10-21', origin: 'https://localhost' }, body: JSON.stringify({ model: 'auto', max_tokens: 100, messages: [{ role: 'user', content: 'xin chào' }], stream: true }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(r.headers.get('request-id')).toBeNull();
    expect(r.headers.get('anthropic-organization-id')).toBeNull();
    expect(await r.text()).toContain('message_stop');
    const up = seen[0];
    expect(up.headers['x-api-key']).toBe('sk-ant-real');
    expect(up.body.model).toBe('claude-opus-5-5');
    expect(up.body.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(up.body.fallbacks).toBe('default');
    expect((up.body.output_config as { effort: string }).effort).toBe('low');
    expect(String(up.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
  });

  it('thử lại dạng tối giản khi nhà cung cấp từ chối tham số mới', async () => {
    const { token } = await register('dev-test-0003');
    seen.length = 0;
    failNextMessages = true;
    const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': token! }, body: JSON.stringify({ model: 'auto', max_tokens: 10, messages: [] }) });
    failNextMessages = false;
    expect(r.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen[1].body.thinking).toBeUndefined();
    expect(seen[1].body.fallbacks).toBeUndefined();
  });

  it('chuyển tiếp responses, tự đổi sang mô hình dự phòng và giấu header tổ chức', async () => {
    const { token } = await register('dev-test-0004');
    seen.length = 0;
    const r = await fetch(`${base}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ model: 'auto', input: 'hi' }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('openai-organization')).toBeNull();
    expect(r.headers.get('openai-project')).toBeNull();
    expect(seen.map((s) => s.body.model)).toEqual(['gpt-new', 'gpt-5.5']);
    expect(seen[1].headers.authorization).toBe('Bearer sk-real');
    expect(seen[1].body.store).toBe(false);
    expect(seen[1].body.reasoning).toEqual({ effort: 'low' });
  });

  it('giới hạn số câu hỏi mỗi thiết bị mỗi ngày', async () => {
    const { token } = await register('dev-test-0005');
    const call = () => fetch(`${base}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'x' }) });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { message: string } }).error.message).toContain('Thiết bị này đã hỏi đủ 3 câu');
  });

  it('trả lời preflight CORS cho ứng dụng', async () => {
    const r = await fetch(`${base}/v1/messages`, { method: 'OPTIONS', headers: { origin: 'https://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('anthropic-dangerous-direct-browser-access');
    const other = await fetch(`${base}/v1/messages`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
