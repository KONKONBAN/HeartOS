export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HaResponse {
  status: number;
  data: unknown;
}

export interface HaTransport {
  request(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown, binary?: boolean): Promise<HaResponse>;
}

export function normalizeHaUrl(input: string) {
  let u = input.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  const url = new URL(u);
  if (!url.port && url.protocol === 'http:' && !/\.(ui\.nabu\.casa)$/i.test(url.hostname)) url.port = '8123';
  return url.origin;
}

export class HaError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

const AREA_TEMPLATE = "{% for s in states %}{{ s.entity_id }}\t{{ area_name(s.entity_id) or '' }}\n{% endfor %}";

export class HaClient {
  readonly base: string;
  constructor(baseUrl: string, private token: string, private transport: HaTransport) {
    this.base = normalizeHaUrl(baseUrl);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async req(method: 'GET' | 'POST', path: string, body?: unknown, binary?: boolean) {
    let r: HaResponse;
    try {
      r = await this.transport.request(method, `${this.base}${path}`, this.headers(), body, binary);
    } catch (e) {
      throw new HaError(`Không kết nối được Home Assistant tại ${this.base}: ${(e as Error).message}`);
    }
    if (r.status === 401 || r.status === 403) throw new HaError('Mã truy cập không hợp lệ hoặc đã bị thu hồi', r.status);
    if (r.status === 404) throw new HaError(`Không tìm thấy ${path} trên Home Assistant`, 404);
    if (r.status >= 400) throw new HaError(`Home Assistant trả lỗi ${r.status}`, r.status);
    return r.data;
  }

  async check(): Promise<{ message: string; version?: string; location?: string }> {
    const ping = (await this.req('GET', '/api/')) as { message?: string };
    if (!ping || typeof ping.message !== 'string') throw new HaError('Địa chỉ này không phải Home Assistant API');
    let version: string | undefined;
    let location: string | undefined;
    try {
      const cfg = (await this.req('GET', '/api/config')) as { version?: string; location_name?: string };
      version = cfg.version;
      location = cfg.location_name;
    } catch {
      version = undefined;
    }
    return { message: ping.message, version, location };
  }

  async states(): Promise<HaState[]> {
    const data = await this.req('GET', '/api/states');
    if (!Array.isArray(data)) throw new HaError('Phản hồi trạng thái không hợp lệ');
    return data as HaState[];
  }

  async areas(): Promise<Record<string, string>> {
    const text = await this.req('POST', '/api/template', { template: AREA_TEMPLATE });
    const out: Record<string, string> = {};
    for (const line of String(text ?? '').split('\n')) {
      const [id, area] = line.split('\t');
      if (id && area?.trim()) out[id.trim()] = area.trim();
    }
    return out;
  }

  async call(domain: string, service: string, data: Record<string, unknown>) {
    return this.req('POST', `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, data);
  }

  async cameraImage(entityId: string): Promise<string> {
    const data = await this.req('GET', `/api/camera_proxy/${encodeURIComponent(entityId)}?t=${Date.now()}`, undefined, true);
    if (typeof data !== 'string' || !data) throw new HaError('Camera không trả ảnh');
    return data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
  }
}
