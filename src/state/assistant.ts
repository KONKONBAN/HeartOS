import * as z from 'zod/v4';
import { create } from 'zustand';
import { AiError, cleanText, defineTool, PROVIDER_NAME, type AiProvider, type AiTool, type TurnInput, type TurnResult } from '../core/ai/types';
import { describe as describeRecurrence, nextOccurrence } from '../core/family/recurrence';
import { fmtClock, fmtDistance, fmtDuration, parseLatLng, type LngLat } from '../core/maps/geo';
import { getRoutes, MODES, type TravelMode } from '../core/maps/route';
import { searchPlaces } from '../core/maps/search';
import type { Actor } from '../core/smarthome/engine';
import type { Device } from '../core/smarthome/types';
import { randomId } from '../core/sentinel/encoding';
import { speak } from '../lib/media';
import { assistantSend, createInvitation, currentLocation } from './actions';
import { baseFor, ensureGatewayToken, isManaged, isNeutral, keyFor, modelFor, providerOrder, refreshGateway } from './aiConfig';
import { getHome, getSentinel } from './services';
import { adultIds, getApp, greetName, memberName, useApp } from './store';
import type { AiAction, AiConversation, ChatMsg, Member } from './types';

export interface AiLive {
  busy: boolean;
  owner: string;
  text: string;
  tool: string | null;
  provider: AiProvider | null;
  controller: AbortController | null;
}

export const useAiLive = create<AiLive>(() => ({ busy: false, owner: '', text: '', tool: null, provider: null, controller: null }));

const TOOL_LABEL: Record<string, string> = {
  get_tasks: 'Đang xem việc chung',
  get_schedule: 'Đang xem lịch gia đình',
  get_home_status: 'Đang xem trạng thái nhà',
  search_places: 'Đang tìm địa điểm',
  get_route: 'Đang tính đường đi',
  propose_task: 'Đang chuẩn bị việc',
  propose_device_action: 'Đang chuẩn bị lệnh thiết bị',
  propose_scene: 'Đang chuẩn bị cảnh',
  propose_directions: 'Đang chuẩn bị chỉ đường',
  propose_call: 'Đang chuẩn bị cuộc gọi',
  propose_invitation: 'Đang chuẩn bị lời mời',
  open_screen: 'Đang mở màn hình',
};

export const toolLabel = (name: string | null) => (name ? TOOL_LABEL[name] ?? 'Đang xử lý' : '');

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();

function findMember(name: string | undefined, members: Member[]) {
  if (!name) return null;
  const q = strip(name);
  return members.find((m) => strip(m.name) === q) ?? members.find((m) => strip(m.name).includes(q) || q.includes(strip(m.name)) || strip(m.address) === q || strip(m.relation).includes(q)) ?? null;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

const WEEKDAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function dayWord(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start) / 86400_000);
  if (diff === 0) return 'hôm nay';
  if (diff === 1) return 'ngày mai';
  if (diff === -1) return 'hôm qua';
  return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function when(ts: number) {
  return `${fmtClock(ts)} ${dayWord(ts)}`;
}

function deviceState(d: Device) {
  const s = d.state;
  if (!d.online) return 'mất kết nối';
  switch (d.kind) {
    case 'light':
      return s.on ? `đang bật${s.brightness !== undefined ? ` ${s.brightness}%` : ''}` : 'đang tắt';
    case 'plug':
    case 'siren':
      return s.on ? 'đang bật' : 'đang tắt';
    case 'ac':
      return s.on ? `đang chạy, đặt ${s.target}°C${s.current !== undefined ? `, phòng ${s.current}°C` : ''}` : 'đang tắt';
    case 'curtain':
      return `mở ${s.position ?? 0}%`;
    case 'lock':
      return s.locked ? 'đang khóa' : 'đang mở khóa';
    case 'valve':
      return s.open ? 'van đang mở' : 'van đang đóng';
    case 'door':
      return s.open ? 'cửa đang mở' : 'cửa đóng';
    case 'smoke':
      return s.smoke ? 'ĐANG BÁO KHÓI' : 'bình thường';
    case 'leak':
      return s.wet ? 'ĐANG BÁO RÒ NƯỚC' : 'khô ráo';
    case 'radar':
      return Number(s.targets) > 0 ? `có ${s.targets} người` : 'không có người';
    case 'thermal':
      return s.maxC !== undefined ? `nhiệt độ cao nhất ${s.maxC}°C` : 'đang đo';
    case 'camera':
      return s.privacy ? 'chế độ riêng tư' : 'đang hoạt động';
    default:
      return 'trực tuyến';
  }
}

