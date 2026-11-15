import type { JsonStore } from '../storage';
import { exportPub, genEcdhKey, genSigningKey } from '../sentinel/crypto';
import { randomId } from '../sentinel/encoding';
import { Journal } from '../sentinel/journal';
import {
  COMMAND_LABEL,
  deriveSessionKey,
  openEnvelope,
  pairingCode,
  safeEqual,
  sas,
  sealEnvelope,
  signPairResponse,
  verifyRemoteEntry,
  type AdminCommand,
  type CommandKind,
  type CommandResult,
  type DeviceSnapshot,
  type DownPayload,
  type Envelope,
  type PairRequest,
  type PairResponse,
  type RemoteJournalEntry,
  type UpPayload,
} from './protocol';

export interface HubKeys {
  sign: CryptoKeyPair;
  kx: CryptoKeyPair;
}

export interface HubDevice {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  signPub: string;
  kxPub: string;
  pairedAt: number;
  sas: string;
  lastSeen?: number;
  lastAddress?: string;
  upSeq: number;
  downSeq: number;
  lastError?: string;
  revoked?: boolean;
}

export interface HubCommandRecord extends AdminCommand {
  deviceId: string;
  status: 'queued' | 'delivered' | 'done' | 'failed' | 'expired';
  deliveredAt?: number;
  result?: CommandResult;
}

export interface StoredJournalEntry extends RemoteJournalEntry {
  hashOk: boolean;
  linkOk: boolean | null;
}

interface PairingWindow {
  code: string;
  expiresAt: number;
  attempts: number;
}

export interface HubView {
  name: string;
  signPub: string;
  pairing: { code: string; expiresAt: number } | null;
  devices: HubDevice[];
  commands: HubCommandRecord[];
  snapshots: Record<string, DeviceSnapshot | undefined>;
  journalStats: Record<string, { count: number; broken: number; gaps: number; lastSeq: number }>;
}

const MAX_ENTRIES = 5000;
const PAIR_TTL = 120_000;
const MAX_ATTEMPTS = 5;

export class HubCore {
  private devices: Record<string, HubDevice>;
  private commands: HubCommandRecord[];
  private snapshots: Record<string, DeviceSnapshot>;
  private pairing: PairingWindow | null = null;
  private sessionKeys = new Map<string, CryptoKey>();
  private listeners = new Set<() => void>();
  readonly audit: Journal;
  signPub = '';
  kxPub = '';

  constructor(
    private store: JsonStore,
    private keys: HubKeys,
    readonly name: string,
    private now: () => number = Date.now,
  ) {
    this.devices = store.get<Record<string, HubDevice>>('hub.devices') ?? {};
    this.commands = store.get<HubCommandRecord[]>('hub.commands') ?? [];
    this.snapshots = store.get<Record<string, DeviceSnapshot>>('hub.snapshots') ?? {};
    this.audit = new Journal(store, 'hub.audit', 2000, now);
  }

  static async generateKeys(extractable: boolean): Promise<HubKeys> {
    if (!extractable) return { sign: await genSigningKey(), kx: await genEcdhKey() };
    const sign = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const kx = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    return { sign, kx };
  }

  async init() {
    this.signPub = await exportPub(this.keys.sign.publicKey);
    this.kxPub = await exportPub(this.keys.kx.publicKey);
    return this;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    this.store.set('hub.devices', this.devices);
    this.store.set('hub.commands', this.commands.slice(-500));
    this.store.set('hub.snapshots', this.snapshots);
    this.listeners.forEach((l) => l());
  }

  view(): HubView {
    const journalStats: HubView['journalStats'] = {};
    for (const id of Object.keys(this.devices)) {
      const list = this.journal(id);
      journalStats[id] = {
        count: list.length,
        broken: list.filter((e) => !e.hashOk || e.linkOk === false).length,
        gaps: list.filter((e) => e.linkOk === null).length - (list.length ? 1 : 0),
        lastSeq: list.at(-1)?.seq ?? 0,
      };
    }
    this.expireCommands();
    return {
      name: this.name,
      signPub: this.signPub,
      pairing: this.pairing && this.pairing.expiresAt > this.now() ? { code: this.pairing.code, expiresAt: this.pairing.expiresAt } : null,
      devices: Object.values(this.devices).sort((a, b) => b.pairedAt - a.pairedAt),
      commands: [...this.commands].reverse(),
      snapshots: this.snapshots,
      journalStats,
    };
  }

