import { Activity, AlertTriangle, Building2, Camera, Server, Check, MessageSquare, Navigation, Plus, Trash2, CloudOff, Droplets, ExternalLink, Flame, FlaskConical, Lightbulb, Map as MapIcon, MapPin, Phone as PhoneIcon, Plug, Power, Radar, Siren, UserCheck, Users, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { RouteMap } from '../../components/RouteMap';
import { Badge, Field, Header, KV, Row, Seg, Sheet, Sim, Steps, Switch, TopBar } from '../../components/ui';
import { compareRoutes, FACILITIES, mapsLink, type FloodState } from '../../core/guardian/routes';
import type { HomeIncident } from '../../core/smarthome/types';
import { FALL_ESCALATE_MS, type SimEvent } from '../../core/smarthome/engine';
import { ago, hhmm } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { readSupportLocation, sendSOS, setHospitals, smsLink, sosMessage, supportContacts } from '../../state/actions';
import { useOnline } from '../../lib/net';
import { useHa } from '../../state/ha';
import { useHome } from '../../state/services';
import { namesOf, useApp, useHouseholdName, useMe } from '../../state/store';

const prioBadge = (i: HomeIncident) => <Badge tone={i.priority === 'P1' ? 'danger' : i.priority === 'P2' ? 'warm' : 'line'}>{i.priority}</Badge>;
const kindIcon = (k: HomeIncident['kind']) => (k === 'sos' ? <Siren size={18} /> : k === 'fall' ? <Activity size={18} /> : k === 'smoke' ? <Flame size={18} /> : k === 'leak' ? <Droplets size={18} /> : <AlertTriangle size={18} />);

export function FSafe() {
  const home = useHome();
  const open = home.openIncidents();
  const fresh = home.freshRooms();
  const stale = home.s.rooms.filter((r) => !fresh.includes(r));
  const lastAt = home.s.rooms.length ? Math.max(...home.s.rooms.map((r) => r.lastSignal)) : 0;
  const hospitals = useApp((s) => s.hospitals);
  const camera = home.s.devices.find((d) => d.kind === 'camera');
  const online = useOnline();
  const ha = useHa();
  return (
    <Phone tabs>
      <TopBar />
      <Header title="An toàn tại nhà" sub={lastAt ? `Guardian, dữ kiện nhận lúc ${hhmm(lastAt)}` : 'Guardian, SOS và bệnh viện gần nhà'} />
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
      {home.s.real ? (
        <>
          {!online && <Row tone="rose" icon={<WifiOff size={18} />} tileTone="white" title="Điện thoại mất Internet" meta="Thiết bị trong nhà vẫn chạy qua Wi-Fi nội bộ, SMS SOS vẫn gửi được" to="/f/offline" />}
          {ha.state !== 'ok' && <Row tone="sand" icon={<Server size={18} />} tileTone="white" title={ha.state === 'error' ? 'Home Assistant không phản hồi' : 'Kết nối thiết bị trong nhà'} meta={ha.state === 'error' ? ha.error : 'Dùng Home Assistant để đọc cảm biến, điều khiển đèn, khóa và camera'} to="/f/ha" />}
        </>
      ) : (
        !home.s.net.internet && <Row tone="rose" icon={<WifiOff size={18} />} tileTone="white" title="Kết nối đang gián đoạn" meta="Hub mất Internet, LAN vẫn hoạt động" to="/f/offline" />
      )}
      <Row icon={<Siren size={18} />} tileTone="rose" title="Sự cố đang theo dõi" meta="SOS và tín hiệu nghi ngã" badge={<Badge tone={open.length ? 'danger' : undefined}>{open.length} ca</Badge>} to="/f/incidents" />
      <Row icon={<MapIcon size={18} />} tileTone="sand" title="Bản đồ vùng quan sát" meta={!home.s.rooms.length ? 'Chưa có phòng nào, thêm thiết bị để hiện sơ đồ' : stale.length ? `${stale.map((r) => r.name).join(', ')} chưa có dữ liệu mới` : 'Mọi vùng có tín hiệu gần đây'} to="/f/map" />
      <Row icon={<Radar size={18} />} title="Guardian radar-nhiệt trực tiếp" meta={!home.s.devices.some((d) => d.kind === 'radar') ? 'Chưa có cảm biến radar, kết nối qua Home Assistant' : home.s.real ? 'Radar và cảm biến nhiệt, theo dõi ngã theo phòng' : 'LD2450 2D, MLX90640 32×24, điểm ghép'} to="/f/guardian" />
      {camera && <Row icon={<Camera size={18} />} title="Camera được cấp quyền" meta="Xem theo vùng và thời hạn" to={`/f/camera/${encodeURIComponent(camera.id)}`} />}
      <Row icon={<Power size={18} />} title="Thiết bị và điện dự phòng" meta={home.s.real ? 'Home Assistant, cảm biến, UPS và mạng' : 'Hub, cảm biến, UPS và mạng'} to="/f/devices" />
      <Row icon={<Lightbulb size={18} />} tileTone="sand" title="Thiết bị thông minh" meta="Đèn, ổ cắm, cảnh và luật tự động" to="/f/smart" />
      <Row icon={<Building2 size={18} />} title="Bệnh viện gần nhà" meta={hospitals.length ? hospitals.map((h) => h.name).join(', ') : 'Thêm nơi đưa người thân tới khi cần'} to="/f/hospitals" />
      {home.s.real ? null : <Row icon={<FlaskConical size={18} />} tileTone="peach" title="Thử tình huống trong nhà mẫu" meta="Ngã, khói, rò nước, mất điện, mất Internet" to="/f/simulate" />}
      <Link to="/f/sos" className="btn danger">
        <Siren size={18} /> Gửi SOS
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
      {open.length === 0 && <div className="empty">Không có ca đang mở. Ca mới hiện ở đây khi có SOS hoặc cảm biến báo động.</div>}
      {open.map((i) => (
        <Row key={i.id} icon={kindIcon(i.kind)} tileTone={i.priority === 'P1' ? 'rose' : 'sand'} title={i.title} meta={`${hhmm(i.createdAt)}, ${i.status === 'verifying' ? 'Đang kiểm tra' : i.assignee ? `${i.assignee} đã nhận việc` : i.evidence[0]?.summary ?? ''}`} right={prioBadge(i)} to={`/f/incident/${i.id}`} />
      ))}
      <Row tone="tint" icon={<Siren size={18} />} tileTone="white" title="Báo tại chỗ" meta="Còi khói/CO và đường SOS tối thiểu theo cấu hình tại nhà, chạy cả khi mất Internet." />
      {closed.length > 0 && <div className="section-title">Đã đóng gần đây</div>}
      {closed.map((i) => (
        <Row key={i.id} icon={kindIcon(i.kind)} title={`${i.id}, ${i.title}`} meta={i.closedReason} to={`/f/incident/${i.id}`} />
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
  const [closeOpen, setCloseOpen] = useState(false);
  const [okOpen, setOkOpen] = useState(false);
  const [, setTick] = useState(0);
  const [loc, setLoc] = useState<string>('');
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!inc || inc.kind !== 'sos') return;
    if (inc.location) return setLoc(`${inc.location.lat.toFixed(5)}, ${inc.location.lng.toFixed(5)}, sai số khoảng ${Math.round(inc.location.accuracy)} m`);
    void readSupportLocation(me.id, inc.personId).then((r) => setLoc(r.ok && r.data ? `${r.data.place}, ${r.data.lat.toFixed(4)}, ${r.data.lng.toFixed(4)}` : 'Không mở được vị trí: ' + (r.error ?? 'Không có quyền vị trí')));
  }, [inc?.id, inc?.kind, me.id, inc]);
  if (!inc)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/incidents" />
        <Header title="Không tìm thấy ca" sub="Ca có thể đã đóng và được dọn khỏi máy này." />
        <Link to="/f/incidents" className="btn">Về các ca đang mở</Link>
      </Phone>
    );
  const actor = { id: me.id, name: me.name, role: me.role };
  const canAct = home.canCoordinate(actor);
  const person = members.find((m) => m.id === inc.personId);
  const contacts = supportContacts(inc.personId ?? '');
  const emergency = inc.kind === 'smoke' ? { n: '114', label: 'Gọi cứu hỏa 114' } : { n: '115', label: 'Gọi cấp cứu 115' };
  const left = Math.max(0, Math.ceil((inc.createdAt + FALL_ESCALATE_MS - Date.now()) / 1000));
  if (inc.status === 'verifying')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/incidents" />
        <Header title="Tín hiệu nghi ngã" sub={`${home.room(inc.room).name}, Nhận ${hhmm(inc.createdAt)}, ${inc.id}`} />
        <Row tone="peach" icon={<Activity size={18} />} tileTone="white" title="Đang xác minh" meta="Quan sát từ radar và nhiệt. Chưa đủ bằng chứng để kết luận." />
        <div className="countdown" role="timer" aria-live="polite">
          <b>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</b>
          <span>{left > 0 ? 'Nếu chưa ai xác minh, Guardian sẽ tự bật còi và báo cả nhà' : 'Đang báo cả nhà'}</span>
        </div>
        <div className="card">
          <div className="label">Bằng chứng của ca</div>
          <div className="list">
            {inc.evidence.map((e, i) => (
              <div key={i} className="li"><Badge tone="line">{e.kind}</Badge><div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 700 }}>{e.summary}</div><div className="small muted">{hhmm(e.at)}, {e.ref}</div></div></div>
            ))}
          </div>
        </div>
        <Row icon={<Radar size={18} />} title="Xem vùng và độ mới" meta={`${home.room(inc.room).name}, Quan sát mới lúc ${hhmm(home.room(inc.room).lastSignal)}`} to="/f/guardian" />
        {person?.phone ? <a className="btn secondary" href={`tel:${person.phone}`}><PhoneIcon size={18} /> Gọi {person.name} để hỏi</a> : members.filter((m) => m.phone && m.id !== me.id).slice(0, 2).map((m) => <a key={m.id} className="btn secondary" href={`tel:${m.phone}`}><PhoneIcon size={18} /> Gọi {m.name}</a>)}
        {canAct ? (
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setOkOpen(true)}>Không sao</button>
            <button className="btn danger" onClick={() => home.verifyFall(inc.id, 'needs_help', actor)}>Cần hỗ trợ</button>
          </div>
        ) : (
          <>
            <div className="card sand"><p>Con hãy gọi ngay cho người lớn trong nhà. Nếu thấy ông bà bị ngã, bấm Cần hỗ trợ.</p></div>
            <button className="btn danger" onClick={() => home.verifyFall(inc.id, 'needs_help', actor)}>Cần hỗ trợ</button>
          </>
        )}
        <Sheet open={okOpen} onClose={() => setOkOpen(false)} title="Xác nhận không có sự cố">
          <p className="small muted" style={{ margin: 0 }}>Chỉ chọn khi bạn đã liên lạc được hoặc nhìn thấy người trong phòng an toàn. Guardian ghi lại lựa chọn này.</p>
          {['Đã gọi điện, người nhà vẫn ổn', 'Tôi đang ở nhà và đã kiểm tra phòng', 'Người nhà tự báo là ổn'].map((r) => (
            <button key={r} className="btn secondary" onClick={() => { home.verifyFall(inc.id, 'false_alarm', actor, r); setOkOpen(false); toast('Đã đóng ca: không có sự cố.'); nav('/f/incidents'); }}>{r}</button>
          ))}
          <button className="btn danger" onClick={() => { home.verifyFall(inc.id, 'needs_help', actor, 'Chưa liên lạc được'); setOkOpen(false); }}>Chưa liên lạc được, báo cả nhà</button>
        </Sheet>
        <Link to="/f/incidents" className="btn ghost">Về các ca đang mở</Link>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/incidents" right={<Sim sos />} />
      <Header title={inc.title} sub={`Ca ${inc.id}, ${new Date(inc.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}, ${hhmm(inc.createdAt)}${inc.status === 'closed' ? ', đã đóng' : ''}`} />
      <div className="card">
        <Steps
          items={[
            { title: 'Báo tại nhà', meta: inc.steps.local.at ? `Đã bật còi, ${hhmm(inc.steps.local.at)}` : inc.steps.local.state === 'unknown' ? 'Nhà chưa kết nối còi báo' : 'Chưa phát', state: inc.steps.local.state },
            { title: home.s.real ? 'Tin nhắn tới người thân' : 'Kênh từ xa', meta: `${inc.steps.remote.note ?? ''}${inc.steps.remote.at ? ', ' + hhmm(inc.steps.remote.at) : ''}`, state: inc.steps.remote.state },
            { title: 'Người hỗ trợ', meta: inc.steps.helper.by ? `${inc.steps.helper.by} đã nhận việc, ${hhmm(inc.steps.helper.at!)}` : 'Chưa ai nhận việc', state: inc.steps.helper.state },
            { title: 'Có mặt và bàn giao', meta: inc.steps.handover.at ? `Đã bàn giao, ${hhmm(inc.steps.handover.at)}` : 'Chờ người hỗ trợ xác nhận', state: inc.steps.handover.state },
          ]}
        />
      </div>
      {inc.kind === 'sos' && <Row icon={<MapPin size={18} />} title={inc.location ? 'Vị trí khi gửi SOS' : 'Vị trí hỗ trợ (qua Sentinel)'} meta={loc || 'Đang mở'} chevron={false} right={inc.location ? <Link className="btn xs secondary" to={`/f/maps/dir?to=${inc.location.lat.toFixed(6)},${inc.location.lng.toFixed(6)}&name=${encodeURIComponent(`Chỗ ${inc.personName ?? 'người thân'} gửi SOS`)}`}>Chỉ đường</Link> : undefined} />}
      {inc.status !== 'closed' && (inc.kind === 'sos' || inc.kind === 'smoke' || inc.kind === 'fall') && (
        <div className="card rose stack">
          <h3 style={{ margin: 0 }}>Báo cho người thân</h3>
          {contacts.length === 0 && <p style={{ margin: 0 }}>Chưa có người thân nào có số điện thoại. Thêm số trong Thành viên để gửi tin nhắn SOS.</p>}
          {contacts.length > 0 && home.s.real && <a className="btn danger" href={smsLink(contacts.map((m) => m.phone), sosMessage(inc))} onClick={() => home.markFamilyNotified(inc.id, me.name)}><MessageSquare size={18} /> Gửi tin nhắn SOS kèm vị trí</a>}
          {contacts.length > 0 && (
            <div className={contacts.length > 1 ? 'grid2' : 'stack'}>
              {contacts.slice(0, 4).map((m) => <a key={m.id} className="btn secondary" href={`tel:${m.phone}`}><PhoneIcon size={16} /> {contacts.length > 1 ? m.name : `Gọi ${m.name}`}</a>)}
            </div>
          )}
          {me.id !== inc.personId && inc.steps.helper.state !== 'done' && <button className="btn" onClick={() => home.acceptHelp(inc.id, { id: me.id, name: me.name })}><UserCheck size={18} /> Tôi đang tới</button>}
          <a className="btn secondary" href={`tel:${emergency.n}`}><PhoneIcon size={16} /> {emergency.label}</a>
        </div>
      )}
      {inc.destination && <Row tone="tint" icon={<MapPin size={18} />} tileTone="white" title={`Đích bàn giao: ${inc.destination.name ?? FACILITIES.find((f) => f.id === inc.destination!.facilityId)?.name}${inc.destination.gate ? ', ' + inc.destination.gate : ''}`} meta={`ETA ${inc.destination.etaMin} phút tại ${hhmm(inc.destination.computedAt)}, ${inc.destination.confirmedBy} chốt`} />}
      {inc.status !== 'closed' && canAct && (
        <>
          <div className="grid2">
            <button className="btn secondary" onClick={() => setAssignOpen(true)}><UserCheck size={18} /> Giao việc</button>
            <Link to={`/f/routes/${inc.id}`} className="btn secondary"><MapIcon size={18} /> Tuyến hỗ trợ</Link>
          </div>
          {inc.assignee && inc.steps.helper.state === 'active' && inc.assignee === me.name && <button className="btn" onClick={() => home.acceptHelp(inc.id, { id: me.id, name: me.name })}><UserCheck size={18} /> Tôi nhận việc, đang tới</button>}
          {inc.assignee && inc.steps.helper.state === 'done' && inc.steps.handover.state !== 'done' && (inc.assignee === me.name || me.role === 'admin') && <button className="btn" onClick={() => home.markHandover(inc.id, actor)}><Check size={18} /> Xác nhận có mặt và bàn giao</button>}
          <button className="btn ghost" onClick={() => setCloseOpen(true)}>Đóng ca</button>
        </>
      )}
      {inc.status !== 'closed' && !canAct && <div className="card sand"><p>Con hãy gọi cho người lớn trong nhà. Chỉ người lớn mới đóng được ca này.</p></div>}
      <Sheet open={closeOpen} onClose={() => setCloseOpen(false)} title="Đóng ca này?">
        <p className="small muted" style={{ margin: 0 }}>{inc.steps.handover.state === 'done' ? 'Người hỗ trợ đã có mặt và bàn giao.' : 'Chưa có ai xác nhận có mặt. Chỉ đóng khi chắc chắn người nhà đã an toàn.'} Chọn lý do để cả nhà cùng biết.</p>
        {['Đã an toàn, có người ở bên', 'Báo nhầm, không có sự cố', 'Đã đưa tới bệnh viện', 'Đã xử lý xong tại nhà'].map((r) => (
          <button key={r} className="btn secondary" onClick={() => { if (home.closeIncident(inc.id, r, actor)) { toast(`Đã đóng ca: ${r}.`); setCloseOpen(false); nav('/f/incidents'); } else toast('Bạn chưa có quyền đóng ca này.', 'warning'); }}>{r}</button>
        ))}
      </Sheet>
      <div className="card flat">
        <div className="label">Dòng thời gian</div>
        <div className="list">
          {inc.timeline.map((t, i) => (
            <div key={i} className="li small"><span className="mono muted">{hhmm(t.at)}</span><span style={{ flex: 1 }}>{t.text}</span><span className="muted">{t.by}</span></div>
          ))}
        </div>
      </div>
      <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title="Giao việc hỗ trợ">
        <p className="small muted" style={{ margin: 0 }}>Ca {inc.id}, Người điều phối có quyền. Có mặt, kết quả kiểm tra và bàn giao là các mốc riêng.</p>
        {members.filter((m) => m.role === 'admin' || m.role === 'member' || m.role === 'carer').filter((m) => m.id !== inc.personId).map((m) => (
          <Row key={m.id} icon={<Users size={18} />} title={m.id === me.id ? `${m.name} (tôi tự nhận)` : m.name} meta={m.relation} onClick={() => { home.assignHelper(inc.id, { id: m.id, name: m.name }, actor); setAssignOpen(false); toast(m.id === me.id ? 'Bạn đã nhận việc hỗ trợ.' : `Đã nhờ ${m.name}, chờ xác nhận.`); }} />
        ))}
      </Sheet>
    </Phone>
  );
}

