import { Activity, AlertTriangle, Camera, Check, CloudOff, Droplets, ExternalLink, Flame, FlaskConical, Lightbulb, Map as MapIcon, MapPin, Phone as PhoneIcon, Plug, Power, Radar, Siren, UserCheck, Users, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { RouteMap } from '../../components/RouteMap';
import { Badge, Header, KV, Row, Seg, Sheet, Sim, Steps, Switch, TopBar } from '../../components/ui';
import { compareRoutes, FACILITIES, mapsLink, type FloodState } from '../../core/guardian/routes';
import type { HomeIncident } from '../../core/smarthome/types';
import type { SimEvent } from '../../core/smarthome/engine';
import { ago, hhmm } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { readSupportLocation, sendSOS } from '../../state/actions';
import { useHome } from '../../state/services';
import { namesOf, useApp, useMe } from '../../state/store';

const prioBadge = (i: HomeIncident) => <Badge tone={i.priority === 'P1' ? 'danger' : i.priority === 'P2' ? 'warm' : 'line'}>{i.priority}</Badge>;
const kindIcon = (k: HomeIncident['kind']) => (k === 'sos' ? <Siren size={18} /> : k === 'fall' ? <Activity size={18} /> : k === 'smoke' ? <Flame size={18} /> : k === 'leak' ? <Droplets size={18} /> : <AlertTriangle size={18} />);

export function FSafe() {
  const home = useHome();
  const open = home.openIncidents();
  const fresh = home.freshRooms();
  const stale = home.s.rooms.filter((r) => !fresh.includes(r));
  const lastAt = Math.max(...home.s.rooms.map((r) => r.lastSignal));
  return (
    <Phone tabs>
      <TopBar />
      <Header title="An toàn tại nhà" sub={`Guardian · Dữ kiện nhận lúc ${hhmm(lastAt)}`} />
      <div className="stats">
        <div className={'stat' + (open.length ? ' rose' : '')}>
          <b>{String(open.length).padStart(2, '0')}</b>
          <span>Ca đang mở</span>
        </div>
        <div className="stat">
          <b>{String(fresh.length).padStart(2, '0')}/{String(home.s.rooms.length).padStart(2, '0')}</b>
          <span>Vùng có tín hiệu</span>
        </div>
      </div>
      {!home.s.net.internet && <Row tone="rose" icon={<WifiOff size={18} />} tileTone="white" title="Kết nối đang gián đoạn" meta="Hub mất Internet, LAN vẫn hoạt động" to="/f/offline" />}
      <Row icon={<Siren size={18} />} tileTone="rose" title="Sự cố đang theo dõi" meta="SOS và tín hiệu nghi ngã" badge={<Badge tone={open.length ? 'danger' : undefined}>{open.length} ca</Badge>} to="/f/incidents" />
      <Row icon={<MapIcon size={18} />} tileTone="sand" title="Bản đồ vùng quan sát" meta={stale.length ? `${stale.map((r) => r.name).join(', ')} chưa có dữ liệu mới` : 'Mọi vùng có tín hiệu gần đây'} to="/f/map" />
      <Row icon={<Radar size={18} />} title="Guardian radar–nhiệt trực tiếp" meta="LD2450 2D · MLX90640 32×24 · điểm ghép" to="/f/guardian" />
      <Row icon={<Camera size={18} />} title="Camera được cấp quyền" meta="Xem theo vùng và thời hạn" to="/f/camera/cam-living" />
      <Row icon={<Power size={18} />} title="Thiết bị và điện dự phòng" meta="Hub, cảm biến, UPS và mạng" to="/f/devices" />
      <Row icon={<Lightbulb size={18} />} tileTone="sand" title="Thiết bị thông minh" meta="Đèn, ổ cắm, cảnh và luật tự động" to="/f/smart" />
      <Row icon={<FlaskConical size={18} />} tileTone="peach" title="Mô phỏng tình huống" meta="Thử ngã, khói, rò nước, mất điện, mất Internet" to="/f/simulate" />
      <Link to="/f/sos" className="btn danger">
        <Siren size={18} /> Mở SOS mô phỏng
      </Link>
    </Phone>
  );
}

export function FIncidents() {
  const home = useHome();
  const open = home.openIncidents();
  const closed = home.s.incidents.filter((i) => i.status === 'closed').slice(0, 5);
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Các ca đang mở" sub="Guardian hiển thị riêng bằng chứng của từng ca." />
      {open.length === 0 && <div className="empty">Không có ca đang mở. Bạn có thể thử ở “Mô phỏng tình huống”.</div>}
      {open.map((i) => (
        <Row key={i.id} icon={kindIcon(i.kind)} tileTone={i.priority === 'P1' ? 'rose' : 'sand'} title={i.title} meta={`${hhmm(i.createdAt)} · ${i.status === 'verifying' ? 'Đang kiểm tra' : i.assignee ? `${i.assignee} đã nhận việc` : i.evidence[0]?.summary ?? ''}`} right={prioBadge(i)} to={`/f/incident/${i.id}`} />
      ))}
      <Row tone="tint" icon={<Siren size={18} />} tileTone="white" title="Báo tại chỗ" meta="Còi khói/CO và đường SOS tối thiểu theo cấu hình tại nhà, chạy cả khi mất Internet." />
      {closed.length > 0 && <div className="section-title">Đã đóng gần đây</div>}
      {closed.map((i) => (
        <Row key={i.id} icon={kindIcon(i.kind)} title={`${i.id} · ${i.title}`} meta={i.closedReason} to={`/f/incident/${i.id}`} />
      ))}
    </Phone>
  );
}

