#!/usr/bin/env node
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createServer } from 'node:http';

export function loadConfig(env = process.env) {
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim() || '';
  const openaiKey = env.OPENAI_API_KEY?.trim() || '';
  const primary = env.PRIMARY === 'responses' || (!anthropicKey && openaiKey) ? 'responses' : 'messages';
  return {
    port: num(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    anthropicKey,
    openaiKey,
    anthropicBase: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
    openaiBase: (env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, ''),
    primary,
    claudeModel: env.CLAUDE_MODEL || 'claude-opus-5-5',
    openaiModel: env.OPENAI_MODEL || 'gpt-6-astra',
    openaiFallbackModel: env.OPENAI_FALLBACK_MODEL || 'gpt-5.5',
    effort: ['low', 'medium', 'high'].includes(env.EFFORT) ? env.EFFORT : 'low',
    secret: env.GATEWAY_SECRET || '',
    deviceDaily: num(env.DEVICE_DAILY_LIMIT, 150),
    globalDaily: num(env.GLOBAL_DAILY_LIMIT, 5000),
    registerPerDay: num(env.REGISTER_PER_IP_PER_DAY, 200),
    codes: (env.ACTIVATION_CODES || '').split(',').map((s) => s.trim()).filter(Boolean),
    origins: (env.ALLOWED_ORIGINS || 'https://localhost,http://localhost,capacitor://localhost').split(',').map((s) => s.trim()).filter(Boolean),
    adminToken: env.ADMIN_TOKEN || '',
    dataFile: env.DATA_FILE || '',
    maxBody: num(env.MAX_BODY_BYTES, 4_000_000),
  };
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function createGateway(cfg, log = console) {
  const secret = cfg.secret || b64u(randomBytes(32));
  if (!cfg.secret) log.warn('GATEWAY_SECRET chưa đặt: mã thiết bị sẽ mất hiệu lực khi khởi động lại.');
  const state = { day: today(), global: 0, devices: {}, revoked: [], registers: {} };
  if (cfg.dataFile && existsSync(cfg.dataFile)) {
    try {
      Object.assign(state, JSON.parse(readFileSync(cfg.dataFile, 'utf8')));
    } catch (e) {
      log.warn('Không đọc được tệp dữ liệu, bắt đầu mới:', e.message);
    }
  }
  let dirty = false;
  const persist = () => {
    if (!cfg.dataFile || !dirty) return;
    dirty = false;
    try {
      writeFileSync(cfg.dataFile + '.tmp', JSON.stringify(state));
      renameSync(cfg.dataFile + '.tmp', cfg.dataFile);
    } catch (e) {
      log.warn('Không ghi được tệp dữ liệu:', e.message);
    }
  };
  const timer = setInterval(persist, 15_000);
  timer.unref?.();

  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function roll() {
    const d = today();
    if (state.day !== d) {
      state.day = d;
      state.global = 0;
      for (const k of Object.keys(state.devices)) state.devices[k].today = 0;
      state.registers = {};
      dirty = true;
    }
  }
  function sign(payload) {
    const body = b64u(JSON.stringify(payload));
    return `${body}.${b64u(createHmac('sha256', secret).update(body).digest())}`;
  }
  function verify(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const want = createHmac('sha256', secret).update(body).digest();
    let got;
    try {
      got = Buffer.from(sig, 'base64url');
    } catch {
      return null;
    }
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (!p.d || state.revoked.includes(p.d)) return null;
      return p;
    } catch {
      return null;
    }
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (cfg.origins.includes('*') || cfg.origins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization, content-type, x-api-key');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }

  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function apiError(res, kind, status, message) {
    if (kind === 'messages') return json(res, status, { type: 'error', error: { type: status === 429 ? 'rate_limit_error' : status === 401 ? 'authentication_error' : 'invalid_request_error', message } });
    return json(res, status, { error: { message, type: status === 429 ? 'rate_limit_exceeded' : status === 401 ? 'invalid_api_key' : 'invalid_request_error', code: null, param: null } });
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > cfg.maxBody) throw Object.assign(new Error('Yêu cầu quá lớn'), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  function charge(device) {
    roll();
    const d = (state.devices[device] ??= { today: 0, total: 0, first: Date.now(), last: 0 });
    if (state.global >= cfg.globalDaily) return 'Máy chủ trợ lý đã dùng hết hạn mức hôm nay. Vui lòng thử lại vào ngày mai.';
    if (d.today >= cfg.deviceDaily) return `Thiết bị này đã hỏi đủ ${cfg.deviceDaily} câu hôm nay. Vui lòng thử lại vào ngày mai.`;
    d.today += 1;
    d.total += 1;
    d.last = Date.now();
    state.global += 1;
    dirty = true;
    return null;
  }

  const CURRENT = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5|fable-5|mythos-5)/;
  const FALLBACKS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-2|fable-5-1)$/;

  function prepareMessages(body, headers, minimal) {
    const out = { ...body, model: cfg.claudeModel };
    const betas = new Set((headers['anthropic-beta'] || '').split(',').map((s) => s.trim()).filter(Boolean));
    delete out.thinking;
    delete out.fallbacks;
    const oc = { ...(out.output_config || {}) };
    delete oc.effort;
    if (!minimal && CURRENT.test(cfg.claudeModel)) {
      out.thinking = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } };
      betas.add('thinking-binding-controls-2026-08-01');
      oc.effort = cfg.effort;
    }
    if (!minimal && FALLBACKS.test(cfg.claudeModel)) {
      out.fallbacks = 'default';
      betas.add('server-side-fallback-2026-07-01');
    }
    if (minimal) {
      betas.delete('thinking-binding-controls-2026-08-01');
      betas.delete('server-side-fallback-2026-07-01');
    }
    if (Object.keys(oc).length) out.output_config = oc;
    else delete out.output_config;
    if (minimal && Array.isArray(out.tools)) out.tools = out.tools.map(({ eager_input_streaming: _e, ...t }) => t);
    return { body: out, betas: [...betas] };
  }

  function prepareResponses(body, model) {
    const out = { ...body, model, store: false };
    if (/^(gpt-5|gpt-6|o\d)/.test(model)) out.reasoning = { ...(out.reasoning || {}), effort: cfg.effort };
    else {
      delete out.reasoning;
      if (Array.isArray(out.include)) out.include = out.include.filter((i) => i !== 'reasoning.encrypted_content');
    }
    return out;
  }

  async function forward(url, headers, body) {
    const up = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return up;
  }

  async function pipe(res, up) {
    const type = up.headers.get('content-type') || 'application/json';
    res.writeHead(up.status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    if (!up.body) return res.end();
    const reader = up.body.getReader();
    res.on('close', () => reader.cancel().catch(() => undefined));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }

  async function handleMessages(req, res, token) {
    if (!cfg.anthropicKey) return apiError(res, 'messages', 404, 'Máy chủ chưa bật dịch vụ này.');
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return apiError(res, 'messages', 400, 'JSON không hợp lệ');
    }
    const limited = charge(token.d);
    if (limited) return apiError(res, 'messages', 429, limited);
    for (const minimal of [false, true]) {
      const p = prepareMessages(body, req.headers, minimal);
      const headers = { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': req.headers['anthropic-version'] || '2023-06-01' };
      if (p.betas.length) headers['anthropic-beta'] = p.betas.join(',');
      const up = await forward(`${cfg.anthropicBase}/v1/messages`, headers, p.body);
      if (up.status === 400 && !minimal) {
        const text = await up.text();
        log.warn('Yêu cầu bị từ chối, thử lại dạng tối giản:', text.slice(0, 300));
        continue;
      }
      return pipe(res, up);
    }
  }

  async function handleResponses(req, res, token) {
    if (!cfg.openaiKey) return apiError(res, 'responses', 404, 'Máy chủ chưa bật dịch vụ này.');
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return apiError(res, 'responses', 400, 'JSON không hợp lệ');
    }
    const limited = charge(token.d);
    if (limited) return apiError(res, 'responses', 429, limited);
    const models = [...new Set([cfg.openaiModel, cfg.openaiFallbackModel])];
    for (let i = 0; i < models.length; i++) {
      const up = await forward(`${cfg.openaiBase}/v1/responses`, { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiKey}` }, prepareResponses(body, models[i]));
      if ((up.status === 404 || up.status === 400) && i < models.length - 1) {
        const text = await up.text();
        if (up.status === 404 || /model/i.test(text)) {
          log.warn(`Mô hình ${models[i]} chưa dùng được, chuyển sang ${models[i + 1]}`);
          continue;
        }
        res.writeHead(up.status, { 'Content-Type': 'application/json' });
        return res.end(text);
      }
      return pipe(res, up);
    }
  }

  async function handleRegister(req, res) {
    roll();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    state.registers[ip] = (state.registers[ip] || 0) + 1;
    if (state.registers[ip] > cfg.registerPerDay) return json(res, 429, { error: 'Quá nhiều lượt đăng ký từ địa chỉ này.' });
    let body = {};
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return json(res, 400, { error: 'JSON không hợp lệ' });
    }
    const device = String(body.device || '').slice(0, 80);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(device)) return json(res, 400, { error: 'Mã thiết bị không hợp lệ' });
    if (cfg.codes.length && !cfg.codes.includes(String(body.code || '').trim())) return json(res, 403, { error: 'Mã kích hoạt không đúng.' });
    dirty = true;
    return json(res, 200, { token: sign({ d: device, h: String(body.household || '').slice(0, 80), iat: Date.now() }) });
  }

  function tokenOf(req) {
    const auth = String(req.headers.authorization || '');
    return verify(auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-api-key'] || ''));
  }

  const server = createServer(async (req, res) => {
    cors(req, res);
    const path = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && path === '/v1/config') {
        const has = { messages: !!cfg.anthropicKey, responses: !!cfg.openaiKey };
        return json(res, 200, { primary: has[cfg.primary] ? cfg.primary : has.messages ? 'messages' : 'responses', engines: has, activation: cfg.codes.length > 0 });
      }
      if (req.method === 'POST' && path === '/v1/register') return await handleRegister(req, res);
      if (req.method === 'GET' && path === '/admin/usage') {
        if (!cfg.adminToken || req.headers.authorization !== `Bearer ${cfg.adminToken}`) return json(res, 401, { error: 'unauthorized' });
        roll();
        return json(res, 200, { day: state.day, global: state.global, devices: Object.keys(state.devices).length, top: Object.entries(state.devices).sort((a, b) => b[1].today - a[1].today).slice(0, 20) });
      }
      if (req.method === 'POST' && path === '/admin/revoke') {
        if (!cfg.adminToken || req.headers.authorization !== `Bearer ${cfg.adminToken}`) return json(res, 401, { error: 'unauthorized' });
        const body = JSON.parse((await readBody(req)) || '{}');
        if (body.device && !state.revoked.includes(body.device)) state.revoked.push(String(body.device));
        dirty = true;
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && (path === '/v1/messages' || path === '/v1/responses')) {
        const kind = path === '/v1/messages' ? 'messages' : 'responses';
        const token = tokenOf(req);
        if (!token) return apiError(res, kind, 401, 'Thiết bị chưa được đăng ký với máy chủ trợ lý.');
        return kind === 'messages' ? await handleMessages(req, res, token) : await handleResponses(req, res, token);
      }
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      log.error('Lỗi xử lý:', e.message);
      if (!res.headersSent) json(res, e.status || 502, { error: e.status ? e.message : 'Máy chủ trợ lý tạm thời không gọi được dịch vụ AI.' });
      else res.end();
    }
  });
  server.on('close', () => {
    clearInterval(timer);
    persist();
  });
  return { server, state, sign, verify };
}

async function selfCheck(cfg, log) {
  const checks = [];
  if (cfg.anthropicKey) checks.push(fetch(`${cfg.anthropicBase}/v1/models?limit=1`, { headers: { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' } }).then((r) => log.log(`Khóa Anthropic: ${r.ok ? 'dùng được' : `lỗi ${r.status}`}`)).catch((e) => log.warn('Không kiểm tra được khóa Anthropic:', e.message)));
  if (cfg.openaiKey) checks.push(fetch(`${cfg.openaiBase}/v1/models`, { headers: { authorization: `Bearer ${cfg.openaiKey}` } }).then((r) => log.log(`Khóa OpenAI: ${r.ok ? 'dùng được' : `lỗi ${r.status}`}`)).catch((e) => log.warn('Không kiểm tra được khóa OpenAI:', e.message)));
  await Promise.all(checks);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const cfg = loadConfig();
  if (!cfg.anthropicKey && !cfg.openaiKey) {
    console.error('Cần đặt ANTHROPIC_API_KEY hoặc OPENAI_API_KEY (hoặc cả hai) trong biến môi trường.');
    process.exit(1);
  }
  const { server } = createGateway(cfg);
  server.listen(cfg.port, cfg.host, () => {
    console.log(`HeartOS AI gateway đang chạy ở cổng ${cfg.port}. Chính: ${cfg.primary}, dự phòng: ${cfg.anthropicKey && cfg.openaiKey ? 'có' : 'không'}.`);
    void selfCheck(cfg, console);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
