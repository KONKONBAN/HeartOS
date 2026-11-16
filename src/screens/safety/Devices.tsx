import { Activity, AirVent, BatteryCharging, Blinds, Camera, Check, Clock, Cpu, DoorOpen, Droplets, ExternalLink, Flame, Heart, Lightbulb, Lock, Moon, Network, Play, Plug, Plus, Power, QrCode, Radar, RefreshCw, Server, ShieldCheck, Siren, Trash2, Unlock, Utensils, Wifi, WifiOff, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Missing } from '../../components/Missing';
import { Badge, Chips, Field, Header, KV, Row, Seg, Steps, Switch, TopBar } from '../../components/ui';
import { describeDesired, roleName } from '../../core/smarthome/engine';
import type { Command, Device, DeviceKind, HomeMode, RoomId, Trigger } from '../../core/smarthome/types';
import { randomId } from '../../core/sentinel/encoding';
import { ago, hhmm, mmss, useNow } from '../../lib/format';
import { requestApproval, toast } from '../../lib/ui-store';
import { useOnline } from '../../lib/net';
import { syncHaNow, useHa } from '../../state/ha';
import { useHubLink } from '../../state/hublink';
import { getHome, useHome } from '../../state/services';
import { useApp, useHouseholdName, useMe } from '../../state/store';
import { haStateLabel } from './HomeAssistant';
import { AreaChart } from '../../components/Charts';

export const ICON: Partial<Record<DeviceKind, ReactNode>> = {
  hub: <Cpu size={18} />, light: <Lightbulb size={18} />, plug: <Plug size={18} />, door: <DoorOpen size={18} />, smoke: <Flame size={18} />, leak: <Droplets size={18} />, radar: <Radar size={18} />, thermal: <Activity size={18} />, camera: <Activity size={18} />, sos: <Siren size={18} />, siren: <Siren size={18} />, valve: <Droplets size={18} />, lock: <Lock size={18} />, ac: <AirVent size={18} />, curtain: <Blinds size={18} />, ups: <BatteryCharging size={18} />, generator: <Zap size={18} />, router: <Network size={18} />,
};

const ROOMS: { value: RoomId; label: string }[] = [
  { value: 'living', label: 'Phòng khách' },
  { value: 'kitchen', label: 'Bếp' },
  { value: 'door', label: 'Cửa chính' },
  { value: 'hall', label: 'Hành lang' },
  { value: 'bedroom', label: 'Phòng ngủ' },
  { value: 'laundry', label: 'Phòng giặt' },
];

export function stateText(d: Device) {
  const s = d.state;
  switch (d.kind) {
    case 'light': return s.on ? `Đang bật, ${s.brightness}%` : 'Đang tắt';
    case 'plug': return s.on ? `Đang bật, ${s.powerW} W` : 'Đang tắt';
    case 'ac': return s.on ? `Đang chạy, đặt ${s.target}°C${s.current ? `, phòng ${s.current}°C` : ''}` : 'Đang tắt';
    case 'curtain': return `Mở ${s.position}%`;
    case 'lock': return s.locked ? 'Đã khóa' : 'Đang mở khóa';
    case 'valve': return s.open ? 'Van đang mở' : 'Van đã khóa';
    case 'siren': return s.on ? 'Đang kêu' : 'Im lặng';
    case 'camera': return s.privacy !== undefined ? (s.privacy ? 'Chế độ riêng tư' : `Đang quan sát, ${s.masks} vùng che`) : s.on === false ? 'Không phản hồi' : s.streaming ? 'Đang phát' : 'Sẵn sàng';
    case 'door': return s.open ? 'Cửa đang mở' : 'Cửa đóng';
    case 'smoke': return s.co !== undefined ? (s.smoke ? `CÓ KHÓI, CO ${s.co} ppm` : `Bình thường, CO ${s.co} ppm`) : s.smoke ? 'CÓ KHÓI HOẶC KHÍ' : 'Bình thường';
    case 'leak': return s.wet ? 'Phát hiện nước' : 'Khô ráo';
    case 'radar': return s.presence !== undefined ? (s.presence ? 'Có người' : 'Không có người') : `${s.targets} mục tiêu`;
    case 'thermal': return `Đỉnh ${s.maxC}°C`;
    case 'sos': return s.pressed ? 'Đang nhấn' : 'Sẵn sàng';
    case 'ups': return `Pin ${Math.round(Number(s.battery))}%`;
    case 'generator': return String(s.state);
    case 'hub': return `CPU ${s.cpu}%, bộ nhớ ${s.storage}%`;
    default: return '';
  }
}

const pendingBadge = (c?: Command) => (c ? <Badge tone="warm">Chờ</Badge> : undefined);

export function FDevices() {
  const home = useHome();
  return home.s.real ? <FDevicesReal /> : <FDevicesDemo />;
}

function FDevicesDemo() {
  const homeName = useHouseholdName();
  const home = useHome();
  const now = useNow(5000);
  const hub = home.device('hub')!;
  const sensors = home.s.devices.filter((d) => ['radar', 'thermal', 'door', 'smoke', 'leak', 'sos'].includes(d.kind));
  const offline = home.s.devices.filter((d) => !d.online);
  const stale = home.s.rooms.filter((r) => r.stale).length;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Thiết bị tại nhà" sub={`${homeName}, hub và thiết bị ghép nối`} />
      <Row icon={<Cpu size={18} />} title="HeartOS Hub" meta={`LAN, Cập nhật lúc ${hhmm(hub.lastSeen)}, firmware ${hub.firmware}`} badge={<Badge>Trực tuyến</Badge>} chevron={false} />
      <Row icon={<Radar size={18} />} tileTone="sand" title="Radar, nhiệt và cảm biến" meta={`${home.s.rooms.length} vùng, ${stale} vùng chưa rõ, ${sensors.length} cảm biến`} to="/f/map" />
      <Row icon={<Power size={18} />} title="Nguồn và mạng" meta={`UPS ${home.s.power.ats === 'battery' ? 'đang dự phòng' : home.s.power.ups.charging ? 'đang sạc' : 'sẵn sàng'}, ${Math.round(home.s.power.ups.battery)}%`} to="/f/power" />
      <Row icon={<Lightbulb size={18} />} tileTone="sand" title="Thiết bị thông minh" meta="Đèn, ổ cắm, rèm, điều hòa, khóa và van" to="/f/smart" />
      {offline.length > 0 && (
        <div className="card rose">
          <h3 className="danger-text">{offline.length} thiết bị ngoại tuyến</h3>
          <p className="danger-text">{offline.map((d) => `${d.name} (${ago(d.lastSeen, now)})`).join(', ')}</p>
        </div>
      )}
      <div className="section-title">Tất cả cảm biến</div>
      {sensors.map((d) => (
        <Row key={d.id} icon={ICON[d.kind]} tileTone={d.online ? undefined : 'rose'} title={d.name} meta={`${stateText(d)}${d.battery !== undefined ? `, pin ${d.battery}%` : ''}, ${d.model}`} badge={!d.online ? <Badge tone="danger">Ngoại tuyến</Badge> : d.battery !== undefined && d.battery < 20 ? <Badge tone="warm">Pin yếu</Badge> : undefined} chevron={false} />
      ))}
      <Link to="/f/pair" className="btn">
        <Plus size={18} /> Ghép thiết bị
      </Link>
    </Phone>
  );
}

