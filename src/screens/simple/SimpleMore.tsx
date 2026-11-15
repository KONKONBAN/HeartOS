import { CalendarDays, Image, Languages, LogOut, MapPin, Phone as PhoneIcon, Siren, Sun, Type, Users, Volume2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { RouteMap } from '../../components/RouteMap';
import { Badge, Header, Row, Sim, Steps, Switch, TopBar } from '../../components/ui';
import { compareRoutes, FACILITIES } from '../../core/guardian/routes';
import { hhmm } from '../../lib/format';
import { speak } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { sendSOS, setCalendarShared } from '../../state/actions';
import { useHome } from '../../state/services';
import { namesOf, useApp, useMe } from '../../state/store';

export function SHelp() {
  const me = useMe();
  const home = useHome();
  const nav = useNavigate();
  const open = home.openIncidents().find((i) => i.kind === 'sos');
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" right={<Sim sos />} />
      <Header title="Bà cần giúp?" sub="Gửi SOS cho người thân đã chọn." />
      <Row icon={<Users size={22} />} tileTone="peach" title="Người nhận SOS" meta={`${namesOf(home.s.helpers.map((h) => h.id))} · Danh sách hỗ trợ của nhà`} />
      {open ? (
        <button className="btn danger" onClick={() => nav(`/s/sos/${open.id}`)}>
          <Siren size={22} /> Xem SOS đang mở
        </button>
      ) : (
        <button
          className="btn danger"
          style={{ minHeight: 84, fontSize: 20 }}
          onClick={() => {
            const inc = sendSOS(me.id, 'living');
            nav(`/s/sos/${inc.id}`);
          }}
        >
          <Siren size={26} /> Gửi SOS mô phỏng
        </button>
      )}
      <button className="btn secondary" onClick={() => nav('/s/call')}>
        <PhoneIcon size={20} /> Gọi người thân
      </button>
      <div className="card sand">
        <p style={{ color: '#6E4E20', fontSize: 14 }}>
          Đây là bản mô phỏng: SOS báo trong nhà và tới người thân trong ứng dụng, không tự gọi dịch vụ cấp cứu. Khi nguy hiểm, hãy gọi ngay 115.
        </p>
        <a className="btn sm danger" style={{ marginTop: 10 }} href="tel:115">
          <PhoneIcon size={16} /> Gọi cấp cứu 115
        </a>
      </div>
    </Phone>
  );
}

export function SSos() {
  const { id } = useParams();
  const home = useHome();
  const me = useMe();
  const nav = useNavigate();
  const inc = home.incident(id!);
  if (!inc) return null;
  const acked = inc.steps.helper.state === 'done';
  return (
    <Phone simple>
      <TopBar back backTo="/s" right={<Sim sos />} />
      <Header title={acked ? `${inc.steps.helper.by} đã nhận hỗ trợ` : inc.status === 'closed' ? 'Đã đóng SOS' : 'Đã báo tại nhà'} sub={acked ? `Cập nhật lúc ${hhmm(inc.steps.helper.at!)} · ${inc.id}` : `${inc.id} · ${hhmm(inc.createdAt)}`} />
      {acked ? (
        <Row tone="tint" icon={<Users size={22} />} tileTone="white" title={`${inc.steps.helper.by} đang tới`} meta={inc.steps.handover.state === 'done' ? 'Đã có mặt và bàn giao.' : `${inc.steps.helper.by} xác nhận nhận việc. Chưa có xác nhận đã đến.`} />
      ) : (
        <Row tone="rose" icon={<Siren size={22} />} tileTone="white" title="Đã phát báo tại nhà" meta={inc.steps.remote.state === 'done' ? 'Kênh từ xa đã tiếp nhận.' : 'Đang chờ kênh từ xa báo lại.'} />
      )}
      <div className="card">
        <Steps
          items={[
            { title: 'Báo tại nhà', meta: 'Đã phát tín hiệu', state: inc.steps.local.state },
            { title: 'Chuyển đến người thân', meta: inc.steps.remote.state === 'done' ? 'Nhà cung cấp đã tiếp nhận' : inc.steps.remote.note ?? 'Chưa rõ tình trạng gửi', state: inc.steps.remote.state },
            { title: 'Người hỗ trợ', meta: acked ? `${inc.steps.helper.by} nhận việc lúc ${hhmm(inc.steps.helper.at!)}` : 'Chưa ai nhận việc', state: inc.steps.helper.state },
          ]}
        />
      </div>
      {inc.destination && (
        <button className="btn" onClick={() => nav(`/s/route/${inc.id}`)}>
          <MapPin size={20} /> Xem tuyến đã chọn
        </button>
      )}
      <button className="btn secondary" onClick={() => nav('/s/call')}>
        <PhoneIcon size={20} /> Gọi người thân
      </button>
      {inc.status !== 'closed' && (
        <button
          className="btn ghost"
          onClick={() => {
            home.closeIncident(inc.id, 'Người gửi báo bấm nhầm', { id: me.id, name: me.name, role: me.role });
            toast('Đã báo người thân: bà bấm nhầm, không cần hỗ trợ.');
            nav('/s');
          }}
        >
          Tôi bấm nhầm — hủy SOS
        </button>
      )}
      <button className="btn secondary" onClick={() => nav('/s')}>Về trang nhà</button>
    </Phone>
  );
}

