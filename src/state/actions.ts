import { commonSlots, fmtSlot, type MemberWindows, type Slot } from '../core/family/calendar';
import { draftInvitation, parseIntent, type InviteFacts } from '../core/family/genai';
import { buf, fromB64, randomId, toB64 } from '../core/sentinel/encoding';
import type { ReadResult, TraceStep } from '../core/sentinel/types';
import { blobs, getHome, getSentinel, initServices, signApproval } from './services';
import { getApp, memberName, namesOf, useApp } from './store';
import type { Invitation, Member, Memory } from './types';

const set = (fn: Parameters<ReturnType<typeof useApp.getState>['set']>[0]) => getApp().set(fn);

export const MEMORY_TEXT: Record<string, { transcript: string; caption: string }> = {
  'm-kitchen': { transcript: 'Ngày đó, cả nhà quây quần bên bếp mỗi cuối tuần. Bà nấu canh chua, ông ngồi nhặt rau, tụi nhỏ chạy quanh hiên.', caption: '“Ngày đó, cả nhà quây quần bên bếp mỗi cuối tuần.”' },
  'm-sunday': { transcript: 'Bữa cơm Chủ nhật tháng trước, Minh lần đầu tự rán trứng cho cả nhà.', caption: 'Ảnh được chia sẻ với nhà An' },
};

export async function bootstrap() {
  const app = getApp();
  await initServices(app.members);
  const s = getSentinel();
  const needsSeed = s.vault.list().length === 0 || s.H.freshlyCreated;
  if (needsSeed) {
    if (s.H.freshlyCreated && s.vault.list().length) {
      s.vault.replaceAll([]);
      await s.log({ kind: 'note', actor: 'K', severity: 'warning', summary: 'KEK mới được tạo (kho khóa thiết bị trống), gieo lại dữ liệu mẫu được bảo vệ' });
    }
    for (const c of app.calendars) {
      await s.protect({ subject: c.memberId, objectId: `cal-${c.memberId}`, type: 'calendar.freebusy', label: `Lịch rảnh/bận của ${memberName(c.memberId)}`, data: { windows: c.windows, quietFrom: c.quietFrom, tz: 'GMT+7' }, viewers: c.viewers, purposes: ['rhythm.intersect'] });
    }
    for (const m of app.memories) {
      const t = MEMORY_TEXT[m.id] ?? { transcript: '', caption: '' };
      await s.protect({ subject: m.narrator, objectId: m.objectId, type: 'memory', label: `Ký ức · ${m.title}`, data: { title: m.title, transcript: t.transcript, caption: t.caption, audioKey: '' }, viewers: m.viewers, purposes: ['memory.view'] });
    }
    for (const c of app.contributions) {
      await s.protect({ subject: c.by, objectId: c.objectId, type: 'fund.entry', label: `Khoản tự ghi của ${memberName(c.by)}`, data: { amount: c.amount, note: 'Khoản tự ghi', by: c.by }, viewers: c.visibleTo.filter((v) => v !== c.by), purposes: ['fund.view'] });
    }
    await s.protect({ subject: 'u-lan', objectId: 'loc-u-lan', type: 'location', label: 'Vị trí hỗ trợ của bà Lan', data: { place: 'Nhà An · phòng khách', lat: 10.7769, lng: 106.7009, note: 'Chỉ dùng khi bà gửi SOS' }, viewers: ['u-an', 'u-carer'], purposes: ['support.location'] });
    await s.protect({ subject: 'u-an', objectId: 'cam-living', type: 'camera.policy', label: 'Chính sách xem camera phòng khách', data: { stream: 'rtsp://hub.local/living', masks: 'sofa, cửa phòng ngủ', maxSessionSec: 240 }, viewers: ['u-carer'], purposes: ['camera.view'] });
    if (!s.recovery.list().length) await s.checkpoint('u-an');
  }
}

export interface RhythmResult {
  slot: Slot | null;
  readable: { memberId: string; windows: { start: string; end: string }[] }[];
  denied: { memberId: string; reason: string }[];
  reason?: string;
  traces: TraceStep[][];
}

