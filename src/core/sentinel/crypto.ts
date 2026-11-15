/**
 * Nguyên thủy mật mã của Sentinel — chỉ dùng WebCrypto (thư viện được duy trì, §3.6: "Không tự thiết kế thuật toán").
 *  - AEAD: AES-256-GCM, nonce 96 bit ngẫu nhiên, AAD gắn ngữ cảnh (3.11–3.12).
 *  - Chữ ký: ECDSA P-256/SHA-256 cho grant và báo cáo chứng thực.
 *  - Chuyển khóa gắn người nhận: ECDH P-256 → HKDF-SHA-256 (info = ngữ cảnh) → AES-KW.
 *  - Niêm phong cho đích đã xác minh: ECIES (ECDH tạm thời + HKDF + AES-GCM).
 */
import { buf, canonical, concatBytes, fromB64, randomBytes, sha256, toB64, toB64Url, utf8 } from './encoding';

const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto không khả dụng trong môi trường này.');
  return globalThis.crypto.subtle;
};

export const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const;
export const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export async function genSigningKey(): Promise<CryptoKeyPair> {
  // Khóa riêng không xuất được: chỉ ký trong phạm vi chủ thể giữ khóa.
  return subtle().generateKey(EC, false, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

export async function genEcdhKey(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ECDH, false, ['deriveBits']) as Promise<CryptoKeyPair>;
}

export async function exportPub(key: CryptoKey): Promise<string> {
  return toB64(await subtle().exportKey('raw', key));
}

export async function importEcdsaPub(raw: string): Promise<CryptoKey> {
  return subtle().importKey('raw', buf(fromB64(raw)), EC, true, ['verify']);
}

export async function importEcdhPub(raw: string): Promise<CryptoKey> {
  return subtle().importKey('raw', buf(fromB64(raw)), ECDH, true, []);
}

/** Dấu vân tay khóa công khai — dùng để ràng buộc grant với khóa nhận. */
export async function thumbprint(rawPubB64: string): Promise<string> {
  return toB64Url(await sha256(fromB64(rawPubB64)));
}

export async function signObject(priv: CryptoKey, obj: unknown): Promise<string> {
  const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, buf(utf8(canonical(obj))));
  return toB64(sig);
}

export async function verifyObject(pub: CryptoKey, obj: unknown, sigB64: string): Promise<boolean> {
  try {
    return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, buf(fromB64(sigB64)), buf(utf8(canonical(obj))));
  } catch {
    return false;
  }
}

// ---------- AEAD ----------

export async function genDek(extractable: boolean): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']) as Promise<CryptoKey>;
}

export async function genKek(): Promise<CryptoKey> {
  // KEK không xuất qua API thông thường (§3.6.1).
  return subtle().generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']) as Promise<CryptoKey>;
}

export async function aeadEncrypt(dek: CryptoKey, plaintext: Uint8Array, aad: Uint8Array) {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad), tagLength: 128 }, dek, buf(plaintext));
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function aeadDecrypt(dek: CryptoKey, ivB64: string, ctB64: string, aad: Uint8Array): Promise<Uint8Array> {
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: buf(fromB64(ivB64)), additionalData: buf(aad), tagLength: 128 },
    dek,
    buf(fromB64(ctB64)),
  );
  return new Uint8Array(pt);
}

// ---------- Bọc khóa ----------

export async function wrapWithKek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return toB64(await subtle().wrapKey('raw', dek, kek, 'AES-KW'));
}

export async function unwrapWithKek(wrapped: string, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  return subtle().unwrapKey('raw', buf(fromB64(wrapped)), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}

async function hkdfKey(shared: ArrayBuffer, salt: Uint8Array, info: string, alg: AesKeyAlgorithm | AesKeyGenParams, usages: KeyUsage[]) {
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(utf8(info)) },
    ikm,
    alg as AesKeyGenParams,
    false,
    usages,
  );
}

/** Khóa bọc dẫn xuất ECDH, ràng buộc với ngữ cảnh (đối tượng, phiên bản, grant). */
export async function deriveWrapKey(myPriv: CryptoKey, peerPubRaw: string, context: unknown): Promise<CryptoKey> {
  const peer = await importEcdhPub(peerPubRaw);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: peer }, myPriv, 256);
  return hkdfKey(shared, utf8('HOS-recipient-v1'), canonical(context), { name: 'AES-KW', length: 256 }, ['wrapKey', 'unwrapKey']);
}

/** HSM bọc DEK cho khóa nhận đã được chứng thực (tương tự CiphertextForRecipient). */
export async function wrapForRecipient(dek: CryptoKey, recipientPubRaw: string, context: unknown) {
  const eph = await genEcdhKey();
  const kw = await deriveWrapKey(eph.privateKey, recipientPubRaw, context);
  const wrapped = toB64(await subtle().wrapKey('raw', dek, kw, 'AES-KW'));
  return { wrapped, ephPub: await exportPub(eph.publicKey) };
}

/** Vùng nhận mở DEK bằng khóa phiên riêng; DEK kết quả không xuất được. */
export async function unwrapAsRecipient(recipientPriv: CryptoKey, ephPubRaw: string, wrapped: string, context: unknown): Promise<CryptoKey> {
  const kw = await deriveWrapKey(recipientPriv, ephPubRaw, context);
  return subtle().unwrapKey('raw', buf(fromB64(wrapped)), kw, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------- Niêm phong (ECIES) ----------

export interface Sealed {
  ephPub: string;
  iv: string;
  ct: string;
}

export async function sealTo(recipientPubRaw: string, plaintext: Uint8Array, info: string): Promise<Sealed> {
  const eph = await genEcdhKey();
  const peer = await importEcdhPub(recipientPubRaw);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: peer }, eph.privateKey, 256);
  const key = await hkdfKey(shared, utf8('HOS-seal-v1'), info, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(utf8(info)) }, key, buf(plaintext));
  return { ephPub: await exportPub(eph.publicKey), iv: toB64(iv), ct: toB64(ct) };
}

export async function openSealed(myPriv: CryptoKey, sealed: Sealed, info: string): Promise<Uint8Array> {
  const peer = await importEcdhPub(sealed.ephPub);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: peer }, myPriv, 256);
  const key = await hkdfKey(shared, utf8('HOS-seal-v1'), info, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf(fromB64(sealed.iv)), additionalData: buf(utf8(info)) }, key, buf(fromB64(sealed.ct)));
  return new Uint8Array(pt);
}

/** Cam kết có giá trị ngẫu nhiên bí mật riêng (§3.8): không băm trần dữ liệu có không gian đoán nhỏ. */
export async function commit(value: string): Promise<{ commitment: string; opening: string }> {
  const r = randomBytes(32);
  const c = await sha256(concatBytes(r, utf8(value)));
  return { commitment: toB64Url(c), opening: toB64(r) };
}
