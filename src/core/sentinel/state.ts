import type { JsonStore } from '../storage';

export interface BucketConfig {
  capacity: number;
  rate: number;
  quota: number;
  windowMs: number;
}

export type ReservationStatus = 'reserved' | 'settled' | 'unknown' | 'refunded';

export interface Reservation {
  id: string;
  tenant: string;
  bytes: number;
  used?: number;
  status: ReservationStatus;
  at: number;
}

export interface RState {
  version: number;
  initialEpoch: number;
  epochs: Record<string, number>;
  usedNonces: Record<string, number>;
  bucket: BucketConfig & { tokens: number; updatedAt: number };
  quotaRemaining: number;
  windowStart: number;
  reservations: Record<string, Reservation>;
  highWater: { epochs: Record<string, number>; consumed: number };
  locks: Record<string, boolean>;
  stats: { releasedBytes: number; denials: number; replays: number };
}

export const DEFAULT_BUCKET: BucketConfig = {
  capacity: 64 * 1024,
  rate: 2 * 1024,
  quota: 4 * 1024 * 1024,
  windowMs: 24 * 3600_000,
};

export type ReserveResult =
  | { ok: true; reservation: Reservation; tokensLeft: number; quotaLeft: number }
  | { ok: false; reason: 'replay' | 'burst' | 'quota' | 'locked' | 'invalid'; detail: string };

export class StateService {
  private s: RState;
  private listeners = new Set<() => void>();

  constructor(private store: JsonStore, private key = 'sentinel.R', private now: () => number = Date.now, initialEpoch = 42) {
    const saved = store.get<RState>(key);
    this.s = saved ?? StateService.fresh(now(), initialEpoch);
    this.persist();
  }

  static fresh(t: number, initialEpoch = 42, bucket: BucketConfig = DEFAULT_BUCKET): RState {
    return {
      version: 1,
      initialEpoch,
      epochs: {},
      usedNonces: {},
      bucket: { ...bucket, tokens: bucket.capacity, updatedAt: t },
      quotaRemaining: bucket.quota,
      windowStart: t,
      reservations: {},
      highWater: { epochs: {}, consumed: 0 },
      locks: {},
      stats: { releasedBytes: 0, denials: 0, replays: 0 },
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    this.store.set(this.key, this.s);
    this.listeners.forEach((l) => l());
  }

  snapshotView(): Readonly<RState> {
    this.refill();
    return this.s;
  }

  epoch(tenant: string): number {
    return Math.max(this.s.epochs[tenant] ?? this.s.initialEpoch ?? 42, this.s.highWater.epochs[tenant] ?? 0);
  }

  bumpEpoch(tenant: string): number {
    const next = this.epoch(tenant) + 1;
    this.s.epochs[tenant] = next;
    this.s.highWater.epochs[tenant] = Math.max(next, this.s.highWater.epochs[tenant] ?? 0);
    this.persist();
    return next;
  }

  isLocked(tenant: string) {
    return !!this.s.locks[tenant];
  }

  setLock(tenant: string, locked: boolean) {
    this.s.locks[tenant] = locked;
    this.persist();
  }

  private refill() {
    const t = this.now();
    const b = this.s.bucket;
    const dt = Math.max(0, (t - b.updatedAt) / 1000);
    b.tokens = Math.min(b.capacity, b.tokens + dt * b.rate);
    b.updatedAt = t;
    if (t - this.s.windowStart >= b.windowMs) {
      this.s.windowStart = t;
      this.s.quotaRemaining = b.quota;
    }
    for (const [n, exp] of Object.entries(this.s.usedNonces)) if (exp + 600_000 < t) delete this.s.usedNonces[n];
  }

  hasNonce(nonce: string) {
    return nonce in this.s.usedNonces;
  }

  checkAndReserve(tenant: string, nonce: string, bytes: number, nonceExpiresAt: number, reservationId: string): ReserveResult {
    this.refill();
    if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, reason: 'invalid', detail: 'Kích thước đặt chỗ không hợp lệ' };
    if (this.isLocked(tenant)) {
      this.s.stats.denials++;
      this.persist();
      return { ok: false, reason: 'locked', detail: 'Đường đọc trong két đang bị khóa do sự cố' };
    }
    if (this.hasNonce(nonce)) {
      this.s.stats.replays++;
      this.persist();
      return { ok: false, reason: 'replay', detail: `Mã chống dùng lại ${nonce.slice(0, 10)}… đã được dùng` };
    }
    this.s.usedNonces[nonce] = nonceExpiresAt;
    const b = this.s.bucket;
    if (bytes > b.tokens) {
      this.s.stats.denials++;
      this.persist();
      return { ok: false, reason: 'burst', detail: `Cần ${fmt(bytes)}, bucket còn ${fmt(b.tokens)} (B=${fmt(b.capacity)}, r=${fmt(b.rate)}/s)` };
    }
    if (bytes > this.s.quotaRemaining) {
      this.s.stats.denials++;
      this.persist();
      return { ok: false, reason: 'quota', detail: `Hạn mức còn ${fmt(this.s.quotaRemaining)} < ${fmt(bytes)}` };
    }
    b.tokens -= bytes;
    this.s.quotaRemaining -= bytes;
    this.s.highWater.consumed += bytes;
    const reservation: Reservation = { id: reservationId, tenant, bytes, status: 'reserved', at: this.now() };
    this.s.reservations[reservationId] = reservation;
    this.pruneReservations();
    this.persist();
    return { ok: true, reservation, tokensLeft: b.tokens, quotaLeft: this.s.quotaRemaining };
  }