export async function computeRhythm(hostId: string, participants: string[]): Promise<RhythmResult> {
  const s = getSentinel();
  const readable: RhythmResult['readable'] = [];
  const denied: RhythmResult['denied'] = [];
  const traces: TraceStep[][] = [];
  for (const id of participants) {
    const r = await s.read<{ windows: { start: string; end: string }[] }>({ subject: hostId, objectId: `cal-${id}`, purpose: 'rhythm.intersect', fields: ['windows'], workload: 'nhip-nha' });
    traces.push(r.trace);
    if (r.ok && r.data) readable.push({ memberId: id, windows: r.data.windows });
    else denied.push({ memberId: id, reason: r.error ?? 'Không có quyền' });
  }
  const quiet = getApp().prefs.quietFrom;
  const res = commonSlots(readable as MemberWindows[], quiet);
  return { slot: res.best, readable, denied, reason: res.reason, traces };
}

export async function createInvitation(p: { hostId: string; occasion: string; recipients: string[]; tone?: InviteFacts['tone']; place?: string }): Promise<{ ok: boolean; id?: string; error?: string; rhythm: RhythmResult }> {
  const app = getApp();
  const rhythm = await computeRhythm(p.hostId, [p.hostId, ...p.recipients]);
  if (!rhythm.slot) return { ok: false, error: rhythm.reason ?? 'Không tìm được khung chung.', rhythm };
  const host = app.members.find((m) => m.id === p.hostId)!;
  const recips = p.recipients.map((id) => app.members.find((m) => m.id === id)!).filter(Boolean);
  const facts: InviteFacts = {
    occasion: p.occasion,
    slot: rhythm.slot,
    tz: 'GMT+7',
    host: host.name,
    hostSelf: host.selfRef,
    place: p.place ?? `nhà ${host.name}`,
    tone: p.tone ?? 'warm',
    recipients: recips.map((m) => ({ id: m.id, name: m.name, address: m.address, lang: m.lang })),
  };
  const prefs = app.prefs;
  const result = await draftInvitation(facts, prefs.claudeEnabled && prefs.claudeKey ? { apiKey: prefs.claudeKey, model: prefs.claudeModel } : null);
  const id = randomId('inv', 4);
  const inv: Invitation = {
    id,
    occasion: p.occasion,
    slot: rhythm.slot,
    tz: 'GMT+7',
    place: facts.place,
    hostId: p.hostId,
    recipients: p.recipients,
    draft: result.draft,
    gen: { provider: result.provider, model: result.model, checks: result.checks, fellBack: result.fellBack, ms: result.ms },
    status: 'draft',
    createdAt: Date.now(),
    receipts: Object.fromEntries(p.recipients.map((r) => [r, 'pending'])),
    history: [{ at: Date.now(), text: `Nhịp Nhà tìm thấy ${fmtSlot(rhythm.slot)} · ${result.provider === 'claude' ? 'Claude' : 'mẫu trên thiết bị'} soạn bản nháp` }],
  };
  set((s) => {
    s.invitations.unshift(inv);
  });
  await getSentinel().log({ kind: 'note', actor: 'AI', summary: `GenAI soạn bản nháp "${p.occasion}" ${fmtSlot(rhythm.slot)} cho ${namesOf(p.recipients)}, chờ duyệt`, data: { provider: result.provider, checks: result.checks.filter((c) => c.ok).length + '/' + result.checks.length } });
  return { ok: true, id, rhythm };
}

export function updateInvitationText(id: string, recipientId: string, text: string) {
  set((s) => {
    const inv = s.invitations.find((i) => i.id === id);
    const m = inv?.draft.messages.find((x) => x.recipientId === recipientId);
    if (inv && m) {
      m.text = text;
      inv.history.push({ at: Date.now(), text: `Sửa lời mời cho ${memberName(recipientId)}` });
    }
  });
}

export function setInvitationRecipientLang(id: string, recipientId: string, lang: 'vi' | 'en') {
  set((s) => {
    const inv = s.invitations.find((i) => i.id === id);
    const m = inv?.draft.messages.find((x) => x.recipientId === recipientId);
    if (m) m.lang = lang;
  });
}

