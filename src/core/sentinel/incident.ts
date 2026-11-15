/**
 * Mô hình trạng thái sự cố (Hình 3.3, §3.9, §4.5).
 * Trạng thái nguồn ngẫu nhiên được TÁCH khỏi trạng thái xâm nhập: nguồn suy giảm không phải bằng chứng xâm nhập.
 *
 *   Bình thường → Nghi vấn xâm nhập → Đủ điều kiện cô lập → Đã cô lập → Phục hồi có kiểm soát → Bình thường
 */
import type { JsonStore } from '../storage';

export type SecurityState = 'normal' | 'suspected' | 'isolation_ready' | 'isolated' | 'recovering';
export type SourceState = 'healthy' | 'degraded' | 'halted';

export type SignalKind = 'read_spike' | 'canary' | 'policy_anomaly' | 'attestation_fail' | 'replay' | 'tamper' | 'manual';

export interface Signal {
  id: string;
  kind: SignalKind;
  at: number;
  evidence: string[];
  note: string;
  source: 'rule' | 'human' | 'ai';
}

export const SECURITY_STATE_LABEL: Record<SecurityState, string> = {
  normal: 'Bình thường',
  suspected: 'Nghi vấn xâm nhập',
  isolation_ready: 'Đủ điều kiện cô lập',
  isolated: 'Đã cô lập',
  recovering: 'Phục hồi có kiểm soát',
};

export const SECURITY_STATE_HINT: Record<SecurityState, string> = {
  normal: 'Danh tính, chính sách, RNG và nhật ký đáp ứng điều kiện. Cấp quyền tối thiểu; giám sát liên tục.',
  suspected: 'Đối chiếu tín hiệu từ nguồn độc lập; hạn chế phiên nghi vấn; chặn xuất hàng loạt theo chính sách đã kiểm thử.',
  isolation_ready: 'Rule có chứng cứ hỗ trợ hoặc quyết định của người trực. Sẵn sàng thu hồi quyền mở khóa và chặn egress.',
  isolated: 'Đã thu hồi quyền mở khóa liên quan (tăng epoch), chặn phiên và khóa đường đọc trong két.',
  recovering: 'Máy sạch, quyền mới, phạm vi lộ đã đánh giá. Người có thẩm quyền duyệt mở lại — không mở chỉ vì AI đánh giá an toàn.',
};

export const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  healthy: 'Nguồn ổn định',
  degraded: 'Suy giảm nguồn',
  halted: 'Dừng thao tác cần ngẫu nhiên mới',
};