  settle(reservationId: string, used: number, clean: boolean) {
    const r = this.s.reservations[reservationId];
    if (!r || r.status !== 'reserved') return;
    r.used = Math.min(used, r.bytes);
    this.s.stats.releasedBytes += r.used;
    if (clean && r.used < r.bytes) {
      const refund = r.bytes - r.used;
      this.s.quotaRemaining = Math.min(this.s.bucket.quota, this.s.quotaRemaining + refund);
      r.status = 'refunded';
    } else r.status = 'settled';
    this.persist();
  }

  markUnknown(reservationId: string) {
    const r = this.s.reservations[reservationId];
    if (r && r.status === 'reserved') {
      r.status = 'unknown';
      this.persist();
    }
  }

  outstanding(tenant?: string): number {
    return Object.values(this.s.reservations)
      .filter((r) => (r.status === 'reserved' || r.status === 'unknown') && (!tenant || r.tenant === tenant))
      .reduce((n, r) => n + r.bytes, 0);
  }

  private pruneReservations() {
    const list = Object.values(this.s.reservations).sort((a, b) => a.at - b.at);
    while (list.length > 300) {
      const r = list.shift()!;
      if (r.status !== 'reserved') delete this.s.reservations[r.id];
    }
  }

  configureBucket(cfg: Partial<BucketConfig>) {
    this.refill();
    const b = this.s.bucket;
    Object.assign(b, cfg);
    b.tokens = Math.min(b.tokens, b.capacity);
    this.s.quotaRemaining = Math.min(this.s.quotaRemaining, b.quota);
    this.persist();
  }

  snapshot(): RState {
    this.refill();
    return JSON.parse(JSON.stringify(this.s));
  }

  restoreSnapshot(old: RState) {
    this.refill();
    const cur = this.s;
    const epochs: Record<string, number> = {};
    for (const t of new Set([...Object.keys(cur.epochs), ...Object.keys(old.epochs), ...Object.keys(cur.highWater.epochs)])) {
      epochs[t] = Math.max(cur.epochs[t] ?? 0, old.epochs[t] ?? 0, cur.highWater.epochs[t] ?? 0);
    }
    this.s = {
      ...cur,
      epochs,
      usedNonces: { ...old.usedNonces, ...cur.usedNonces },
      bucket: { ...cur.bucket, tokens: Math.min(cur.bucket.tokens, old.bucket.tokens) },
      quotaRemaining: Math.min(cur.quotaRemaining, old.quotaRemaining),
      highWater: { epochs: { ...cur.highWater.epochs }, consumed: Math.max(cur.highWater.consumed, old.highWater.consumed) },
    };
    this.persist();
  }

  simulateRestart() {
    const saved = this.store.get<RState>(this.key);
    if (saved) this.s = saved;
    this.persist();
  }

  reset(initialEpoch = 42) {
    this.s = StateService.fresh(this.now(), initialEpoch);
    this.persist();
  }
}

export function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2).replace('.', ',') + ' MiB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KiB';
  return Math.round(bytes) + ' B';
}