export async function approveInvitation(id: string, by: string) {
  const inv = getApp().invitations.find((i) => i.id === id);
  if (!inv) return;
  const approval = await signApproval([`Gửi lời mời "${inv.occasion}" ${fmtSlot(inv.slot)}`, ...inv.draft.messages.map((m) => `${memberName(m.recipientId)}: ${m.text}`)], inv.recipients.join(','));
  set((s) => {
    const x = s.invitations.find((i) => i.id === id)!;
    x.status = 'queued';
    x.approvedAt = Date.now();
    x.approvedBy = by;
    x.approvedEpoch = approval.epoch;
    x.approvalId = approval.id;
    x.history.push({ at: Date.now(), text: `${memberName(by)} duyệt và xếp hàng gửi (epoch ${approval.epoch})` });
  });
}

export async function releaseInvitation(id: string): Promise<{ ok: boolean; reason?: string }> {
  const inv = getApp().invitations.find((i) => i.id === id);
  if (!inv || inv.status !== 'queued') return { ok: false, reason: 'Lời mời không ở hàng đợi.' };
  const s = getSentinel();
  const problems: string[] = [];
  for (const r of inv.recipients) {
    const res = await s.read({ subject: inv.hostId, objectId: `cal-${r}`, purpose: 'rhythm.intersect', fields: ['windows'], workload: 'nhip-nha-release' });
    if (!res.ok) problems.push(`Quyền chia sẻ lịch của ${memberName(r)} đã thay đổi`);
  }
  if (problems.length) {
    set((st) => {
      const x = st.invitations.find((i) => i.id === id)!;
      x.status = 'blocked';
      x.blockedReason = problems.join('; ');
      x.history.push({ at: Date.now(), text: 'Chặn chuyển giao: ' + x.blockedReason });
    });
    await s.log({ kind: 'gate.deny', actor: 'G', severity: 'notice', summary: `Chặn phát hành lời mời "${inv.occasion}": ${problems.join('; ')}`, decision: 'deny', epoch: s.epoch() });
    return { ok: false, reason: problems.join('; ') };
  }
  set((st) => {
    const x = st.invitations.find((i) => i.id === id)!;
    x.status = 'delivered';
    x.deliveredAt = Date.now();
    x.history.push({ at: Date.now(), text: 'Đã chuyển giao tới người nhận · chờ biên nhận' });
  });
  await s.log({ kind: 'note', actor: 'A', summary: `Phát hành lời mời "${inv.occasion}" sau khi kiểm lại quyền (epoch ${s.epoch()})`, decision: 'allow' });
  return { ok: true };
}

export function respondInvitation(id: string, memberId: string, response: 'accepted' | 'declined' | 'later') {
  set((s) => {
    const x = s.invitations.find((i) => i.id === id);
    if (x) {
      x.receipts[memberId] = response;
      x.history.push({ at: Date.now(), text: `${memberName(memberId)}: ${response === 'accepted' ? 'sẽ tham gia' : response === 'declined' ? 'không tham gia' : 'trả lời sau'}` });
    }
  });
}

export function setInvitationStatus(id: string, status: Invitation['status']) {
  set((s) => {
    const x = s.invitations.find((i) => i.id === id);
    if (x) {
      x.status = status;
      x.history.push({ at: Date.now(), text: status === 'snoozed' ? 'Hoãn' : status === 'dismissed' ? 'Bỏ qua' : 'Mở lại để duyệt' });
    }
  });
}

export async function saveMyWindows(memberId: string, windows: { start: string; end: string }[]) {
  const s = getSentinel();
  const cal = getApp().calendars.find((c) => c.memberId === memberId);
  if (!cal) return;
  const version = (s.vault.meta(`cal-${memberId}`)?.version ?? 0) + 1;
  await s.protect({ subject: memberId, objectId: `cal-${memberId}`, type: 'calendar.freebusy', label: `Lịch rảnh/bận của ${memberName(memberId)}`, data: { windows, quietFrom: cal.quietFrom, tz: 'GMT+7' }, viewers: cal.shared ? cal.viewers : [], purposes: ['rhythm.intersect'], version });
  set((st) => {
    const c = st.calendars.find((x) => x.memberId === memberId)!;
    c.windows = windows;
    c.version = version;
  });
}

