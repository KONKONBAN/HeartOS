import fs from 'node:fs';
import { HubCore, type HubKeys } from '../../src/core/hublink/hubcore';

export type KeyProtection = 'os' | 'file';

export interface Protector {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

interface KeyFile {
  v: 1;
  protection: KeyProtection;
  payload: string;
}

async function importPair(sign: JsonWebKey[], kx: JsonWebKey[]): Promise<HubKeys> {
  const s = crypto.subtle;
  return {
    sign: {
      privateKey: await s.importKey('jwk', sign[0], { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
      publicKey: await s.importKey('jwk', sign[1], { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']),
    },
    kx: {
      privateKey: await s.importKey('jwk', kx[0], { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
      publicKey: await s.importKey('jwk', kx[1], { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    },
  };
}

export async function loadOrCreateHubKeys(file: string, protector?: Protector): Promise<{ keys: HubKeys; protection: KeyProtection }> {
  if (fs.existsSync(file)) {
    const kf = JSON.parse(fs.readFileSync(file, 'utf8')) as KeyFile;
    const json = kf.protection === 'os' && protector ? protector.decrypt(Buffer.from(kf.payload, 'base64')) : Buffer.from(kf.payload, 'base64').toString('utf8');
    const { sign, kx } = JSON.parse(json) as { sign: JsonWebKey[]; kx: JsonWebKey[] };
    return { keys: await importPair(sign, kx), protection: kf.protection };
  }
  const k = await HubCore.generateKeys(true);
  const exp = async (p: CryptoKeyPair) => [await crypto.subtle.exportKey('jwk', p.privateKey), await crypto.subtle.exportKey('jwk', p.publicKey)];
  const json = JSON.stringify({ sign: await exp(k.sign), kx: await exp(k.kx) });
  const protection: KeyProtection = protector?.available() ? 'os' : 'file';
  const payload = protection === 'os' ? protector!.encrypt(json).toString('base64') : Buffer.from(json, 'utf8').toString('base64');
  fs.writeFileSync(file, JSON.stringify({ v: 1, protection, payload } satisfies KeyFile), { mode: 0o600 });
  const parsed = JSON.parse(json) as { sign: JsonWebKey[]; kx: JsonWebKey[] };
  return { keys: await importPair(parsed.sign, parsed.kx), protection };
}
