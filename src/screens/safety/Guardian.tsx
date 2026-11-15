import { Activity, Camera, Check, EyeOff, Lock, Radar, Server, Thermometer, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Chips, Header, Row, Seg, TopBar, TraceView } from '../../components/ui';
import { FALL_THRESHOLD } from '../../core/guardian/fusion';
import { summarizeTargets } from '../../core/guardian/fusion';
import type { TraceStep } from '../../core/sentinel/types';
import type { FusionResult } from '../../core/guardian/fusion';
import type { RadarTarget, RoomId, ThermalFrame } from '../../core/smarthome/types';
import { ago, hhmm, mmss, useNow } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { cameraViewers, endCamera, ensureCameraPolicy, setCameraViewers, startCamera } from '../../state/actions';
import { haCameraImage, useHa } from '../../state/ha';
import { useHome } from '../../state/services';
import { adultIds, useApp, useMe } from '../../state/store';

export function FMap() {
  const home = useHome();
  const now = useNow(2000);
  const fresh = home.freshRooms();
  const real = home.s.real;
  const [pick, setSel] = useState<RoomId>(real ? '' : 'laundry');
  const sel = home.s.rooms.some((r) => r.id === pick) ? pick : home.s.rooms[0]?.id ?? '';
  const room = home.room(sel);
  const cams = home.s.devices.filter((d) => d.kind === 'camera');
  const hasGuardian = home.s.devices.some((d) => d.kind === 'radar' || d.kind === 'thermal');
  const planH = Math.max(100, ...home.s.rooms.map((r) => r.rect.y + r.rect.h + 4));
  if (real && home.s.rooms.length === 0)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/safe" />
        <Header title="Vùng quan sát" sub="Chưa có phòng nào có thiết bị." />
        <div className="empty">Thêm cảm biến vào Home Assistant và gán Khu vực cho từng thiết bị, sơ đồ phòng sẽ hiện ở đây.</div>
        <Link to="/f/ha" className="btn"><Server size={18} /> Kết nối Home Assistant</Link>
      </Phone>
    );
  const devices = home.s.devices.filter((d) => d.room === sel && !['light', 'plug', 'ac', 'curtain'].includes(d.kind));
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Vùng quan sát" sub={`Guardian, ${fresh.length}/${home.s.rooms.length} vùng có tín hiệu gần đây`} />
      <svg viewBox={`0 0 100 ${real ? planH : 100}`} className="plan" style={real ? { aspectRatio: `100 / ${planH}` } : undefined} role="img" aria-label="Sơ đồ vùng quan sát">
        {home.s.rooms.map((r) => {
          const ok = fresh.includes(r);
          const active = r.id === sel;
          const fall = home.openIncidents().some((i) => i.room === r.id);
          return (
            <g key={r.id} onClick={() => setSel(r.id)} style={{ cursor: 'pointer' }}>
              <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} rx="3" fill={fall ? '#F9E2DD' : ok ? '#E4EDE1' : '#F4E8CF'} stroke={active ? '#18382D' : fall ? '#9E3830' : '#DDD2C3'} strokeWidth={active ? 1.2 : 0.6} />
              <text x={r.rect.x + 3} y={r.rect.y + 7} fontSize="4.2" fontWeight="700" fill="#211F1B">{r.short}</text>
              <text x={r.rect.x + 3} y={r.rect.y + 12.5} fontSize="3.2" fill={ok ? '#244C3E' : '#6E4E20'}>{ok ? 'Có tín hiệu' : 'Chưa rõ'}</text>
              {(home.radar[r.id] ?? []).map((t) => (
                <circle key={t.id} cx={r.rect.x + ((t.x + 3000) / 6000) * r.rect.w} cy={r.rect.y + r.rect.h - (t.y / 6000) * r.rect.h} r="1.6" fill="#D8612A" />
              ))}
            </g>
          );
        })}
      </svg>
      <Row
        icon={!fresh.includes(room) ? <EyeOff size={18} /> : <Check size={18} />}
        tileTone={!fresh.includes(room) ? 'sand' : undefined}
        title={room.name}
        meta={room.lastSignal ? `Thay đổi gần nhất ${hhmm(room.lastSignal)} (${ago(room.lastSignal, now)})${room.stale ? ', đang chờ dữ liệu mới' : ''}` : 'Chưa có dữ liệu'}
        badge={<Badge tone={!fresh.includes(room) ? 'warm' : undefined}>{fresh.includes(room) ? 'Có tín hiệu' : 'Chưa rõ'}</Badge>}
        chevron={false}
      />
      <div className="card">
        <div className="label">Thiết bị trong vùng</div>
        <div className="list">
          {devices.map((d) => (
            <div key={d.id} className="li">
              <span style={{ flex: 1 }}><b>{d.name}</b><div className="small muted">{d.model}{d.battery !== undefined ? `, pin ${Math.round(d.battery)}%` : ''}</div></span>
              <Badge tone={d.online ? undefined : 'danger'}>{d.online ? 'Trực tuyến' : 'Không phản hồi'}</Badge>
            </div>
          ))}
          {devices.length === 0 && <div className="li muted small">Không có cảm biến.</div>}
        </div>
      </div>
      {(!real || hasGuardian) && <Row icon={<Radar size={18} />} title="Radar và nhiệt" meta={`Cập nhật ${hhmm(now)}`} to="/f/guardian" />}
      {real ? (
        cams.map((c) => <Row key={c.id} icon={<Camera size={18} />} title={c.name} meta={`${home.room(c.room).name}, phiên xem có thời hạn`} to={`/f/camera/${encodeURIComponent(c.id)}`} />)
      ) : (
        <Row icon={<Camera size={18} />} title="Camera phòng khách" meta="Vùng riêng tư đã che theo cấu hình" to="/f/camera/cam-living" />
      )}
    </Phone>
  );
}