export async function revokePermission(permId: string, by: string, reason = 'Người sở hữu thu hồi') {
  const app = getApp();
  const p = app.permissions.find((x) => x.id === permId);
  if (!p) return;
  const s = getSentinel();
  let epoch: number;
  if (p.objectId && s.vault.meta(p.objectId)) {
    const meta = s.vault.meta(p.objectId)!;
    s.vault.updateAcl(p.objectId, { viewers: [] });
    epoch = s.R.bumpEpoch(s.tenant);
    await s.log({ kind: 'policy.revoke', actor: 'G', severity: 'notice', summary: `Thu hồi quyền ${p.title.toLowerCase()} (${meta.label})`, subject: by, objectId: p.objectId, epoch, data: { reason } });
  } else epoch = await s.revokeScope({ actor: by, scope: p.title, reason });
  const now = Date.now();
  const affected = app.syncDevices.filter((d) => p.viewers.includes(d.ownerId) || d.id === 'dev-hub' || d.ownerId === p.ownerId);
  set((st) => {
    const x = st.permissions.find((y) => y.id === permId)!;
    x.status = 'revoked';
    if (p.scope === 'calendar') {
      const c = st.calendars.find((y) => y.memberId === p.ownerId);
      if (c) {
        c.shared = false;
        c.viewers = [];
      }
    }
    st.syncJobs.unshift({
      id: randomId('sync', 4),
      permissionId: permId,
      title: p.title,
      version: epoch,
      at: now,
      devices: affected.map((d) => ({ deviceId: d.id, status: 'pending', oldExpiry: d.online ? undefined : now + 6 * 60_000 })),
    });
  });
}

export async function regrantPermission(permId: string, by: string) {
  const p = getApp().permissions.find((x) => x.id === permId);
  if (!p) return;
  const s = getSentinel();
  if (p.objectId) for (const v of p.viewers) await s.addViewer({ actor: p.ownerId, objectId: p.objectId, viewer: v });
  set((st) => {
    const x = st.permissions.find((y) => y.id === permId)!;
    x.status = 'granted';
    if (p.scope === 'calendar') {
      const c = st.calendars.find((y) => y.memberId === p.ownerId);
      if (c) {
        c.shared = true;
        c.viewers = [...p.viewers];
      }
    }
  });
  await s.log({ kind: 'policy.change', actor: 'G', summary: `${memberName(by)} cấp lại quyền ${p.title.toLowerCase()}` });
}

export function tickSync() {
  const app = getApp();
  const now = Date.now();
  let changed = false;
  for (const j of app.syncJobs) for (const d of j.devices) if (d.status === 'pending' && app.syncDevices.find((x) => x.id === d.deviceId)?.online && now - j.at > (d.deviceId === 'dev-hub' ? 600 : 1400)) changed = true;
  if (!changed) return;
  set((st) => {
    for (const j of st.syncJobs)
      for (const d of j.devices) {
        const dev = st.syncDevices.find((x) => x.id === d.deviceId);
        if (d.status === 'pending' && dev?.online && now - j.at > (d.deviceId === 'dev-hub' ? 600 : 1400)) {
          d.status = 'applied';
          d.at = now;
        }
      }
  });
  void getSentinel().log({ kind: 'device.sync', actor: 'R', summary: 'Thiết bị xác nhận áp dụng phiên bản quyền mới' });
}

export function setSyncDeviceOnline(id: string, online: boolean) {
  set((s) => {
    const d = s.syncDevices.find((x) => x.id === id);
    if (d) d.online = online;
  });
}

async function sealBlob(bytes: ArrayBuffer) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { rawKey: toB64(await crypto.subtle.exportKey('raw', key)), iv: toB64(iv), ct };
}

async function openBlob(rawKey: string, iv: string, ct: ArrayBuffer) {
  const key = await crypto.subtle.importKey('raw', buf(fromB64(rawKey)), 'AES-GCM', false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(fromB64(iv)) }, key, ct);
}

