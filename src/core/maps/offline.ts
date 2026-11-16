import type { LngLat } from './geo';
import { cumulative, haversine } from './geo';
import type { Route, TravelMode } from './route';

const CACHE = 'heartos-map-v1';
const SCHEME = 'hos';
const STALE_MS = 7 * 86400_000;
export const FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const GLYPH_RANGES = ['0-255', '256-511', '768-1023', '7680-7935', '8192-8447'];

export const offlineSupported = () => typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext !== false;

export const wrap = (url: string) => (offlineSupported() ? url.replace(/^https:\/\//, `${SCHEME}://`) : url);
const unwrap = (url: string) => url.replace(new RegExp(`^${SCHEME}://`), 'https://');

export function cacheKey(url: string) {
  const u = unwrap(url).replace(/\/planet\/\d{8}_\d+_[a-z]+\//, '/planet/v/');
  return `https://heartos.cache/${encodeURIComponent(u)}`;
}

const isTileJson = (url: string) => /\/planet\/?(\?.*)?$/.test(unwrap(url));

async function fromNetwork(url: string, signal?: AbortSignal, timeoutMs = 15_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  signal?.addEventListener('abort', relay);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', relay);
  }
}

async function put(key: string, body: ArrayBuffer, type: string) {
  const c = await caches.open(CACHE);
  await c.put(key, new Response(body, { headers: { 'content-type': type, 'x-saved': String(Date.now()) } }));
}

function rewriteTileJson(j: { tiles?: string[] }) {
  return { ...j, tiles: (j.tiles ?? []).map(wrap) };
}

export async function handle(url: string, signal: AbortSignal, type?: string): Promise<{ data: unknown }> {
  const real = unwrap(url);
  const key = cacheKey(real);
  const cache = await caches.open(CACHE);
  if (isTileJson(real)) {
    try {
      const r = await fromNetwork(real, signal, 6000);
      const buf = await r.arrayBuffer();
      await put(key, buf, 'application/json');
      return { data: rewriteTileJson(JSON.parse(new TextDecoder().decode(buf))) };
    } catch (e) {
      const hit = await cache.match(key);
      if (!hit) throw e;
      return { data: rewriteTileJson(await hit.json()) };
    }
  }
  const hit = await cache.match(key);
  if (hit) {
    const saved = Number(hit.headers.get('x-saved') ?? 0);
    if (Date.now() - saved > STALE_MS && navigator.onLine) {
      void fromNetwork(real)
        .then(async (r) => put(key, await r.arrayBuffer(), r.headers.get('content-type') ?? 'application/octet-stream'))
        .catch(() => undefined);
    }
    const buf = await hit.arrayBuffer();
    return { data: type === 'json' ? JSON.parse(new TextDecoder().decode(buf)) : buf };
  }
  const r = await fromNetwork(real, signal);
  const buf = await r.arrayBuffer();
  void put(key, buf.slice(0), r.headers.get('content-type') ?? 'application/octet-stream').catch(() => undefined);
  return { data: type === 'json' ? JSON.parse(new TextDecoder().decode(buf)) : buf };
}

let installed = false;
export function installProtocol(add: (scheme: string, fn: (p: { url: string; type?: string }, ac: AbortController) => Promise<{ data: unknown }>) => void) {
  if (installed || !offlineSupported()) return;
  installed = true;
  add(SCHEME, (p, ac) => handle(p.url, ac.signal, p.type));
}

function lon2tile(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function tilesFor(bbox: [LngLat, LngLat], minZ: number, maxZ: number) {
  const out: [number, number, number][] = [];
  for (let z = minZ; z <= maxZ; z++) {
    const x0 = lon2tile(bbox[0][0], z);
    const x1 = lon2tile(bbox[1][0], z);
    const y0 = lat2tile(bbox[1][1], z);
    const y1 = lat2tile(bbox[0][1], z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

export interface OfflineArea {
  id: string;
  name: string;
  bbox: [LngLat, LngLat];
  tiles: number;
  bytes: number;
  at: number;
}

const AREAS_KEY = 'heartos-map-areas';

export function listAreas(): OfflineArea[] {
  try {
    return JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]') as OfflineArea[];
  } catch {
    return [];
  }
}

function saveAreas(list: OfflineArea[]) {
  try {
    localStorage.setItem(AREAS_KEY, JSON.stringify(list));
  } catch {
    return;
  }
}

export async function downloadArea(p: { name: string; bbox: [LngLat, LngLat]; tileJsonUrl: string; glyphs: string; minZ?: number; maxZ?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<OfflineArea> {
  if (!offlineSupported()) throw new Error('Thiết bị này không hỗ trợ lưu bản đồ.');
  const tj = await fromNetwork(p.tileJsonUrl, p.signal);
  const tjBuf = await tj.arrayBuffer();
  await put(cacheKey(p.tileJsonUrl), tjBuf.slice(0), 'application/json');
  const template = (JSON.parse(new TextDecoder().decode(tjBuf)) as { tiles: string[] }).tiles[0];
  const list = tilesFor(p.bbox, p.minZ ?? 10, p.maxZ ?? 14);
  if (list.length > 4000) throw new Error('Vùng quá rộng, hãy phóng to bản đồ rồi tải lại.');
  const urls = [...list.map(([z, x, y]) => template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))), ...FONTS.flatMap((f) => GLYPH_RANGES.map((r) => p.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r)))];
  const cache = await caches.open(CACHE);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      if (p.signal?.aborted) throw new DOMException('Đã hủy', 'AbortError');
      const url = urls[next++];
      const key = cacheKey(url);
      try {
        const hit = await cache.match(key);
        if (hit && Date.now() - Number(hit.headers.get('x-saved') ?? 0) < STALE_MS) bytes += Number(hit.headers.get('content-length') ?? 0);
        else {
          const r = await fromNetwork(url, p.signal);
          const buf = await r.arrayBuffer();
          bytes += buf.byteLength;
          await put(key, buf, r.headers.get('content-type') ?? 'application/octet-stream');
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        failed++;
      }
      done++;
      p.onProgress?.(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failed > urls.length * 0.2) throw new Error(`Tải thiếu ${failed}/${urls.length} phần, kiểm tra mạng rồi thử lại.`);
  const area: OfflineArea = { id: `area-${Date.now().toString(36)}`, name: p.name, bbox: p.bbox, tiles: list.length, bytes, at: Date.now() };
  saveAreas([area, ...listAreas().filter((a) => a.name !== p.name)].slice(0, 12));
  return area;
}

export function removeArea(id: string) {
  saveAreas(listAreas().filter((a) => a.id !== id));
}

export async function clearOffline() {
  if (offlineSupported()) await caches.delete(CACHE);
  saveAreas([]);
  try {
    localStorage.removeItem(ROUTES_KEY);
    localStorage.removeItem(HOME_KEY);
  } catch {
    return;
  }
}

export async function storageUsed(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return est?.usage ?? null;
  } catch {
    return null;
  }
}

const HOME_KEY = 'heartos-map-home';

export function homeCached(home: { lat: number; lng: number }) {
  try {
    const v = JSON.parse(localStorage.getItem(HOME_KEY) ?? 'null') as { lat: number; lng: number; at: number } | null;
    return !!v && haversine([v.lng, v.lat], [home.lng, home.lat]) < 300 && Date.now() - v.at < 30 * 86400_000;
  } catch {
    return false;
  }
}

export function markHomeCached(home: { lat: number; lng: number }) {
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify({ lat: home.lat, lng: home.lng, at: Date.now() }));
  } catch {
    return;
  }
}

export const homeBox = (home: { lat: number; lng: number }, km = 6): [LngLat, LngLat] => {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((home.lat * Math.PI) / 180));
  return [
    [home.lng - dLng, home.lat - dLat],
    [home.lng + dLng, home.lat + dLat],
  ];
};

const ROUTES_KEY = 'heartos-map-routes';

interface SavedRoute {
  mode: TravelMode;
  from: LngLat;
  to: LngLat;
  at: number;
  routes: Route[];
}

export function saveRoutes(from: LngLat, to: LngLat, mode: TravelMode, routes: Route[]) {
  try {
    const list = JSON.parse(localStorage.getItem(ROUTES_KEY) ?? '[]') as SavedRoute[];
    const slim = routes.slice(0, 2).map((r) => ({ ...r, cum: [] as number[] }));
    const next = [{ mode, from, to, at: Date.now(), routes: slim }, ...list.filter((s) => !(s.mode === mode && haversine(s.to, to) < 50 && haversine(s.from, from) < 300))].slice(0, 15);
    localStorage.setItem(ROUTES_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

export function findSavedRoutes(from: LngLat, to: LngLat, mode: TravelMode): { routes: Route[]; at: number } | null {
  try {
    const list = JSON.parse(localStorage.getItem(ROUTES_KEY) ?? '[]') as SavedRoute[];
    const hit = list.find((s) => s.mode === mode && haversine(s.to, to) < 60 && haversine(s.from, from) < 400);
    return hit ? { routes: hit.routes.map((r) => ({ ...r, cum: cumulative(r.coords) })), at: hit.at } : null;
  } catch {
    return null;
  }
}