  journal(deviceId: string): StoredJournalEntry[] {
    return this.store.get<StoredJournalEntry[]>(`hub.journal.${deviceId}`) ?? [];
  }

  openPairing(operator: string) {
    this.pairing = { code: pairingCode(), expiresAt: this.now() + PAIR_TTL, attempts: 0 };
    void this.audit.append({ kind: 'session', actor: 'Human', summary: `${operator} mở cửa sổ ghép nối (120 giây)` });
    this.persist();
    return { code: this.pairing.code, expiresAt: this.pairing.expiresAt };
  }

  closePairing() {
    this.pairing = null;
    this.persist();
  }

  async handlePair(req: PairRequest, address = ''): Promise<{ ok: true; response: PairResponse } | { ok: false; status: number; reason: string }> {
    const w = this.pairing;
    if (!w || w.expiresAt < this.now()) return { ok: false, status: 403, reason: 'Máy quản trị chưa mở ghép nối hoặc mã đã hết hạn' };
    if (w.attempts >= MAX_ATTEMPTS) {
      this.pairing = null;
      return { ok: false, status: 429, reason: 'Nhập sai quá nhiều lần, hãy mở ghép nối lại' };
    }
    w.attempts++;
    if (!req || req.v !== 1 || typeof req.code !== 'string' || !safeEqual(req.code, w.code)) {
      void this.audit.append({ kind: 'grant.denied', actor: 'G', severity: 'warning', summary: `Mã ghép nối sai từ ${address || 'không rõ'}`, decision: 'deny' });
      this.persist();
      return { ok: false, status: 401, reason: 'Mã ghép nối không đúng' };
    }
    if (!req.signPub || !req.kxPub || !req.nonce) return { ok: false, status: 400, reason: 'Thiếu khóa thiết bị' };
    this.pairing = null;
    const id = randomId('dev', 6);
    const device: HubDevice = {
      id,
      name: String(req.device?.name ?? 'Thiết bị').slice(0, 60),
      platform: String(req.device?.platform ?? '').slice(0, 30),
      appVersion: String(req.device?.appVersion ?? '').slice(0, 20),
      signPub: req.signPub,
      kxPub: req.kxPub,
      pairedAt: this.now(),
      sas: await sas(this.signPub, req.signPub),
      lastAddress: address,
      upSeq: 0,
      downSeq: 0,
    };
    this.devices[id] = device;
    const response = await signPairResponse({ v: 1, deviceId: id, hubName: this.name, hubSignPub: this.signPub, hubKxPub: this.kxPub, nonce: req.nonce, pairedAt: device.pairedAt }, this.keys.sign.privateKey);
    await this.audit.append({ kind: 'session', actor: 'Human', severity: 'notice', summary: `Ghép nối thiết bị ${device.name} (${id}) · mã đối chiếu ${device.sas}`, decision: 'allow' });
    this.persist();
    return { ok: true, response };
  }

  private async sessionKey(d: HubDevice) {
    let k = this.sessionKeys.get(d.id);
    if (!k) {
      k = await deriveSessionKey(this.keys.kx.privateKey, d.kxPub, d.id);
      this.sessionKeys.set(d.id, k);
    }
    return k;
  }

