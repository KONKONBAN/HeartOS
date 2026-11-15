/**
 * Tác tử AI hỗ trợ truy dấu (§3.12, §4.6, I5).
 * AI đọc bản giảm nhạy cảm, dựng dòng thời gian, chỉ khoảng thiếu bằng chứng và ĐỀ XUẤT hành động có cấu trúc.
 * Bộ thực thi độc lập kiểm allowlist, phạm vi, thời hạn và khả năng hoàn tác. Log là dữ liệu không tin cậy.
 *
 * Bản cài đặt này là mô hình luật cục bộ chạy trên thiết bị (không gửi log ra dịch vụ ngoài).
 */
import type { JournalEntry } from './journal';

export type ActionKind =
  | 'revoke_session'
  | 'limit_export'
  | 'isolate_workload'
  | 'deploy_canary'
  | 'block_egress'
  // các hành động dưới đây luôn bị bộ thực thi từ chối
  | 'seal_all'
  | 'open_source_gate'
  | 'assign_entropy_k'
  | 'modify_policy'
  | 'issue_grant'
  | 'delete_logs'
  | 'reopen_service'
  | 'counter_attack';

export interface Proposal {
  id: string;
  action: ActionKind;
  target: string;
  scope: string;
  ttlSec: number;
  reversible: boolean;
  rationale: string;
  evidence: string[];
  /** Suy luận (không phải quan sát). */
  inference: boolean;
}

export interface Analysis {
  timeline: { id: string; ts: number; text: string; kind: 'observed' | 'inferred' }[];
  gaps: string[];
  proposals: Proposal[];
  summary: string;
}

export const ALLOWED: ActionKind[] = ['revoke_session', 'limit_export', 'isolate_workload', 'deploy_canary', 'block_egress'];
export const FORBIDDEN_REASON: Partial<Record<ActionKind, string>> = {
  seal_all: 'Seal toàn hệ thống dùng quy trình khẩn cấp tách biệt; AI không có quyền root.',
  open_source_gate: 'AI không được tự mở cổng nguồn hoặc cấp nhãn QRNG (§3.14).',
  assign_entropy_k: 'AI không được tự gán cận entropy k.',
  modify_policy: 'AI không tự sửa chính sách hoặc các gốc tin cậy (A4, I5).',
  issue_grant: 'AI không thay cơ chế cấp quyền (I5).',
  delete_logs: 'Không xóa log điều tra trước khi giữ bằng chứng.',
  reopen_service: 'Mở lại dịch vụ cần người có thẩm quyền.',
  counter_attack: 'Không tấn công ngược; IP có thể thuộc nạn nhân trung gian.',
};
const HIGH_IMPACT: ActionKind[] = ['isolate_workload', 'block_egress'];

type Redacted = Pick<JournalEntry, 'id' | 'ts' | 'kind' | 'severity' | 'decision' | 'summary' | 'objectId' | 'data'> & { subject?: string };

let pid = 0;
const mk = (p: Omit<Proposal, 'id'>): Proposal => ({ ...p, id: `prop-${++pid}` });

