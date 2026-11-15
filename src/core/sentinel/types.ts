/** Kiểu dữ liệu dùng chung của mô hình ARGOLET Sentinel (Chương 3). */
import type { Sealed } from './crypto';

export type Operation = 'read' | 'write' | 'export' | 'compute';
export type Role = 'admin' | 'member' | 'child' | 'carer' | 'ops';

/** Chủ thể chức năng (Bảng 3.1). */
export type Actor = 'A' | 'G' | 'Ve' | 'K' | 'H' | 'R' | 'B' | 'J' | 'AI' | 'Client' | 'Verifier' | 'Human';

export const ACTOR_LABEL: Record<Actor, string> = {
  A: 'A · Ứng dụng',
  G: 'G · Cấp quyền',
  Ve: 'Ve · Core Vault (enclave)',
  K: 'K · Điều phối khóa',
  H: 'H · HSM',
  R: 'R · Trạng thái bền vững',
  B: 'B · Recovery Vault',
  J: 'J · Bằng chứng',
  AI: 'AI · Tác tử hỗ trợ',
  Client: 'Client tin cậy',
  Verifier: 'Trình xác minh',
  Human: 'Người có thẩm quyền',
};

export interface DirectoryEntry {
  id: string;
  name: string;
  tenant: string;
  role: Role;
  guardian?: string;
  /** Quyền có thời hạn (người hỗ trợ theo ca). */
  expiresAt?: number;
  disabled?: boolean;
}

export interface ObjectMeta {
  tenant: string;
  objectId: string;
  version: number;
  type: string;
  label: string;
  owner: string;
  viewers: string[];
  purposes: string[];
  fields: string[];
  createdAt: number;
  expiresAt?: number;
  canary?: boolean;
}

export interface StoredObject {
  meta: ObjectMeta;
  iv: string;
  ciphertext: string;
  /** DEK được bọc dưới KEK (CiphertextBlob) — để lưu và dùng lại qua cổng cấp khóa. */
  blob: { kekVersion: number; wrapped: string };
  alg: 'AES-256-GCM';
  size: number;
  committedAt: number;
}

export interface Grant {
  v: 1;
  grantId: string;
  subject: string;
  workload: string;
  tenant: string;
  objectId: string;
  version: number;
  fields: string[];
  operation: Operation;
  purpose: string;
  /** Dấu vân tay khóa phiên của enclave nhận DEK (I8). */
  recipient: string;
  sessionId: string;
  /** Dấu vân tay khóa của đích nhận kết quả (client đã xác thực). */
  destination: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  budgetBytes: number;
  epoch: number;
}

export interface SignedGrant {
  grant: Grant;
  sig: string;
}

export interface AttestationReport {
  platform: string;
  measurement: string;
  codeName: string;
  codeVersion: string;
  tcb: number;
  debug: boolean;
  sessionId: string;
  sessionPub: string;
  challenge: string;
  issuedAt: number;
}

export interface Attestation {
  report: AttestationReport;
  sig: string;
}

export interface GateDecision {
  Gok: boolean;
  Aok: boolean;
  Eok: boolean;
  Bok: boolean;
  release: boolean;
  reasons: string[];
  reservationId?: string;
}

export interface RecipientRelease {
  wrapped: string;
  ephPub: string;
  context: KeyContext;
}

export interface KeyContext {
  tenant: string;
  objectId: string;
  version: number;
  grantId: string;
  sessionId: string;
}

export interface TraceStep {
  actor: Actor;
  label: string;
  ok: boolean;
  detail?: string;
  ms?: number;
}

export interface ReadResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  decision?: GateDecision;
  trace: TraceStep[];
  grantId?: string;
  bytes?: number;
}

export type { Sealed };