export async function addMemory(p: { by: string; title: string; kind: Memory['kind']; transcript: string; caption: string; image?: string; audio?: Blob; durationSec?: number; viewers: string[]; ritualId?: string; derivedAllowed: boolean; retention: string; share: boolean }) {
  const id = randomId('m', 4);
  const objectId = `mem-${id}`;
  let audioKey = '';
  let audioRef: string | undefined;
  if (p.audio) {
    const sealed = await sealBlob(await p.audio.arrayBuffer());
    audioRef = `audio:${id}`;
    await blobs.set(audioRef, { iv: sealed.iv, ct: sealed.ct, type: p.audio.type });
    audioKey = sealed.rawKey;
  }
  const viewers = p.share ? p.viewers : [];
  const res = await getSentinel().protect({ subject: p.by, objectId, type: 'memory', label: `Ký ức · ${p.title}`, data: { title: p.title, transcript: p.derivedAllowed ? p.transcript : '', caption: p.caption, audioKey }, viewers, purposes: ['memory.view'] });
  if (!res.ok) return { ok: false, error: res.error };
  const mem: Memory = { id, title: p.title, kind: p.kind, narrator: p.by, createdAt: Date.now(), durationSec: p.durationSec, lang: 'vi', image: p.image, audioKey: audioRef, objectId, viewers, retention: p.retention, derivedAllowed: p.derivedAllowed, ritualId: p.ritualId, shared: p.share };
  set((s) => {
    s.memories.unshift(mem);
    if (p.ritualId) s.rituals.find((r) => r.id === p.ritualId)?.memoryIds.push(id);
  });
  return { ok: true, id };
}

export async function openMemory(memId: string, subject: string) {
  const mem = getApp().memories.find((m) => m.id === memId);
  if (!mem) return { ok: false as const, error: 'Không có ký ức', trace: [] as TraceStep[] };
  const r = await getSentinel().read<{ title: string; transcript: string; caption: string; audioKey: string }>({ subject, objectId: mem.objectId, purpose: 'memory.view' });
  if (!r.ok || !r.data) return { ok: false as const, error: r.error ?? 'Không có quyền', trace: r.trace };
  let audioUrl: string | undefined;
  if (mem.audioKey && r.data.audioKey) {
    const rec = await blobs.get<{ iv: string; ct: ArrayBuffer; type: string }>(mem.audioKey);
    if (rec) audioUrl = URL.createObjectURL(new Blob([await openBlob(r.data.audioKey, rec.iv, rec.ct)], { type: rec.type }));
  }
  return { ok: true as const, data: r.data, audioUrl, trace: r.trace };
}

export async function setMemoryViewers(memId: string, viewers: string[], by: string) {
  const mem = getApp().memories.find((m) => m.id === memId);
  if (!mem) return;
  const s = getSentinel();
  const removed = mem.viewers.filter((v) => !viewers.includes(v));
  for (const v of removed) await s.revoke({ actor: by, objectId: mem.objectId, viewer: v, reason: 'Người kể thu hồi quyền xem' });
  for (const v of viewers.filter((x) => !mem.viewers.includes(x))) await s.addViewer({ actor: by, objectId: mem.objectId, viewer: v });
  set((st) => {
    const m = st.memories.find((x) => x.id === memId)!;
    m.viewers = viewers;
    m.shared = viewers.length > 0;
  });
}

export async function addContribution(goalId: string, amount: number, by: string, visibleTo: string[]) {
  const id = randomId('c', 4);
  const objectId = `fund-${id}`;
  const r = await getSentinel().protect({ subject: by, objectId, type: 'fund.entry', label: `Khoản tự ghi của ${memberName(by)}`, data: { amount, note: 'Khoản tự ghi', by }, viewers: visibleTo.filter((v) => v !== by), purposes: ['fund.view'] });
  if (!r.ok) return { ok: false, error: r.error };
  set((s) => {
    s.contributions.unshift({ id, goalId, amount, by, at: Date.now(), objectId, visibleTo });
  });
  return { ok: true, id };
}

export async function readContribution(id: string, subject: string): Promise<ReadResult<{ amount: number; note: string; by: string }>> {
  const c = getApp().contributions.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Không có khoản', trace: [] };
  return getSentinel().read<{ amount: number; note: string; by: string }>({ subject, objectId: c.objectId, purpose: 'fund.view' });
}

