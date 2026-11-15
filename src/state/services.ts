/**
 * Dịch vụ dùng chung của ứng dụng: Sentinel (bảo vệ dữ liệu), HomeEngine (hub tại nhà),
 * khóa phê duyệt trên thiết bị (§3.8.2) và kho blob (ghi âm, ảnh).
 */
import { useSyncExternalStore } from 'react';
import { canonical, randomId, toB64 } from '../core/sentinel/encoding';
import { exportPub, genSigningKey, signObject } from '../core/sentinel/crypto';
import { Sentinel } from '../core/sentinel/sentinel';
import type { DirectoryEntry } from '../core/sentinel/types';
import { HomeEngine } from '../core/smarthome/engine';
import { indexedObjectStore, localJsonStore, type ObjectStore } from '../core/storage';

export const TENANT = 'nha-an';

export const json = localJsonStore('heartos:');
export const blobs: ObjectStore = indexedObjectStore('heartos', 'objects');

let sentinel: Sentinel | null = null;
let home: HomeEngine | null = null;
let ready: Promise<void> | null = null;
let approvalKey: { key: CryptoKeyPair; pub: string } | null = null;

export function directoryFrom(members: { id: string; name: string; role: DirectoryEntry['role']; guardian?: string; expiresAt?: number }[]): DirectoryEntry[] {
  return [
    ...members.map((m) => ({ id: m.id, name: m.name, tenant: TENANT, role: m.role, guardian: m.guardian, expiresAt: m.expiresAt })),
    { id: 'u-ops', name: 'Vận hành', tenant: TENANT, role: 'ops' as const },
    { id: 'svc-rhythm', name: 'Nhịp Nhà', tenant: TENANT, role: 'member' as const },
  ];
}

export function initServices(members: Parameters<typeof directoryFrom>[0]): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    sentinel = await Sentinel.create({ json, objects: blobs, tenant: TENANT, directory: directoryFrom(members) });
    home = new HomeEngine(json, Date.now, (kind, summary, severity) => {
      void sentinel?.log({ kind, actor: 'A', summary, severity: severity ?? 'info' });
    });
    const saved = await blobs.get<CryptoKeyPair>('approval.key');
    if (saved?.privateKey instanceof CryptoKey) approvalKey = { key: saved, pub: await exportPub(saved.publicKey) };
    else {
      const key = await genSigningKey();
      await blobs.set('approval.key', key);
      approvalKey = { key, pub: await exportPub(key.publicKey) };
    }
  })();
  return ready;
}

export function getSentinel(): Sentinel {
  if (!sentinel) throw new Error('Sentinel chưa sẵn sàng');
  return sentinel;
}

export function getHome(): HomeEngine {
  if (!home) throw new Error('Hub chưa sẵn sàng');
  return home;
}

export const servicesReady = () => !!sentinel && !!home;

/** Hook: render lại khi Sentinel thay đổi. */
export function useSentinel(): Sentinel {
  const s = getSentinel();
  useSyncExternalStore((cb) => s.subscribe(cb), () => s.version);
  return s;
}

/** Hook: render lại khi hub thay đổi. */
export function useHome(): HomeEngine {
  const h = getHome();
  useSyncExternalStore((cb) => h.subscribe(cb), () => h.version);
  return h;
}

export interface ApprovalRecord {
  id: string;
  content: string[];
  recipient: string;
  nonce: string;
  expiresAt: number;
  epoch: number;
  sig: string;
  pub: string;
  at: number;
}

/**
 * Khóa phê duyệt trên thiết bị: ký đúng nội dung đã hiển thị, đích nhận, nonce, thời hạn và epoch.
 * Khóa riêng không xuất được, lưu trong IndexedDB của thiết bị.
 */
export async function signApproval(content: string[], recipient: string): Promise<ApprovalRecord> {
  if (!approvalKey) throw new Error('Khóa phê duyệt chưa sẵn sàng');
  const s = getSentinel();
  const body = { content, recipient, nonce: randomId('apv', 8), expiresAt: Date.now() + 5 * 60_000, epoch: s.epoch() };
  const sig = await signObject(approvalKey.key.privateKey, body);
  const rec: ApprovalRecord = { id: body.nonce, ...body, sig, pub: approvalKey.pub, at: Date.now() };
  await s.log({ kind: 'approval', actor: 'Human', severity: 'notice', summary: `Phê duyệt trên thiết bị: ${content[0]}`, data: { approvalId: rec.id, recipient, digest: toB64(new TextEncoder().encode(canonical(body))).slice(0, 24) } });
  return rec;
}

export function approvalPub() {
  return approvalKey?.pub ?? '';
}

// ---------- Passkey (WebAuthn) ----------

export async function createPasskey(email: string): Promise<{ id: string; kind: 'webauthn' | 'device-key' }> {
  try {
    if (window.PublicKeyCredential && navigator.credentials?.create) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'HeartOS' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: email, displayName: email.split('@')[0] },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (cred) return { id: cred.id, kind: 'webauthn' };
    }
  } catch {
    /* thiết bị không hỗ trợ hoặc người dùng hủy — dùng khóa thiết bị */
  }
  return { id: randomId('devkey', 8), kind: 'device-key' };
}

export async function verifyPasskey(): Promise<boolean> {
  try {
    if (window.PublicKeyCredential && navigator.credentials?.get) {
      const c = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), timeout: 60_000, userVerification: 'preferred' } });
      return !!c;
    }
  } catch {
    return false;
  }
  return false;
}
