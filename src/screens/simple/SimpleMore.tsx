import { CalendarDays, Image, Languages, MapPin, MessageSquare, Phone as PhoneIcon, Siren, Sun, Type, Users, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Missing } from '../../components/Missing';
import { SignOutButton } from '../../components/SignOut';
import { RouteMap } from '../../components/RouteMap';
import { Badge, Header, Row, Sim, Steps, Switch, TopBar } from '../../components/ui';
import { compareRoutes, FACILITIES } from '../../core/guardian/routes';
import { hhmm } from '../../lib/format';
import { speak } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { sendSOS, setCalendarShared, smsLink, sosMessage, supportContacts } from '../../state/actions';
import { useHome } from '../../state/services';
import { capFirst, honorific, namesOf, useApp, useHouseholdName, useMe } from '../../state/store';

export function SHelp() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const home = useHome();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = home.openIncidents().find((i) => i.kind === 'sos');
  const contacts = supportContacts(me.id);
  const send = async () => {
    setBusy(true);
    try {
      const inc = await sendSOS(me.id, 'living');
      nav(`/s/sos/${inc.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" right={<Sim sos />} />
      <Header title={`${Hon} cần giúp?`} sub="Gửi SOS cho người thân đã chọn." />
      <Row icon={<Users size={22} />} tileTone="peach" title="Người nhận SOS" meta={home.s.real ? (contacts.length ? contacts.map((m) => m.name).join(', ') : 'Chưa có người thân có số điện thoại') : `${namesOf(home.s.helpers.map((h) => h.id))}, danh sách hỗ trợ của nhà`} />
      {open ? (
        <button className="btn danger" onClick={() => nav(`/s/sos/${open.id}`)}>
          <Siren size={22} /> Xem SOS đang mở
        </button>
      ) : (
        <button className="btn danger" style={{ minHeight: 84, fontSize: 20 }} disabled={busy} onClick={() => void send()}>
          <Siren size={26} /> {busy ? 'Đang gửi' : 'Gửi SOS'}
        </button>
      )}
      <button className="btn secondary" onClick={() => nav('/s/call')}>
        <PhoneIcon size={20} /> Gọi người thân
      </button>
      <div className="card sand">
        <p style={{ color: '#6E4E20', fontSize: 14 }}>
          {home.s.real ? 'SOS báo tới người thân và soạn tin nhắn kèm vị trí. HeartOS không tự gọi cấp cứu.' : 'Nhà mẫu: SOS báo trong nhà và tới người thân trong ứng dụng, không tự gọi cấp cứu.'} Khi nguy hiểm, hãy gọi ngay 115.
        </p>
        <a className="btn sm danger" style={{ marginTop: 10 }} href="tel:115">
          <PhoneIcon size={16} /> Gọi cấp cứu 115
        </a>
      </div>
    </Phone>
  );
}

export function SSos() {
  const me = useMe();
  const hon = honorific(me);
  const { id } = useParams();
  const home = useHome();
  const nav = useNavigate();
  const inc = home.incident(id!);
  if (!inc) return <Missing simple title="Không tìm thấy ca" back="/s" label="Về màn hình chính" />;
  const acked = inc.steps.helper.state === 'done';
  const contacts = supportContacts(inc.personId ?? me.id);
  return (
    <Phone simple>
      <TopBar back backTo="/s" right={<Sim sos />} />
      <Header title={acked ? `${inc.steps.helper.by} đã nhận hỗ trợ` : inc.status === 'closed' ? 'Đã đóng SOS' : 'Đã báo tại nhà'} sub={acked ? `Cập nhật lúc ${hhmm(inc.steps.helper.at!)}, ${inc.id}` : `${inc.id}, ${hhmm(inc.createdAt)}`} />
      {acked ? (
        <Row tone="tint" icon={<Users size={22} />} tileTone="white" title={`${inc.steps.helper.by} đang tới`} meta={inc.steps.handover.state === 'done' ? 'Đã có mặt và bàn giao.' : `${inc.steps.helper.by} xác nhận nhận việc. Chưa có xác nhận đã đến.`} />
      ) : (
        <Row tone="rose" icon={<Siren size={22} />} tileTone="white" title={home.s.real ? 'Đã báo tới người thân trong nhà' : 'Đã phát báo tại nhà'} meta={home.s.real ? (inc.steps.remote.state === 'done' ? 'Đã soạn tin nhắn SOS kèm vị trí.' : 'Bấm nút đỏ bên dưới để nhắn tin kèm vị trí.') : inc.steps.remote.state === 'done' ? 'Kênh từ xa đã tiếp nhận.' : 'Đang chờ kênh từ xa báo lại.'} />
      )}
      {home.s.real && inc.status !== 'closed' && contacts.length > 0 && inc.steps.remote.state !== 'done' && (
        <a className="btn danger" style={{ minHeight: 72, fontSize: 19 }} href={smsLink(contacts.map((m) => m.phone), sosMessage(inc))} onClick={() => home.markFamilyNotified(inc.id, me.name)}>
          <MessageSquare size={24} /> Nhắn tin cho người thân
        </a>
      )}
      {home.s.real && contacts.slice(0, 3).map((m) => (
        <a key={m.id} className="btn secondary" href={`tel:${m.phone}`}><PhoneIcon size={20} /> Gọi {m.name}</a>
      ))}
      <div className="card">
        <Steps
          items={[
            { title: 'Báo tại nhà', meta: inc.steps.local.state === 'unknown' ? 'Nhà chưa kết nối còi báo' : 'Đã bật còi', state: inc.steps.local.state },
            { title: home.s.real ? 'Tin nhắn tới người thân' : 'Chuyển đến người thân', meta: inc.steps.remote.state === 'done' ? (home.s.real ? 'Đã soạn tin nhắn kèm vị trí' : 'Nhà cung cấp đã tiếp nhận') : inc.steps.remote.note ?? 'Chưa rõ tình trạng gửi', state: inc.steps.remote.state },
            { title: 'Người hỗ trợ', meta: acked ? `${inc.steps.helper.by} nhận việc lúc ${hhmm(inc.steps.helper.at!)}` : 'Chưa ai nhận việc', state: inc.steps.helper.state },
          ]}
        />
      </div>
      {inc.destination && (
        <button className="btn" onClick={() => nav(`/s/route/${inc.id}`)}>
          <MapPin size={20} /> Xem tuyến đã chọn
        </button>
      )}
      {!home.s.real && (
        <button className="btn secondary" onClick={() => nav('/s/call')}>
          <PhoneIcon size={20} /> Gọi người thân
        </button>
      )}
      {inc.status !== 'closed' && (
        <button
          className="btn ghost"
          onClick={() => {
            home.closeIncident(inc.id, 'Người gửi báo bấm nhầm', { id: me.id, name: me.name, role: me.role });
            toast(`Đã báo người thân: ${hon} bấm nhầm, không cần hỗ trợ.`);
            nav('/s');
          }}
        >
          Tôi bấm nhầm, hủy SOS
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
  if (!inc?.destination) return <Missing simple title="Chưa chốt nơi bàn giao" sub="Người nhà sẽ chọn bệnh viện trên điện thoại của họ." back="/s" label="Về màn hình chính" />;
  const d = inc.destination;
  if (d.name) {
    return (
      <Phone simple>
        <TopBar back backTo={`/s/sos/${inc.id}`} />
        <Header title="Nơi người thân đưa tới" sub={`${d.confirmedBy} đã chốt lúc ${hhmm(d.confirmedAt)}.`} />
        <Row tone="tint" icon={<MapPin size={22} />} tileTone="white" title={d.name} meta={`${d.address ?? ''}${d.gate ? `, ${d.gate}` : ''}`} chevron={false} />
        {d.address && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.address)}`} target="_blank" rel="noreferrer"><MapPin size={20} /> Mở chỉ đường</a>}
        <button className="btn secondary" onClick={() => nav(`/s/sos/${inc.id}`)}>Về trạng thái SOS</button>
      </Phone>
    );
  }
  const f = FACILITIES.find((x) => x.id === d.facilityId)!;
  const r = compareRoutes(home.s.edges).results.find((x) => x.facility.id === f.id);
  return (
    <Phone simple>
      <TopBar back backTo={`/s/sos/${inc.id}`} />
      <Header title="Đường tới nơi hỗ trợ" sub={`Đích đã được ${d.confirmedBy} xác nhận.`} />
      <div style={{ position: 'relative' }}>
        <RouteMap edges={home.s.edges} highlight={r} height={230} />
        <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>NHÀ MẪU</span>
      </div>
      <Row tone="tint" icon={<MapPin size={22} />} tileTone="white" title={`${f.name}, ${f.gate}`} meta={`Khoảng ${d.etaMin} phút, ước tính lúc ${hhmm(d.computedAt)}.`} />
      <button className="btn secondary" onClick={() => nav(`/s/sos/${inc.id}`)}>Về trạng thái SOS</button>
    </Phone>
  );
}