function systemPrompt(me: Member): string {
  const app = getApp();
  const ai = app.prefs.ai;
  const lang = app.prefs.assistantLang === 'en-US' ? 'English' : 'tiếng Việt';
  const others = app.members.filter((m) => m.id !== me.id);
  const roleText: Record<Member['role'], string> = { admin: 'quản trị hộ', member: 'thành viên', child: 'trẻ em', carer: 'người hỗ trợ theo ca' };
  const family = others.length
    ? others.map((m) => `- ${m.name}: ${m.relation || roleText[m.role]}, vai trò ${roleText[m.role]}${m.mode === 'simple' ? ', dùng giao diện Thân Quen (người lớn tuổi)' : ''}${m.phone ? ', có số điện thoại' : ''}`).join('\n')
    : '- Chưa có thành viên khác.';
  const shares = [
    ai.shareSchedule ? 'được xem việc chung và lịch mà người đang chat có quyền xem' : 'KHÔNG được xem việc và lịch',
    ai.shareHome ? 'được xem trạng thái thiết bị và sự cố trong nhà' : 'KHÔNG được xem thiết bị và sự cố',
    ai.shareLocation ? 'được dùng vị trí hiện tại của điện thoại khi tìm đường' : 'KHÔNG được dùng vị trí hiện tại (chỉ dùng vị trí nhà)',
  ];
  return [
    `Bạn là Trợ lý HeartOS, trợ lý của gia đình "${app.household?.name ?? 'Nhà của bạn'}" trong ứng dụng HeartOS. Bạn giúp cả nhà sắp xếp việc chung, lịch sinh hoạt, chăm sóc ông bà, dùng thiết bị trong nhà và đi lại an toàn.`,
    '',
    'Người đang trò chuyện với bạn:',
    `- Tên: ${me.name}. Quan hệ: ${me.relation || roleText[me.role]}. Vai trò: ${roleText[me.role]}.`,
    `- Gọi người này là "${greetName(me)}".${me.mode === 'simple' ? ' Người này dùng giao diện Thân Quen dành cho người lớn tuổi: nói thật ngắn, từng ý một, từ ngữ quen thuộc, lễ phép.' : ''}`,
    '',
    'Các thành viên khác trong nhà:',
    family,
    '',
    `Quyền dữ liệu gia đình đã chọn: ${shares.join('; ')}.`,
    '',
    'Cách làm việc:',
    `1. Luôn trả lời bằng ${lang} tự nhiên, ấm áp, ngắn gọn, đúng xưng hô trong gia đình Việt Nam.`,
    '2. Thông tin về việc, lịch, thiết bị, địa điểm và đường đi phải lấy từ công cụ. Không bịa. Nếu công cụ báo không có quyền hoặc không có dữ liệu thì nói rõ.',
    '3. Mọi hành động (tạo việc, điều khiển thiết bị, chạy cảnh, chỉ đường, gọi điện, soạn lời mời) chỉ được làm qua các công cụ propose_* hoặc open_screen. Các công cụ này chỉ hiện thẻ để người dùng bấm duyệt. Đừng nói là đã làm xong; hãy nói bạn đã chuẩn bị và người dùng bấm Duyệt ở thẻ bên dưới.',
    '4. Tình huống khẩn cấp (ngã, bất tỉnh, khó thở, đau ngực, nghi đột quỵ, cháy, rò khí, bị đe dọa): trả lời ngay câu đầu tiên là bấm nút SOS trong HeartOS hoặc gọi 115 (cấp cứu), 114 (cứu hỏa), 113 (công an), rồi dùng open_screen với màn sos. Không trì hoãn bằng câu hỏi.',
    '5. Về sức khỏe và thuốc: chỉ đưa thông tin chung, dễ hiểu; không chẩn đoán, không kê đơn; khuyên hỏi bác sĩ hoặc dược sĩ.',
    '6. Không đề xuất mở khóa cửa, tắt còi hay tắt cảm biến an toàn. Việc mở khóa cửa phải làm trực tiếp trên màn thiết bị.',
    '7. Định dạng: văn bản thuần, câu ngắn. Danh sách dùng gạch đầu dòng "- ". Có thể in đậm ý quan trọng bằng **chữ**. Không dùng tiêu đề markdown, bảng, emoji. Không dùng các ký tự "·", "→", "…" hay gạch dài; dùng dấu phẩy, dấu chấm thay thế.',
    '8. Giờ viết theo kiểu 24 giờ như 18:30. Khoảng cách dùng m hoặc km.',
    '9. Nếu yêu cầu chưa rõ (ví dụ chưa rõ ai làm, mấy giờ), hỏi lại một câu ngắn hoặc chọn mặc định hợp lý và nói rõ để người dùng sửa trước khi duyệt.',
  ].join('\n');
}

function contextBlock(me: Member, conv: AiConversation, simple: boolean) {
  const now = new Date();
  const lines = [
    `Thời điểm: ${WEEKDAY[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${fmtClock(now.getTime())} (${getApp().household?.tz ?? 'Asia/Ho_Chi_Minh'})`,
    `Giao diện đang dùng: ${simple ? 'Thân Quen' : 'Gia Đình'}`,
  ];
  if (conv.notes.length) lines.push('Kết quả các thẻ đề xuất trước:', ...conv.notes.map((n) => `- ${n}`));
  void me;
  return `<ngu_canh_ung_dung>\n${lines.join('\n')}\n</ngu_canh_ung_dung>`;
}

async function originPoint(kind: 'me' | 'home' | undefined): Promise<{ at: LngLat; label: string } | null> {
  const app = getApp();
  const home = app.household?.home;
  if (kind !== 'home' && app.prefs.ai.shareLocation) {
    const loc = await currentLocation(6000);
    if (loc) return { at: [loc.lng, loc.lat], label: 'vị trí hiện tại' };
  }
  if (home) return { at: [home.lng, home.lat], label: 'nhà' };
  return null;
}

const HOME_WORDS = ['nha', 've nha', 'nha minh', 'home', 'nha cua toi'];