  async handleSync(env: Envelope, address = ''): Promise<{ ok: true; response: Envelope } | { ok: false; status: number; reason: string }> {
    const d = env && this.devices[env.deviceId];
    if (!d || d.revoked) return { ok: false, status: 404, reason: 'Thiết bị chưa ghép nối hoặc đã bị gỡ' };
    const key = await this.sessionKey(d);
    const opened = await openEnvelope<UpPayload>(env, { expectedDir: 'up', lastSeq: d.upSeq, peerSignPub: d.signPub, sessionKey: key, now: this.now() });
    if (!opened.ok) {
      d.lastError = opened.reason;
      await this.audit.append({ kind: 'gate.deny', actor: 'Verifier', severity: 'warning', summary: `Từ chối gói đồng bộ từ ${d.name}: ${opened.reason}`, decision: 'deny' });
      this.persist();
      return { ok: false, status: 400, reason: opened.reason };
    }
    d.upSeq = env.seq;
    d.lastSeen = this.now();
    d.lastAddress = address || d.lastAddress;
    d.lastError = undefined;
    const p = opened.payload;
    if (p.snapshot) this.snapshots[d.id] = p.snapshot;
    if (Array.isArray(p.journal) && p.journal.length) await this.ingestJournal(d.id, p.journal);
    for (const r of p.results ?? []) {
      const c = this.commands.find((x) => x.id === r.id && x.deviceId === d.id);
      if (c && c.status !== 'done' && c.status !== 'failed') {
        c.status = r.ok ? 'done' : 'failed';
        c.result = r;
        await this.audit.append({ kind: 'note', actor: 'A', severity: r.ok ? 'info' : 'warning', summary: `${d.name}: ${COMMAND_LABEL[c.kind]} → ${r.ok ? 'đã áp dụng' : 'từ chối'} · ${r.message}`, decision: r.ok ? 'allow' : 'deny' });
      }
    }
    this.expireCommands();
    const pending = this.commands.filter((c) => c.deviceId === d.id && (c.status === 'queued' || c.status === 'delivered'));
    pending.forEach((c) => {
      if (c.status === 'queued') {
        c.status = 'delivered';
        c.deliveredAt = this.now();
      }
    });
    const down: DownPayload = {
      commands: pending.map(({ id, kind, params, issuedAt, expiresAt, issuedBy }) => ({ id, kind, params, issuedAt, expiresAt, issuedBy })),
      ackJournalSeq: this.journal(d.id).at(-1)?.seq ?? 0,
      hubTime: this.now(),
    };
    d.downSeq += 1;
    const response = await sealEnvelope({ deviceId: d.id, dir: 'down', seq: d.downSeq, payload: down, sessionKey: key, signKey: this.keys.sign.privateKey, now: this.now() });
    this.persist();
    return { ok: true, response };
  }

  private async ingestJournal(deviceId: string, entries: RemoteJournalEntry[]) {
    const list = this.journal(deviceId);
    const known = new Set(list.map((e) => e.seq));
    let prev = list.at(-1);
    for (const raw of entries.sort((a, b) => a.seq - b.seq)) {
      if (known.has(raw.seq)) continue;
      const v = await verifyRemoteEntry(raw, prev);
      const e: StoredJournalEntry = { ...raw, ...v };
      list.push(e);
      prev = e;
    }
    this.store.set(`hub.journal.${deviceId}`, list.slice(-MAX_ENTRIES));
  }

  queueCommand(deviceId: string, kind: CommandKind, params: AdminCommand['params'], operator: string, ttlMs = 15 * 60_000): HubCommandRecord | null {
    const d = this.devices[deviceId];
    if (!d || d.revoked) return null;
    const c: HubCommandRecord = { id: randomId('cmd', 6), deviceId, kind, params, issuedAt: this.now(), expiresAt: this.now() + ttlMs, issuedBy: operator, status: 'queued' };
    this.commands.push(c);
    void this.audit.append({ kind: 'policy.change', actor: 'Human', severity: 'notice', summary: `${operator} gửi lệnh "${COMMAND_LABEL[kind]}" tới ${d.name}`, data: { commandId: c.id, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`p_${k}`, v])) } });
    this.persist();
    return c;
  }

  private expireCommands() {
    for (const c of this.commands) if ((c.status === 'queued' || c.status === 'delivered') && c.expiresAt < this.now()) c.status = 'expired';
  }

  unpair(deviceId: string, operator: string) {
    const d = this.devices[deviceId];
    if (!d) return;
    d.revoked = true;
    this.sessionKeys.delete(deviceId);
    void this.audit.append({ kind: 'policy.revoke', actor: 'Human', severity: 'notice', summary: `${operator} gỡ ghép nối ${d.name}` });
    this.persist();
  }

  removeDevice(deviceId: string) {
    delete this.devices[deviceId];
    delete this.snapshots[deviceId];
    this.store.del(`hub.journal.${deviceId}`);
    this.commands = this.commands.filter((c) => c.deviceId !== deviceId);
    this.persist();
  }
}