export function FIncident() {
  const { id } = useParams();
  const home = useHome();
  const me = useMe();
  const members = useApp((s) => s.members);
  const nav = useNavigate();
  const inc = home.incident(id!);
  const [assignOpen, setAssignOpen] = useState(false);
  const [loc, setLoc] = useState<string>('');
  useEffect(() => {
    if (!inc || inc.kind !== 'sos') return;
    void readSupportLocation(me.id).then((r) => setLoc(r.ok && r.data ? `${r.data.place} · ${r.data.lat.toFixed(4)}, ${r.data.lng.toFixed(4)}` : 'Không mở được vị trí: ' + (r.error ?? 'Không có quyền vị trí')));
  }, [inc?.id, inc?.kind, me.id, inc]);
  if (!inc) return <Phone tabs><TopBar back backTo="/f/incidents" /><div className="empty">Không tìm thấy ca.</div></Phone>;
  const actor = { id: me.id, name: me.name, role: me.role };
  const lan = members.find((m) => m.id === 'u-lan');
  if (inc.status === 'verifying')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/incidents" />
        <Header title="Tín hiệu nghi ngã" sub={`${home.room(inc.room).name} · Nhận ${hhmm(inc.createdAt)} · ${inc.id}`} />
        <Row tone="peach" icon={<Activity size={18} />} tileTone="white" title="Đang xác minh" meta="Quan sát từ radar và nhiệt. Chưa đủ bằng chứng để kết luận." />
        <div className="card">
          <div className="label">Bằng chứng của ca</div>
          <div className="list">
            {inc.evidence.map((e, i) => (
              <div key={i} className="li"><Badge tone="line">{e.kind}</Badge><div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 700 }}>{e.summary}</div><div className="small muted">{hhmm(e.at)} · {e.ref}</div></div></div>
            ))}
          </div>
        </div>
        <Row icon={<Radar size={18} />} title="Xem vùng và độ mới" meta={`${home.room(inc.room).name} · Quan sát mới lúc ${hhmm(home.room(inc.room).lastSignal)}`} to="/f/guardian" />
        {lan?.phone && <a className="btn secondary" href={`tel:${lan.phone}`}><PhoneIcon size={18} /> Gọi bà Lan để hỏi</a>}
        <div className="btnrow">
          <button className="btn secondary" onClick={() => { home.verifyFall(inc.id, 'false_alarm', actor); toast('Đã đóng ca: không có sự cố.'); nav('/f/incidents'); }}>Không sao</button>
          <button className="btn danger" onClick={() => home.verifyFall(inc.id, 'needs_help', actor)}>Cần hỗ trợ</button>
        </div>
        <Link to="/f/incidents" className="btn ghost">Về các ca đang mở</Link>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/incidents" right={<Sim sos />} />
      <Header title={inc.title} sub={`Ca ${inc.id} · ${new Date(inc.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}, ${hhmm(inc.createdAt)}${inc.status === 'closed' ? ' · đã đóng' : ''}`} />
      <div className="card">
        <Steps
          items={[
            { title: 'Báo tại nhà', meta: inc.steps.local.at ? `Đã phát tín hiệu · ${hhmm(inc.steps.local.at)}` : 'Chưa phát', state: inc.steps.local.state },
            { title: 'Kênh từ xa', meta: `${inc.steps.remote.note ?? ''}${inc.steps.remote.at ? ' · ' + hhmm(inc.steps.remote.at) : ''}`, state: inc.steps.remote.state },
            { title: 'Người hỗ trợ', meta: inc.steps.helper.by ? `${inc.steps.helper.by} đã nhận việc · ${hhmm(inc.steps.helper.at!)}` : 'Chưa ai nhận việc', state: inc.steps.helper.state },
            { title: 'Có mặt và bàn giao', meta: inc.steps.handover.at ? `Đã bàn giao · ${hhmm(inc.steps.handover.at)}` : 'Chờ người hỗ trợ xác nhận', state: inc.steps.handover.state },
          ]}
        />
      </div>
      {inc.kind === 'sos' && <Row icon={<MapPin size={18} />} title="Vị trí hỗ trợ (qua Sentinel)" meta={loc || 'Đang mở…'} chevron={false} />}
      {inc.destination && <Row tone="tint" icon={<MapPin size={18} />} tileTone="white" title={`Đích bàn giao: ${FACILITIES.find((f) => f.id === inc.destination!.facilityId)?.name} · ${inc.destination.gate}`} meta={`ETA ${inc.destination.etaMin} phút tại ${hhmm(inc.destination.computedAt)} · ${inc.destination.confirmedBy} chốt`} />}
      {inc.status !== 'closed' && (
        <>
          <div className="grid2">
            <button className="btn secondary" onClick={() => setAssignOpen(true)}><UserCheck size={18} /> Giao việc</button>
            <Link to={`/f/routes/${inc.id}`} className="btn secondary"><MapIcon size={18} /> Tuyến hỗ trợ</Link>
          </div>
          {inc.assignee && inc.steps.handover.state !== 'done' && <button className="btn" onClick={() => home.markHandover(inc.id, actor)}><Check size={18} /> Xác nhận có mặt và bàn giao</button>}
          <button className="btn ghost" onClick={() => { home.closeIncident(inc.id, inc.steps.handover.state === 'done' ? 'Đã bàn giao xong' : 'Người điều phối đóng ca', actor); nav('/f/incidents'); }}>Đóng ca</button>
        </>
      )}
      <div className="card flat">
        <div className="label">Dòng thời gian</div>
        <div className="list">
          {inc.timeline.map((t, i) => (
            <div key={i} className="li small"><span className="mono muted">{hhmm(t.at)}</span><span style={{ flex: 1 }}>{t.text}</span><span className="muted">{t.by}</span></div>
          ))}
        </div>
      </div>
      <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title="Giao việc hỗ trợ">
        <p className="small muted" style={{ margin: 0 }}>Ca {inc.id} · Người điều phối có quyền. Có mặt, kết quả kiểm tra và bàn giao là các mốc riêng.</p>
        {members.filter((m) => m.role === 'admin' || m.role === 'member' || m.role === 'carer').filter((m) => m.id !== 'u-lan').map((m) => (
          <Row key={m.id} icon={<Users size={18} />} title={m.name} meta={m.relation} onClick={() => { home.acceptHelp(inc.id, { id: m.id, name: m.name }); setAssignOpen(false); }} />
        ))}
      </Sheet>
    </Phone>
  );
}

