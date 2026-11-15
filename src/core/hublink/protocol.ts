import { buf, canonical, fromB64, fromUtf8, randomBytes, sha256Hex, toB64, utf8 } from '../sentinel/encoding';
import { importEcdhPub, importEcdsaPub, signObject, verifyObject } from '../sentinel/crypto';

export const HUBLINK_VERSION = 1;
export const DEFAULT_HUB_PORT = 7420;
export const MAX_SKEW_MS = 10 * 60_000;

export interface PairRequest {
  v: 1;
  code: string;
  device: { name: string; platform: string; appVersion: string };
  signPub: string;
  kxPub: string;
  nonce: string;
}

export type HouseholdEntity = 'household' | 'member' | 'calendar' | 'task' | 'invitation' | 'ritual' | 'memory' | 'goal' | 'contribution' | 'permission' | 'hospital' | 'incident';

export interface HouseholdInfo {
  id: string;
  name: string;
  tz: string;
}

export interface HouseholdOp {
  key: string;
  entity: HouseholdEntity;
  id: string;
  data: unknown | null;
  ts: number;
  by: string;
  aud?: string[];
}

export interface PairResponseBody {
  v: 1;
  deviceId: string;
  household?: HouseholdInfo | null;
  memberId?: string;
  hubName: string;
  hubSignPub: string;
  hubKxPub: string;
  nonce: string;
  pairedAt: number;
}

export interface PairResponse {
  body: PairResponseBody;
  sig: string;
}

export interface Envelope {
  v: 1;
  deviceId: string;
  dir: 'up' | 'down';
  seq: number;
  ts: number;
  iv: string;
  ct: string;
  sig: string;
}

export type CommandKind =
  | 'ping'
  | 'bump_epoch'
  | 'lock_vault'
  | 'unlock_vault'
  | 'restrict_member'
  | 'signal'
  | 'checkpoint'
  | 'verify_journal'
  | 'revoke_permission'
  | 'set_bucket'
  | 'run_scenarios'
  | 'set_mode'
  | 'close_incident';

export const COMMAND_LABEL: Record<CommandKind, string> = {
  ping: 'Kiểm tra kết nối',
  bump_epoch: 'Thu hồi khẩn cấp (tăng thế hệ quyền)',
  lock_vault: 'Khóa đường đọc trong két',
  unlock_vault: 'Mở khóa đường đọc',
  restrict_member: 'Hạn chế phiên thành viên',
  signal: 'Gửi tín hiệu nghi vấn',
  checkpoint: 'Niêm phong điểm phục hồi',
  verify_journal: 'Kiểm chuỗi bằng chứng trên thiết bị',
  revoke_permission: 'Thu hồi một quyền chia sẻ',
  set_bucket: 'Cấu hình hạn mức giải mã (B, r)',
  run_scenarios: 'Chạy 12 kịch bản T1-T7 trên thiết bị',
  set_mode: 'Đổi chế độ nhà',
  close_incident: 'Đóng ca Guardian',
};

export interface AdminCommand {
  id: string;
  kind: CommandKind;
  params: Record<string, string | number | boolean>;
  issuedAt: number;
  expiresAt: number;
  issuedBy: string;
}

export interface CommandResult {
  id: string;
  ok: boolean;
  message: string;
  at: number;
  epoch: number;
}

export interface RemoteJournalEntry {
  seq: number;
  id: string;
  ts: number;
  kind: string;
  actor: string;
  severity: string;
  summary: string;
  subject?: string;
  objectId?: string;
  decision?: string;
  epoch?: number;
  data?: Record<string, string | number | boolean | null>;
  prevHash: string;
  hash: string;
}

export interface DeviceSnapshot {
  at: number;
  device: { name: string; platform: string; appVersion: string; actingAs: string };
  sentinel: {
    tenant: string;
    epoch: number;
    security: { state: string; exportBlocked: boolean; restricted: string[]; signals: number };
    R: { tokens: number; capacity: number; rate: number; quotaRemaining: number; quota: number; replays: number; denials: number; releasedBytes: number; locked: boolean; outstanding: number };
    hsm: { activeVersion: number; versions: number; generate: number; release: number; refused: number };
    ve: { name: string; version: string; measurement: string; accepted: boolean; tcb: number };
    gate: { released: number; denied: number };
    vault: { objectId: string; label: string; type: string; version: number; kekVersion: number; owner: string; viewers: string[]; purposes: string[]; size: number }[];
    recovery: { id: string; status: string; createdAt: number; objects: number; epochAt: number }[];
    journalHead: { seq: number; hash: string; count: number };
  };
  home: {
    mode: string;
    power: { mains: string; ats: string; battery: number; generator: string };
    net: { lan: boolean; internet: boolean };
    incidents: { id: string; title: string; priority: string; status: string; createdAt: number; assignee?: string }[];
    roomsFresh: number;
    roomsTotal: number;
    offlineDevices: string[];
  };
  family: {
    members: { id: string; name: string; role: string }[];
    permissions: { id: string; title: string; owner: string; status: string; viewers: string[] }[];
    syncPending: number;
  };
}

