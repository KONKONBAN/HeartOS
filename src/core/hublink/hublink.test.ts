import { describe, expect, it } from 'vitest';
import { memoryJsonStore } from '../storage';
import { HubClient, normalizeHubUrl, type Transport } from './client';
import { HubCore } from './hubcore';
import type { DeviceSnapshot, Envelope, PairRequest } from './protocol';

const snap = (epoch: number): DeviceSnapshot => ({
  at: Date.now(),
  device: { name: 'Điện thoại An', platform: 'android', appVersion: '1.0.0', actingAs: 'u-an' },
  sentinel: {
    tenant: 'nha-an',
    epoch,
    security: { state: 'normal', exportBlocked: false, restricted: [], signals: 0 },
    R: { tokens: 1, capacity: 1, rate: 1, quotaRemaining: 1, quota: 1, replays: 0, denials: 0, releasedBytes: 0, locked: false, outstanding: 0 },
    hsm: { activeVersion: 1, versions: 1, generate: 0, release: 0, refused: 0 },
    ve: { name: 've', version: '1', measurement: 'm', accepted: true, tcb: 7 },
    gate: { released: 0, denied: 0 },
    vault: [],
    recovery: [],
    journalHead: { seq: 0, hash: '', count: 0 },
  },
  home: { mode: 'home', power: { mains: 'on', ats: 'mains', battery: 78, generator: 'standby' }, net: { lan: true, internet: true }, incidents: [], roomsFresh: 5, roomsTotal: 6, offlineDevices: [] },
  family: { members: [], permissions: [], syncPending: 0 },
});

async function setup() {
  const hub = await new HubCore(memoryJsonStore(), await HubCore.generateKeys(false), 'Máy quản trị').init();
  const transport: Transport = {
    async post(url, body) {
      const r = url.endsWith('/pair') ? await hub.handlePair(body as PairRequest, '192.168.1.20') : await hub.handleSync(body as Envelope, '192.168.1.20');
      return r.ok ? { status: 200, data: r.response } : { status: r.status, data: { error: r.reason } };
    },
  };
  let epoch = 42;
  const applied: string[] = [];
  const keys = { sign: await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair, kx: await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as CryptoKeyPair };
  const journal = [
    { seq: 1, id: 'evt-00001', ts: 1, kind: 'session', actor: 'A', severity: 'info', summary: 'a', prevHash: '0'.repeat(64), hash: '' },
  ];
  const client = new HubClient(memoryJsonStore(), keys, transport, { name: 'Điện thoại An', platform: 'android', appVersion: '1.0.0' }, {
    snapshot: () => snap(epoch),
    journalSince: (seq) => journal.filter((e) => e.seq > seq),
    apply: async (cmd) => {
      applied.push(cmd.kind);
      if (cmd.kind === 'bump_epoch') epoch++;
      return { ok: true, message: `epoch ${epoch}` };
    },
    epoch: () => epoch,
  });
  return { hub, client, applied, getEpoch: () => epoch };
}

describe('HubLink', () => {
  it('normalizes hub addresses', () => {
    expect(normalizeHubUrl('192.168.1.10')).toBe('http://192.168.1.10:7420');
    expect(normalizeHubUrl('http://pc.local:8000/')).toBe('http://pc.local:8000');
  });

  it('rejects pairing without an open window or with a wrong code', async () => {
    const { hub, client } = await setup();
    expect((await client.pair('127.0.0.1', '123456')).ok).toBe(false);
    hub.openPairing('Quản trị');
    const wrong = hub.view().pairing!.code === '000000' ? '111111' : '000000';
    expect((await client.pair('127.0.0.1', wrong)).ok).toBe(false);
  });

  it('pairs, syncs snapshot, delivers signed commands and receives results', async () => {
    const { hub, client, applied, getEpoch } = await setup();
    const { code } = hub.openPairing('Quản trị');
    const p = await client.pair('127.0.0.1', code);
    expect(p.ok).toBe(true);
    const devId = client.link!.deviceId;
    expect(hub.view().devices[0].sas).toBe(client.link!.sas);
    const s1 = await client.sync();
    expect(s1.error ?? 'ok').toBe('ok');
    expect(hub.view().snapshots[devId]?.sentinel.epoch).toBe(42);
    hub.queueCommand(devId, 'bump_epoch', { reason: 'test' }, 'Quản trị');
    const s2 = await client.sync();
    expect(s2.applied).toBe(1);
    expect(applied).toEqual(['bump_epoch']);
    expect(getEpoch()).toBe(43);
    await client.sync();
    const cmd = hub.view().commands[0];
    expect(cmd.status).toBe('done');
    expect(cmd.result?.epoch).toBe(43);
    await client.sync();
    expect(applied).toEqual(['bump_epoch']);
  });

  it('rejects replayed or tampered envelopes', async () => {
    const { hub, client } = await setup();
    const { code } = hub.openPairing('Quản trị');
    await client.pair('127.0.0.1', code);
    const captured: Envelope[] = [];
    const orig = (client as unknown as { transport: Transport }).transport;
    (client as unknown as { transport: Transport }).transport = {
      post: async (url, body) => {
        captured.push(body as Envelope);
        return orig.post(url, body);
      },
    };
    await client.sync();
    const replay = await hub.handleSync(captured[0]);
    expect(replay.ok).toBe(false);
    const tampered = { ...captured[0], seq: 99, ct: captured[0].ct.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
    expect((await hub.handleSync(tampered)).ok).toBe(false);
  });

  it('stops talking to an unpaired device', async () => {
    const { hub, client } = await setup();
    const { code } = hub.openPairing('Quản trị');
    await client.pair('127.0.0.1', code);
    hub.unpair(client.link!.deviceId, 'Quản trị');
    expect((await client.sync()).ok).toBe(false);
  });
});
