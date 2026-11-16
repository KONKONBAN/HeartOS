import { useSyncExternalStore } from 'react';
import { HaClient, type HaTransport } from '../core/ha/client';
import { mapStates, servicesFor } from '../core/ha/map';
import { getHome } from './services';
import { getApp } from './store';

type Cap = { isNativePlatform?: () => boolean };
const native = () => !!(window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.();

const transport: HaTransport = {
  async request(method, url, headers, body, binary) {
    if (native()) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const r = await CapacitorHttp.request({ method, url, headers, data: body, responseType: binary ? 'blob' : 'json', connectTimeout: 8000, readTimeout: 15000 });
      return { status: r.status, data: r.data };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      if (binary) {
        const b = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
        return { status: res.status, data: `data:${res.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}` };
      }
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: res.status, data };
    } finally {
      clearTimeout(t);
    }
  },
};

export interface HaStatus {
  state: 'off' | 'connecting' | 'ok' | 'error';
  error?: string;
  version?: string;
  location?: string;
  lastSync?: number;
  devices: number;
  entities: number;
}

let status: HaStatus = { state: 'off', devices: 0, entities: 0 };
let ver = 0;
const listeners = new Set<() => void>();
let client: HaClient | null = null;
let timer: number | undefined;
let areas: Record<string, string> = {};
let areasAt = 0;
let polling = false;
let gen = 0;

function setStatus(p: Partial<HaStatus>) {
  status = { ...status, ...p };
  ver++;
  listeners.forEach((l) => l());
}

export function haStatus() {
  return status;
}

export function useHa() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ver,
  );
  return status;
}

export function haClient() {
  return client;
}

async function pull() {
  if (!client || polling) return;
  polling = true;
  const at = gen;
  try {
    const states = await client.states();
    if (at !== gen) {
      window.setTimeout(() => void pull(), 300);
      return;
    }
    if (Date.now() - areasAt > 60_000) {
      try {
        areas = await client.areas();
      } catch {
        areas = {};
      }
      areasAt = Date.now();
    }
    const snap = mapStates(states, areas);
    getHome().applyExternal(snap);
    setStatus({ state: 'ok', error: undefined, lastSync: Date.now(), devices: snap.devices.length, entities: states.length });
  } catch (e) {
    setStatus({ state: 'error', error: (e as Error).message });
  } finally {
    polling = false;
  }
}

function attach(c: HaClient) {
  client = c;
  getHome().attachBridge({
    async execute(device, desired) {
      const calls = servicesFor(device, desired);
      if (!calls.length) throw new Error('Thiết bị này không nhận lệnh điều khiển');
      gen++;
      for (const s of calls) await c.call(s.domain, s.service, s.data);
      window.setTimeout(() => void pull(), 700);
    },
    async runScene(entity) {
      const domain = entity.split('.')[0];
      gen++;
      await c.call(domain, 'turn_on', { entity_id: entity });
      window.setTimeout(() => void pull(), 700);
    },
    async setAutomation(entity, enabled) {
      gen++;
      await c.call('automation', enabled ? 'turn_on' : 'turn_off', { entity_id: entity });
      window.setTimeout(() => void pull(), 700);
    },
    async triggerAutomation(entity) {
      await c.call('automation', 'trigger', { entity_id: entity });
    },
  });
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void pull();
  }, 3000);
  void pull();
}

export async function testHa(url: string, token: string) {
  const c = new HaClient(url, token.trim(), transport);
  const info = await c.check();
  const states = await c.states();
  return { info, entities: states.length, devices: mapStates(states, {}).devices.length, base: c.base };
}

export async function connectHa(url: string, token: string) {
  const c = new HaClient(url, token.trim(), transport);
  setStatus({ state: 'connecting', error: undefined });
  try {
    const info = await c.check();
    getApp().set((s) => {
      s.prefs.haUrl = c.base;
      s.prefs.haToken = token.trim();
    });
    setStatus({ version: info.version, location: info.location });
    areasAt = 0;
    attach(c);
    return info;
  } catch (e) {
    setStatus({ state: 'error', error: (e as Error).message });
    throw e;
  }
}

export function stopHa() {
  window.clearInterval(timer);
  timer = undefined;
  client = null;
  areas = {};
  areasAt = 0;
  getHome().attachBridge(null);
  setStatus({ state: 'off', error: undefined, version: undefined, location: undefined, devices: 0, entities: 0, lastSync: undefined });
}

export function disconnectHa() {
  stopHa();
  getApp().set((s) => {
    s.prefs.haUrl = '';
    s.prefs.haToken = '';
  });
}

export function initHa() {
  const { prefs, household } = getApp();
  if (client || !household || household.demo || !prefs.haUrl || !prefs.haToken) return;
  setStatus({ state: 'connecting' });
  const c = new HaClient(prefs.haUrl, prefs.haToken, transport);
  attach(c);
  c.check()
    .then((info) => {
      if (client === c) setStatus({ version: info.version, location: info.location });
    })
    .catch(() => undefined);
}

export function syncHaNow() {
  return pull();
}

export async function haCameraImage(entity: string) {
  if (!client) throw new Error('Chưa kết nối Home Assistant');
  return client.cameraImage(entity);
}
