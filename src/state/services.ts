import { useSyncExternalStore } from 'react';
import { canonical, randomId, toB64 } from '../core/sentinel/encoding';
import { exportPub, genSigningKey, signObject, verifyObject } from '../core/sentinel/crypto';
import { Sentinel } from '../core/sentinel/sentinel';
import type { DirectoryEntry } from '../core/sentinel/types';
import { HomeEngine } from '../core/smarthome/engine';
import { encryptedJsonStore, openAtRest, type AtRest } from '../core/atrest';
import { indexedObjectStore, memoryJsonStore, type JsonStore, type ObjectStore } from '../core/storage';

export const TENANT = 'heartos-home';

export const blobs: ObjectStore = indexedObjectStore('heartos', 'objects');
export let json: JsonStore = memoryJsonStore();

let atRestKey: Promise<AtRest> | null = null;
export const atRest = () => (atRestKey ??= openAtRest(blobs));

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
    json = await encryptedJsonStore('heartos:', await atRest());
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

export function syncDirectory(members: Parameters<typeof directoryFrom>[0]) {
  sentinel?.directory.replace(directoryFrom(members));
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

export function useSentinel(): Sentinel {
  const s = getSentinel();
  useSyncExternalStore((cb) => s.subscribe(cb), () => s.version);
  return s;
}

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

async function platformAuthenticator(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) return false;
    return await Promise.race([PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(), new Promise<boolean>((r) => setTimeout(() => r(false), 1500))]);
  } catch {
    return false;
  }
}

export async function deviceKeyAuth(): Promise<boolean> {
  if (!approvalKey) return false;
  const challenge = { purpose: 'sign-in', nonce: randomId('auth', 12), at: Date.now() };
  const sig = await signObject(approvalKey.key.privateKey, challenge);
  return verifyObject(approvalKey.key.publicKey, challenge, sig);
}

export async function createPasskey(email: string): Promise<{ id: string; kind: 'webauthn' | 'device-key' }> {
  try {
    if (await platformAuthenticator()) {
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
    return { id: randomId('devkey', 8), kind: 'device-key' };
  }
  return { id: randomId('devkey', 8), kind: 'device-key' };
}

export async function verifyPasskey(kind: 'webauthn' | 'device-key' | undefined): Promise<boolean> {
  if (kind === 'webauthn' && (await platformAuthenticator())) {
    try {
      const c = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), timeout: 60_000, userVerification: 'preferred' } });
      return !!c;
    } catch {
      return false;
    }
  }
  return deviceKeyAuth();
}