export function FPair() {
  const home = useHome();
  return home.s.real ? <FPairReal /> : <FPairDemo />;
}

function FPairDemo() {
  const home = useHome();
  const me = useMe();
  const now = useNow(500);
  const nav = useNavigate();
  const p = home.s.pairing;
  const [kind, setKind] = useState<DeviceKind>('door');
  const [name, setName] = useState('Cảm biến cửa, DR-02');
  const [room, setRoom] = useState<RoomId>('door');
  const [roles, setRoles] = useState<string[]>(['admin']);
  const actor = { id: me.id, name: me.name, role: me.role };
  if (me.role !== 'admin')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/devices" />
        <Header title="Ghép thiết bị" sub="Người có quyền quản thiết bị thực hiện tại nhà." />
        <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Bạn chưa có quyền quản thiết bị" meta={`Vai trò hiện tại: ${roleName(me.role)}. Nhờ quản trị hộ ghép thiết bị.`} />
      </Phone>
    );
  const step = p?.step ?? 'idle';
  const kinds: { value: DeviceKind; label: string; model: string; name: string }[] = [
    { value: 'door', label: 'Cảm biến cửa', model: 'Contact sensor', name: 'Cảm biến cửa, DR-02' },
    { value: 'light', label: 'Đèn', model: 'Zigbee bulb', name: 'Đèn phòng ngủ phụ' },
    { value: 'plug', label: 'Ổ cắm', model: 'Smart plug 16A', name: 'Ổ cắm phòng khách' },
    { value: 'leak', label: 'Cảm biến nước', model: 'Leak sensor', name: 'Cảm biến nước nhà tắm' },
    { value: 'sos', label: 'Nút SOS', model: 'Nút SOS Zigbee', name: 'Nút SOS nhà tắm' },
  ];
  return (
    <Phone tabs>
      <TopBar back backTo="/f/devices" />
      <Header title={step === 'zone' || step === 'done' ? 'Đặt vùng thiết bị' : 'Ghép thiết bị'} sub={step === 'zone' ? 'Mã đã được xác minh với hub.' : 'Người có quyền quản thiết bị thực hiện tại nhà.'} />
      <div className="card">
        <Steps
          items={[
            { title: 'Quét mã ghép', meta: p ? `Mã ngắn hạn ${p.code}, còn ${mmss(p.expiresAt - now)}` : 'Dùng mã ngắn hạn của thiết bị', state: step === 'scan' ? 'active' : step === 'idle' || step === 'expired' ? 'todo' : 'done' },
            { title: 'Xác nhận tại thiết bị', meta: 'Bấm nút vật lý trên hub', state: step === 'button' ? 'active' : ['zone', 'done'].includes(step) ? 'done' : 'todo' },
            { title: 'Đặt vùng', meta: 'Chọn phòng và quyền quan sát', state: step === 'zone' ? 'active' : step === 'done' ? 'done' : 'todo' },
          ]}
        />
      </div>
      {step === 'expired' && <Row tone="rose" icon={<Clock size={18} />} tileTone="white" title="Mã ghép đã hết hạn" meta="Bắt đầu lại để tạo mã mới." />}
      {(step === 'idle' || step === 'expired' || step === 'done') && (
        <button className="btn" onClick={() => home.startPairing(randomId('HOS', 3).toUpperCase().replace('HOS-', 'HOS-'))}>
          <QrCode size={18} /> {step === 'done' ? 'Ghép thêm thiết bị' : 'Tiếp tục ghép'}
        </button>
      )}
      {step === 'scan' && (
        <>
          <div className="label">Thiết bị trong nhà mẫu</div>
          <div className="chips">
            {kinds.map((k) => (
              <button key={k.value} className="chip" aria-pressed={kind === k.value} onClick={() => { setKind(k.value); setName(k.name); }}>{k.label}</button>
            ))}
          </div>
          <button className="btn" onClick={() => home.scanPairing(kind, kinds.find((k) => k.value === kind)!.model)}>Quét mã trên thiết bị</button>
        </>
      )}
      {step === 'button' && <button className="btn" onClick={() => !home.confirmPhysicalButton() && toast('Mã đã hết hạn.', 'warning')}>Tôi đã bấm nút vật lý trên hub</button>}
      {step === 'zone' && (
        <>
          <Field label="Thiết bị"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Vùng">
            <select className="input" value={room} onChange={(e) => setRoom(e.target.value as RoomId)}>{ROOMS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </Field>
          {['light', 'plug'].includes(p?.kind ?? '') && (
            <>
              <div className="label">Vai trò được điều khiển</div>
              <Chips options={[{ value: 'admin', label: 'Quản trị hộ' }, { value: 'member', label: 'Thành viên' }, { value: 'child', label: 'Thành viên trẻ' }]} value={roles} onChange={setRoles} />
            </>
          )}
          <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Quyền thiết bị" meta="Thiết bị chỉ gửi tín hiệu trong vùng đã gán." />
          <button className="btn" onClick={() => { const d = home.completePairing({ name, room, controlRoles: roles as Device['controlRoles'] }, actor); if (d) toast(`Đã lưu ${d.name}.`); }}>Lưu thiết bị</button>
        </>
      )}
      {step === 'done' && <button className="btn secondary" onClick={() => { home.cancelPairing(); nav('/f/devices'); }}>Về danh sách thiết bị</button>}
      {p && !['done', 'expired'].includes(step) && <button className="btn ghost" onClick={() => home.cancelPairing()}>Hủy ghép</button>}
    </Phone>
  );
}

export function FPower() {
  const home = useHome();
  return home.s.real ? <FPowerReal /> : <FPowerDemo />;
}