function drawThermal(c: HTMLCanvasElement | null, f?: ThermalFrame) {
  if (!c || !f) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  c.width = f.w;
  c.height = f.h;
  const img = ctx.createImageData(f.w, f.h);
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.25, 59, 15, 112],
    [0.5, 140, 41, 129],
    [0.72, 222, 73, 104],
    [0.88, 254, 159, 109],
    [1, 252, 253, 191],
  ];
  const lo = 24;
  const hi = 35;
  for (let i = 0; i < f.data.length; i++) {
    const t = Math.max(0, Math.min(1, (f.data[i] - lo) / (hi - lo)));
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k];
    const [t1, r1, g1, b1] = stops[k + 1];
    const u = (t - t0) / (t1 - t0 || 1);
    img.data.set([r0 + (r1 - r0) * u, g0 + (g1 - g0) * u, b0 + (b1 - b0) * u, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
}

function drawRadar(c: HTMLCanvasElement | null, targets: RadarTarget[]) {
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const W = (c.width = 360);
  const H = (c.height = 216);
  ctx.fillStyle = '#0f2a22';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2f5a4a';
  ctx.lineWidth = 1;
  for (let r = 1; r <= 6; r++) {
    ctx.beginPath();
    ctx.arc(W / 2, H, (r / 6) * H, Math.PI, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2 - H * Math.sin(Math.PI / 3), H - H * Math.cos(Math.PI / 3));
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2 + H * Math.sin(Math.PI / 3), H - H * Math.cos(Math.PI / 3));
  ctx.stroke();
  for (const t of targets) {
    const x = W / 2 + (t.x / 6000) * H;
    const y = H - (t.y / 6000) * H;
    ctx.fillStyle = t.speed > 100 ? '#ff8a5c' : '#ACDFE5';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`#${t.id} ${t.speed}cm/s`, x + 9, y + 4);
  }
}

export function FGuardian() {
  const home = useHome();
  return home.s.real ? <FGuardianReal /> : <FGuardianDemo />;
}