export function FRoutes() {
  const { id } = useParams();
  const home = useHome();
  const inc = home.incident(id!);
  const cmp = compareRoutes(home.s.edges);
  const rec = cmp.results.find((r) => r.facility.id === cmp.recommended);
  const flaggable = home.s.edges.filter((e) => ['e3', 'e8', 'e10', 'e11', 'e7'].includes(e.id));
  return (
    <Phone tabs>
      <TopBar back backTo={`/f/incident/${id}`} />
      <Header title="So tuyến bệnh viện" sub={`Ca ${inc?.id ?? ''} · Dữ liệu minh họa lúc ${hhmm(Date.now())}`} />
      <RouteMap edges={home.s.edges} highlight={rec} />
      {cmp.results.map((r) => (
        <Row
          key={r.facility.id}
          icon={<MapPin size={18} />}
          tileTone={r.complete ? undefined : 'sand'}
          title={`${r.facility.name} · ${r.facility.gate}`}
          meta={r.blocked ? 'Không có tuyến khả dụng (ngập)' : `${r.minutes} phút · ${r.complete ? 'Cổng và đường đã đối chiếu' : 'Chờ dữ liệu ngập: ' + r.pendingEdges.map((e) => e.name).join(', ')}`}
          badge={r.facility.id === cmp.recommended ? <Badge>Đề xuất</Badge> : !r.complete ? <Badge tone="warm">Chưa đủ dữ kiện</Badge> : undefined}
          to={!r.blocked ? `/f/route/${id}/${r.facility.id}` : undefined}
        />
      ))}
      <div className="card sand">
        <h3>{cmp.completeCount}/{cmp.results.length} tuyến đủ dữ kiện</h3>
        <p style={{ color: '#6E4E20' }}>Tuyến thiếu dữ liệu ngập không được đề xuất. Ước tính tính tại {hhmm(Date.now())}.</p>
      </div>
      <div className="section-title">Cập nhật dữ liệu ngập (mô phỏng)</div>
      {flaggable.map((e) => (
        <div key={e.id} className="card" style={{ padding: '10px 12px' }}>
          <div className="hstack" style={{ marginBottom: 8 }}><b className="small" style={{ flex: 1 }}>{e.name}</b><span className="small muted">{e.minutes} phút</span></div>
          <Seg<FloodState> value={e.flood} onChange={(v) => home.setEdgeFlood(e.id, v)} options={[{ value: 'clear', label: 'Thông' }, { value: 'unknown', label: 'Chưa rõ' }, { value: 'flooded', label: 'Ngập' }]} />
        </div>
      ))}
    </Phone>
  );
}