export interface UpPayload {
  snapshot: DeviceSnapshot;
  journal: RemoteJournalEntry[];
  results: CommandResult[];
  ops?: HouseholdOp[];
  opsCursor?: number;
  memberId?: string;
}

export interface DownPayload {
  commands: AdminCommand[];
  ackJournalSeq: number;
  hubTime: number;
  ops?: HouseholdOp[];
  opsCursor?: number;
  household?: HouseholdInfo | null;
  memberId?: string;
}

export const MAX_OP_BYTES = 4_000_000;

export function newNonce() {
  return toB64(randomBytes(16));
}

export function pairingCode(): string {
  const max = 4_294_967_296 - (4_294_967_296 % 1_000_000);
  for (;;) {
    const v = new DataView(buf(randomBytes(4))).getUint32(0);
    if (v < max) return String(v % 1_000_000).padStart(6, '0');
  }
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function sas(hubSignPub: string, deviceSignPub: string) {
  const h = await sha256Hex(`HOS-SAS|${hubSignPub}|${deviceSignPub}`);
  return `${h.slice(0, 3)}-${h.slice(3, 6)}-${h.slice(6, 9)}`.toUpperCase();
}

export async function deriveSessionKey(myKxPriv: CryptoKey, peerKxPub: string, deviceId: string): Promise<CryptoKey> {
  const peer = await importEcdhPub(peerKxPub);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, myKxPriv, 256);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(utf8('HOS-hublink-v1')), info: buf(utf8(`session|${deviceId}`)) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const aad = (deviceId: string, seq: number, ts: number, dir: string) => utf8(`HOS-hublink|${deviceId}|${seq}|${ts}|${dir}`);

export async function sealEnvelope(p: { deviceId: string; dir: 'up' | 'down'; seq: number; payload: unknown; sessionKey: CryptoKey; signKey: CryptoKey; now?: number }): Promise<Envelope> {
  const ts = p.now ?? Date.now();
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad(p.deviceId, p.seq, ts, p.dir)) }, p.sessionKey, buf(utf8(JSON.stringify(p.payload))));
  const unsigned = { v: 1 as const, deviceId: p.deviceId, dir: p.dir, seq: p.seq, ts, iv: toB64(iv), ct: toB64(ct) };
  return { ...unsigned, sig: await signObject(p.signKey, unsigned) };
}

export type OpenResult<T> = { ok: true; payload: T } | { ok: false; reason: string };

export async function openEnvelope<T>(env: Envelope, p: { expectedDir: 'up' | 'down'; lastSeq: number; peerSignPub: string; sessionKey: CryptoKey; now?: number }): Promise<OpenResult<T>> {
  if (!env || env.v !== 1) return { ok: false, reason: 'Phiên bản giao thức không hỗ trợ' };
  if (env.dir !== p.expectedDir) return { ok: false, reason: 'Sai chiều gói tin' };
  const { sig, ...unsigned } = env;
  const pub = await importEcdsaPub(p.peerSignPub);
  if (!(await verifyObject(pub, unsigned, sig))) return { ok: false, reason: 'Chữ ký không hợp lệ' };
  if (!(env.seq > p.lastSeq)) return { ok: false, reason: `Gói tin phát lại hoặc cũ (seq ${env.seq} ≤ ${p.lastSeq})` };
  const now = p.now ?? Date.now();
  if (Math.abs(now - env.ts) > MAX_SKEW_MS) return { ok: false, reason: 'Đồng hồ lệch quá 10 phút' };
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(fromB64(env.iv)), additionalData: buf(aad(env.deviceId, env.seq, env.ts, env.dir)) }, p.sessionKey, buf(fromB64(env.ct)));
    return { ok: true, payload: JSON.parse(fromUtf8(pt)) as T };
  } catch {
    return { ok: false, reason: 'Giải mã thất bại (khóa phiên hoặc dữ liệu bị sửa)' };
  }
}

export async function signPairResponse(body: PairResponseBody, hubSignPriv: CryptoKey): Promise<PairResponse> {
  return { body, sig: await signObject(hubSignPriv, body) };
}

export async function verifyPairResponse(r: PairResponse, nonce: string): Promise<boolean> {
  if (!r?.body || r.body.nonce !== nonce) return false;
  return verifyObject(await importEcdsaPub(r.body.hubSignPub), r.body, r.sig);
}

export async function verifyRemoteEntry(e: RemoteJournalEntry, prev?: RemoteJournalEntry): Promise<{ hashOk: boolean; linkOk: boolean | null }> {
  const { hash, ...body } = e;
  const hashOk = (await sha256Hex(canonical(body))) === hash;
  const linkOk = prev ? (prev.seq + 1 === e.seq ? prev.hash === e.prevHash : null) : null;
  return { hashOk, linkOk };
}