export function SMore() {
  const homeName = useHouseholdName();
  const me = useMe();
  const prefs = useApp((s) => s.prefs);
  const set = useApp((s) => s.set);
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <Header title="Cài đặt dễ dùng" sub={`${homeName}, ${me.name}`} />
      <Row icon={<Sun size={22} />} tileTone="peach" title="Đổi cách hiển thị" meta="Thân Quen hoặc Gia Đình" to="/mode" />
      <Row icon={<Languages size={22} />} tileTone="peach" title="Ngôn ngữ và giọng đọc" meta="Giao diện tiếng Việt" to="/s/language" />
      <Row icon={<Users size={22} />} tileTone="peach" title="Quyền của tôi" meta="Xem mình đang chia sẻ gì" to="/s/permissions" />
      <Row icon={<Type size={22} />} title="Chữ lớn hơn" meta="Phóng to chữ trên mọi màn hình" chevron={false} right={<Switch label="Chữ lớn hơn" checked={prefs.largeText} onChange={(v) => set((s) => void (s.prefs.largeText = v))} />} />
      <Row icon={<Volume2 size={22} />} title="Nút đọc to" meta="Hiện nút đọc to ở tiêu đề" chevron={false} right={<Switch label="Nút đọc to" checked={prefs.readAloud} onChange={(v) => set((s) => void (s.prefs.readAloud = v))} />} />
      <SignOutButton size={20} />
    </Phone>
  );
}

