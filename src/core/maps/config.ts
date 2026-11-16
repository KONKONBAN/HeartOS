export interface MapEndpoints {
  tiles: string;
  glyphs: string;
  routing: string;
  osrm: string;
  geocoder: string;
  nominatim: string;
  satellite: string;
  satelliteAttribution: string;
}

const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const DEFAULT_ENDPOINTS: MapEndpoints = {
  tiles: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  routing: 'https://valhalla1.openstreetmap.de',
  osrm: 'https://routing.openstreetmap.de',
  geocoder: 'https://photon.komoot.io',
  nominatim: 'https://nominatim.openstreetmap.org',
  satellite: String(ENV.VITE_SATELLITE_TILES ?? '').trim() || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  satelliteAttribution: String(ENV.VITE_SATELLITE_ATTRIBUTION ?? '').trim() || 'Ảnh vệ tinh © Esri, Maxar, Earthstar Geographics',
};

let current: MapEndpoints = { ...DEFAULT_ENDPOINTS };

export function setMapEndpoints(patch: Partial<MapEndpoints>) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim().replace(/\/+$/, '')]));
  current = { ...DEFAULT_ENDPOINTS, ...clean };
}

export const endpoints = () => current;

export async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  signal?.addEventListener('abort', relay);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new MapServiceError(r.status, body.slice(0, 200));
    }
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof MapServiceError) throw e;
    if (signal?.aborted) throw new DOMException('Đã hủy', 'AbortError');
    throw new MapServiceError(0, ctrl.signal.aborted ? 'Hết thời gian chờ máy chủ bản đồ' : (e as Error).message);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

export class MapServiceError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(status === 0 ? `Không kết nối được dịch vụ bản đồ (${detail})` : `Dịch vụ bản đồ báo lỗi ${status}${detail ? `: ${detail}` : ''}`);
  }
}

export async function tilesVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const j = await getJson<{ tiles?: string[] }>(endpoints().tiles, signal, 10_000);
    const m = j.tiles?.[0]?.match(/\/(\d{4})(\d{2})(\d{2})_\d+/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
  } catch {
    return null;
  }
}
