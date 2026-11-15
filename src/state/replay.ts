/**
 * Replay · Sandbox kịch bản F.8 (lời mời ăn cơm từ lịch đã chia sẻ).
 * Chạy trên một Sentinel riêng (bộ nhớ trong), đồng hồ và người nhận giả lập — không chạm dữ liệu Live.
 * Kỳ vọng được tính bằng "oracle" quét từng phút (thuật toán độc lập với commonSlots) để đối chiếu.
 */
import { create } from 'zustand';
import { commonSlots, fmtSlot, fromMin, toMin } from '../core/family/calendar';
import { checkDraft, localDraft, type InviteFacts } from '../core/family/genai';
import { canonical, sha256Hex } from '../core/sentinel/encoding';
import { Sentinel } from '../core/sentinel/sentinel';
import { memoryJsonStore, memoryObjectStore } from '../core/storage';
import { getSentinel } from './services';

export interface ReplayFacts {
  aStart: string;
  aEnd: string;
  bStart: string;
  bEnd: string;
  quiet: string;
  revokeBBeforeRelease: boolean;
}

export interface ReplayRow {
  name: string;
  expected: string;
  observed: string;
  match: boolean;
}

export interface ReplayResult {
  id: string;
  at: number;
  facts: ReplayFacts;
  factsVersion: string;
  rule: string;
  slot: string;
  draftStatus: string;
  released: string;
  rows: ReplayRow[];
  previewHash: string;
  liveEventsBefore: number;
  liveEventsAfter: number;
  ms: number;
}

export const DEFAULT_FACTS: ReplayFacts = { aStart: '18:30', aEnd: '20:00', bStart: '19:00', bEnd: '20:30', quiet: '20:00', revokeBBeforeRelease: false };

/** Oracle: quét từng phút, đánh dấu phút mà cả A và B đều rảnh và trước giờ yên tĩnh. */
function oracle(f: ReplayFacts) {
  const free = (m: number, s: string, e: string) => m >= toMin(s) && m < toMin(e);
  let start = -1;
  for (let m = 0; m < 24 * 60; m++) {
    const ok = free(m, f.aStart, f.aEnd) && free(m, f.bStart, f.bEnd) && m < toMin(f.quiet);
    if (ok && start < 0) start = m;
    if (start >= 0 && (!ok || m === 24 * 60 - 1)) {
      const end = ok ? m + 1 : m;
      if (end - start >= 60) return `${fromMin(start)}–${fromMin(start + 60)}`;
      start = -1;
    }
  }
  return 'không có khung';
}

export const useReplay = create<{ facts: ReplayFacts; results: ReplayResult[]; running: boolean }>(() => ({ facts: DEFAULT_FACTS, results: [], running: false }));

