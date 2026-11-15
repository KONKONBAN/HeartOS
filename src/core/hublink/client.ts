import type { JsonStore } from '../storage';
import { exportPub } from '../sentinel/crypto';
import {
  COMMAND_LABEL,
  deriveSessionKey,
  newNonce,
  openEnvelope,
  sas,
  sealEnvelope,
  verifyPairResponse,
  type AdminCommand,
  type CommandResult,
  type DeviceSnapshot,
  type DownPayload,
  type Envelope,
  type PairRequest,
  type PairResponse,
  type RemoteJournalEntry,
  type UpPayload,
} from './protocol';

export interface LinkState {
  hubUrl: string;
  deviceName: string;
  deviceId: string;
  hubName: string;
  hubSignPub: string;
  hubKxPub: string;
  sas: string;
  pairedAt: number;
  upSeq: number;
  downSeq: number;
  ackJournalSeq: number;
  lastSync?: number;
  lastError?: string;
  seen: string[];
  pendingResults: CommandResult[];
  history: { at: number; kind: string; label: string; ok: boolean; message: string; by: string }[];
}

export interface Transport {
  post(url: string, body: unknown): Promise<{ status: number; data: unknown }>;
}

export interface ClientDeps {
  snapshot(): DeviceSnapshot;
  journalSince(seq: number, limit: number): RemoteJournalEntry[];
  apply(cmd: AdminCommand): Promise<{ ok: boolean; message: string }>;
  epoch(): number;
}

export function normalizeHubUrl(input: string) {
  let u = input.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  const url = new URL(u);
  if (!url.port && url.protocol === 'http:') url.port = '7420';
  return url.origin;
}

export class HubClient {
  private state: LinkState | null;
  private sessionKey: CryptoKey | null = null;
  private busy = false;
  private listeners = new Set<() => void>();

  constructor(
    private store: JsonStore,
    private keys: { sign: CryptoKeyPair; kx: CryptoKeyPair },
    private transport: Transport,
    private device: { name: string; platform: string; appVersion: string },
    private deps: ClientDeps,
    private now: () => number = Date.now,
    private storeKey = 'hublink.state',
  ) {
    this.state = store.get<LinkState>(storeKey) ?? null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get link(): Readonly<LinkState> | null {
    return this.state;
  }

  private save() {
    if (this.state) this.store.set(this.storeKey, this.state);
    else this.store.del(this.storeKey);
    this.listeners.forEach((l) => l());
  }

  async pair(hubUrl: string, code: string, deviceName?: string): Promise<{ ok: true; sas: string; hubName: string } | { ok: false; error: string }> {
    let url: string;
    try {
      url = normalizeHubUrl(hubUrl);
    } catch {
      return { ok: false, error: 'Địa chỉ máy quản trị không hợp lệ' };
    }
    if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Mã ghép nối gồm 6 chữ số' };
    const nonce = newNonce();
    const signPub = await exportPub(this.keys.sign.publicKey);
    const device = { ...this.device, name: (deviceName ?? '').trim() || this.device.name };
    const req: PairRequest = { v: 1, code: code.trim(), device, signPub, kxPub: await exportPub(this.keys.kx.publicKey), nonce };
    let res: { status: number; data: unknown };
    try {
      res = await this.transport.post(`${url}/api/v1/pair`, req);
    } catch (e) {
      return { ok: false, error: `Không kết nối được ${url}: ${(e as Error).message}` };
    }
    if (res.status !== 200) return { ok: false, error: (res.data as { error?: string })?.error ?? `Máy quản trị trả mã ${res.status}` };
    const pr = res.data as PairResponse;
    if (!(await verifyPairResponse(pr, nonce))) return { ok: false, error: 'Phản hồi ghép nối không có chữ ký hợp lệ của máy quản trị' };
    const code6 = await sas(pr.body.hubSignPub, signPub);
    this.state = {
      hubUrl: url,
      deviceName: device.name,
      deviceId: pr.body.deviceId,
      hubName: pr.body.hubName,
      hubSignPub: pr.body.hubSignPub,
      hubKxPub: pr.body.hubKxPub,
      sas: code6,
      pairedAt: pr.body.pairedAt,
      upSeq: 0,
      downSeq: 0,
      ackJournalSeq: 0,
      seen: [],
      pendingResults: [],
      history: [],
    };
    this.sessionKey = null;
    this.save();
    return { ok: true, sas: code6, hubName: pr.body.hubName };
  }

  unpair() {
    this.state = null;
    this.sessionKey = null;
    this.save();
  }

  private async getSessionKey() {
    if (!this.state) throw new Error('Chưa ghép nối');
    if (!this.sessionKey) this.sessionKey = await deriveSessionKey(this.keys.kx.privateKey, this.state.hubKxPub, this.state.deviceId);
    return this.sessionKey;
  }

  async sync(): Promise<{ ok: boolean; applied: number; error?: string }> {
    const s = this.state;
    if (!s) return { ok: false, applied: 0, error: 'Chưa ghép nối' };
    if (this.busy) return { ok: true, applied: 0 };
    this.busy = true;
    try {
      const key = await this.getSessionKey();
      const payload: UpPayload = { snapshot: this.deps.snapshot(), journal: this.deps.journalSince(s.ackJournalSeq, 150), results: s.pendingResults };
      const seq = s.upSeq + 1;
      const env = await sealEnvelope({ deviceId: s.deviceId, dir: 'up', seq, payload, sessionKey: key, signKey: this.keys.sign.privateKey, now: this.now() });
      s.upSeq = seq;
      this.save();
      const res = await this.transport.post(`${s.hubUrl}/api/v1/sync`, env);
      if (res.status !== 200) throw new Error((res.data as { error?: string })?.error ?? `Máy quản trị trả mã ${res.status}`);
      const opened = await openEnvelope<DownPayload>(res.data as Envelope, { expectedDir: 'down', lastSeq: s.downSeq, peerSignPub: s.hubSignPub, sessionKey: key, now: this.now() });
      if (!opened.ok) throw new Error('Phản hồi máy quản trị bị từ chối: ' + opened.reason);
      s.downSeq = (res.data as Envelope).seq;
      s.pendingResults = [];
      s.ackJournalSeq = Math.max(s.ackJournalSeq, opened.payload.ackJournalSeq);
      let applied = 0;
      for (const cmd of opened.payload.commands) {
        if (s.seen.includes(cmd.id)) continue;
        s.seen = [...s.seen, cmd.id].slice(-300);
        let r: { ok: boolean; message: string };
        if (cmd.expiresAt < this.now()) r = { ok: false, message: 'Lệnh đã hết hạn' };
        else {
          try {
            r = await this.deps.apply(cmd);
          } catch (e) {
            r = { ok: false, message: (e as Error).message };
          }
        }
        s.pendingResults.push({ id: cmd.id, ok: r.ok, message: r.message, at: this.now(), epoch: this.deps.epoch() });
        s.history = [{ at: this.now(), kind: cmd.kind, label: COMMAND_LABEL[cmd.kind] ?? cmd.kind, ok: r.ok, message: r.message, by: cmd.issuedBy }, ...s.history].slice(0, 60);
        applied++;
      }
      s.lastSync = this.now();
      s.lastError = undefined;
      this.save();
      return { ok: true, applied };
    } catch (e) {
      if (this.state) {
        this.state.lastError = (e as Error).message;
        this.save();
      }
      return { ok: false, applied: 0, error: (e as Error).message };
    } finally {
      this.busy = false;
    }
  }
}