export async function startCamera(deviceId: string, subject: string) {
  const r = await getSentinel().read<{ maxSessionSec: number; masks: string }>({ subject, objectId: 'cam-living', purpose: 'camera.view', fields: ['maxSessionSec', 'masks'] });
  if (!r.ok || !r.data) return { ok: false as const, error: r.error ?? 'Không có quyền xem camera', trace: r.trace };
  const id = randomId('cam', 4);
  const sec = Math.min(240, Number(r.data.maxSessionSec) || 240);
  set((s) => {
    s.cameraSessions.unshift({ id, deviceId, startedAt: Date.now(), expiresAt: Date.now() + sec * 1000, grantId: r.grantId, status: 'active', by: subject });
  });
  return { ok: true as const, id, masks: r.data.masks, trace: r.trace };
}

export async function endCamera(id: string, reason = 'Người xem kết thúc phiên') {
  set((s) => {
    const c = s.cameraSessions.find((x) => x.id === id);
    if (c && c.status === 'active') {
      c.status = 'ended';
      c.endedAt = Date.now();
    }
  });
  await getSentinel().log({ kind: 'session', actor: 'Ve', summary: `Đóng phiên xem camera ${id}: ${reason}, đầu phát xác nhận` });
}

export async function changeRole(memberId: string, role: Member['role'], by: string) {
  const me = getApp().members.find((m) => m.id === by);
  if (me?.role !== 'admin') return { ok: false, reason: 'Chỉ quản trị hộ được đổi vai trò.' };
  set((s) => {
    const m = s.members.find((x) => x.id === memberId);
    if (m) m.role = role;
  });
  const s = getSentinel();
  const d = s.directory.get(memberId);
  if (d) s.directory.upsert({ ...d, role });
  s.R.bumpEpoch(s.tenant);
  await s.log({ kind: 'policy.change', actor: 'G', severity: 'notice', summary: `${memberName(by)} đổi vai trò ${memberName(memberId)} → ${role}`, epoch: s.epoch() });
  return { ok: true };
}

export function newInviteCode() {
  const part = () => randomId('', 2).slice(1).toUpperCase();
  return `NHA-AN-${part()}${part()}`;
}

export async function assistantSend(text: string, by: string) {
  const at = Date.now();
  set((s) => {
    s.chat.push({ id: randomId('msg', 4), from: 'user', text, at });
  });
  const intent = parseIntent(text);
  let reply = '';
  let action: { label: string; to: string } | undefined;
  if (intent.kind === 'invite') {
    const app = getApp();
    const recips = app.members.filter((m) => m.id !== by && (m.id === 'u-lan' || m.id === 'u-linh')).map((m) => m.id);
    const r = await createInvitation({ hostId: by, occasion: intent.occasion, recipients: recips });
    if (r.ok) {
      reply = `Đã lấy giờ rảnh được chia sẻ. Xem lời mời lúc ${r.rhythm.slot ? fmtSlot(r.rhythm.slot) : ''} và kiểm tra ${recips.length} người nhận.${r.rhythm.denied.length ? ` Không đọc được lịch của ${namesOf(r.rhythm.denied.map((d) => d.memberId))}.` : ''}`;
      action = { label: 'Mở bản nháp cần duyệt', to: `/f/draft/${r.id}` };
    } else reply = `Chưa tạo được lời mời: ${r.error}`;
  } else if (intent.kind === 'task') {
    reply = `Mình gợi ý tạo việc "${intent.title}". Bạn chọn người phụ trách và giờ nhắc trước khi lưu.`;
    action = { label: 'Tạo việc chung', to: `/f/task-new?title=${encodeURIComponent(intent.title)}` };
  } else if (intent.kind === 'story') {
    reply = 'Bạn có thể thu âm lời kể; lời chép chỉ tạo khi người kể đồng ý và quyền bản chép không rộng hơn bản gốc.';
    action = { label: 'Thêm ký ức', to: '/f/memory-new' };
  } else if (intent.kind === 'sos') {
    reply = 'Nếu cần giúp ngay, mở màn SOS để báo tại nhà và người thân. Trợ lý không tự gửi SOS.';
    action = { label: 'Mở SOS', to: '/f/sos' };
  } else if (intent.kind === 'device') {
    reply = `Lệnh thiết bị cần đúng quyền và phản hồi từ hub. Mở danh sách thiết bị để ${intent.on ? 'bật' : 'tắt'} ${intent.target.trim()}.`;
    action = { label: 'Thiết bị thông minh', to: '/f/smart' };
  } else {
    reply = 'Mình có thể soạn lời mời ăn cơm, gợi ý việc chung, giữ lại lời kể hoặc mở SOS. Bạn muốn làm gì?';
  }
  set((s) => {
    s.chat.push({ id: randomId('msg', 4), from: 'assistant', text: reply, at: Date.now(), action });
  });
}

