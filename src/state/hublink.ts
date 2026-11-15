import { useSyncExternalStore } from 'react';
import { HubClient, type Transport } from '../core/hublink/client';
import type { AdminCommand, DeviceSnapshot, RemoteJournalEntry } from '../core/hublink/protocol';
import { runAll } from '../core/sentinel/threats';
import { revokePermission } from './actions';
import { blobs, getHome, getSentinel, json } from './services';
import { getApp, memberName } from './store';

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, unknown> };
const cap = () => (window as unknown as { Capacitor?: Cap }).Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const platformName = () => cap()?.getPlatform?.() ?? 'web';

const transport: Transport = {
  async post(url, body) {
    if (isNative()) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const r = await CapacitorHttp.post({ url, headers: { 'Content-Type': 'application/json' }, data: body, connectTimeout: 8000, readTimeout: 15000 });
      const data = typeof r.data === 'string' ? safeJson(r.data) : r.data;
      return { status: r.status, data };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      return { status: res.status, data: safeJson(await res.text()) };
    } finally {
      clearTimeout(t);
    }
  },
};

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { error: s.slice(0, 200) };
  }
}

function snapshot(): DeviceSnapshot {
  const s = getSentinel();
  const home = getHome();
  const app = getApp();
  const R = s.R.snapshotView();
  const hsm = s.H.status(s.tenant);
  const inc = s.incident.view();
  const last = s.journal.all().at(-1);
  return {
    at: Date.now(),
    device: { name: '', platform: platformName(), appVersion: '1.0.0', actingAs: app.session.actingAs },
    sentinel: {
      tenant: s.tenant,
      epoch: s.epoch(),
      security: { state: inc.state, exportBlocked: inc.exportBlocked, restricted: inc.restrictedSessions, signals: inc.signals.length },
      R: { tokens: Math.round(R.bucket.tokens), capacity: R.bucket.capacity, rate: R.bucket.rate, quotaRemaining: Math.round(R.quotaRemaining), quota: R.bucket.quota, replays: R.stats.replays, denials: R.stats.denials, releasedBytes: R.stats.releasedBytes, locked: s.R.isLocked(s.tenant), outstanding: s.R.outstanding(s.tenant) },
      hsm: { activeVersion: hsm.activeVersion, versions: hsm.versions.length, generate: hsm.ops.generate, release: hsm.ops.release, refused: hsm.ops.refused },
      ve: { name: s.Ve.code.name, version: s.Ve.code.version, measurement: s.Ve.measurement, accepted: s.verifier.isAccepted(s.Ve.measurement), tcb: s.Ve.code.tcb },
      gate: { ...s.gate.stats },
      vault: s.vault.list().map((o) => ({ objectId: o.meta.objectId, label: o.meta.label, type: o.meta.type, version: o.meta.version, kekVersion: o.blob.kekVersion, owner: o.meta.owner, viewers: o.meta.viewers, purposes: o.meta.purposes, size: o.size })),
      recovery: s.recovery.list().map((c) => ({ id: c.id, status: c.status, createdAt: c.createdAt, objects: c.manifest.length, epochAt: c.epochAtCheckpoint })),
      journalHead: { seq: last?.seq ?? 0, hash: last?.hash ?? '', count: s.journal.all().length },
    },
    home: {
      mode: home.s.mode,
      power: { mains: home.s.power.mains, ats: home.s.power.ats, battery: Math.round(home.s.power.ups.battery), generator: home.s.power.generator },
      net: { lan: home.s.net.lan, internet: home.s.net.internet },
      incidents: home.openIncidents().map((i) => ({ id: i.id, title: i.title, priority: i.priority, status: i.status, createdAt: i.createdAt, assignee: i.assignee })),
      roomsFresh: home.freshRooms().length,
      roomsTotal: home.s.rooms.length,
      offlineDevices: home.s.devices.filter((d) => !d.online).map((d) => d.name),
    },
    family: {
      members: app.members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      permissions: app.permissions.map((p) => ({ id: p.id, title: p.title, owner: memberName(p.ownerId), status: p.status, viewers: p.viewers.filter((v) => v !== 'svc-rhythm').map((v) => memberName(v)) })),
      syncPending: app.syncJobs.flatMap((j) => j.devices).filter((d) => d.status === 'pending').length,
    },
  };
}

function journalSince(seq: number, limit: number): RemoteJournalEntry[] {
  return getSentinel()
    .journal.all()
    .filter((e) => e.seq > seq)
    .slice(0, limit) as RemoteJournalEntry[];
}