function FPowerDemo() {
  const home = useHome();
  const p = home.s.power;
  const n = home.s.net;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/devices" />
      <Header title="Điện và kết nối" sub={`Trạng thái đọc từ hub lúc ${hhmm(Date.now())}.`} />
      <div className="stats">
        <div className={'stat' + (p.ups.battery < 30 ? ' rose' : '')}><b>{Math.round(p.ups.battery)}%</b><span>Pin UPS {p.ups.charging ? ', đang sạc' : p.ats === 'battery' ? ', đang xả' : ''}</span></div>
        <div className="stat sand"><b>{p.ups.loadW} W</b><span>Tải thiết yếu</span></div>
      </div>
      <Row icon={<Zap size={18} />} tileTone={p.mains === 'on' ? undefined : 'rose'} title="Nguồn chính" meta={p.mains === 'on' ? `Điện lưới, ${p.voltage} V, Đang cấp` : 'Mất điện lưới'} badge={<Badge tone={p.mains === 'on' ? undefined : 'danger'}>{p.mains === 'on' ? 'Ổn định' : 'Mất điện'}</Badge>} chevron={false} />
      <Row icon={<Power size={18} />} tileTone="sand" title="Máy phát và ATS" meta={`Máy phát ${{ standby: 'chờ', cranking: 'đang khởi động', running: 'đang chạy', cooldown: 'đang làm mát' }[p.generator]}, ATS đang dùng ${{ mains: 'điện lưới', battery: 'UPS', generator: 'máy phát' }[p.ats]}`} chevron={false} />
      <Row icon={n.internet ? <Wifi size={18} /> : <WifiOff size={18} />} tileTone={n.internet ? undefined : 'rose'} title="Mạng tại nhà" meta={`LAN ${n.lan ? 'hoạt động' : 'mất'}, Internet ${n.internet ? 'đang kết nối' : 'gián đoạn'}`} chevron={false} />
      <div className="card">
        <div className="chart-head"><b>Công suất toàn nhà</b><span>{Math.round(home.totalW()).toLocaleString('vi-VN')} W</span></div>
        <AreaChart points={home.s.energy.map((e) => ({ x: e.at, y: e.w }))} title="Công suất toàn nhà trong vài phút gần đây" unit="W" />
      </div>
      <Row tone="tint" icon={<Check size={18} />} tileTone="white" title="Tải ưu tiên" meta="Hub, vùng cần thiết và đường SOS đã cấu hình. Khi chạy UPS, luật tự động cắt ổ cắm không thiết yếu." />
      <div className="stack">
        <button className="btn secondary" onClick={() => home.simulate(p.mains === 'on' ? 'mains_lost' : 'mains_restored')}>{p.mains === 'on' ? 'Thử mất điện' : 'Có điện lại'}</button>
        <button className="btn secondary" onClick={() => home.simulate(n.internet ? 'internet_lost' : 'internet_restored')}>{n.internet ? 'Thử mất Internet' : 'Có Internet lại'}</button>
      </div>
      {p.history.length > 0 && (
        <div className="card flat">
          <div className="label">Nhật ký nguồn</div>
          <div className="list">{p.history.slice(0, 6).map((h, i) => <div key={i} className="li small"><span className="mono muted">{hhmm(h.at)}</span>{h.text}</div>)}</div>
        </div>
      )}
      <Link to="/f/offline" className="btn">Xem trạng thái khi mất Internet</Link>
    </Phone>
  );
}

export function FOffline() {
  const home = useHome();
  return home.s.real ? <FOfflineReal /> : <FOfflineDemo />;
}

function FOfflineDemo() {
  const homeName = useHouseholdName();
  const home = useHome();
  const n = home.s.net;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/power" />
      <Header title={n.internet ? 'Kết nối ổn định' : 'Kết nối đang gián đoạn'} sub={n.internet ? `${homeName}, hub có Internet` : `${homeName}, hub mất Internet lúc ${hhmm(n.changedAt)}`} />
      <Row tone="tint" icon={<Network size={18} />} tileTone="white" title="Vẫn đọc được từ hub" meta={`LAN đang hoạt động. Bản đọc thiết bị lấy lúc ${hhmm(Date.now())}. Lệnh trong nhà vẫn chạy qua LAN.`} />
      <Row icon={<Siren size={18} />} tileTone="rose" title="Đường báo tại nhà" meta={`Cấu hình tối thiểu tại nhà vẫn có nguồn.${n.internet ? '' : ' Trạng thái gửi từ xa chưa rõ.'}`} />
      <KV items={[['Ca chờ gửi từ xa', String(home.openIncidents().filter((i) => i.steps.remote.state === 'unknown').length)], ['Nguồn', home.s.power.ats === 'mains' ? 'Điện lưới' : home.s.power.ats === 'battery' ? 'UPS' : 'Máy phát']]} />
      <button className="btn secondary" onClick={() => home.simulate(n.internet ? 'internet_lost' : 'internet_restored')}>{n.internet ? 'Thử mất Internet' : 'Có Internet lại'}</button>
      <Link to="/f/power" className="btn">Về điện và kết nối</Link>
    </Phone>
  );
}