/** Phân tích luật: đọc nhật ký giảm nhạy cảm, không giữ khóa, không có shell. */
export function analyze(entries: Redacted[]): Analysis {
  const timeline: Analysis['timeline'] = [];
  const proposals: Proposal[] = [];
  const gaps: string[] = [];
  const denies = entries.filter((e) => e.decision === 'deny');
  const replays = entries.filter((e) => e.kind === 'replay.block');
  const budget = entries.filter((e) => e.kind === 'budget.deny');
  const attest = entries.filter((e) => e.kind === 'attest.fail');
  const canary = entries.filter((e) => e.kind === 'incident.signal' && String(e.summary).includes('canary'));

  for (const e of entries.filter((x) => x.severity !== 'info').slice(-14)) {
    timeline.push({ id: e.id, ts: e.ts, text: e.summary, kind: 'observed' });
  }

  const bySubject = new Map<string, number>();
  denies.forEach((e) => e.subject && bySubject.set(e.subject, (bySubject.get(e.subject) ?? 0) + 1));
  for (const [sub, n] of bySubject) {
    if (n >= 3) {
      proposals.push(
        mk({
          action: 'revoke_session',
          target: sub,
          scope: 'tenant hiện tại',
          ttlSec: 1800,
          reversible: true,
          rationale: `${n} yêu cầu bị từ chối liên tiếp từ cùng chủ thể giả danh ${sub}.`,
          evidence: denies.filter((e) => e.subject === sub).slice(-5).map((e) => e.id),
          inference: true,
        }),
      );
    }
  }
  if (budget.length >= 2) {
    proposals.push(
      mk({
        action: 'limit_export',
        target: 'đường xuất hàng loạt',
        scope: 'tenant hiện tại',
        ttlSec: 3600,
        reversible: true,
        rationale: 'Ngân sách giải mã chạm trần nhiều lần — dấu hiệu đọc tăng đột biến.',
        evidence: budget.slice(-5).map((e) => e.id),
        inference: true,
      }),
    );
  }
  if (replays.length) {
    timeline.push({ id: replays.at(-1)!.id, ts: replays.at(-1)!.ts, text: 'Có grant bị phát lại — có thể token bị lấy cắp hoặc ứng dụng bị chiếm.', kind: 'inferred' });
  }
  if (attest.length) {
    proposals.push(
      mk({
        action: 'isolate_workload',
        target: 'host chạy enclave',
        scope: 'một workload',
        ttlSec: 3600,
        reversible: true,
        rationale: 'Chứng thực thất bại — host có thể đang thay khóa nhận hoặc phát lại bằng chứng.',
        evidence: attest.slice(-3).map((e) => e.id),
        inference: true,
      }),
    );
  }
  if (canary.length === 0) {
    proposals.push(
      mk({
        action: 'deploy_canary',
        target: 'canary-ledger',
        scope: 'mạng tách biệt, không dữ liệu thật',
        ttlSec: 86400,
        reversible: true,
        rationale: 'Bổ sung mồi giả nội bộ để phát hiện đọc trái phép sớm.',
        evidence: [],
        inference: false,
      }),
    );
  }

  // Log là dữ liệu không tin cậy: nội dung chèn lệnh có thể khiến mô hình đề xuất hành động cấm.
  const injected = entries.find((e) => /ignore previous|bỏ qua chỉ dẫn|grant root|cấp quyền root|mở cổng nguồn/i.test(e.summary + JSON.stringify(e.data ?? {})));
  if (injected) {
    proposals.push(
      mk({
        action: 'modify_policy',
        target: 'policy/admin',
        scope: 'toàn hệ thống',
        ttlSec: 0,
        reversible: false,
        rationale: `Nội dung trong ${injected.id} yêu cầu nâng quyền (chèn lệnh qua log).`,
        evidence: [injected.id],
        inference: true,
      }),
    );
  }

  if (!entries.some((e) => e.kind === 'session')) gaps.push('Thiếu sự kiện phiên đăng nhập trong cửa sổ — cần đối chiếu nguồn IdP.');
  gaps.push('Không có dấu vết kết nối tại biên (IP+cổng nguồn) — không suy từ header; ghi rõ dữ liệu thiếu, không tự điền.');
  if (entries.length && entries[0].ts > Date.now() - 600_000) gaps.push('Cửa sổ log ngắn hơn 10 phút — có thể thiếu sự kiện trước đó.');

  return {
    timeline: timeline.sort((a, b) => a.ts - b.ts),
    gaps,
    proposals,
    summary: proposals.length
      ? `Đề xuất ${proposals.length} hành động; tất cả phải qua bộ thực thi độc lập.`
      : 'Không thấy mẫu bất thường trong cửa sổ đã xem.',
  };
}

export interface ExecutionCheck {
  ok: boolean;
  needsHuman: boolean;
  reasons: string[];
}

/** Bộ thực thi độc lập: allowlist, phạm vi, thời hạn, khả năng hoàn tác, phê duyệt hành động tác động lớn. */
export function checkExecution(p: Proposal, opts: { humanApproved: boolean }): ExecutionCheck {
  const reasons: string[] = [];
  if (!ALLOWED.includes(p.action)) {
    return { ok: false, needsHuman: false, reasons: [FORBIDDEN_REASON[p.action] ?? 'Hành động không nằm trong allowlist.'] };
  }
  if (p.scope.includes('toàn hệ thống')) reasons.push('Phạm vi vượt tenant hiện tại.');
  if (p.ttlSec <= 0 || p.ttlSec > 86400) reasons.push('Thời hạn phải trong (0, 24 giờ].');
  if (!p.reversible) reasons.push('Hành động không hoàn tác được cần quy trình riêng.');
  const needsHuman = HIGH_IMPACT.includes(p.action);
  if (needsHuman && !opts.humanApproved) reasons.push('Hành động tác động lớn cần người phê duyệt đúng đối tượng và tham số.');
  return { ok: reasons.length === 0, needsHuman, reasons };
}