function FusionCard({ fusion }: { fusion: FusionResult }) {
  return (
    <div className={'card ' + (fusion.level === 'suspected' ? 'rose' : fusion.level === 'watch' ? 'sand' : 'tint')}>
      <div className="hstack">
        <Activity size={18} />
        <b style={{ flex: 1 }}>Điểm ghép {fusion.score.toFixed(2)} / ngưỡng {FALL_THRESHOLD}</b>
        <Badge tone={fusion.level === 'suspected' ? 'danger' : fusion.level === 'watch' ? 'warm' : undefined}>{fusion.level === 'suspected' ? 'Nghi ngã' : fusion.level === 'watch' ? 'Theo dõi' : 'Bình thường'}</Badge>
      </div>
      <div className="progress" style={{ margin: '8px 0' }}><i style={{ width: `${Math.min(100, fusion.score * 100)}%`, background: fusion.level === 'suspected' ? '#9E3830' : '#244C3E' }} /></div>
      <div className="list">
        {fusion.cues.map((c) => (
          <div key={c.name} className="li small">
            {c.hit ? <Check size={14} color="#9E3830" /> : <X size={14} color="#8a8076" />}
            <span style={{ flex: 1 }}>{c.name}</span>
            <span className="muted">{c.value}, w={c.weight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FGuardianReal() {
  const home = useHome();
  const zones = home.s.rooms.filter((r) => home.s.devices.some((d) => d.room === r.id && (d.kind === 'radar' || d.kind === 'thermal')));
  const [pick, setPick] = useState('');
  const room = zones.some((z) => z.id === pick) ? pick : zones[0]?.id ?? '';
  const rRef = useRef<HTMLCanvasElement>(null);
  const targets = home.radar[room] ?? [];
  const watch = home.fallWatch(room);
  const fallOpen = home.openIncidents().find((i) => i.kind === 'fall' && i.room === room);
  const ld2450 = !!home.s.ha?.radar && room in home.s.ha.radar;
  const presence = home.s.devices.filter((d) => d.room === room && d.kind === 'radar' && d.state.presence !== undefined);
  const therm = home.s.devices.filter((d) => d.room === room && d.kind === 'thermal');
  useEffect(() => {
    if (ld2450) drawRadar(rRef.current, targets);
  });
  if (!zones.length)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/safe" />
        <Header title="Guardian trực tiếp" sub="Phát hiện nghi ngã bằng radar và nhiệt, không dùng camera." />
        <div className="card stack">
          <h3>Chưa có cảm biến Guardian</h3>
          <p className="small" style={{ margin: 0 }}>Guardian dùng radar mmWave LD2450 (gắn ESP32, chạy ESPHome) và cảm biến nhiệt MLX90640 đặt ở phòng người thân. Thêm chúng vào Home Assistant, gán Khu vực, vùng sẽ hiện ở đây. Cảm biến chuyển động thường cũng được dùng để báo có người.</p>
          <Link to="/f/devices" className="btn"><Server size={18} /> Thiết bị tại nhà</Link>
        </div>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Guardian trực tiếp" sub="Ghép radar và nhiệt theo phòng. Ảnh nhiệt không nhận diện khuôn mặt." />
      {zones.length <= 3 ? (
        <Seg value={room} onChange={setPick} options={zones.map((z) => ({ value: z.id, label: z.short || z.name }))} />
      ) : (
        <select className="input" aria-label="Chọn phòng" value={room} onChange={(e) => setPick(e.target.value)}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
      )}
      {ld2450 && (
        <div className="card stack">
          <div className="hstack"><Radar size={16} /><b className="small" style={{ flex: 1 }}>Radar LD2450, {targets.length} mục tiêu</b><span className="small muted">2D, tối đa 3 mục tiêu</span></div>
          <canvas ref={rRef} className="radar" aria-label="Biểu đồ radar" />
          <div className="small muted">{targets.length ? summarizeTargets(targets) : 'Không có mục tiêu trong vùng.'}</div>
        </div>
      )}
      {presence.map((d) => (
        <Row key={d.id} icon={<Radar size={18} />} tileTone={d.state.presence ? 'peach' : undefined} title={d.name} meta={d.state.presence ? 'Có người trong phòng' : 'Không có người'} chevron={false} />
      ))}
      {therm.map((d) => (
        <Row key={d.id} icon={<Thermometer size={18} />} tileTone={Number(d.state.maxC) >= 28 ? 'peach' : undefined} title={`Nhiệt độ đỉnh ${Number(d.state.maxC).toFixed(1)}°C`} meta={`${d.name}. ${Number(d.state.maxC) >= 28 ? 'Có nguồn nhiệt cỡ cơ thể người.' : 'Không thấy nguồn nhiệt cơ thể.'}`} chevron={false} />
      ))}
      {ld2450 && (
        <div className={'card ' + (fallOpen ? 'rose' : watch.drop ? 'sand' : 'tint')}>
          <div className="hstack">
            <Activity size={18} />
            <b style={{ flex: 1 }}>Theo dõi ngã</b>
            <Badge tone={fallOpen ? 'danger' : watch.drop ? 'warm' : undefined}>{fallOpen ? 'Đã mở ca' : watch.drop ? 'Đang theo dõi' : 'Bình thường'}</Badge>
          </div>
          {fallOpen ? (
            <p className="small" style={{ margin: '8px 0 0' }}>{fallOpen.evidence.map((e) => e.summary).join('. ')}.</p>
          ) : (
          <div className="list" style={{ marginTop: 8 }}>
            <div className="li small">{watch.peak > 120 ? <Check size={14} color="#9E3830" /> : <X size={14} color="#8a8076" />}<span style={{ flex: 1 }}>Tốc độ cao nhất gần đây</span><span className="muted">{watch.peak} cm/s, ngưỡng 120</span></div>
            <div className="li small">{watch.stillSec >= 30 ? <Check size={14} color="#9E3830" /> : <X size={14} color="#8a8076" />}<span style={{ flex: 1 }}>Thời gian bất động</span><span className="muted">{watch.stillSec} giây, mở ca từ 30</span></div>
          </div>
          )}
          {fallOpen && <Link to={`/f/incident/${fallOpen.id}`} className="btn sm danger" style={{ marginTop: 10 }}>Xem ca đang mở</Link>}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>Khi radar thấy tăng tốc đột ngột rồi bất động từ 30 giây, HeartOS mở ca “đang xác minh” để người nhà kiểm tra. Guardian không tự kết luận hay tự gọi cấp cứu.</p>
    </Phone>
  );
}

function FGuardianDemo() {
  const home = useHome();
  const [room, setRoom] = useState<RoomId>('hall');
  const tRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<HTMLCanvasElement>(null);
  const frame = home.frames[room];
  const targets = home.radar[room] ?? [];
  const fusion = home.fusion[room];
  useEffect(() => {
    drawThermal(tRef.current, frame);
    drawRadar(rRef.current, targets);
  });
  return (
    <Phone tabs>
      <TopBar back backTo="/f/safe" />
      <Header title="Guardian trực tiếp" sub="Nhà mẫu, ghép radar và nhiệt theo cặp vùng. Ảnh nhiệt không nhận diện khuôn mặt." />
      <Seg value={room} onChange={setRoom} options={[{ value: 'hall', label: 'Hành lang' }, { value: 'living', label: 'Phòng khách' }, { value: 'bedroom', label: 'Phòng ngủ' }]} />
      <div className="card stack">
        <div className="hstack"><Radar size={16} /><b className="small" style={{ flex: 1 }}>Radar LD2450, {targets.length} mục tiêu</b><span className="small muted">2D, ≤3 mục tiêu</span></div>
        <canvas ref={rRef} className="radar" aria-label="Biểu đồ radar" />
        <div className="small muted">{targets.length ? summarizeTargets(targets) : 'Không có mục tiêu trong vùng.'}</div>
      </div>
      <div className="card stack">
        <div className="hstack"><Thermometer size={16} /><b className="small" style={{ flex: 1 }}>Ảnh nhiệt MLX90640, 32×24</b><span className="small muted">{frame ? `${frame.min.toFixed(1)}-${frame.max.toFixed(1)}°C` : '-'}</span></div>
        <canvas ref={tRef} className="thermal" aria-label="Ảnh nhiệt" />
      </div>
      {fusion && <FusionCard fusion={fusion} />}
      <button className="btn soft" onClick={() => { home.simulate(room === 'bedroom' ? 'fall_bedroom' : 'fall_hall'); toast('Nhà mẫu: người đi bộ rồi ngã, theo dõi điểm ghép.'); }}>
        <Activity size={18} /> Thử tình huống ngã trong nhà mẫu
      </button>
      <p className="small muted" style={{ margin: 0 }}>Vượt ngưỡng chỉ mở ca “đang xác minh”; Guardian không tự kết luận hay tự gọi cấp cứu.</p>
    </Phone>
  );
}

export function FCamera() {
  const home = useHome();
  return home.s.real ? <FCameraReal /> : <FCameraDemo />;
}

function FCameraReal() {
  const { id: raw } = useParams();
  const id = decodeURIComponent(raw ?? '');
  const home = useHome();
  const ha = useHa();
  const me = useMe();
  const members = useApp((s) => s.members);
  const sessions = useApp((s) => s.cameraSessions);
  const now = useNow(1000);
  const d = home.device(id);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [err, setErr] = useState('');
  const [frame, setFrame] = useState('');
  const [frameErr, setFrameErr] = useState('');
  const [frameAt, setFrameAt] = useState(0);
  const [viewers, setViewers] = useState<string[] | null>(null);
  const admin = me.role === 'admin';
  const active = sessions.find((s) => s.deviceId === id && s.status === 'active' && s.by === me.id);
  const last = sessions.find((s) => s.deviceId === id && s.by === me.id);
  useEffect(() => {
    if (!admin || !d) return;
    void ensureCameraPolicy(d.id, d.name, me.id).then(() => setViewers(cameraViewers(d.id)));
  }, [admin, d?.id, d?.name, me.id]);
  useEffect(() => {
    if (!active || !d?.ha) return;
    let stop = false;
    let timer: number | undefined;
    const grab = async () => {
      try {
        const img = await haCameraImage(d.ha!.entity);
        if (stop) return;
        setFrame(img);
        setFrameAt(Date.now());
        setFrameErr('');
      } catch (e) {
        if (!stop) setFrameErr((e as Error).message);
      }
      if (!stop) timer = window.setTimeout(() => void grab(), document.visibilityState === 'hidden' ? 4000 : 1500);
    };
    void grab();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      setFrame('');
    };
  }, [active?.id, d?.ha?.entity]);
  if (!d)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/map" />
        <Header title="Không tìm thấy camera" sub="Camera có thể đã bị gỡ khỏi Home Assistant." />
        <Link to="/f/devices" className="btn">Về thiết bị tại nhà</Link>
      </Phone>
    );
  const start = async () => {
    const r = await startCamera(d.id, me.id);
    setTrace(r.trace);
    setErr(r.ok ? '' : r.error);
  };
  const adults = adultIds(members, me.id);
  const others = members.filter((m) => adults.includes(m.id));
  return (
    <Phone tabs>
      <TopBar back backTo="/f/map" />
      <Header title={d.name} sub={`${home.room(d.room).name}, xem từ xa theo phiên có thời hạn`} />
      {ha.state !== 'ok' && <Row tone="sand" icon={<Server size={18} />} tileTone="white" title="Home Assistant chưa sẵn sàng" meta={ha.error ?? 'Kết nối Home Assistant trên điện thoại này để xem ảnh camera.'} to="/f/ha" />}
      {active ? (
        <>
          <div className="camview">
            {frame && <img src={frame} alt={`Ảnh trực tiếp từ ${d.name}`} />}
            {!frame && <div className="camwait">{frameErr || 'Đang lấy ảnh từ camera'}</div>}
            {frame && <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>Trực tiếp {hhmm(frameAt)}</span>}
          </div>
          {frame && frameErr && <p className="small danger-text" style={{ margin: 0 }}>{frameErr}</p>}
          <Row icon={<Lock size={18} />} title="Phạm vi phiên" meta={`${d.name}, còn ${mmss(active.expiresAt - now)}`} chevron={false} />
          <button className="btn" onClick={() => void endCamera(active.id)}>Kết thúc phiên xem</button>
        </>
      ) : (
        <>
          {last?.status === 'ended' && <Row tone="tint" icon={<Check size={18} />} tileTone="white" title="Phiên trước đã đóng" meta={`Đóng lúc ${hhmm(last.endedAt!)}. Ảnh không được lưu lại trên điện thoại.`} />}
          <div className="card stack">
            <p style={{ margin: 0 }}>Mỗi phiên xem cần Sentinel cấp quyền cho mục đích xem camera, kéo dài tối đa 4 phút và chỉ dành cho người được quản trị hộ cho phép.</p>
            <button className="btn" disabled={ha.state !== 'ok'} onClick={() => void start()}><Camera size={18} /> Mở phiên xem</button>
          </div>
          {err && <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Không mở được phiên" meta={err} />}
        </>
      )}
      {admin && viewers && (
        <div className="card stack">
          <div className="hstack"><Users size={16} /><b className="small" style={{ flex: 1 }}>Ai được xem camera này</b></div>
          {others.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>Chỉ bạn. Thêm thành viên người lớn để chia sẻ quyền xem.</p>
          ) : (
            <>
              <Chips options={others.map((m) => ({ value: m.id, label: m.name }))} value={viewers.filter((v) => others.some((m) => m.id === v))} onChange={(v) => setViewers(v)} />
              <button className="btn sm secondary" onClick={() => void setCameraViewers(d.id, me.id, viewers).then((ok) => toast(ok ? 'Đã lưu quyền xem camera.' : 'Không lưu được quyền xem.', ok ? 'info' : 'warning'))}>Lưu quyền xem</button>
            </>
          )}
        </div>
      )}
      {trace.length > 0 && <div className="card"><div className="label">Đường cấp quyền</div><TraceView trace={trace} compact /></div>}
    </Phone>
  );
}

function FCameraDemo() {
  const { id } = useParams();
  const me = useMe();
  const sessions = useApp((s) => s.cameraSessions);
  const nav = useNavigate();
  const now = useNow(500);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [err, setErr] = useState('');
  const [masks, setMasks] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = sessions.find((s) => s.deviceId === id && s.status === 'active' && s.by === me.id);
  const last = sessions.find((s) => s.deviceId === id && s.by === me.id);
  useEffect(() => {
    if (!active || !canvas.current) return;
    const c = canvas.current;
    const ctx = c.getContext('2d')!;
    c.width = 480;
    c.height = 300;
    ctx.fillStyle = '#2b3530';
    ctx.fillRect(0, 0, 480, 300);
    ctx.fillStyle = '#3b4741';
    ctx.fillRect(0, 200, 480, 100);
    ctx.fillStyle = '#5b4a3d';
    ctx.fillRect(40, 150, 170, 60);
    ctx.fillStyle = '#6f8a7a';
    ctx.fillRect(300, 60, 120, 90);
    ctx.fillStyle = '#18382D';
    ctx.fillRect(30, 120, 200, 100);
    ctx.fillRect(420, 40, 60, 170);
    ctx.fillStyle = '#ACDFE5';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText('VÙNG RIÊNG TƯ ĐÃ CHE', 52, 175);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 480, Math.random() * 300, 2, 2);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`Phòng khách, ${new Date(now).toLocaleTimeString('vi-VN')}`, 12, 290);
  }, [active, now]);
  const start = async () => {
    const r = await startCamera(id!, me.id);
    setTrace(r.trace);
    if (!r.ok) setErr(r.error);
    else {
      setErr('');
      setMasks(r.masks);
    }
  };
  if (!active && last?.status === 'ended')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/map" />
        <Header title="Đã đóng phiên xem" sub="Camera phòng khách, Thiết bị này" />
        <Row tone="tint" icon={<Check size={18} />} tileTone="white" title="Quyền xem đã kết thúc" meta={`Đầu phát đã xác nhận đóng phiên lúc ${hhmm(last.endedAt!)}.`} />
        <button className="btn secondary" onClick={() => void start()}>Mở phiên mới</button>
        <Link to="/f/map" className="btn">Về bản đồ vùng</Link>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/map" />
      <Header title="Camera phòng khách" sub="Xem từ xa, Phiên có thời hạn" />
      {active ? (
        <>
          <div className="camview">
            <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="Khung xem nhà mẫu" />
            <span className="badge dark" style={{ position: 'absolute', left: 10, top: 10 }}>Nhà mẫu, vùng che</span>
          </div>
          <Row icon={<Lock size={18} />} title="Phạm vi phiên" meta={`Phòng khách, Còn ${mmss(active.expiresAt - now)}`} chevron={false} />
          <Row tone="tint" icon={<EyeOff size={18} />} tileTone="white" title="Vùng riêng tư" meta={`Vùng che áp dụng trên luồng quan sát từ nhà: ${masks || 'theo cấu hình'}.`} />
          <button className="btn" onClick={() => void endCamera(active.id).then(() => nav(`/f/camera/${id}`))}>Kết thúc phiên xem</button>
        </>
      ) : (
        <>
          <div className="card stack">
            <p>Phiên xem cần grant của Sentinel cho mục đích “camera.view”, có thời hạn tối đa 4 phút và chỉ dành cho người được cấp quyền vùng camera.</p>
            <button className="btn" onClick={() => void start()}><Camera size={18} /> Mở phiên xem</button>
          </div>
          {err && <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Không mở được phiên" meta={err} />}
        </>
      )}
      {trace.length > 0 && <div className="card"><div className="label">Đường cấp quyền</div><TraceView trace={trace} compact /></div>}
    </Phone>
  );
}