export function SRoute() {
  const { id } = useParams();
  const home = useHome();
  const inc = home.incident(id!);
  const nav = useNavigate();
  if (!inc?.destination) return null;
  const f = FACILITIES.find((x) => x.id === inc.destination!.facilityId)!;
  const r = compareRoutes(home.s.edges).results.find((x) => x.facility.id === f.id);
  return (
    <Phone simple>
      <TopBar back backTo={`/s/sos/${inc.id}`} />
      <Header title="Đường tới nơi hỗ trợ" sub={`Đích đã được ${inc.destination.confirmedBy} xác nhận.`} />
      <div style={{ position: 'relative' }}>
        <RouteMap edges={home.s.edges} highlight={r} height={230} />
        <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>TUYẾN MINH HỌA</span>
      </div>
      <Row tone="tint" icon={<MapPin size={22} />} tileTone="white" title={`${f.name} · ${f.gate}`} meta={`Khoảng ${inc.destination.etaMin} phút · Ước tính lúc ${hhmm(inc.destination.computedAt)}.`} />
      <button className="btn secondary" onClick={() => nav(`/s/sos/${inc.id}`)}>Về trạng thái SOS</button>
    </Phone>
  );
}

export function SMore() {
  const me = useMe();
  const prefs = useApp((s) => s.prefs);
  const set = useApp((s) => s.set);
  const signOut = useApp((s) => s.signOut);
  const nav = useNavigate();
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <Header title="Cài đặt dễ dùng" sub={`Nhà An · ${me.name}`} />
      <Row icon={<Sun size={22} />} tileTone="peach" title="Đổi cách hiển thị" meta="Thân Quen hoặc Gia Đình" to="/mode" />
      <Row icon={<Languages size={22} />} tileTone="peach" title="Ngôn ngữ và giọng đọc" meta="Giao diện tiếng Việt" to="/s/language" />
      <Row icon={<Users size={22} />} tileTone="peach" title="Quyền của tôi" meta="Xem mình đang chia sẻ gì" to="/s/permissions" />
      <Row icon={<Type size={22} />} title="Chữ lớn hơn" meta="Phóng to chữ trên mọi màn hình" chevron={false} right={<Switch label="Chữ lớn hơn" checked={prefs.largeText} onChange={(v) => set((s) => void (s.prefs.largeText = v))} />} />
      <Row icon={<Volume2 size={22} />} title="Nút đọc to" meta="Hiện nút đọc to ở tiêu đề" chevron={false} right={<Switch label="Nút đọc to" checked={prefs.readAloud} onChange={(v) => set((s) => void (s.prefs.readAloud = v))} />} />
      <button
        className="btn secondary"
        onClick={() => {
          signOut();
          nav('/welcome');
        }}
      >
        <LogOut size={20} /> Đăng xuất
      </button>
    </Phone>
  );
}

export function SLanguage() {
  const prefs = useApp((s) => s.prefs);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s/more" />
      <Header title="Ngôn ngữ" sub="Cách đọc và hiển thị trên điện thoại này." />
      <Row icon={<Languages size={22} />} tileTone="peach" title="Giao diện" meta="Tiếng Việt" chevron={false} />
      <Row
        icon={<Volume2 size={22} />}
        tileTone="peach"
        title="Giọng đọc"
        meta={prefs.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'English'}
        onClick={() => set((s) => void (s.prefs.voiceLang = s.prefs.voiceLang === 'vi-VN' ? 'en-US' : 'vi-VN'))}
      />
      <button className="btn soft" onClick={() => speak(prefs.voiceLang === 'vi-VN' ? 'Chào bà. Đây là giọng đọc tiếng Việt.' : 'Hello. This is the English voice.', prefs.voiceLang)}>
        <Volume2 size={20} /> Nghe thử
      </button>
      <button className="btn secondary" onClick={() => nav('/s/more')}>Về cài đặt</button>
    </Phone>
  );
}

export function SPermissions() {
  const me = useMe();
  const cal = useApp((s) => s.calendars.find((c) => c.memberId === me.id));
  const mems = useApp((s) => s.memories).filter((m) => m.narrator === me.id);
  const nav = useNavigate();
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s/more" />
      <Header title="Bà đang chia sẻ gì?" sub="Bà xem và chọn từng mục riêng." />
      <Row
        icon={<CalendarDays size={22} />}
        tileTone="peach"
        title="Lịch rảnh"
        meta="Chia sẻ với gia đình (chỉ rảnh/bận)"
        badge={<Badge tone={cal?.shared ? undefined : 'warm'}>{cal?.shared ? 'Đã cấp' : 'Đang tắt'}</Badge>}
        chevron={false}
        right={<Switch label="Chia sẻ lịch rảnh" checked={!!cal?.shared} onChange={(v) => void setCalendarShared(me.id, v).then(() => toast(v ? 'Đã bật chia sẻ lịch rảnh.' : 'Đã thu hồi chia sẻ lịch rảnh.'))} />}
      />
      <Row icon={<Image size={22} />} tileTone="peach" title="Ký ức" meta={`Bà chọn người nghe từng bản thu · ${mems.length} bản`} to="/s/memory" />
      <Row icon={<MapPin size={22} />} tileTone="peach" title="Vị trí hỗ trợ" meta="Chỉ dùng khi bà chọn gửi SOS" />
      <button className="btn secondary" onClick={() => nav('/s/more')}>Về cài đặt</button>
    </Phone>
  );
}