export function FRoute() {
  const { id, fac } = useParams();
  const home = useHome();
  const me = useMe();
  const inc = home.incident(id!);
  const f = FACILITIES.find((x) => x.id === fac)!;
  const r = compareRoutes(home.s.edges).results.find((x) => x.facility.id === fac)!;
  const confirmed = inc?.destination?.facilityId === fac;
  return (
    <Phone tabs>
      <TopBar back backTo={`/f/routes/${id}`} />
      <Header title={confirmed ? 'Đã chốt đích bàn giao' : `Tuyến đến ${f.name}`} sub={`Ca ${inc?.id} · ${confirmed ? `${f.name}, ${f.gate.toLowerCase()}` : `Đường tới ${f.gate.toLowerCase()}`}`} />
      <div style={{ position: 'relative' }}>
        <RouteMap edges={home.s.edges} highlight={r} height={230} />
        <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>TUYẾN MINH HỌA</span>
        <span className="badge white" style={{ position: 'absolute', right: 10, top: 10 }}>{f.gate.toUpperCase()}</span>
      </div>
      {confirmed ? (
        <>
          <Row tone="tint" icon={<Check size={18} />} tileTone="white" title="Đã xác nhận điểm đến" meta={`Người điều phối ${inc!.destination!.confirmedBy} · Phiên đích lúc ${hhmm(inc!.destination!.confirmedAt)}.`} />
          <Row icon={<MapPin size={18} />} title="ETA tại lúc tính" meta={`${inc!.destination!.etaMin} phút · ${hhmm(inc!.destination!.computedAt)}`} chevron={false} />
          <Link to={`/f/incident/${id}`} className="btn">Về hồ sơ ca</Link>
        </>
      ) : (
        <>
          <Row icon={<MapPin size={18} />} title="ETA minh họa" meta={`${r.minutes} phút · Cập nhật ${hhmm(Date.now())}${r.complete ? '' : ' · tuyến chưa đủ dữ kiện ngập'}`} chevron={false} />
          <Row tone="tint" icon={<UserCheck size={18} />} tileTone="white" title="Đích bàn giao" meta="Người điều phối xác nhận cơ sở và cổng trước khi chia sẻ tuyến." />
          <button className="btn" disabled={!inc || inc.status === 'closed'} onClick={() => home.confirmDestination(id!, f.id, { id: me.id, name: me.name, role: me.role })}>
            Xác nhận {f.name} · {f.gate}
          </button>
        </>
      )}
      <a className="btn secondary" href={mapsLink(f)} target="_blank" rel="noreferrer">
        <ExternalLink size={16} /> Mở bản đồ thật ({f.address})
      </a>
    </Phone>
  );
}

export function FSos() {
  const me = useMe();
  const home = useHome();
  const nav = useNavigate();
  const open = home.openIncidents().find((i) => i.kind === 'sos');
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" right={<Sim sos />} />
      <Header title="Yêu cầu hỗ trợ" sub="Gửi SOS tới liên hệ đã cấu hình của Nhà An." />
      <Row icon={<Users size={18} />} tileTone="rose" title="Người nhận SOS" meta={`${namesOf(home.s.helpers.map((h) => h.id))} · Danh sách hỗ trợ của nhà`} />
      {open ? (
        <Link to={`/f/incident/${open.id}`} className="btn danger"><Siren size={18} /> Xem SOS đang mở · {open.id}</Link>
      ) : (
        <button className="btn danger" style={{ minHeight: 72, fontSize: 18 }} onClick={() => nav(`/f/incident/${sendSOS(me.id).id}`)}>
          <Siren size={22} /> Gửi SOS mô phỏng
        </button>
      )}
      <div className="card sand">
        <p style={{ color: '#6E4E20' }}>Bản mô phỏng: SOS báo tại nhà, tới người thân trong ứng dụng và kênh từ xa giả lập, không tự gọi dịch vụ cấp cứu. Khi nguy hiểm thật, hãy gọi 115 (cấp cứu), 114 (cứu hỏa) hoặc 113 (công an).</p>
        <a className="btn sm danger" style={{ marginTop: 10 }} href="tel:115"><PhoneIcon size={16} /> Gọi 115</a>
      </div>
    </Phone>
  );
}