export function sendSOS(byId: string, room: 'living' | 'bedroom' = 'living') {
  const by = getApp().members.find((m) => m.id === byId)!;
  return getHome().sos({ id: by.id, name: by.name, role: by.role }, room);
}

export async function readSupportLocation(subject: string) {
  return getSentinel().read<{ place: string; lat: number; lng: number }>({ subject, objectId: 'loc-u-lan', purpose: 'support.location', fields: ['place', 'lat', 'lng'] });
}

export async function resetEverything() {
  getApp().resetAll();
  await getSentinel().resetAll();
  getHome().reset();
  await bootstrap();
}

export async function setCalendarShared(memberId: string, shared: boolean) {
  const s = getSentinel();
  const objectId = `cal-${memberId}`;
  const family = getApp().members.filter((m) => m.id !== memberId && (m.role === 'admin' || m.role === 'member')).map((m) => m.id);
  const viewers = [...family, 'svc-rhythm'];
  if (shared) {
    for (const v of viewers) await s.addViewer({ actor: memberId, objectId, viewer: v });
  } else {
    s.vault.updateAcl(objectId, { viewers: [] });
    const epoch = s.R.bumpEpoch(s.tenant);
    await s.log({ kind: 'policy.revoke', actor: 'G', severity: 'notice', summary: `${memberName(memberId)} tắt chia sẻ lịch rảnh/bận`, subject: memberId, objectId, epoch });
  }
  set((st) => {
    const c = st.calendars.find((x) => x.memberId === memberId);
    if (c) {
      c.shared = shared;
      c.viewers = shared ? viewers : [];
    }
    const p = st.permissions.find((x) => x.objectId === objectId);
    if (p) p.status = shared ? 'granted' : 'revoked';
  });
}

export function markInvitationApproved(id: string, by: string, approval: { id: string; epoch: number }) {
  set((s) => {
    const x = s.invitations.find((i) => i.id === id);
    if (!x) return;
    x.status = 'queued';
    x.approvedAt = Date.now();
    x.approvedBy = by;
    x.approvedEpoch = approval.epoch;
    x.approvalId = approval.id;
    x.history.push({ at: Date.now(), text: `${memberName(by)} duyệt bằng khóa thiết bị và xếp hàng gửi (epoch ${approval.epoch})` });
  });
}

export async function regenerateInvitation(id: string, tone: 'warm' | 'short' | 'formal') {
  const inv = getApp().invitations.find((i) => i.id === id);
  if (!inv) return;
  const app = getApp();
  const host = app.members.find((m) => m.id === inv.hostId)!;
  const facts: InviteFacts = {
    occasion: inv.occasion,
    slot: inv.slot,
    tz: inv.tz,
    host: host.name,
    hostSelf: host.selfRef,
    place: inv.place,
    tone,
    recipients: inv.recipients.map((rid) => {
      const m = app.members.find((x) => x.id === rid)!;
      const cur = inv.draft.messages.find((x) => x.recipientId === rid);
      return { id: m.id, name: m.name, address: m.address, lang: (cur?.lang ?? m.lang) as 'vi' | 'en' };
    }),
  };
  const r = await draftInvitation(facts, app.prefs.claudeEnabled && app.prefs.claudeKey ? { apiKey: app.prefs.claudeKey, model: app.prefs.claudeModel } : null);
  set((s) => {
    const x = s.invitations.find((i) => i.id === id)!;
    x.draft = r.draft;
    x.gen = { provider: r.provider, model: r.model, checks: r.checks, fellBack: r.fellBack, ms: r.ms };
    x.history.push({ at: Date.now(), text: `Tạo lại bản nháp (${tone}) bằng ${r.provider === 'claude' ? 'Claude' : 'mẫu trên thiết bị'}` });
  });
}