async function resolveDestination(text: string, near?: LngLat): Promise<{ at: LngLat; name: string; address: string } | null> {
  const app = getApp();
  const ll = parseLatLng(text);
  if (ll) return { at: ll, name: 'Vị trí đã chọn', address: text };
  const home = app.household?.home;
  if (home && HOME_WORDS.includes(strip(text))) return { at: [home.lng, home.lat], name: home.label || 'Nhà', address: 'Nhà' };
  const hospital = app.hospitals.find((h) => h.lat !== undefined && strip(h.name) === strip(text));
  if (hospital?.lat !== undefined && hospital.lng !== undefined) return { at: [hospital.lng, hospital.lat], name: hospital.name, address: hospital.address };
  const list = await searchPlaces(text, { near, limit: 1 });
  const p = list[0];
  return p ? { at: [p.lng, p.lat], name: p.name, address: p.address } : null;
}

const MODE_IDS = MODES.map((m) => m.id) as [TravelMode, ...TravelMode[]];
const modeLabel = (m: TravelMode) => MODES.find((x) => x.id === m)?.label ?? m;

function buildTools(me: Member, actions: AiAction[]): AiTool[] {
  const app = () => getApp();
  const actor: Actor = { id: me.id, name: me.name, role: me.role };
  const propose = (a: Omit<AiAction, 'id' | 'status'>) => {
    const action: AiAction = { ...a, id: randomId('act', 5), status: 'pending' };
    actions.push(action);
    return `Đã hiện thẻ "${a.title}" (${a.detail}) để người dùng bấm Duyệt. Chưa thực hiện cho tới khi người dùng duyệt.`;
  };

  const tools: AiTool[] = [
    defineTool({
      name: 'get_tasks',
      description: 'Liệt kê việc chung trong gia đình mà người đang chat được xem: tên việc, người làm, giờ nhắc, trạng thái.',
      schema: z.object({ range: z.enum(['today', 'tomorrow', 'week', 'all']).optional().describe('Khoảng thời gian, mặc định week'), include_done: z.boolean().optional() }),
      run: ({ range = 'week', include_done }) => {
        if (!app().prefs.ai.shareSchedule) return 'Gia đình chưa cho phép trợ lý xem việc và lịch. Người dùng có thể bật trong Cài đặt trợ lý AI.';
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const end = range === 'today' ? start + 86400_000 : range === 'tomorrow' ? start + 2 * 86400_000 : range === 'week' ? start + 8 * 86400_000 : Infinity;
        const from = range === 'tomorrow' ? start + 86400_000 : range === 'all' ? -Infinity : start - 86400_000;
        const list = app()
          .tasks.filter((t) => t.visibleTo.includes(me.id) || t.assignee === me.id || t.createdBy === me.id)
          .filter((t) => (include_done ? true : t.status !== 'done'))
          .filter((t) => t.remindAt >= from && t.remindAt < end)
          .sort((a, b) => a.remindAt - b.remindAt);
        if (!list.length) return 'Không có việc nào trong khoảng này.';
        const status: Record<string, string> = { open: 'chưa ai nhận', accepted: 'đã nhận', scheduled: 'đã hẹn', done: 'đã xong' };
        return list.map((t) => `- ${t.title}: ${memberName(t.assignee)} làm, nhắc ${when(t.remindAt)}, ${status[t.status]}${t.kind === 'call' && t.target ? `, gọi cho ${memberName(t.target)}` : ''}${t.note ? `. Ghi chú: ${t.note}` : ''}`).join('\n');
      },
    }),
    defineTool({
      name: 'get_schedule',
      description: 'Xem lịch sinh hoạt gia đình: các nếp nhà định kỳ (bữa cơm, kể chuyện), lời mời đang chờ, khung giờ rảnh hôm nay mà thành viên chia sẻ.',
      schema: z.object({ days: z.number().int().min(1).max(31).optional().describe('Số ngày tới, mặc định 7') }),
      run: ({ days = 7 }) => {
        if (!app().prefs.ai.shareSchedule) return 'Gia đình chưa cho phép trợ lý xem việc và lịch.';
        const out: string[] = [];
        const until = Date.now() + days * 86400_000;
        for (const r of app().rituals) {
          const next = nextOccurrence(r.recurrence, new Date(), r.skip);
          if (next.getTime() <= until) out.push(`- Nếp nhà "${r.name}" (${describeRecurrence(r.recurrence)}): lần tới ${when(next.getTime())}, gồm ${r.participants.map((p) => memberName(p)).join(', ')}`);
        }
        const invText: Record<string, string> = { queued: 'đang chờ tới giờ gửi', delivered: 'đã gửi', snoozed: 'tạm hoãn', blocked: 'bị chặn do quyền' };
        for (const inv of app().invitations.filter((i) => invText[i.status])) out.push(`- Lời mời "${inv.occasion}": ${invText[inv.status]}`);
        for (const c of app().calendars.filter((c) => c.shared && (c.viewers.includes(me.id) || c.memberId === me.id))) {
          if (c.windows.length) out.push(`- ${memberName(c.memberId)} rảnh hôm nay: ${c.windows.map((w) => `${w.start}-${w.end}`).join(', ')}`);
        }
        return out.length ? out.join('\n') : 'Chưa có lịch hay nếp nhà nào trong khoảng này.';
      },
    }),
    defineTool({
      name: 'get_home_status',
      description: 'Xem trạng thái nhà thông minh: thiết bị (đèn, ổ cắm, điều hòa, rèm, khóa, van, cảm biến), sự cố đang mở và chế độ nhà.',
      schema: z.object({ room: z.string().optional().describe('Tên phòng nếu chỉ cần một phòng') }),
      run: ({ room }) => {
        if (!app().prefs.ai.shareHome) return 'Gia đình chưa cho phép trợ lý xem thiết bị và sự cố.';
        const home = getHome();
        if (home.s.real && !home.s.ha) return 'Nhà chưa kết nối Home Assistant nên chưa có thiết bị. Quản trị hộ vào Thêm, Home Assistant để kết nối.';
        const rooms = home.s.rooms;
        const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
        let devices = home.s.devices.filter((d) => d.kind !== 'hub' && d.paired);
        if (room) devices = devices.filter((d) => strip(roomName(d.room)).includes(strip(room)));
        const lines = devices.map((d) => `- ${d.name} (${roomName(d.room)}): ${deviceState(d)}${d.battery !== undefined && d.battery < 20 ? `, pin yếu ${d.battery}%` : ''}`);
        const open = home.openIncidents();
        const head = [`Chế độ nhà: ${home.s.mode === 'away' ? 'vắng nhà' : home.s.mode === 'night' ? 'ban đêm' : 'ở nhà'}.`, open.length ? `Sự cố đang mở: ${open.map((i) => `${i.title} (${i.id})`).join('; ')}.` : 'Không có sự cố đang mở.'];
        return [...head, ...(lines.length ? lines : ['Không có thiết bị phù hợp.'])].join('\n');
      },
    }),
    defineTool({
      name: 'search_places',
      description: 'Tìm địa điểm trên bản đồ (bệnh viện, nhà thuốc, quán ăn, địa chỉ...). Trả về tên, địa chỉ, khoảng cách và tọa độ.',
      schema: z.object({ query: z.string().min(2).describe('Từ khóa tìm, ví dụ "nhà thuốc", "Bệnh viện Chợ Rẫy"'), near: z.enum(['me', 'home']).optional().describe('Tìm gần vị trí hiện tại (me) hay gần nhà (home)') }),
      run: async ({ query, near }) => {
        const o = await originPoint(near);
        const list = await searchPlaces(query, { near: o?.at, limit: 5 });
        if (!list.length) return 'Không tìm thấy địa điểm phù hợp.';
        return list.map((p, i) => `${i + 1}. ${p.name}${p.kind ? ` (${p.kind})` : ''}, ${p.address || 'chưa rõ địa chỉ'}${p.distance !== undefined ? `, cách ${o?.label ?? ''} ${fmtDistance(p.distance)}` : ''}. Tọa độ ${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('\n');
      },
    }),
    defineTool({
      name: 'get_route',
      description: 'Tính đường đi và thời gian tới một nơi bằng xe máy, ô tô, đi bộ hoặc xe đạp.',
      schema: z.object({ destination: z.string().min(2).describe('Tên nơi đến, "nhà", hoặc tọa độ "lat,lng"'), mode: z.enum(MODE_IDS).optional().describe('Mặc định motorbike'), origin: z.enum(['me', 'home']).optional() }),
      run: async ({ destination, mode = 'motorbike', origin }) => {
        const o = await originPoint(origin);
        if (!o) return 'Chưa có vị trí xuất phát: điện thoại chưa cho phép vị trí và nhà chưa đặt vị trí trên bản đồ.';
        const d = await resolveDestination(destination, o.at);
        if (!d) return `Không tìm thấy "${destination}" trên bản đồ.`;
        const routes = await getRoutes(o.at, d.at, mode);
        const best = routes[0];
        const alt = routes[1] ? ` Có ${routes.length - 1} tuyến khác, dài nhất ${fmtDuration(Math.max(...routes.map((r) => r.duration)))}.` : '';
        return `Từ ${o.label} tới ${d.name} (${d.address}) bằng ${modeLabel(mode).toLowerCase()}: ${fmtDistance(best.distance)}, khoảng ${fmtDuration(best.duration)}, ${best.via}. Nếu đi bây giờ sẽ tới lúc ${fmtClock(Date.now() + best.duration * 1000)}.${alt} Tọa độ nơi đến ${d.at[1].toFixed(6)},${d.at[0].toFixed(6)}.`;
      },
    }),
    defineTool({
      name: 'propose_task',
      description: 'Đề xuất tạo một việc chung hoặc lời nhắc gọi điện. Hiện thẻ để người dùng duyệt.',
      schema: z.object({
        title: z.string().min(2).max(80),
        assignee: z.string().optional().describe('Tên thành viên làm việc này, mặc định là người đang chat'),
        time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe('Giờ nhắc HH:mm'),
        day: z.string().optional().describe('"today", "tomorrow" hoặc ngày YYYY-MM-DD'),
        kind: z.enum(['chore', 'call']).optional(),
        call_target: z.string().optional().describe('Người cần gọi nếu kind là call'),
        note: z.string().max(200).optional(),
      }),
      run: ({ title, assignee, time, day, kind = 'chore', call_target, note }) => {
        const members = app().members;
        const who = findMember(assignee, members) ?? me;
        const target = kind === 'call' ? findMember(call_target, members) : null;
        if (kind === 'call' && !target) return `Không tìm thấy thành viên "${call_target ?? ''}" để gọi. Hỏi lại người dùng.`;
        const d = new Date();
        if (day === 'tomorrow') d.setDate(d.getDate() + 1);
        else if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
          const [y, m, dd] = day.split('-').map(Number);
          d.setFullYear(y, m - 1, dd);
        }
        const [h, mi] = (time ?? '18:00').split(':').map(Number);
        d.setHours(Math.min(23, h), Math.min(59, mi), 0, 0);
        if (!day && d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
        return propose({ kind: 'task', title: `Tạo việc: ${title}`, detail: `${who.name} làm, nhắc ${when(d.getTime())}${target ? `, gọi cho ${target.name}` : ''}`, payload: { title, assignee: who.id, remindAt: d.getTime(), kind, target: target?.id ?? null, note: note ?? '' } });
      },
    }),
    defineTool({
      name: 'propose_device_action',
      description: 'Đề xuất điều khiển một thiết bị: bật, tắt, chỉnh độ sáng, nhiệt độ điều hòa, mở hoặc đóng rèm, khóa cửa, đóng mở van nước. Không hỗ trợ mở khóa cửa.',
      schema: z.object({ device: z.string().min(2).describe('Tên thiết bị, ví dụ "đèn phòng khách"'), action: z.enum(['on', 'off', 'brightness', 'temperature', 'open', 'close', 'position', 'lock']), value: z.number().optional().describe('Độ sáng %, nhiệt độ °C hoặc vị trí rèm %') }),
      run: ({ device, action, value }) => {
        if (!app().prefs.ai.shareHome) return 'Gia đình chưa cho phép trợ lý dùng thiết bị.';
        const home = getHome();
        const q = strip(device);
        const list = home.s.devices.filter((d) => d.paired && d.controlRoles.length);
        const exact = list.filter((d) => strip(d.name) === q);
        const matches = exact.length ? exact : list.filter((d) => strip(d.name).includes(q) || q.split(' ').every((w) => strip(d.name).includes(w)));
        if (!matches.length) return `Không có thiết bị nào tên "${device}". Thiết bị điều khiển được: ${list.map((d) => d.name).join(', ') || 'chưa có'}.`;
        if (matches.length > 1) return `Có nhiều thiết bị khớp: ${matches.map((d) => d.name).join(', ')}. Hỏi người dùng muốn chọn cái nào.`;
        const d = matches[0];
        const perm = home.canControl(d, actor);
        if (!perm.ok) return `Không đề xuất được: ${perm.reason}`;
        let desired: Record<string, string | number | boolean>;
        let text: string;
        if (d.kind === 'light' && action === 'brightness') {
          const v = Math.max(1, Math.min(100, Math.round(value ?? 60)));
          desired = { on: true, brightness: v };
          text = `bật ${v}%`;
        } else if (d.kind === 'ac' && action === 'temperature') {
          const v = Math.max(16, Math.min(30, Math.round(value ?? 26)));
          desired = { on: true, target: v };
          text = `đặt ${v}°C`;
        } else if (d.kind === 'curtain') {
          const v = action === 'position' ? Math.max(0, Math.min(100, Math.round(value ?? 50))) : action === 'close' || action === 'off' ? 0 : 100;
          desired = { position: v };
          text = v === 0 ? 'đóng rèm' : v === 100 ? 'mở rèm' : `mở ${v}%`;
        } else if (d.kind === 'lock') {
          if (action !== 'lock' && action !== 'close') return 'Trợ lý chỉ đề xuất khóa cửa. Mở khóa phải làm trên màn thiết bị.';
          desired = { locked: true };
          text = 'khóa cửa';
        } else if (d.kind === 'valve') {
          const open = action === 'open' || action === 'on';
          desired = { open };
          text = open ? 'mở van' : 'đóng van';
        } else if (d.kind === 'camera') {
          return 'Trợ lý không điều khiển camera.';
        } else if (d.kind === 'siren' && action !== 'on') {
          return 'Trợ lý không đề xuất tắt còi. Người dùng tắt trên màn sự cố.';
        } else {
          const on = action === 'on' || action === 'open' || action === 'brightness' || action === 'temperature';
          desired = { on };
          text = on ? 'bật' : 'tắt';
        }
        return propose({ kind: 'device', title: `${text.charAt(0).toUpperCase() + text.slice(1)}: ${d.name}`, detail: `Hiện ${deviceState(d)}`, payload: { deviceId: d.id, desired: JSON.stringify(desired) } });
      },
    }),
    defineTool({
      name: 'propose_scene',
      description: 'Đề xuất chạy một cảnh trong nhà (ví dụ đi ngủ, ra khỏi nhà, xem phim).',
      schema: z.object({ scene: z.string().min(2) }),
      run: ({ scene }) => {
        if (!app().prefs.ai.shareHome) return 'Gia đình chưa cho phép trợ lý dùng thiết bị.';
        const scenes = getHome().s.scenes;
        const sc = scenes.find((s) => strip(s.name) === strip(scene)) ?? scenes.find((s) => strip(s.name).includes(strip(scene)));
        if (!sc) return `Không có cảnh "${scene}". Các cảnh hiện có: ${scenes.map((s) => s.name).join(', ') || 'chưa có'}.`;
        return propose({ kind: 'scene', title: `Chạy cảnh: ${sc.name}`, detail: sc.description || `${sc.actions.length} thao tác`, payload: { sceneId: sc.id } });
      },
    }),
    defineTool({
      name: 'propose_directions',
      description: 'Đề xuất mở bản đồ chỉ đường trong HeartOS tới một nơi. Nếu đã có tọa độ từ search_places hoặc get_route thì truyền lat, lng.',
      schema: z.object({ destination: z.string().min(2).describe('Tên nơi đến hoặc "nhà"'), lat: z.number().optional(), lng: z.number().optional(), mode: z.enum(MODE_IDS).optional() }),
      run: async ({ destination, lat, lng, mode = 'motorbike' }) => {
        let at: LngLat | null = lat !== undefined && lng !== undefined ? [lng, lat] : null;
        let name = destination;
        if (!at) {
          const o = await originPoint(undefined);
          const d = await resolveDestination(destination, o?.at);
          if (!d) return `Không tìm thấy "${destination}" trên bản đồ.`;
          at = d.at;
          name = d.name;
        }
        return propose({ kind: 'route', title: `Chỉ đường tới ${name}`, detail: `Đi bằng ${modeLabel(mode).toLowerCase()}`, payload: { lat: at[1], lng: at[0], name, mode } });
      },
    }),
    defineTool({
      name: 'propose_call',
      description: 'Đề xuất gọi điện cho một thành viên trong gia đình.',
      schema: z.object({ member: z.string().min(1) }),
      run: ({ member }) => {
        const m = findMember(member, app().members.filter((x) => x.id !== me.id));
        if (!m) return `Không tìm thấy thành viên "${member}".`;
        if (!m.phone) return `${m.name} chưa có số điện thoại trong hồ sơ.`;
        return propose({ kind: 'call', title: `Gọi cho ${m.name}`, detail: m.relation || 'Thành viên gia đình', payload: { memberId: m.id } });
      },
    }),
    defineTool({
      name: 'propose_invitation',
      description: 'Đề xuất soạn lời mời cả nhà (ví dụ bữa cơm). HeartOS sẽ tìm giờ rảnh chung rồi soạn bản nháp cho người dùng duyệt.',
      schema: z.object({ occasion: z.string().min(2).max(80).describe('Dịp, ví dụ "Bữa cơm tối nay"') }),
      run: ({ occasion }) => {
        if (!app().prefs.ai.shareSchedule) return 'Gia đình chưa cho phép trợ lý xem lịch nên chưa soạn lời mời được.';
        const n = adultIds(app().members, me.id).length;
        if (!n) return 'Nhà chưa có thành viên người lớn khác để mời.';
        return propose({ kind: 'invite', title: `Soạn lời mời: ${occasion}`, detail: `Gửi ${n} người, tìm giờ rảnh chung`, payload: { occasion } });
      },
    }),
    defineTool({
      name: 'open_screen',
      description: 'Mở nhanh một màn hình trong HeartOS: sos (gửi cứu hộ), tasks (việc chung), calendar (lịch), devices (thiết bị), map (bản đồ), memories (ký ức), hospitals (bệnh viện gần nhà), safety (an toàn).',
      schema: z.object({ screen: z.enum(['sos', 'tasks', 'calendar', 'devices', 'map', 'memories', 'hospitals', 'safety']) }),
      run: ({ screen }) => {
        const simple = me.mode === 'simple';
        const map: Record<string, [string, string]> = {
          sos: [simple ? '/s/help' : '/f/sos', 'Mở SOS'],
          tasks: [simple ? '/s/today' : '/f/tasks', 'Mở việc chung'],
          calendar: [simple ? '/s/today' : '/f/rhythm', 'Mở lịch gia đình'],
          devices: ['/f/smart', 'Mở thiết bị'],
          map: [simple ? '/s/maps' : '/f/maps', 'Mở bản đồ'],
          memories: [simple ? '/s/memory' : '/f/memories', 'Mở ký ức'],
          hospitals: ['/f/hospitals', 'Mở bệnh viện gần nhà'],
          safety: [simple ? '/s/help' : '/f/safe', 'Mở An toàn'],
        };
        const [to, label] = map[screen];
        actions.push({ id: randomId('act', 5), kind: 'open', title: label, detail: '', payload: { to }, status: 'pending' });
        return `Đã hiện nút "${label}" cho người dùng.`;
      },
    }),
  ];
  return tools;
}

function newConversation(me: Member): AiConversation {
  return { id: randomId('conv', 6), ownerId: me.id, startedAt: Date.now(), updatedAt: Date.now(), system: systemPrompt(me), provider: null, history: [], notes: [], turns: 0 };
}

function conversationFor(me: Member, fresh = false): AiConversation {
  const conv = getApp().aiConvs[me.id];
  if (!fresh && conv && conv.turns < 30 && Date.now() - conv.updatedAt < 8 * 3600_000) return conv;
  const c = newConversation(me);
  useApp.getState().set((s) => {
    s.aiConvs[me.id] = c;
  });
  return c;
}

export function startNewConversation(meId: string) {
  const me = getApp().members.find((m) => m.id === meId);
  if (!me) return;
  conversationFor(me, true);
  useApp.getState().set((s) => {
    s.chat = s.chat.filter((m) => m.by && m.by !== meId);
  });
}

function transcript(convId: string, exclude?: string) {
  return getApp()
    .chat.filter((m) => m.conv === convId && !m.error && m.id !== exclude)
    .map((m) => ({ from: m.from, text: m.text }));
}

async function callProvider(p: AiProvider, input: TurnInput): Promise<TurnResult> {
  if (p === 'claude') {
    const { claudeTurn } = await import('../core/ai/claude');
    return claudeTurn(input);
  }
  const { openaiTurn } = await import('../core/ai/openai');
  return openaiTurn(input);
}

async function rebuildHistory(p: AiProvider, convId: string, exclude: string) {
  const turns = transcript(convId, exclude);
  if (p === 'claude') return (await import('../core/ai/claude')).claudeHistoryFromTranscript(turns);
  return (await import('../core/ai/openai')).openaiHistoryFromTranscript(turns);
}

function push(msg: ChatMsg) {
  useApp.getState().set((s) => {
    s.chat.push(msg);
    if (s.chat.length > 300) s.chat.splice(0, s.chat.length - 300);
  });
}

export async function askAssistant(text: string, meId: string, opts: { simple?: boolean } = {}) {
  const app = getApp();
  const me = app.members.find((m) => m.id === meId);
  if (!me || !text.trim() || useAiLive.getState().busy) return;
  let ai = app.prefs.ai;
  const managed = isManaged(ai);
  if (managed && ai.enabled) {
    try {
      await refreshGateway();
      await ensureGatewayToken();
      ai = getApp().prefs.ai;
    } catch (e) {
      push({ id: randomId('msg', 4), from: 'user', text: text.trim(), at: Date.now(), by: me.id });
      push({ id: randomId('msg', 4), from: 'assistant', text: `Chưa kết nối được trợ lý. ${(e as Error).message}`, at: Date.now(), by: me.id, error: true });
      return;
    }
  }
  const order = providerOrder(ai);
  const neutral = isNeutral(ai);
  const label = (p: AiProvider) => (neutral ? (order.indexOf(p) === 0 ? 'Trợ lý HeartOS' : 'Máy chủ dự phòng') : PROVIDER_NAME[p]);
  if (!order.length) {
    useAiLive.setState({ busy: true, owner: me.id, text: '', tool: null, provider: null });
    try {
      await assistantSend(text.trim(), me.id);
    } finally {
      useAiLive.setState({ busy: false });
    }
    return;
  }
  const conv = conversationFor(me);
  const userMsg: ChatMsg = { id: randomId('msg', 4), from: 'user', text: text.trim(), at: Date.now(), by: me.id, conv: conv.id };
  const controller = new AbortController();
  useAiLive.setState({ busy: true, owner: me.id, text: '', tool: null, provider: order[0], controller });
  const actions: AiAction[] = [];
  const tools = buildTools(me, actions);
  const user = `${contextBlock(me, conv, !!opts.simple)}\n\n${text.trim()}`;
  const notices: string[] = [];
  let result: TurnResult | null = null;
  let used: AiProvider | null = null;
  let lastError: AiError | null = null;
  push(userMsg);
  for (const p of order) {
    actions.length = 0;
    useAiLive.setState({ text: '', tool: null, provider: p });
    const history = conv.provider === p ? conv.history : await rebuildHistory(p, conv.id, userMsg.id);
    const attempt = () =>
      callProvider(p, {
        key: keyFor(getApp().prefs.ai, p),
        model: modelFor(ai, p),
        system: conv.system,
        history,
        user,
        tools,
        signal: controller.signal,
        baseURL: baseFor(ai, p),
        managed,
        neutral,
        onText: (d) => useAiLive.setState((s) => ({ text: s.text + d, tool: null })),
        onTool: (name) => useAiLive.setState({ tool: name }),
      });
    try {
      try {
        result = await attempt();
      } catch (e) {
        if (!(managed && e instanceof AiError && e.kind === 'auth')) throw e;
        await ensureGatewayToken(true);
        actions.length = 0;
        useAiLive.setState({ text: '', tool: null });
        result = await attempt();
      }
      used = p;
      break;
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError((e as Error).message, 'network', p);
      lastError = err;
      if (err.kind === 'aborted') break;
      if (order.indexOf(p) < order.length - 1) notices.push(neutral ? 'Máy chủ chính đang bận, trợ lý dùng máy chủ dự phòng.' : `${label(p)} chưa trả lời được (${err.message}), ${label(order[order.indexOf(p) + 1])} trả lời thay.`);
    }
  }
  const live = useAiLive.getState().text;
  useAiLive.setState({ busy: false, text: '', tool: null, controller: null });
  if (!result || !used) {
    const aborted = lastError?.kind === 'aborted';
    push({ id: randomId('msg', 4), from: 'assistant', text: aborted ? (live ? cleanText(live) : 'Đã dừng.') : `Chưa gọi được trợ lý AI. ${lastError?.message ?? ''}`.trim(), at: Date.now(), by: me.id, conv: conv.id, error: !aborted || !live, action: aborted || neutral ? undefined : { label: 'Mở cài đặt trợ lý AI', to: '/f/ai-settings' } });
    return;
  }
  const answer = result.stop === 'refusal' ? 'Trợ lý không thể hỗ trợ yêu cầu này. Nếu đây là việc khẩn cấp, hãy bấm SOS hoặc gọi 115.' : cleanText(result.text.trim() || (actions.length ? 'Mình đã chuẩn bị, bạn xem thẻ bên dưới.' : 'Mình chưa có câu trả lời.'));
  if (result.fellBackModel && !neutral) notices.push(`Dùng ${result.fellBackModel} thay cho mô hình đã chọn.`);
  if (result.stop === 'length') notices.push('Câu trả lời dài quá nên bị cắt bớt.');
  const finalHistory = result.history;
  useApp.getState().set((s) => {
    const c = s.aiConvs[me.id];
    if (c && c.id === conv.id && result!.stop !== 'refusal') {
      c.provider = used;
      c.history = finalHistory as never[];
      c.notes = [];
      c.turns += 1;
      c.updatedAt = Date.now();
    }
  });
  push({ id: randomId('msg', 4), from: 'assistant', text: answer, at: Date.now(), by: me.id, conv: conv.id, provider: used, model: result.model, notice: notices.join(' ') || undefined, actions: actions.length ? actions.map((a) => ({ ...a })) : undefined });
  if (ai.speak || opts.simple) speak(answer.replace(/\*\*/g, ''), app.prefs.voiceLang);
  void getSentinel().log({ kind: 'note', actor: 'A', summary: `Trợ lý AI (${label(used)}) trả lời ${me.name}${actions.length ? `, ${actions.length} đề xuất chờ duyệt` : ''}` });
}

export function stopAssistant() {
  useAiLive.getState().controller?.abort();
}

function setAction(msgId: string, actionId: string, patch: Partial<AiAction>, note?: string) {
  useApp.getState().set((s) => {
    const msg = s.chat.find((m) => m.id === msgId);
    const a = msg?.actions?.find((x) => x.id === actionId);
    if (a) Object.assign(a, patch);
    if (note && msg?.by) {
      const c = s.aiConvs[msg.by];
      if (c && c.id === msg.conv) c.notes.push(note);
    }
  });
}

export function findAction(msgId: string, actionId: string) {
  return getApp()
    .chat.find((m) => m.id === msgId)
    ?.actions?.find((a) => a.id === actionId);
}

export async function approveAction(msgId: string, actionId: string, meId: string, nav: (to: string) => void) {
  const a = findAction(msgId, actionId);
  const app = getApp();
  const me = app.members.find((m) => m.id === meId);
  if (!a || a.status !== 'pending' || !me) return;
  const actor: Actor = { id: me.id, name: me.name, role: me.role };
  const p = a.payload;
  try {
    switch (a.kind) {
      case 'task': {
        const id = randomId('t', 6);
        const assignee = String(p.assignee);
        const visible = [...new Set([me.id, assignee, ...(p.target ? [String(p.target)] : [])])];
        useApp.getState().set((s) => {
          s.tasks.unshift({ id, title: String(p.title), place: '', note: String(p.note ?? ''), kind: p.kind === 'call' ? 'call' : 'chore', assignee, target: p.target ? String(p.target) : undefined, visibleTo: visible, remindAt: Number(p.remindAt), status: assignee === me.id ? 'accepted' : 'open', createdBy: me.id, createdAt: Date.now() });
        });
        void getSentinel().log({ kind: 'note', actor: 'A', summary: `${me.name} duyệt việc "${String(p.title)}" do trợ lý đề xuất` });
        setAction(msgId, actionId, { status: 'done', note: 'Đã lưu việc' }, `Người dùng đã duyệt và lưu việc "${String(p.title)}".`);
        return;
      }
      case 'device': {
        const desired = JSON.parse(String(p.desired)) as Record<string, string | number | boolean>;
        const cmd = getHome().sendCommand(String(p.deviceId), 'set', desired, actor, 'user');
        const ok = cmd.status !== 'rejected' && cmd.status !== 'failed';
        setAction(msgId, actionId, { status: ok ? 'done' : 'failed', note: ok ? 'Đã gửi lệnh, chờ thiết bị xác nhận' : cmd.reason ?? 'Không gửi được lệnh' }, ok ? `Người dùng đã duyệt "${a.title}", lệnh đã gửi.` : `Lệnh "${a.title}" không gửi được: ${cmd.reason ?? ''}`);
        return;
      }
      case 'scene': {
        const out = getHome().runScene(String(p.sceneId), actor);
        const okCount = out.filter((c) => c.status !== 'rejected' && c.status !== 'failed').length;
        setAction(msgId, actionId, { status: okCount ? 'done' : 'failed', note: `${okCount}/${out.length} lệnh được nhận` }, `Người dùng đã chạy "${a.title}", ${okCount}/${out.length} lệnh được nhận.`);
        return;
      }
      case 'route': {
        const simple = me.mode === 'simple';
        setAction(msgId, actionId, { status: 'done', note: 'Đã mở bản đồ' }, `Người dùng đã mở chỉ đường tới ${String(p.name)}.`);
        nav(`${simple ? '/s/maps' : '/f/maps'}/dir?to=${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}&name=${encodeURIComponent(String(p.name))}&mode=${String(p.mode)}`);
        return;
      }
      case 'call': {
        const m = app.members.find((x) => x.id === String(p.memberId));
        if (!m?.phone) throw new Error('Thành viên chưa có số điện thoại.');
        setAction(msgId, actionId, { status: 'done', note: 'Đã mở trình gọi điện' }, `Người dùng đã gọi cho ${m.name}.`);
        location.href = `tel:${m.phone}`;
        return;
      }
      case 'invite': {
        const r = await createInvitation({ hostId: me.id, occasion: String(p.occasion), recipients: adultIds(app.members, me.id) });
        if (!r.ok) throw new Error(r.error);
        setAction(msgId, actionId, { status: 'done', note: 'Đã soạn bản nháp' }, `Người dùng đã tạo bản nháp lời mời "${String(p.occasion)}".`);
        nav(`/f/draft/${r.id}`);
        return;
      }
      case 'open':
        setAction(msgId, actionId, { status: 'done' });
        nav(String(p.to));
        return;
    }
  } catch (e) {
    setAction(msgId, actionId, { status: 'failed', note: (e as Error).message }, `Thẻ "${a.title}" thất bại: ${(e as Error).message}`);
  }
}

export function dismissAction(msgId: string, actionId: string) {
  const a = findAction(msgId, actionId);
  if (!a || a.status !== 'pending') return;
  setAction(msgId, actionId, { status: 'dismissed', note: 'Đã bỏ qua' }, `Người dùng bỏ qua đề xuất "${a.title}".`);
}

export async function testProvider(p: AiProvider, key: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  try {
    const models = p === 'claude' ? await (await import('../core/ai/claude')).claudeModels(key) : await (await import('../core/ai/openai')).openaiModels(key);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