const SIMS: { ev: SimEvent; label: string; icon: React.ReactNode; tone?: 'rose' | 'sand' }[] = [
  { ev: 'sos_bedroom', label: 'Nhấn nút SOS đầu giường', icon: <Siren size={18} />, tone: 'rose' },
  { ev: 'fall_hall', label: 'Người ngã ở hành lang', icon: <Activity size={18} />, tone: 'rose' },
  { ev: 'fall_bedroom', label: 'Người ngã ở phòng ngủ', icon: <Activity size={18} />, tone: 'rose' },
  { ev: 'person_hall', label: 'Có người đi qua hành lang', icon: <Radar size={18} /> },
  { ev: 'smoke', label: 'Khói/CO ở bếp', icon: <Flame size={18} />, tone: 'rose' },
  { ev: 'smoke_clear', label: 'Hết khói', icon: <Flame size={18} /> },
  { ev: 'leak', label: 'Rò nước ở bếp', icon: <Droplets size={18} />, tone: 'sand' },
  { ev: 'leak_clear', label: 'Hết rò nước', icon: <Droplets size={18} /> },
  { ev: 'door_open', label: 'Mở cửa chính', icon: <AlertTriangle size={18} /> },
  { ev: 'door_close', label: 'Đóng cửa chính', icon: <AlertTriangle size={18} /> },
  { ev: 'mains_lost', label: 'Mất điện lưới', icon: <Power size={18} />, tone: 'sand' },
  { ev: 'mains_restored', label: 'Có điện lưới lại', icon: <Power size={18} /> },
  { ev: 'internet_lost', label: 'Mất Internet', icon: <CloudOff size={18} />, tone: 'sand' },
  { ev: 'internet_restored', label: 'Có Internet lại', icon: <Wifi size={18} /> },
  { ev: 'laundry_restore', label: 'Khôi phục cảm biến phòng giặt', icon: <Droplets size={18} /> },
];

export function FSimulate() {
  const home = useHome();
  const plug = home.device('plug-hall');
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Mô phỏng tình huống" sub="Bơm sự kiện vào hub để thử Guardian, luật tự động và luồng SOS." />
      <div className="card flat"><p>Trạng thái: {home.s.net.internet ? 'Internet ổn định' : 'mất Internet'} · điện {home.s.power.mains === 'on' ? 'lưới' : 'UPS/máy phát'} · chế độ {home.s.mode}. Sự kiện gần nhất: {home.s.notices[0] ? `${home.s.notices[0].title} (${ago(home.s.notices[0].at)})` : 'chưa có'}.</p></div>
      {SIMS.map((s) => (
        <Row key={s.ev} icon={s.icon} tileTone={s.tone} title={s.label} onClick={() => { home.simulate(s.ev); toast(`Đã bơm sự kiện: ${s.label}`); }} />
      ))}
      <Row icon={<Plug size={18} />} title="Ổ cắm hành lang trực tuyến" meta="Lệnh đang chờ sẽ được áp dụng khi thiết bị trở lại" chevron={false} right={<Switch label="Ổ cắm trực tuyến" checked={!!plug?.online} onChange={(v) => home.setDeviceOnline('plug-hall', v)} />} />
      <Row icon={<UserCheck size={18} />} title="Mô phỏng người thân nhận việc" meta="An tự nhận SOS sau 6 giây (từ điện thoại của An)" chevron={false} right={<Switch label="Mô phỏng nhận việc" checked={home.s.simulateHelpers} onChange={(v) => home.setSimulateHelpers(v)} />} />
      <KV items={[['Ca đang mở', String(home.openIncidents().length)], ['Lệnh đang chờ', String(home.s.commands.filter((c) => ['queued', 'sent', 'awaiting'].includes(c.status)).length)]]} />
    </Phone>
  );
}
