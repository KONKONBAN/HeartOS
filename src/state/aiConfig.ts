import type { AiProvider } from '../core/ai/types';
import type { DraftConfig } from '../core/family/genai';
import { randomId } from '../core/sentinel/encoding';
import { getApp, useApp } from './store';
import type { AiPrefs } from './types';
import { embedded } from './embedded';

export const BUILD_GATEWAY = String(import.meta.env.VITE_AI_GATEWAY ?? '').trim();

export function gatewayOf(ai: AiPrefs) {
  return (ai.gateway || BUILD_GATEWAY).trim().replace(/\/+$/, '');
}

export const isManaged = (ai: AiPrefs) => !!gatewayOf(ai);

export const isNeutral = (ai: AiPrefs) => isManaged(ai) || !!embedded();

const gw = { url: '', at: 0, primary: 'claude' as AiProvider, engines: { claude: true, openai: true } as Record<AiProvider, boolean> };

export function keyFor(ai: AiPrefs, p: AiProvider) {
  if (isManaged(ai)) return ai.gatewayToken;
  const own = p === 'claude' ? ai.claudeKey : ai.openaiKey;
  const emb = embedded();
  return own || (emb ? (p === 'claude' ? emb.claude : emb.openai) : '');
}

export function modelFor(ai: AiPrefs, p: AiProvider) {
  if (isManaged(ai)) return 'auto';
  return p === 'claude' ? ai.claudeModel : ai.openaiModel;
}

export function baseFor(ai: AiPrefs, p: AiProvider) {
  const url = gatewayOf(ai);
  if (!url) return undefined;
  return p === 'claude' ? url : `${url}/v1`;
}

export function providerOrder(ai: AiPrefs): AiProvider[] {
  if (!ai.enabled) return [];
  if (isManaged(ai)) {
    const other: AiProvider = gw.primary === 'claude' ? 'openai' : 'claude';
    return [gw.primary, other].filter((p) => gw.engines[p]);
  }
  const emb = embedded();
  const main: AiProvider = emb && !ai.claudeKey && !ai.openaiKey ? emb.primary : ai.provider;
  const other: AiProvider = main === 'claude' ? 'openai' : 'claude';
  const list: AiProvider[] = [];
  if (keyFor(ai, main)) list.push(main);
  if ((ai.fallback || !list.length) && keyFor(ai, other)) list.push(other);
  return list;
}

export function aiReady(ai: AiPrefs) {
  return providerOrder(ai).length > 0;
}

export function draftConfig(ai: AiPrefs): DraftConfig | null {
  const p = providerOrder(ai)[0];
  if (!p) return null;
  const managed = isManaged(ai);
  if (managed && !ai.gatewayToken) return null;
  return { provider: p, apiKey: keyFor(ai, p), model: modelFor(ai, p), baseURL: baseFor(ai, p), managed, neutral: isNeutral(ai) };
}

async function getJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error || `Máy chủ trợ lý báo lỗi ${r.status}`);
    return body as Record<string, unknown>;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Máy chủ trợ lý không phản hồi.');
    if (e instanceof TypeError) throw new Error('Không kết nối được máy chủ trợ lý. Kiểm tra mạng.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function refreshGateway(force = false) {
  const ai = getApp().prefs.ai;
  const url = gatewayOf(ai);
  if (!url) return null;
  if (!force && gw.url === url && Date.now() - gw.at < 10 * 60_000) return gw;
  const c = await getJson(`${url}/v1/config`);
  const engines = (c.engines ?? {}) as { messages?: boolean; responses?: boolean };
  gw.url = url;
  gw.at = Date.now();
  gw.engines = { claude: !!engines.messages, openai: !!engines.responses };
  gw.primary = c.primary === 'responses' ? 'openai' : 'claude';
  return gw;
}

export async function ensureGatewayToken(force = false) {
  const app = getApp();
  const ai = app.prefs.ai;
  const url = gatewayOf(ai);
  if (!url) return '';
  if (ai.gatewayToken && !force) return ai.gatewayToken;
  const device = ai.deviceId || randomId('dev', 16).replace(/[^A-Za-z0-9_-]/g, '');
  const r = await getJson(`${url}/v1/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, household: app.household?.id ?? '', code: ai.gatewayCode }) });
  const token = String(r.token ?? '');
  if (!token) throw new Error('Máy chủ trợ lý không cấp mã thiết bị.');
  useApp.getState().set((s) => {
    s.prefs.ai.deviceId = device;
    s.prefs.ai.gatewayToken = token;
  });
  return token;
}

export async function testGateway(url: string, code: string) {
  const base = url.trim().replace(/\/+$/, '');
  const c = await getJson(`${base}/v1/config`);
  const engines = (c.engines ?? {}) as { messages?: boolean; responses?: boolean };
  const r = await getJson(`${base}/v1/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: getApp().prefs.ai.deviceId || randomId('dev', 16).replace(/[^A-Za-z0-9_-]/g, ''), household: getApp().household?.id ?? '', code }) });
  return { engines: Number(!!engines.messages) + Number(!!engines.responses), token: String(r.token ?? '') };
}