export async function runReplay(): Promise<ReplayResult> {
  const t0 = performance.now();
  useReplay.setState({ running: true });
  const f = useReplay.getState().facts;
  const live = getSentinel();
  const liveBefore = live.journal.all().length;
  const dir = [
    { id: 'A', name: 'Tài khoản thử A', tenant: 'replay', role: 'admin' as const },
    { id: 'B', name: 'Tài khoản thử B', tenant: 'replay', role: 'member' as const },
  ];
  const sb = await Sentinel.create({ json: memoryJsonStore(), objects: memoryObjectStore(), tenant: 'replay', directory: dir, prefix: 'replay.' });
  await sb.protect({ subject: 'A', objectId: 'cal-A', type: 'calendar.freebusy', label: 'Lịch A', data: { windows: [{ start: f.aStart, end: f.aEnd }] }, viewers: ['B'], purposes: ['rhythm.intersect'] });
  await sb.protect({ subject: 'B', objectId: 'cal-B', type: 'calendar.freebusy', label: 'Lịch B', data: { windows: [{ start: f.bStart, end: f.bEnd }] }, viewers: ['A'], purposes: ['rhythm.intersect'] });
  const ra = await sb.read<{ windows: { start: string; end: string }[] }>({ subject: 'A', objectId: 'cal-A', purpose: 'rhythm.intersect' });
  const rb = await sb.read<{ windows: { start: string; end: string }[] }>({ subject: 'A', objectId: 'cal-B', purpose: 'rhythm.intersect' });
  const members = [ra, rb].filter((r) => r.ok && r.data).map((r, i) => ({ memberId: i ? 'B' : 'A', windows: r.data!.windows }));
  const res = commonSlots(members, f.quiet);
  const slot = res.best ? fmtSlot(res.best) : 'không có khung';
  let draftStatus = 'Không tạo';
  let released = 'Không phát hành';
  let previewHash = '—';
  let draftOk = false;
  if (res.best) {
    const facts: InviteFacts = { occasion: 'Bữa cơm cùng nhà', slot: res.best, tz: 'GMT+7', host: 'A', hostSelf: 'con', place: 'nhà A', tone: 'warm', recipients: [{ id: 'B', name: 'B', address: 'mẹ', lang: 'vi' }] };
    const d = localDraft(facts);
    draftOk = checkDraft(d, facts).ok;
    draftStatus = 'Chờ duyệt';
    previewHash = 'preview-f8-' + (await sha256Hex(canonical(d))).slice(0, 8);
    if (f.revokeBBeforeRelease) await sb.revoke({ actor: 'B', objectId: 'cal-B', viewer: 'A', reason: 'Replay: B thu hồi trước khi phát hành' });
    const check = await sb.read({ subject: 'A', objectId: 'cal-B', purpose: 'rhythm.intersect' });
    released = check.ok ? 'Sẵn sàng phát hành sau khi duyệt' : 'Đã chặn';
  }
  const expectedSlot = oracle(f);
  const liveAfter = live.journal.all().length;
  const rows: ReplayRow[] = [
    { name: 'Giao lịch', expected: expectedSlot, observed: slot, match: expectedSlot === slot },
    { name: 'Bản nháp chờ người dùng duyệt (không tự gửi)', expected: res.best ? 'Chờ duyệt' : 'Không tạo', observed: draftStatus, match: draftStatus === (res.best ? 'Chờ duyệt' : 'Không tạo') },
    { name: 'Bản nháp đạt kiểm dữ kiện', expected: res.best ? 'Đạt' : '—', observed: res.best ? (draftOk ? 'Đạt' : 'Không đạt') : '—', match: !res.best || draftOk },
    { name: 'Quyền bị thu hồi chặn chuyển giao', expected: f.revokeBBeforeRelease ? 'Chặn' : 'Không chặn', observed: released === 'Đã chặn' ? 'Chặn' : res.best ? 'Không chặn' : '—', match: !res.best || (f.revokeBBeforeRelease ? released === 'Đã chặn' : released !== 'Đã chặn') },
    { name: 'Tác động ghi trong sandbox', expected: 'Tách biệt với Live', observed: liveAfter === liveBefore ? 'Tách biệt' : `Live +${liveAfter - liveBefore} sự kiện`, match: liveAfter === liveBefore },
  ];
  const n = useReplay.getState().results.length + 1;
  const result: ReplayResult = {
    id: `trace-F8-${String(n).padStart(3, '0')}`,
    at: Date.now(),
    facts: f,
    factsVersion: 'facts-f8-' + (await sha256Hex(canonical(f))).slice(0, 6),
    rule: 'rule-v18',
    slot,
    draftStatus,
    released,
    rows,
    previewHash,
    liveEventsBefore: liveBefore,
    liveEventsAfter: liveAfter,
    ms: Math.round(performance.now() - t0),
  };
  useReplay.setState((s) => ({ results: [result, ...s.results].slice(0, 20), running: false }));
  void live.log({ kind: 'note', actor: 'A', summary: `Replay ${result.id}: ${rows.filter((r) => r.match).length}/${rows.length} khớp kỳ vọng (adapter Replay, không phát hành)` });
  return result;
}