export function FRoutes() {
  const real = useHome().s.real;
  return real ? <RealRoutes /> : <DemoRoutes />;
}

function DemoRoutes() {
  const { id } = useParams();
  const home = useHome();
  const inc = home.incident(id!);
  const cmp = compareRoutes(home.s.edges);
  const rec = cmp.results.find((r) => r.facility.id === cmp.recommended);
  const flaggable = home.s.edges.filter((e) => ['e3', 'e8', 'e10', 'e11', 'e7'].includes(e.id));
  return (
    <Phone tabs>
      <TopBar back backTo={`/f/incident/${id}`} />
      <Header title="So tuyến bệnh viện" sub={`Ca ${inc?.id ?? ''}, nhà mẫu lúc ${hhmm(Date.now())}`} />
      <RouteMap edges={home.s.edges} highlight={rec} />
      {cmp.results.map((r) => (
        <Row
          key={r.facility.id}
          icon={<MapPin size={18} />}
          tileTone={r.complete ? undefined : 'sand'}
          title={`${r.facility.name}, ${r.facility.gate}`}
          meta={r.blocked ? 'Không có tuyến khả dụng (ngập)' : `${r.minutes} phút, ${r.complete ? 'Cổng và đường đã đối chiếu' : 'Chờ dữ liệu ngập: ' + r.pendingEdges.map((e) => e.name).join(', ')}`}
          badge={r.facility.id === cmp.recommended ? <Badge>Đề xuất</Badge> : !r.complete ? <Badge tone="warm">Chưa đủ dữ kiện</Badge> : undefined}
          to={!r.blocked ? `/f/route/${id}/${r.facility.id}` : undefined}
        />
      ))}
      <div className="card sand">
        <h3>{cmp.completeCount}/{cmp.results.length} tuyến đủ dữ kiện</h3>
        <p style={{ color: '#6E4E20' }}>Tuyến thiếu dữ liệu ngập không được đề xuất. Ước tính tính tại {hhmm(Date.now())}.</p>
      </div>
      <div className="section-title">Cập nhật dữ liệu ngập (nhà mẫu)</div>
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
      <Header title={confirmed ? 'Đã chốt đích bàn giao' : `Tuyến đến ${f.name}`} sub={`Ca ${inc?.id}, ${confirmed ? `${f.name}, ${f.gate.toLowerCase()}` : `Đường tới ${f.gate.toLowerCase()}`}`} />
      <div style={{ position: 'relative' }}>
        <RouteMap edges={home.s.edges} highlight={r} height={230} />
        <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>NHÀ MẪU</span>
        <span className="badge white" style={{ position: 'absolute', right: 10, top: 10 }}>{f.gate.toUpperCase()}</span>
      </div>
      {confirmed ? (
        <>
          <Row tone="tint" icon={<Check size={18} />} tileTone="white" title="Đã xác nhận điểm đến" meta={`Người điều phối ${inc!.destination!.confirmedBy}, Phiên đích lúc ${hhmm(inc!.destination!.confirmedAt)}.`} />
          <Row icon={<MapPin size={18} />} title="ETA tại lúc tính" meta={`${inc!.destination!.etaMin} phút, ${hhmm(inc!.destination!.computedAt)}`} chevron={false} />
          <Link to={`/f/incident/${id}`} className="btn">Về hồ sơ ca</Link>
        </>
      ) : (
        <>
          <Row icon={<MapPin size={18} />} title="ETA ước tính" meta={`${r.minutes} phút, Cập nhật ${hhmm(Date.now())}${r.complete ? '' : ', tuyến chưa đủ dữ kiện ngập'}`} chevron={false} />
          <Row tone="tint" icon={<UserCheck size={18} />} tileTone="white" title="Đích bàn giao" meta="Người điều phối xác nhận cơ sở và cổng trước khi chia sẻ tuyến." />
          <button className="btn" disabled={!inc || inc.status === 'closed'} onClick={() => home.confirmDestination(id!, f.id, { id: me.id, name: me.name, role: me.role })}>
            Xác nhận {f.name}, {f.gate}
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
  const homeName = useHouseholdName();
  const me = useMe();
  const home = useHome();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = home.openIncidents().find((i) => i.kind === 'sos');
  const contacts = supportContacts(me.id);
  const send = async () => {
    setBusy(true);
    try {
      const inc = await sendSOS(me.id);
      nav(`/f/incident/${inc.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" right={<Sim sos />} />
      <Header title="Yêu cầu hỗ trợ" sub={`Gửi SOS tới người thân của ${homeName}.`} />
      <Row icon={<Users size={18} />} tileTone="rose" title="Người nhận SOS" meta={home.s.real ? (contacts.length ? contacts.map((m) => m.name).join(', ') : 'Chưa có người thân có số điện thoại') : `${namesOf(home.s.helpers.map((h) => h.id))}, danh sách hỗ trợ của nhà`} to={home.s.real && !contacts.length ? '/f/members' : undefined} chevron={home.s.real && !contacts.length} />
      {open ? (
        <Link to={`/f/incident/${open.id}`} className="btn danger"><Siren size={18} /> Xem SOS đang mở, {open.id}</Link>
      ) : (
        <button className="btn danger" style={{ minHeight: 72, fontSize: 18 }} disabled={busy} onClick={() => void send()}>
          <Siren size={22} /> {busy ? 'Đang lấy vị trí' : 'Gửi SOS'}
        </button>
      )}
      <div className="card sand">
        <p style={{ color: '#6E4E20' }}>{home.s.real ? 'SOS bật còi tại nhà nếu đã kết nối, báo tới điện thoại người thân trong nhà qua hub và soạn tin nhắn kèm vị trí GPS. HeartOS không tự gọi dịch vụ cấp cứu.' : 'Nhà mẫu: SOS báo tại nhà, tới người thân trong ứng dụng và kênh từ xa giả lập, không tự gọi dịch vụ cấp cứu.'} Khi nguy hiểm, hãy gọi 115 (cấp cứu), 114 (cứu hỏa) hoặc 113 (công an).</p>
        <a className="btn sm danger" style={{ marginTop: 10 }} href="tel:115"><PhoneIcon size={16} /> Gọi 115</a>
      </div>
    </Phone>
  );
}

export function FHospitals() {
  const me = useMe();
  const list = useApp((s) => s.hospitals);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const add = () => {
    setHospitals([...list, { name, address, phone, note }]);
    setName('');
    setAddress('');
    setPhone('');
    setNote('');
    toast('Đã thêm bệnh viện.');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Bệnh viện gần nhà" sub="Nơi đưa người thân tới khi cần. Chỉ đường ngay trên bản đồ HeartOS, kể cả khi mất mạng nếu đã lưu vùng." />
      {list.length === 0 && <div className="empty">Chưa có bệnh viện nào. Thêm ít nhất một nơi có khoa cấp cứu gần nhà.</div>}
      {list.map((h) => (
        <div key={h.id} className="card stack">
          <div className="hstack"><Building2 size={18} color="#244C3E" /><h3 style={{ margin: 0, flex: 1 }}>{h.name}</h3>{me.role === 'admin' && <button className="btn xs ghost" aria-label={`Xóa ${h.name}`} onClick={() => setHospitals(list.filter((x) => x.id !== h.id))}><Trash2 size={16} /></button>}</div>
          <p style={{ margin: 0 }}>{h.address}{h.note ? `, ${h.note}` : ''}</p>
          <div className="btnrow">
            <Link className="btn sm secondary" to={hospitalRoute(h)}><Navigation size={16} /> Chỉ đường</Link>
            {h.phone ? <a className="btn sm secondary" href={`tel:${h.phone}`}><PhoneIcon size={16} /> Gọi</a> : <span />}
          </div>
        </div>
      ))}
      {me.role === 'admin' && (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Thêm bệnh viện</h3>
          <Field label="Tên bệnh viện">
            <input className="input" placeholder="Ví dụ: Bệnh viện Chợ Rẫy" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Địa chỉ">
            <input className="input" placeholder="Số nhà, đường, quận" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Số điện thoại cấp cứu">
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Ghi chú (cổng, khoa)">
            <input className="input" placeholder="Ví dụ: Cổng cấp cứu số 2" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button className="btn" disabled={name.trim().length < 2 || address.trim().length < 4} onClick={add}><Plus size={18} /> Thêm</button>
        </div>
      )}
    </Phone>
  );
}

function hospitalRoute(h: { name: string; address: string; lat?: number; lng?: number }, from?: { lat: number; lng: number }) {
  const origin = from ? `&from=${from.lat.toFixed(6)},${from.lng.toFixed(6)}&fromName=${encodeURIComponent('Chỗ gửi SOS')}` : '';
  if (h.lat !== undefined && h.lng !== undefined) return `/f/maps/dir?to=${h.lat.toFixed(6)},${h.lng.toFixed(6)}&name=${encodeURIComponent(h.name)}&addr=${encodeURIComponent(h.address)}${origin}`;
  return `/f/maps?q=${encodeURIComponent(h.address || h.name)}`;
}

export function RealRoutes() {
  const { id } = useParams();
  const home = useHome();
  const me = useMe();
  const inc = home.incident(id!);
  const list = useApp((s) => s.hospitals);
  return (
    <Phone tabs>
      <TopBar back backTo={`/f/incident/${id}`} />
      <Header title="Nơi bàn giao" sub={`Ca ${inc?.id ?? ''}, chọn bệnh viện rồi mở chỉ đường`} />
      {list.length === 0 && <Row tone="sand" icon={<Building2 size={18} />} tileTone="white" title="Chưa có bệnh viện" meta="Thêm bệnh viện gần nhà để chỉ đường nhanh khi có SOS." to="/f/hospitals" />}
      {list.map((h) => {
        const chosen = inc?.destination?.facilityId === h.id;
        return (
          <div key={h.id} className={'card stack' + (chosen ? ' tint' : '')}>
            <div className="hstack"><Building2 size={18} color="#244C3E" /><h3 style={{ margin: 0, flex: 1 }}>{h.name}</h3>{chosen && <Badge>Đã chốt</Badge>}</div>
            <p style={{ margin: 0 }}>{h.address}{h.note ? `, ${h.note}` : ''}</p>
            <div className="btnrow">
              <Link className="btn sm secondary" to={hospitalRoute(h, inc?.location)}><Navigation size={16} /> Chỉ đường</Link>
              {!chosen && inc && inc.status !== 'closed' ? <button className="btn sm" onClick={() => home.setDestination(inc.id, h, { id: me.id, name: me.name, role: me.role })}><Check size={16} /> Chốt nơi này</button> : h.phone ? <a className="btn sm secondary" href={`tel:${h.phone}`}><PhoneIcon size={16} /> Gọi</a> : <span />}
            </div>
          </div>
        );
      })}
      <Link to="/f/hospitals" className="btn ghost">Sửa danh sách bệnh viện</Link>
    </Phone>
  );
}

const SIMS: { ev: SimEvent; label: string; icon: React.ReactNode; tone?: 'rose' | 'sand' }[] = [
  { ev: 'sos_bedroom', label: 'Nhấn nút SOS đầu giường', icon: <Siren size={18} />, tone: 'rose' },
  { ev: 'fall_hall', label: 'Người ngã ở hành lang', icon: <Activity size={18} />, tone: 'rose' },
  { ev: 'fall_bedroom', label: 'Người ngã ở phòng ngủ', icon: <Activity size={18} />, tone: 'rose' },
  { ev: 'fall_recover', label: 'Người ngã tự đứng dậy được', icon: <UserCheck size={18} /> },
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
  if (home.s.real) return <Navigate to="/f/safe" replace />;
  const plug = home.device('plug-hall');
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Thử tình huống" sub="Nhà mẫu: bơm sự kiện vào hub để thử Guardian, luật tự động và luồng SOS." />
      <div className="card flat"><p>Trạng thái: {home.s.net.internet ? 'Internet ổn định' : 'mất Internet'}, điện {home.s.power.mains === 'on' ? 'lưới' : 'UPS/máy phát'}, chế độ {home.s.mode}. Sự kiện gần nhất: {home.s.notices[0] ? `${home.s.notices[0].title} (${ago(home.s.notices[0].at)})` : 'chưa có'}.</p></div>
      {SIMS.map((s) => (
        <Row key={s.ev} icon={s.icon} tileTone={s.tone} title={s.label} onClick={() => { home.simulate(s.ev); toast(`Đã bơm sự kiện: ${s.label}`); }} />
      ))}
      <Row icon={<Plug size={18} />} title="Ổ cắm hành lang trực tuyến" meta="Lệnh đang chờ sẽ được áp dụng khi thiết bị trở lại" chevron={false} right={<Switch label="Ổ cắm trực tuyến" checked={!!plug?.online} onChange={(v) => home.setDeviceOnline('plug-hall', v)} />} />
      <Row icon={<UserCheck size={18} />} title="Người thân tự nhận việc" meta="An tự nhận SOS sau 6 giây (từ điện thoại của An)" chevron={false} right={<Switch label="Người thân tự nhận việc" checked={home.s.simulateHelpers} onChange={(v) => home.setSimulateHelpers(v)} />} />
      <KV items={[['Ca đang mở', String(home.openIncidents().length)], ['Lệnh đang chờ', String(home.s.commands.filter((c) => ['queued', 'sent', 'awaiting'].includes(c.status)).length)]]} />
    </Phone>
  );
}