export function FSmart() {
  const home = useHome();
  const me = useMe();
  const actor = { id: me.id, name: me.name, role: me.role };
  const ha = useHa();
  const actuators = home.s.devices.filter((d) => ACTUATORS.includes(d.kind));
  const recent = home.s.commands.slice(0, 6);
  const roomIds = [...home.s.rooms.map((r) => r.id), ...new Set(actuators.map((d) => d.room).filter((r) => !home.s.rooms.some((x) => x.id === r)))];
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Thiết bị thông minh" sub={home.s.real ? 'Lệnh qua Home Assistant, chỉ đổi trạng thái khi thiết bị phản hồi.' : 'Lệnh theo phòng, quyền và trạng thái phản hồi.'} />
      {home.s.real && ha.state === 'off' && <Row tone="sand" icon={<Server size={18} />} tileTone="white" title="Chưa kết nối Home Assistant" meta="Kết nối để điều khiển đèn, ổ cắm, rèm, điều hòa, khóa và van." to="/f/ha" />}
      {home.s.real && ha.state !== 'off' && actuators.length === 0 && <div className="empty">Chưa có thiết bị điều khiển được. Ghép đèn, ổ cắm hoặc rèm vào Home Assistant, HeartOS sẽ tự nhận.</div>}
      <Seg<HomeMode> value={home.s.mode} onChange={(m) => home.setMode(m, actor)} options={[{ value: 'home', label: 'Ở nhà' }, { value: 'away', label: 'Vắng nhà' }, { value: 'night', label: 'Ban đêm' }]} />
      <div className="grid2">
        <Link to="/f/scenes" className="btn secondary"><Utensils size={18} /> Cảnh</Link>
        <Link to="/f/automations" className="btn secondary"><Clock size={18} /> Tự động hóa</Link>
      </div>
      {roomIds.map((rid) => {
        const list = actuators.filter((d) => d.room === rid);
        if (!list.length) return null;
        return (
          <div key={rid} className="stack" style={{ gap: 8 }}>
            <div className="section-title">{home.room(rid).name}</div>
            {list.map((d) => {
              const pend = home.pendingFor(d.id);
              const allowed = home.canControl(d, actor).ok;
              const isOn = d.kind === 'lock' ? !!d.state.locked : d.kind === 'valve' ? !!d.state.open : d.kind === 'curtain' ? Number(d.state.position) > 0 : !!d.state.on;
              return (
                <Row
                  key={d.id}
                  icon={ICON[d.kind]}
                  tileTone={isOn ? 'peach' : d.online ? undefined : 'rose'}
                  title={d.name}
                  meta={pend ? (pend.reason ?? 'Chờ thiết bị phản hồi') : `${stateText(d)}${d.confirmedAt ? ', Xác nhận ' + hhmm(d.confirmedAt) : ''}${d.online ? '' : ', ngoại tuyến'}`}
                  badge={pendingBadge(pend) ?? (isOn && d.kind === 'light' ? <Badge tone="peach">Bật</Badge> : undefined)}
                  to={`/f/smart/${encodeURIComponent(d.id)}`}
                  right={!allowed ? <Lock size={16} color="#8a8076" /> : undefined}
                />
              );
            })}
          </div>
        );
      })}
      {actuators.length > 0 && <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Lệnh theo quyền hộ" meta={`Bạn là ${roleName(me.role)}. Giao diện chỉ đổi trạng thái khi thiết bị phản hồi, kèm thời điểm nhận.`} />}
      <div className="card flat">
        <div className="label">Lệnh gần đây</div>
        <div className="list">
          {recent.length === 0 && <div className="li small muted">Chưa có lệnh.</div>}
          {recent.map((c) => (
            <div key={c.id} className="li small">
              <span className="mono muted">{hhmm(c.at)}</span>
              <span style={{ flex: 1 }}>{home.device(c.deviceId)?.name}: {describeDesired(c.desired)} <span className="muted">({c.byName})</span></span>
              <Badge tone={c.status === 'acked' ? undefined : c.status === 'rejected' || c.status === 'failed' || c.status === 'expired' ? 'danger' : 'warm'}>{statusLabel(c.status)}</Badge>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

const statusLabel = (s: Command['status']) => ({ queued: 'Xếp hàng', sent: 'Đã gửi', awaiting: 'Chờ', acked: 'Đã xác nhận', failed: 'Lỗi', rejected: 'Từ chối', expired: 'Hết hạn', cancelled: 'Đã hủy' })[s];

export function FSmartDevice() {
  const { id } = useParams();
  const home = useHome();
  const me = useMe();
  const d = home.device(decodeURIComponent(id ?? ''));
  const [bright, setBright] = useState(Number(d?.state.brightness ?? 80));
  const [pos, setPos] = useState(Number(d?.state.position ?? 100));
  const curB = Number(d?.state.brightness ?? 0);
  const curP = Number(d?.state.position ?? 0);
  useEffect(() => {
    if (curB > 0) setBright(curB);
  }, [curB]);
  useEffect(() => {
    setPos(curP);
  }, [curP]);
  if (!d) return <Missing title="Không tìm thấy thiết bị" sub="Thiết bị có thể đã bị gỡ khỏi Home Assistant." back="/f/smart" label="Về thiết bị thông minh" />;
  const actor = { id: me.id, name: me.name, role: me.role };
  const pend = home.pendingFor(d.id);
  const lastCmd = home.s.commands.find((c) => c.deviceId === d.id);
  const allowed = home.canControl(d, actor);
  const send = async (params: Record<string, string | number | boolean>) => {
    let approval: string | undefined;
    if (d.kind === 'lock' && params.locked === false) {
      const rec = await requestApproval(`Mở khóa ${d.name}`, [`Thiết bị: ${d.name} (${d.model})`, 'Hành động: mở khóa cửa chính', `Người yêu cầu: ${me.name}`], d.id, true);
      if (!rec) return;
      approval = rec.id;
    }
    const c = home.sendCommand(d.id, 'set', params, actor, 'user', approval);
    if (c.status === 'rejected' || c.status === 'failed') toast(c.reason ?? 'Lệnh bị từ chối', 'warning');
  };
  const toggleKey = d.kind === 'lock' ? 'locked' : d.kind === 'valve' ? 'open' : 'on';
  const on = d.kind === 'curtain' ? Number(d.state.position) > 0 : !!d.state[toggleKey];
  return (
    <Phone tabs>
      <TopBar back backTo="/f/smart" />
      <Header title={pend ? 'Đang chờ thiết bị' : d.name} sub={pend ? d.name : `${home.s.real ? 'Qua Home Assistant' : 'Thiết bị đã ghép'}, ${allowed.ok ? 'có quyền điều khiển' : 'chỉ xem'}`} />
      {pend ? (
        <div className="card">
          <Steps
            items={[
              { title: `Gửi lệnh: ${describeDesired(pend.desired)}`, meta: pend.sentAt ? `${home.s.real ? 'Đã gửi tới Home Assistant' : 'Đã xếp lệnh tới hub'}, ${hhmm(pend.sentAt)}` : 'Đang xếp hàng', state: pend.status === 'queued' ? 'active' : 'done' },
              { title: 'Thiết bị phản hồi', meta: pend.reason ?? 'Chờ thiết bị xác nhận', state: d.online ? 'active' : 'unknown' },
            ]}
          />
          <button className="btn xs ghost" onClick={() => home.cancelCommand(pend.id)}>Hủy lệnh đang chờ</button>
        </div>
      ) : (
        <Row tone={on ? 'peach' : 'tint'} icon={ICON[d.kind]} tileTone="white" title={stateText(d)} meta={d.confirmedAt ? `Thiết bị xác nhận lúc ${hhmm(d.confirmedAt)}.` : 'Chưa có xác nhận gần đây.'} badge={lastCmd?.status === 'acked' ? <Badge>Thiết bị đã xác nhận</Badge> : undefined} />
      )}
      {!allowed.ok && <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Không có quyền điều khiển" meta={allowed.reason} />}
      {allowed.ok && !['camera'].includes(d.kind) && (
        <button className={'btn' + (d.kind === 'lock' && on ? ' danger' : '')} disabled={!!pend} onClick={() => void send(d.kind === 'curtain' ? { position: on ? 0 : 100 } : { [toggleKey]: !on })}>
          {d.kind === 'lock' ? (on ? <Unlock size={18} /> : <Lock size={18} />) : <Power size={18} />}
          {d.kind === 'lock' ? (on ? 'Mở khóa (cần xác nhận)' : 'Khóa cửa') : d.kind === 'valve' ? (on ? 'Khóa van' : 'Mở van') : d.kind === 'curtain' ? (on ? 'Đóng rèm' : 'Mở rèm') : on ? 'Gửi lệnh tắt' : 'Gửi lệnh bật'}
        </button>
      )}
      {allowed.ok && d.kind === 'light' && (
        <div className="card stack">
          <div className="hstack"><span className="label" style={{ flex: 1 }}>Độ sáng</span><b>{bright}%</b></div>
          <input type="range" min={5} max={100} value={bright} onChange={(e) => setBright(Number(e.target.value))} onMouseUp={() => void send({ on: true, brightness: bright })} onTouchEnd={() => void send({ on: true, brightness: bright })} onKeyUp={() => void send({ on: true, brightness: bright })} />
          {(!home.s.real || d.ha?.ct) && <Seg value={String(d.state.temp ?? 'neutral')} onChange={(v) => void send({ temp: v })} options={[{ value: 'warm', label: 'Ấm' }, { value: 'neutral', label: 'Trung tính' }, { value: 'cool', label: 'Lạnh' }]} />}
        </div>
      )}
      {allowed.ok && d.kind === 'curtain' && (
        <div className="card stack">
          <div className="hstack"><span className="label" style={{ flex: 1 }}>Độ mở rèm</span><b>{pos}%</b></div>
          <input type="range" min={0} max={100} step={10} value={pos} onChange={(e) => setPos(Number(e.target.value))} onMouseUp={() => void send({ position: pos })} onTouchEnd={() => void send({ position: pos })} onKeyUp={() => void send({ position: pos })} />
        </div>
      )}
      {allowed.ok && d.kind === 'ac' && (
        <div className="card hstack">
          <span className="label" style={{ flex: 1 }}>Nhiệt độ đặt</span>
          <button className="btn xs secondary" onClick={() => void send({ target: Number(d.state.target) - 1 })}>−</button>
          <b style={{ fontSize: 20, minWidth: 54, textAlign: 'center' }}>{d.state.target}°C</b>
          <button className="btn xs secondary" onClick={() => void send({ target: Number(d.state.target) + 1 })}>+</button>
        </div>
      )}
      <div className="card flat">
        <KV
          items={[
            ['Phòng', home.room(d.room).name],
            ['Loại', d.model],
            ...(d.firmware ? [['Firmware', d.firmware] as [string, string]] : []),
            ...(d.ha ? [['Thực thể', d.ha.entity] as [string, string]] : []),
            ['Kết nối', d.online ? `Trực tuyến, ${ago(d.lastSeen)}` : `Ngoại tuyến, ${ago(d.lastSeen)}`],
            ['Quyền điều khiển', d.controlRoles.map((r) => roleName(r)).join(', ') || 'Chỉ đọc'],
            ...(home.s.real ? [] : [['Phạm vi vùng', d.zoneLocked ? 'Chỉ trong vùng được gán' : 'Không giới hạn'] as [string, string]]),
          ]}
        />
      </div>
      {home.s.real && me.role === 'admin' && <p className="small muted" style={{ margin: 0 }}>Đổi tên, đổi phòng hoặc gỡ thiết bị trong Home Assistant; HeartOS tự cập nhật.</p>}
      {!home.s.real && me.role === 'admin' && d.kind !== 'hub' && (
        <button className="btn ghost" onClick={() => { home.unpair(d.id, actor); history.back(); }}><Trash2 size={16} /> Gỡ ghép thiết bị</button>
      )}
      <Link to="/f/smart" className="btn secondary">Về danh sách thiết bị</Link>
    </Phone>
  );
}

const SCENE_ICON: Record<string, ReactNode> = { utensils: <Utensils size={18} />, moon: <Moon size={18} />, lock: <Lock size={18} />, heart: <Heart size={18} /> };

export function FScenes() {
  const home = useHome();
  return home.s.real ? <FScenesReal /> : <FScenesDemo />;
}

function FScenesDemo() {
  const home = useHome();
  const me = useMe();
  const [ran, setRan] = useState<Record<string, string>>({});
  return (
    <Phone tabs>
      <TopBar back backTo="/f/smart" />
      <Header title="Cảnh" sub="Một chạm gửi nhiều lệnh, mỗi lệnh vẫn kiểm quyền và chờ xác nhận." />
      {home.s.scenes.map((s) => (
        <div key={s.id} className="card stack" style={{ gap: 8 }}>
          <div className="hstack">
            <span className="tile peach">{SCENE_ICON[s.icon] ?? <Lightbulb size={18} />}</span>
            <div style={{ flex: 1 }}><b>{s.name}</b><div className="small muted">{s.description}</div></div>
          </div>
          <div className="small muted">{s.actions.map((a) => `${home.device(a.deviceId)?.name}: ${describeDesired(a.params ?? {})}`).join(', ')}</div>
          {ran[s.id] && <div className="small ok-text">{ran[s.id]}</div>}
          <button
            className="btn sm"
            onClick={() => {
              const out = home.runScene(s.id, { id: me.id, name: me.name, role: me.role });
              const rej = out.filter((c) => c.status === 'rejected');
              setRan((x) => ({ ...x, [s.id]: `${out.length - rej.length}/${out.length} lệnh đã gửi${rej.length ? ', ' + rej.map((c) => c.reason).join('; ') : ''}` }));
            }}
          >
            Chạy cảnh
          </button>
        </div>
      ))}
    </Phone>
  );
}

const SENSOR_EVENTS: { value: string; label: string; trigger: Trigger }[] = [
  { value: 'door', label: 'Cửa chính mở', trigger: { type: 'sensor', deviceId: 'door-main', event: 'open' } },
  { value: 'motion', label: 'Chuyển động hành lang', trigger: { type: 'sensor', deviceId: 'radar-hall', event: 'motion' } },
  { value: 'leak', label: 'Rò nước', trigger: { type: 'sensor', deviceId: 'leak-kitchen', event: 'leak' } },
  { value: 'mains', label: 'Mất điện lưới', trigger: { type: 'power', event: 'mains_lost' } },
  { value: 'net', label: 'Mất Internet', trigger: { type: 'net', event: 'internet_lost' } },
];

export function FAutomations() {
  const home = useHome();
  return home.s.real ? <FAutomationsReal /> : <FAutomationsDemo />;
}

function FAutomationsDemo() {
  const home = useHome();
  const me = useMe();
  const [ev, setEv] = useState('door');
  const [dev, setDev] = useState('light-hall');
  const [act, setAct] = useState<'on' | 'off'>('on');
  const [night, setNight] = useState(false);
  const lights = home.s.devices.filter((d) => ['light', 'plug', 'siren', 'valve'].includes(d.kind));
  const add = () => {
    const t = SENSOR_EVENTS.find((x) => x.value === ev)!;
    const d = home.device(dev)!;
    const params: Record<string, boolean> = d.kind === 'valve' ? { open: act === 'on' } : { on: act === 'on' };
    home.addRule({ name: `${t.label}: ${act === 'on' ? 'bật' : 'tắt'} ${d.name}`, description: `Tạo bởi ${me.name}${night ? ', chỉ 22:00-06:00' : ''}`, enabled: true, trigger: t.trigger, condition: night ? { timeBetween: ['22:00', '06:00'] } : undefined, actions: [{ type: 'device', deviceId: dev, action: 'set', params }] });
    toast('Đã thêm luật tự động.');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/smart" />
      <Header title="Tự động hóa" sub="Luật chạy trên hub tại nhà, vẫn hoạt động khi mất Internet." />
      {home.s.rules.map((r) => (
        <Row
          key={r.id}
          icon={<Zap size={18} />}
          tileTone={r.enabled ? 'sand' : undefined}
          title={r.name}
          meta={`${r.description}${r.fireCount ? `, đã chạy ${r.fireCount} lần, gần nhất ${hhmm(r.lastFired!)}` : ''}`}
          badge={r.builtin ? <Badge tone="line">Mặc định</Badge> : undefined}
          chevron={false}
          right={
            <span className="hstack">
              {!r.builtin && <button className="btn xs ghost" aria-label="Xóa luật" onClick={() => home.removeRule(r.id)}><Trash2 size={14} /></button>}
              <Switch label={`Bật luật ${r.name}`} checked={r.enabled} onChange={() => home.toggleRule(r.id)} />
            </span>
          }
        />
      ))}
      <div className="card stack">
        <h3>Thêm luật</h3>
        <Field label="Khi">
          <select className="input" value={ev} onChange={(e) => setEv(e.target.value)}>{SENSOR_EVENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </Field>
        <Field label="Thì">
          <select className="input" value={dev} onChange={(e) => setDev(e.target.value)}>{lights.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Field>
        <Seg value={act} onChange={setAct} options={[{ value: 'on', label: 'Bật / mở' }, { value: 'off', label: 'Tắt / khóa' }]} />
        <div className="hstack"><span className="small" style={{ flex: 1 }}>Chỉ ban đêm (22:00-06:00)</span><Switch label="Chỉ ban đêm" checked={night} onChange={setNight} /></div>
        <button className="btn sm" onClick={add}><Plus size={16} /> Thêm luật</button>
      </div>
    </Phone>
  );
}

const ACTUATORS: DeviceKind[] = ['light', 'plug', 'ac', 'curtain', 'lock', 'valve', 'siren'];
const SENSORS: DeviceKind[] = ['radar', 'thermal', 'door', 'smoke', 'leak', 'sos', 'ups'];

function HaRow() {
  const ha = useHa();
  const now = useNow(5000);
  return (
    <Row
      icon={ha.state === 'error' ? <WifiOff size={18} /> : <Server size={18} />}
      tileTone={ha.state === 'error' ? 'rose' : ha.state === 'ok' ? undefined : 'sand'}
      title="Home Assistant"
      meta={ha.state === 'ok' ? `${ha.devices} thiết bị, đồng bộ ${ago(ha.lastSync ?? now, now)}` : ha.state === 'error' ? ha.error : ha.state === 'connecting' ? 'Đang kết nối' : 'Chưa kết nối, bấm để thiết lập'}
      badge={<Badge tone={ha.state === 'ok' ? undefined : ha.state === 'error' ? 'danger' : 'warm'}>{haStateLabel(ha.state)}</Badge>}
      to="/f/ha"
    />
  );
}

function FDevicesReal() {
  const homeName = useHouseholdName();
  const home = useHome();
  const ha = useHa();
  const online = useOnline();
  const now = useNow(5000);
  const ds = home.s.devices;
  const sensors = ds.filter((d) => SENSORS.includes(d.kind));
  const actuators = ds.filter((d) => ACTUATORS.includes(d.kind));
  const cams = ds.filter((d) => d.kind === 'camera');
  const offline = ds.filter((d) => !d.online);
  const ups = ds.filter((d) => d.kind === 'ups');
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Thiết bị tại nhà" sub={`${homeName}, kết nối qua Home Assistant`} />
      <HaRow />
      {ha.state === 'off' ? (
        <div className="card stack">
          <h3>Chưa kết nối thiết bị</h3>
          <p className="small" style={{ margin: 0 }}>HeartOS dùng Home Assistant làm cầu nối tới thiết bị Zigbee, Wi-Fi, Matter và ESPHome trong nhà. Chỉ cần kết nối một lần trên điện thoại của quản trị hộ.</p>
          <Link to="/f/ha" className="btn"><Server size={18} /> Kết nối Home Assistant</Link>
        </div>
      ) : (
        <>
          <Row icon={<Radar size={18} />} tileTone="sand" title="Vùng quan sát và cảm biến" meta={`${home.s.rooms.length} phòng, ${sensors.length} cảm biến`} to="/f/map" />
          <Row icon={<Power size={18} />} title="Điện và kết nối" meta={`${ups.length ? `UPS ${ups.map((u) => `${Math.round(Number(u.state.battery))}%`).join(', ')}, ` : ''}Internet ${online ? 'đang kết nối' : 'gián đoạn'}`} to="/f/power" />
          <Row icon={<Lightbulb size={18} />} tileTone="sand" title="Thiết bị thông minh" meta={`${actuators.length} thiết bị điều khiển được${cams.length ? `, ${cams.length} camera` : ''}`} to="/f/smart" />
          {offline.length > 0 && (
            <div className="card rose">
              <h3 className="danger-text">{offline.length} thiết bị không phản hồi</h3>
              <p className="danger-text">{offline.map((d) => `${d.name} (${ago(d.lastSeen, now)})`).join(', ')}</p>
            </div>
          )}
          <div className="section-title">Cảm biến</div>
          {sensors.length === 0 && <div className="empty">Chưa có cảm biến. Thêm cảm biến cửa, khói, rò nước hoặc radar vào Home Assistant.</div>}
          {sensors.map((d) => (
            <Row key={d.id} icon={ICON[d.kind]} tileTone={d.online ? undefined : 'rose'} title={d.name} meta={`${stateText(d)}${d.battery !== undefined ? `, pin ${Math.round(d.battery)}%` : ''}, ${home.room(d.room).name}`} badge={!d.online ? <Badge tone="danger">Không phản hồi</Badge> : d.battery !== undefined && d.battery < 20 ? <Badge tone="warm">Pin yếu</Badge> : undefined} chevron={false} />
          ))}
          {cams.map((d) => (
            <Row key={d.id} icon={<Camera size={18} />} title={d.name} meta={`${stateText(d)}, ${home.room(d.room).name}`} to={`/f/camera/${encodeURIComponent(d.id)}`} />
          ))}
          <Link to="/f/pair" className="btn">
            <Plus size={18} /> Thêm thiết bị
          </Link>
        </>
      )}
    </Phone>
  );
}

function FPairReal() {
  const home = useHome();
  const me = useMe();
  const ha = useHa();
  const prefs = useApp((s) => s.prefs);
  const [busy, setBusy] = useState(false);
  if (me.role !== 'admin')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/devices" />
        <Header title="Thêm thiết bị" sub="Quản trị hộ thêm thiết bị trong Home Assistant." />
        <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Bạn chưa có quyền quản thiết bị" meta={`Vai trò hiện tại: ${roleName(me.role)}. Nhờ quản trị hộ thêm thiết bị.`} />
      </Phone>
    );
  const sync = async () => {
    setBusy(true);
    const before = new Set(home.s.devices.map((d) => d.id));
    await syncHaNow();
    setBusy(false);
    const added = getHome().s.devices.filter((d) => !before.has(d.id));
    toast(added.length ? `Đã nhận ${added.length} thiết bị mới: ${added.map((d) => d.name).join(', ')}.` : 'Chưa thấy thiết bị mới. Kiểm tra thiết bị đã hiện trong Home Assistant chưa.', added.length ? 'info' : 'warning', 5000);
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/devices" />
      <Header title="Thêm thiết bị" sub="Ghép thiết bị vào Home Assistant, HeartOS tự nhận và xếp theo phòng." />
      <div className="card">
        <Steps
          items={[
            { title: 'Ghép vào Home Assistant', meta: 'Cài đặt, Thiết bị và dịch vụ, Thêm tích hợp. Với Zigbee: bấm Thêm thiết bị rồi giữ nút ghép trên thiết bị.', state: 'active' },
            { title: 'Gán khu vực', meta: 'Chọn phòng cho thiết bị ngay trong Home Assistant.', state: 'todo' },
            { title: 'Đồng bộ về HeartOS', meta: `Tự đồng bộ mỗi 3 giây khi mở ứng dụng. Hiện có ${ha.devices} thiết bị.`, state: ha.state === 'ok' ? 'active' : 'todo' },
          ]}
        />
      </div>
      {ha.state === 'off' ? (
        <Link to="/f/ha" className="btn"><Server size={18} /> Kết nối Home Assistant trước</Link>
      ) : (
        <>
          <a className="btn secondary" href={`${prefs.haUrl}/config/integrations/dashboard`} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Mở trang thêm thiết bị</a>
          <button className="btn" disabled={busy} onClick={() => void sync()}><RefreshCw size={18} /> {busy ? 'Đang đồng bộ' : 'Đồng bộ ngay'}</button>
        </>
      )}
      <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Quyền điều khiển mặc định" meta="Khóa cửa và camera: quản trị hộ. Đèn và rèm: mọi thành viên. Ổ cắm, điều hòa, van nước và còi: người lớn." />
    </Phone>
  );
}

function FPowerReal() {
  const home = useHome();
  const ha = useHa();
  const online = useOnline();
  const ups = home.s.devices.filter((d) => d.kind === 'ups');
  const plugs = home.s.devices.filter((d) => d.kind === 'plug');
  const metered = plugs.filter((d) => Number(d.state.powerW) > 0 || d.state.powerW !== undefined);
  const total = Math.round(plugs.reduce((n, d) => n + Number(d.state.powerW ?? 0), 0));
  const lowest = ups.length ? Math.min(...ups.map((u) => Number(u.state.battery))) : undefined;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/devices" />
      <Header title="Điện và kết nối" sub={ha.lastSync ? `Đọc từ Home Assistant lúc ${hhmm(ha.lastSync)}` : 'Đọc từ Home Assistant và điện thoại này'} />
      <div className="stats">
        <div className={'stat' + (lowest !== undefined && lowest < 30 ? ' rose' : '')}><b>{lowest !== undefined ? `${Math.round(lowest)}%` : '-'}</b><span>{ups.length ? 'Pin UPS thấp nhất' : 'Chưa có UPS'}</span></div>
        <div className="stat sand"><b>{metered.length ? `${total} W` : '-'}</b><span>{metered.length ? 'Ổ cắm đo được' : 'Chưa có ổ cắm đo điện'}</span></div>
      </div>
      <Row icon={online ? <Wifi size={18} /> : <WifiOff size={18} />} tileTone={online ? undefined : 'rose'} title="Internet" meta={online ? 'Điện thoại đang có Internet' : 'Điện thoại mất Internet. Lệnh trong nhà vẫn chạy qua Wi-Fi nội bộ.'} badge={<Badge tone={online ? undefined : 'danger'}>{online ? 'Ổn định' : 'Gián đoạn'}</Badge>} chevron={false} />
      <Row icon={<Server size={18} />} tileTone={ha.state === 'ok' ? undefined : 'sand'} title="Home Assistant trong nhà" meta={ha.state === 'ok' ? 'Đang phản hồi qua mạng nội bộ' : ha.error ?? haStateLabel(ha.state)} to="/f/ha" />
      {ups.map((u) => (
        <Row key={u.id} icon={<BatteryCharging size={18} />} tileTone={Number(u.state.battery) < 30 ? 'rose' : undefined} title={u.name} meta={`${stateText(u)}, ${u.online ? 'đang phản hồi' : 'không phản hồi'}`} chevron={false} />
      ))}
      {metered.length > 0 && (
        <div className="card">
          <div className="chart-head"><b>Công suất các ổ cắm đo điện</b><span>{Math.round(total).toLocaleString('vi-VN')} W</span></div>
          <AreaChart points={home.s.energy.map((e) => ({ x: e.at, y: e.w }))} title="Công suất các ổ cắm đo điện trong vài phút gần đây" unit="W" minMax={50} />
          <div className="list">{metered.map((d) => <div key={d.id} className="li small"><span style={{ flex: 1 }}>{d.name}</span><span className="muted">{d.state.on ? `${Math.round(Number(d.state.powerW ?? 0))} W` : 'Tắt'}</span></div>)}</div>
        </div>
      )}
      {!ups.length && !metered.length && <Row tone="tint" icon={<Zap size={18} />} tileTone="white" title="Chưa có cảm biến điện" meta="Thêm UPS có cổng USB (tích hợp NUT) hoặc ổ cắm đo điện vào Home Assistant để theo dõi nguồn và tải." />}
      <Link to="/f/offline" className="btn">Xem trạng thái khi mất Internet</Link>
    </Phone>
  );
}

function FOfflineReal() {
  const homeName = useHouseholdName();
  const home = useHome();
  const ha = useHa();
  const online = useOnline();
  const hub = useHubLink();
  const link = hub?.link;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/power" />
      <Header title={online ? 'Kết nối ổn định' : 'Điện thoại mất Internet'} sub={`${homeName}, trạng thái đọc lúc ${hhmm(Date.now())}`} />
      <Row icon={online ? <Wifi size={18} /> : <WifiOff size={18} />} tileTone={online ? undefined : 'rose'} title="Internet" meta={online ? 'Đang kết nối' : 'Gián đoạn'} chevron={false} />
      <Row icon={<Server size={18} />} tileTone={ha.state === 'ok' ? undefined : 'sand'} title="Home Assistant trong nhà" meta={ha.state === 'ok' ? `Phản hồi qua Wi-Fi nội bộ, ${ha.devices} thiết bị` : ha.error ?? haStateLabel(ha.state)} to="/f/ha" />
      <Row icon={<Network size={18} />} tileTone={link?.lastError ? 'sand' : undefined} title="Hub gia đình" meta={link ? (link.lastError ? `Lỗi gần nhất: ${link.lastError}` : `Đồng bộ ${link.lastSync ? hhmm(link.lastSync) : 'chưa có'}, ${link.hubName}`) : 'Chưa ghép hub. Ghép trong Cài đặt, Hub gia đình.'} to="/f/hub" />
      <Row tone="tint" icon={<ShieldCheck size={18} />} tileTone="white" title="Khi mất Internet" meta="Home Assistant, luật tự động và lệnh trong nhà vẫn chạy qua Wi-Fi nội bộ. Gọi điện và tin nhắn SOS dùng sóng di động nên vẫn gửi được." />
      <KV items={[['Ca đang mở', String(home.openIncidents().length)], ['Lệnh đang chờ', String(home.s.commands.filter((c) => ['queued', 'sent', 'awaiting'].includes(c.status)).length)]]} />
      <Link to="/f/power" className="btn">Về điện và kết nối</Link>
    </Phone>
  );
}

function FScenesReal() {
  const home = useHome();
  const me = useMe();
  const ha = useHa();
  const [busy, setBusy] = useState('');
  const scenes = home.s.ha?.scenes ?? [];
  const can = me.role === 'admin' || me.role === 'member';
  const run = async (entity: string, name: string) => {
    setBusy(entity);
    try {
      await home.runHaScene(entity, { id: me.id, name: me.name, role: me.role });
      toast(`Đã chạy ${name}.`);
    } catch (e) {
      toast((e as Error).message, 'warning');
    } finally {
      setBusy('');
    }
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/smart" />
      <Header title="Cảnh" sub="Cảnh và kịch bản tạo trong Home Assistant, chạy bằng một chạm." />
      {ha.state === 'off' && <Row tone="sand" icon={<Server size={18} />} tileTone="white" title="Chưa kết nối Home Assistant" meta="Kết nối để dùng cảnh của nhà bạn." to="/f/ha" />}
      {ha.state !== 'off' && scenes.length === 0 && <div className="empty">Chưa có cảnh. Tạo cảnh trong Home Assistant (Cài đặt, Tự động hóa và cảnh, Cảnh), HeartOS tự đồng bộ.</div>}
      {scenes.map((s) => (
        <Row
          key={s.id}
          icon={s.entity.startsWith('script.') ? <Play size={18} /> : <Lightbulb size={18} />}
          tileTone="peach"
          title={s.name}
          meta={s.entity.startsWith('script.') ? 'Kịch bản' : 'Cảnh'}
          chevron={false}
          right={<button className="btn xs" disabled={!can || busy === s.entity} onClick={() => void run(s.entity, s.name)}>{busy === s.entity ? 'Đang chạy' : 'Chạy'}</button>}
        />
      ))}
      {!can && scenes.length > 0 && <p className="small muted" style={{ margin: 0 }}>Vai trò {roleName(me.role)} chỉ xem cảnh.</p>}
    </Phone>
  );
}

const SAFETY_RULES = [
  { icon: <Flame size={18} />, name: 'Báo khói hoặc khí', meta: 'Mở ca khẩn P1 và báo cả nhà' },
  { icon: <Droplets size={18} />, name: 'Phát hiện rò nước', meta: 'Mở ca P2 và báo cả nhà' },
  { icon: <Siren size={18} />, name: 'Nút SOS được nhấn', meta: 'Mở ca khẩn P1, hiện liên hệ người thân' },
  { icon: <Activity size={18} />, name: 'Radar nghi ngã', meta: 'Tăng tốc đột ngột rồi bất động 30 giây: mở ca đang xác minh' },
  { icon: <DoorOpen size={18} />, name: 'Cửa mở khi vắng nhà', meta: 'Gửi thông báo khi chế độ Vắng nhà' },
];

function FAutomationsReal() {
  const home = useHome();
  const me = useMe();
  const ha = useHa();
  const prefs = useApp((s) => s.prefs);
  const autos = home.s.ha?.automations ?? [];
  const admin = me.role === 'admin';
  const actor = { id: me.id, name: me.name, role: me.role };
  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, 'warning');
    }
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/smart" />
      <Header title="Tự động hóa" sub="Luật chạy trên Home Assistant tại nhà, vẫn hoạt động khi mất Internet." />
      <div className="section-title">Luật an toàn của HeartOS</div>
      {SAFETY_RULES.map((r) => (
        <Row key={r.name} icon={r.icon} tileTone="sand" title={r.name} meta={r.meta} badge={<Badge tone="line">Luôn bật</Badge>} chevron={false} />
      ))}
      <div className="section-title">Luật trong Home Assistant</div>
      {ha.state === 'off' && <Row tone="sand" icon={<Server size={18} />} tileTone="white" title="Chưa kết nối Home Assistant" meta="Kết nối để xem và bật tắt luật của nhà bạn." to="/f/ha" />}
      {ha.state !== 'off' && autos.length === 0 && <div className="empty">Chưa có luật nào trong Home Assistant.</div>}
      {autos.map((a) => (
        <Row
          key={a.id}
          icon={<Zap size={18} />}
          tileTone={a.enabled ? 'sand' : undefined}
          title={a.name}
          meta={a.lastTriggered ? `Chạy gần nhất ${hhmm(a.lastTriggered)}, ${ago(a.lastTriggered)}` : 'Chưa chạy lần nào'}
          chevron={false}
          right={
            <span className="hstack">
              {admin && <button className="btn xs ghost" aria-label={`Chạy ngay ${a.name}`} onClick={() => void act(() => home.triggerHaAutomation(a.entity, actor), `Đã chạy ${a.name}.`)}><Play size={14} /></button>}
              <Switch label={`Bật luật ${a.name}`} checked={a.enabled} onChange={(v) => (admin ? void act(() => home.setHaAutomation(a.entity, v, actor), v ? `Đã bật ${a.name}.` : `Đã tắt ${a.name}.`) : toast('Chỉ quản trị hộ được bật tắt luật.', 'warning'))} />
            </span>
          }
        />
      ))}
      {ha.state !== 'off' && admin && (
        <a className="btn secondary" href={`${prefs.haUrl}/config/automation/dashboard`} target="_blank" rel="noreferrer"><Plus size={18} /> Tạo luật mới trong Home Assistant</a>
      )}
    </Phone>
  );
}
