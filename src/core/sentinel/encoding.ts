/**
 * Mã hóa không mơ hồ cho ngữ cảnh mật mã (AAD), chữ ký grant và chuỗi bằng chứng.
 * Luận văn §3.6.1: "Context được mã hóa thành một biểu diễn không mơ hồ trước khi đưa vào AAD."
 */

const te = new TextEncoder();
const td = new TextDecoder();

export const utf8 = (s: string): Uint8Array => te.encode(s);
export const fromUtf8 = (b: ArrayBuffer | Uint8Array): string =>
  td.decode(b instanceof Uint8Array ? b : new Uint8Array(b));

/** Trả về ArrayBuffer độc lập (WebCrypto yêu cầu BufferSource không chia sẻ). */
export function buf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toB64Url = (bytes: ArrayBuffer | Uint8Array) =>
  toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** JSON chuẩn hóa: khóa sắp xếp, không khoảng trắng — dùng trước khi ký hoặc băm. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('canonical: số không hữu hạn');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

/**
 * AAD = Encode(tenant, object, version, type) — biểu thức (3.12).
 * Mỗi trường được tiền tố độ dài byte nên "ab|c" và "a|bc" không thể trùng biểu diễn.
 */
export function encodeAAD(ctx: { tenant: string; object: string; version: number; type: string; alg?: string }): Uint8Array {
  const fields = [
    ['tenant', ctx.tenant],
    ['object', ctx.object],
    ['version', String(ctx.version)],
    ['type', ctx.type],
    ['alg', ctx.alg ?? 'AES-256-GCM'],
  ];
  const parts: Uint8Array[] = [utf8('HOS-AAD-v1')];
  for (const [k, v] of fields) {
    const kb = utf8(k);
    const vb = utf8(v);
    parts.push(lenPrefix(kb.length), kb, lenPrefix(vb.length), vb);
  }
  return concatBytes(...parts);
}

function lenPrefix(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf(bytes)));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

/** Byte ngẫu nhiên từ nền RNG của hệ điều hành (giả thiết A4). Không có seed thay thế. */
export function randomBytes(n: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    // §3.13: nếu nền RNG không sẵn sàng thì thao tác cần nó phải từ chối, không dùng thời gian/seed cố định.
    throw new Error('Nền RNG của hệ điều hành không sẵn sàng — từ chối thao tác cần ngẫu nhiên mới.');
  }
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export const randomId = (prefix: string, bytes = 6) => `${prefix}-${toHex(randomBytes(bytes))}`;

export function shortHash(hex: string, n = 10) {
  return hex.slice(0, n);
}