async function apply(cmd: AdminCommand): Promise<{ ok: boolean; message: string }> {
  const s = getSentinel();
  const home = getHome();
  const by = `máy quản trị (${cmd.issuedBy})`;
  const log = (summary: string, severity: 'info' | 'notice' | 'warning' | 'critical' = 'notice') => s.log({ kind: 'policy.change', actor: 'Human', severity, summary: `Lệnh từ ${by}: ${summary}`, epoch: s.epoch(), data: { commandId: cmd.id } });
  switch (cmd.kind) {
    case 'ping':
      return { ok: true, message: 'Thiết bị phản hồi' };
    case 'bump_epoch': {
      const e = s.R.bumpEpoch(s.tenant);
      await log(`tăng thế hệ quyền lên ${e} (${cmd.params.reason ?? ''})`, 'warning');
      return { ok: true, message: `Thế hệ quyền ${e}` };
    }
    case 'lock_vault':
      s.R.setLock(s.tenant, true);
      await log('khóa đường đọc trong két', 'critical');
      return { ok: true, message: 'Đã khóa đường đọc' };
    case 'unlock_vault':
      if (s.incident.view().state === 'isolated') return { ok: false, message: 'Đang ở trạng thái cô lập, cần mở lại qua quy trình phục hồi trên thiết bị' };
      s.R.setLock(s.tenant, false);
      await log('mở đường đọc trong két');
      return { ok: true, message: 'Đã mở đường đọc' };
    case 'restrict_member': {
      const id = String(cmd.params.memberId ?? '');
      if (!getApp().members.some((m) => m.id === id)) return { ok: false, message: 'Không có thành viên này' };
      s.incident.restrictSession(id);
      await log(`hạn chế phiên của ${memberName(id)}`, 'warning');
      return { ok: true, message: `Đã hạn chế ${memberName(id)}` };
    }
    case 'signal':
      s.incident.signal({ kind: 'manual', evidence: [cmd.id], note: String(cmd.params.note ?? 'Tín hiệu từ máy quản trị'), source: 'human' });
      await log('gửi tín hiệu nghi vấn', 'warning');
      return { ok: true, message: `Trạng thái: ${s.incident.view().state}` };
    case 'checkpoint': {
      const c = await s.checkpoint('admin-pc');
      return { ok: true, message: `Đã niêm phong ${c.id} (${c.manifest.length} đối tượng)` };
    }
    case 'verify_journal': {
      const r = await s.journal.verify();
      return { ok: r.ok, message: r.ok ? `Chuỗi nguyên vẹn (${r.checked} bản ghi)` : `Hỏng tại #${r.brokenAt}` };
    }
    case 'revoke_permission': {
      const p = getApp().permissions.find((x) => x.id === cmd.params.permissionId);
      if (!p) return { ok: false, message: 'Không có quyền này' };
      if (p.status === 'revoked') return { ok: true, message: 'Quyền đã được thu hồi trước đó' };
      await revokePermission(p.id, 'u-an', `Lệnh từ ${by}`);
      return { ok: true, message: `Đã thu hồi ${p.title}, thế hệ quyền ${s.epoch()}` };
    }
    case 'set_bucket': {
      const capacity = Number(cmd.params.capacity);
      const rate = Number(cmd.params.rate);
      if (!(capacity >= 1024 && capacity <= 64 * 1024 * 1024 && rate >= 1 && rate <= capacity)) return { ok: false, message: 'Tham số ngoài phạm vi cho phép' };
      s.R.configureBucket({ capacity, rate });
      await log(`đặt hạn mức B=${capacity}, r=${rate}`);
      return { ok: true, message: `B=${capacity} byte, r=${rate} byte/giây` };
    }
    case 'run_scenarios': {
      const res = await runAll();
      const passed = res.filter((r) => r.passed).length;
      await log(`chạy ${res.length} kịch bản T1–T7: ${passed} đạt`, 'info');
      return { ok: passed === res.length, message: `${passed}/${res.length} kịch bản đạt` };
    }
    case 'set_mode': {
      const m = String(cmd.params.mode);
      if (!['home', 'away', 'night'].includes(m)) return { ok: false, message: 'Chế độ không hợp lệ' };
      home.setMode(m as 'home' | 'away' | 'night', { id: 'admin-pc', name: 'Máy quản trị', role: 'system' });
      return { ok: true, message: `Chế độ ${m}` };
    }
    case 'close_incident': {
      const inc = home.incident(String(cmd.params.incidentId));
      if (!inc) return { ok: false, message: 'Không có ca này' };
      home.closeIncident(inc.id, `Đóng từ ${by}`, { id: 'admin-pc', name: 'Máy quản trị', role: 'system' });
      return { ok: true, message: `Đã đóng ${inc.id}` };
    }
    default:
      return { ok: false, message: 'Lệnh không được hỗ trợ' };
  }
}

let client: HubClient | null = null;
let ready: Promise<HubClient> | null = null;
let timer: number | undefined;
let ver = 0;

export function initHubLink(deviceName: () => string): Promise<HubClient> {
  if (ready) return ready;
  ready = (async () => {
    let keys = await blobs.get<{ sign: CryptoKeyPair; kx: CryptoKeyPair }>('hublink.keys');
    if (!keys || !(keys.sign?.privateKey instanceof CryptoKey) || !(keys.kx?.privateKey instanceof CryptoKey)) {
      keys = {
        sign: (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair,
        kx: (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])) as CryptoKeyPair,
      };
      await blobs.set('hublink.keys', keys);
    }
    const c = new HubClient(json, keys, transport, { name: deviceName(), platform: platformName(), appVersion: '1.0.0' }, {
      snapshot: () => {
        const sn = snapshot();
        sn.device.name = c.link?.deviceName ?? deviceName();
        return sn;
      },
      journalSince,
      apply,
      epoch: () => getSentinel().epoch(),
    });
    c.subscribe(() => {
      ver++;
    });
    client = c;
    startLoop();
    return c;
  })();
  return ready;
}

function startLoop() {
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (client?.link && document.visibilityState !== 'hidden') void client.sync();
  }, 5000);
}

export function getHubClient() {
  return client;
}

export function useHubLink() {
  useSyncExternalStore(
    (cb) => (client ? client.subscribe(cb) : () => undefined),
    () => ver,
  );
  return client;
}