export function SLanguage() {
  const me = useMe();
  const hon = honorific(me);
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
      <button className="btn soft" onClick={() => speak(prefs.voiceLang === 'vi-VN' ? `Chào ${hon}. Đây là giọng đọc tiếng Việt.` : 'Hello. This is the English voice.', prefs.voiceLang)}>
        <Volume2 size={20} /> Nghe thử
      </button>
      <button className="btn secondary" onClick={() => nav('/s/more')}>Về cài đặt</button>
    </Phone>
  );
}

export function SPermissions() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const cal = useApp((s) => s.calendars.find((c) => c.memberId === me.id));
  const mems = useApp((s) => s.memories).filter((m) => m.narrator === me.id);
  const nav = useNavigate();
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s/more" />
      <Header title={`${Hon} đang chia sẻ gì?`} sub={`${Hon} xem và chọn từng mục riêng.`} />
      <Row
        icon={<CalendarDays size={22} />}
        tileTone="peach"
        title="Lịch rảnh"
        meta="Chia sẻ với gia đình (chỉ rảnh/bận)"
        badge={<Badge tone={cal?.shared ? undefined : 'warm'}>{cal?.shared ? 'Đã cấp' : 'Đang tắt'}</Badge>}
        chevron={false}
        right={<Switch label="Chia sẻ lịch rảnh" checked={!!cal?.shared} onChange={(v) => void setCalendarShared(me.id, v).then(() => toast(v ? 'Đã bật chia sẻ lịch rảnh.' : 'Đã thu hồi chia sẻ lịch rảnh.'))} />}
      />
      <Row icon={<Image size={22} />} tileTone="peach" title="Ký ức" meta={`${Hon} chọn người nghe từng bản thu, ${mems.length} bản`} to="/s/memory" />
      <Row icon={<MapPin size={22} />} tileTone="peach" title="Vị trí hỗ trợ" meta={`Chỉ dùng khi ${hon} chọn gửi SOS`} />
      <button className="btn secondary" onClick={() => nav('/s/more')}>Về cài đặt</button>
    </Phone>
  );
}