export interface IncidentModel {
  state: SecurityState;
  source: SourceState;
  signals: Signal[];
  history: { at: number; from: SecurityState; to: SecurityState; by: string; reason: string }[];
  restrictedSessions: string[];
  exportBlocked: boolean;
  recoveryChecks: { cleanMachine: boolean; newCredentials: boolean; exposureAssessed: boolean; causeAddressed: boolean };
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export class IncidentMachine {
  private m: IncidentModel;
  private listeners = new Set<() => void>();
  constructor(private store: JsonStore, private now: () => number = Date.now, private key = 'sentinel.incident') {
    this.m = store.get<IncidentModel>(key) ?? IncidentMachine.fresh();
  }

  static fresh(): IncidentModel {
    return {
      state: 'normal',
      source: 'healthy',
      signals: [],
      history: [],
      restrictedSessions: [],
      exportBlocked: false,
      recoveryChecks: { cleanMachine: false, newCredentials: false, exposureAssessed: false, causeAddressed: false },
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private persist() {
    this.store.set(this.key, this.m);
    this.listeners.forEach((l) => l());
  }
  view(): Readonly<IncidentModel> {
    return this.m;
  }

  private go(to: SecurityState, by: string, reason: string) {
    this.m.history.push({ at: this.now(), from: this.m.state, to, by, reason });
    this.m.state = to;
    this.persist();
  }

  /** Tín hiệu từ rule/người/AI. Rule tự đưa hệ thống sang "Nghi vấn" và chặn xuất hàng loạt. */
  signal(s: Omit<Signal, 'id' | 'at'>): Signal {
    const sig: Signal = { ...s, id: `sig-${String(this.m.signals.length + 1).padStart(3, '0')}`, at: this.now() };
    this.m.signals.push(sig);
    if (this.m.state === 'normal') {
      this.m.exportBlocked = true;
      this.go('suspected', s.source, `Tín hiệu ${s.kind}: ${s.note}`);
    } else this.persist();
    return sig;
  }

  restrictSession(sessionRef: string) {
    if (!this.m.restrictedSessions.includes(sessionRef)) this.m.restrictedSessions.push(sessionRef);
    this.persist();
  }

  /** Đủ điều kiện cô lập: ≥2 loại tín hiệu độc lập (rule) hoặc quyết định của người trực. */
  markIsolationReady(by: { id: string; isAI?: boolean; human: boolean }, reason: string): TransitionResult {
    if (this.m.state !== 'suspected') return { ok: false, reason: 'Chỉ chuyển từ trạng thái Nghi vấn.' };
    const kinds = new Set(this.m.signals.filter((s) => s.at >= (this.m.history.at(-1)?.at ?? 0) - 3600_000).map((s) => s.kind));
    if (!by.human && kinds.size < 2) return { ok: false, reason: 'Rule cần ít nhất 2 loại tín hiệu độc lập hoặc quyết định của người trực.' };
    if (by.isAI) return { ok: false, reason: 'AI chỉ đề xuất; quyết định cô lập thuộc rule có chứng cứ hoặc người trực.' };
    this.go('isolation_ready', by.id, reason);
    return { ok: true };
  }

  isolate(by: { id: string; human: boolean; isAI?: boolean }, effects: () => void): TransitionResult {
    if (this.m.state !== 'isolation_ready') return { ok: false, reason: 'Cần trạng thái Đủ điều kiện cô lập.' };
    if (by.isAI || !by.human) return { ok: false, reason: 'Hành động cô lập do người có thẩm quyền hoặc bộ thực thi được phê duyệt.' };
    effects();
    this.go('isolated', by.id, 'Thu hồi quyền mở khóa, chặn phiên, khóa đường đọc trong két');
    return { ok: true };
  }

  setRecoveryCheck(k: keyof IncidentModel['recoveryChecks'], v: boolean) {
    this.m.recoveryChecks[k] = v;
    this.persist();
  }

  beginRecovery(by: string): TransitionResult {
    if (this.m.state !== 'isolated') return { ok: false, reason: 'Chỉ bắt đầu phục hồi sau khi đã cô lập.' };
    const c = this.m.recoveryChecks;
    if (!c.cleanMachine || !c.newCredentials || !c.exposureAssessed) return { ok: false, reason: 'Cần máy sạch, quyền mới và đánh giá phạm vi lộ trước khi phục hồi.' };
    this.go('recovering', by, 'Bắt đầu phục hồi có kiểm soát');
    return { ok: true };
  }

  reopen(by: { id: string; human: boolean; isAI?: boolean; role: string }, effects: () => void): TransitionResult {
    if (this.m.state !== 'recovering') return { ok: false, reason: 'Chỉ mở lại từ Phục hồi có kiểm soát.' };
    if (by.isAI) return { ok: false, reason: 'Không tự mở lại chỉ vì AI đánh giá an toàn (§3.9).' };
    if (!by.human || !['admin', 'recovery-admin'].includes(by.role)) return { ok: false, reason: 'Cần người có thẩm quyền duyệt mở lại.' };
    if (!this.m.recoveryChecks.causeAddressed) return { ok: false, reason: 'Chưa xử lý nguyên nhân xâm nhập.' };
    effects();
    this.m.exportBlocked = false;
    this.m.restrictedSessions = [];
    this.m.recoveryChecks = { cleanMachine: false, newCredentials: false, exposureAssessed: false, causeAddressed: false };
    this.go('normal', by.id, 'Người có thẩm quyền duyệt mở lại');
    return { ok: true };
  }

  dismiss(by: { id: string; human: boolean }, note: string): TransitionResult {
    if (this.m.state !== 'suspected') return { ok: false, reason: 'Chỉ bỏ qua khi đang Nghi vấn.' };
    if (!by.human) return { ok: false, reason: 'Chỉ người trực được bỏ qua tín hiệu.' };
    this.m.exportBlocked = false;
    this.go('normal', by.id, 'Bỏ qua: ' + note);
    return { ok: true };
  }

  /** Trạng thái nguồn tách riêng — không bao giờ tự đẩy trạng thái xâm nhập. */
  setSource(s: SourceState) {
    this.m.source = s;
    this.persist();
  }

  reset() {
    this.m = IncidentMachine.fresh();
    this.persist();
  }
}
