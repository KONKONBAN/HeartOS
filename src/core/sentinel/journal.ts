/**
 * J — Miền bằng chứng (§3.6, §3.12).
 * Nhật ký nối chuỗi băm SHA-256, root Merkle để neo ở nơi kiểm chứng độc lập.
 * Không ghi DEK, token, mật khẩu hoặc toàn bộ bản rõ; AI chỉ đọc bản giảm nhạy cảm.
 */
import type { JsonStore } from '../storage';
import { canonical, randomBytes, sha256Hex, toHex } from './encoding';
import type { Actor } from './types';

export type JournalKind =
  | 'session'
  | 'grant.issued'
  | 'grant.denied'
  | 'gate.release'
  | 'gate.deny'
  | 'vault.write'
  | 'vault.read'
  | 'policy.change'
  | 'policy.revoke'
  | 'epoch.bump'
  | 'attest.ok'
  | 'attest.fail'
  | 'budget.deny'
  | 'replay.block'
  | 'incident.signal'
  | 'incident.state'
  | 'ai.proposal'
  | 'ai.executed'
  | 'ai.rejected'
  | 'source.health'
  | 'source.gate'
  | 'recovery.checkpoint'
  | 'recovery.step'
  | 'recovery.denied'
  | 'device.sync'
  | 'smarthome.command'
  | 'guardian.event'
  | 'approval'
  | 'note';

export type Severity = 'info' | 'notice' | 'warning' | 'critical';

export interface JournalEntry {
  seq: number;
  id: string;
  ts: number;
  kind: JournalKind;
  actor: Actor;
  severity: Severity;
  summary: string;
  subject?: string;
  objectId?: string;
  decision?: 'allow' | 'deny' | 'pending';
  epoch?: number;
  data?: Record<string, string | number | boolean | null>;
  prevHash: string;
  hash: string;
}

const FORBIDDEN_KEYS = /^(dek|kek|plaintext|password|token|secret|privateKey|opening)$/i;
const GENESIS = '0'.repeat(64);

export interface JournalInput {
  kind: JournalKind;
  actor: Actor;
  summary: string;
  severity?: Severity;
  subject?: string;
  objectId?: string;
  decision?: 'allow' | 'deny' | 'pending';
  epoch?: number;
  data?: Record<string, unknown>;
}

export class Journal {
  private entries: JournalEntry[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private salt: string;

  constructor(private store: JsonStore, private key = 'sentinel.journal', private cap = 800, private now: () => number = Date.now) {
    this.entries = store.get<JournalEntry[]>(key) ?? [];
    this.salt = store.get<string>(key + '.salt') ?? toHex(randomBytes(16));
    store.set(key + '.salt', this.salt);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  all(): readonly JournalEntry[] {
    return this.entries;
  }

  /** Ghi sự kiện. Thứ tự được tuần tự hóa để chuỗi băm không bị rẽ nhánh. */
  append(input: JournalInput): Promise<JournalEntry> {
    const run = this.queue.then(() => this.doAppend(input));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doAppend(input: JournalInput): Promise<JournalEntry> {
    const last = this.entries[this.entries.length - 1];
    const seq = (last?.seq ?? 0) + 1;
    const data = sanitize(input.data);
    const body = {
      seq,
      id: `evt-${String(seq).padStart(5, '0')}`,
      ts: this.now(),
      kind: input.kind,
      actor: input.actor,
      severity: input.severity ?? 'info',
      summary: input.summary,
      subject: input.subject,
      objectId: input.objectId,
      decision: input.decision,
      epoch: input.epoch,
      data,
      prevHash: last?.hash ?? GENESIS,
    };
    const hash = await sha256Hex(canonical(body));
    const entry: JournalEntry = { ...body, hash };
    this.entries.push(entry);
    if (this.entries.length > this.cap) {
      // Bản vận hành giữ cửa sổ gần nhất; mốc băm đầu cửa sổ vẫn kiểm được qua prevHash.
      this.entries = this.entries.slice(this.entries.length - this.cap);
    }
    this.store.set(this.key, this.entries);
    this.listeners.forEach((l) => l());
    return entry;
  }

  /** Kiểm tra lại toàn bộ chuỗi; trả về vị trí hỏng đầu tiên nếu có. */
  async verify(): Promise<{ ok: boolean; checked: number; brokenAt?: number }> {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const { hash, ...body } = e;
      if (i > 0 && e.prevHash !== this.entries[i - 1].hash) return { ok: false, checked: i, brokenAt: e.seq };
      if ((await sha256Hex(canonical(body))) !== hash) return { ok: false, checked: i, brokenAt: e.seq };
    }
    return { ok: true, checked: this.entries.length };
  }

  /** Root Merkle của các băm sự kiện — cam kết mật mã tối thiểu để neo (không chứa bản rõ). */
  async merkleRoot(): Promise<string> {
    let level = this.entries.map((e) => e.hash);
    if (level.length === 0) return GENESIS;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const a = level[i];
        const b = level[i + 1] ?? a;
        next.push(await sha256Hex(a + b));
      }
      level = next;
    }
    return level[0];
  }

  /** Bản giảm nhạy cảm cho AI: định danh chủ thể được giả danh bằng HMAC-like salt cục bộ. */
  async redactedForAI(limit = 120) {
    const slice = this.entries.slice(-limit);
    const out = [];
    for (const e of slice) {
      out.push({
        id: e.id,
        ts: e.ts,
        kind: e.kind,
        actor: e.actor,
        severity: e.severity,
        decision: e.decision,
        summary: e.summary,
        subject: e.subject ? 'sub-' + (await sha256Hex(this.salt + e.subject)).slice(0, 8) : undefined,
        objectId: e.objectId,
        data: e.data,
      });
    }
    return out;
  }

  /** Mô phỏng sửa đổi trái phép một bản ghi (dùng trong phòng thí nghiệm để thấy verify() phát hiện). */
  tamperForDemo(seq: number, summary: string) {
    const e = this.entries.find((x) => x.seq === seq);
    if (e) {
      e.summary = summary;
      this.store.set(this.key, this.entries);
      this.listeners.forEach((l) => l());
    }
  }

  clear() {
    this.entries = [];
    this.store.set(this.key, this.entries);
    this.listeners.forEach((l) => l());
  }
}

function sanitize(data?: Record<string, unknown>): JournalEntry['data'] {
  if (!data) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FORBIDDEN_KEYS.test(k)) {
      out[k] = '[đã loại khỏi log]';
      continue;
    }
    if (v === undefined) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else {
      const s = String(v);
      out[k] = s.length > 160 ? s.slice(0, 157) + '…' : s;
    }
  }
  return out;
}
