import { Calculator, FileText, FlaskConical, FolderOpen, KeyRound, LayoutDashboard, Link2, Lock, MonitorSmartphone, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Trash2, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Badge, Logo, Seg, Sheet } from '../../components/ui';
import type { HubCommandRecord, StoredJournalEntry } from '../../core/hublink/hubcore';
import { COMMAND_LABEL, type CommandKind, type DeviceSnapshot } from '../../core/hublink/protocol';
import { SECURITY_STATE_LABEL, type SecurityState } from '../../core/sentinel/incident';
import type { JournalEntry } from '../../core/sentinel/journal';
import { fmt } from '../../core/sentinel/state';
import { ago, hhmm, hhmmss, mmss, useNow } from '../../lib/format';
import { hubApi, useHubView } from '../../lib/hubApi';
import { toast } from '../../lib/ui-store';
import { Item, Metric, OpsHead } from '../ops/Ops';

const ONLINE_MS = 30_000;

const NAV: { to: string; label: string; icon: ReactNode; grp?: string }[] = [
  { to: '/admin', label: 'Tổng quan', icon: <LayoutDashboard size={16} />, grp: 'MÁY QUẢN TRỊ' },
  { to: '/admin/devices', label: 'Thiết bị đã ghép', icon: <MonitorSmartphone size={16} /> },
  { to: '/admin/pair', label: 'Ghép thiết bị mới', icon: <Link2 size={16} /> },
  { to: '/admin/audit', label: 'Nhật ký quản trị', icon: <FileText size={16} /> },
  { to: '/admin/lab', label: 'Kịch bản T1-T7', icon: <FlaskConical size={16} />, grp: 'SENTINEL CỤC BỘ' },
  { to: '/admin/gate', label: 'Cổng cấp khóa', icon: <KeyRound size={16} /> },
  { to: '/admin/vault', label: 'Vault và khóa', icon: <ShieldCheck size={16} /> },
  { to: '/admin/recovery', label: 'Phục hồi', icon: <Lock size={16} /> },
  { to: '/admin/math', label: 'Cận dữ liệu phát hành (K2)', icon: <Calculator size={16} /> },
  { to: '/admin/incident', label: 'Sự cố và AI', icon: <ShieldAlert size={16} /> },
  { to: '/admin/replay', label: 'Replay F.8', icon: <RefreshCw size={16} /> },
  { to: '/admin/audit-local', label: 'Nhật ký Sentinel cục bộ', icon: <FileText size={16} /> },
];

export function AdminLayout() {
  const { info } = useHubView();
  if (!hubApi())
    return (
      <div className="splash">
        <div className="card" style={{ maxWidth: 460 }}>
          <h3>HeartOS Sentinel Admin</h3>
          <p>Trang này chạy trong phần mềm quản trị trên máy tính. Hãy cài bản Windows, Linux hoặc macOS rồi ghép điện thoại qua mạng LAN.</p>
          <Link className="btn" to="/" style={{ marginTop: 12 }}>Về ứng dụng</Link>
        </div>
      </div>
    );
  return (
    <div className="ops">
      <aside className="ops-side">
        <div className="brand"><Logo size={42} /> Sentinel Admin</div>
        {NAV.map((n) => (
          <div key={n.to} style={{ display: 'contents' }}>
            {n.grp && <div className="grp">{n.grp}</div>}
            <NavLink to={n.to} end style={({ isActive }) => (isActive ? { background: '#2c5646', color: '#fff' } : undefined)}>
              {n.icon}
              {n.label}
            </NavLink>
          </div>
        ))}
        <div className="foot">
          <span>{info ? `Phiên bản ${info.version}, ${info.hostname}` : ''}</span>
          <span>{info?.port ? `Hub LAN cổng ${info.port}` : info?.serverError}</span>
        </div>
      </aside>
      <main className="ops-main">
        <Outlet />
      </main>
    </div>
  );
}

const online = (lastSeen?: number) => !!lastSeen && Date.now() - lastSeen < ONLINE_MS;

export function AdminOverview() {
  const { view, info, api } = useHubView();
  const nav = useNavigate();
  const now = useNow(2000);
  if (!view || !info || !api) return null;
  const devices = view.devices.filter((d) => !d.revoked);
  const pending = view.commands.filter((c) => c.status === 'queued' || c.status === 'delivered').length;
  const broken = Object.values(view.journalStats).reduce((n, s) => n + s.broken, 0);
  const alerts = devices.flatMap((d) => {
    const s = view.snapshots[d.id];
    if (!s) return [];
    const out: string[] = [];
    if (s.sentinel.security.state !== 'normal') out.push(`${d.name}: ${SECURITY_STATE_LABEL[s.sentinel.security.state as SecurityState] ?? s.sentinel.security.state}`);
    if (s.sentinel.R.locked) out.push(`${d.name}: đường đọc trong két đang khóa`);
    for (const i of s.home.incidents) out.push(`${d.name}: ${i.id} ${i.title} (${i.priority})`);
    if (!s.home.net.internet) out.push(`${d.name}: hub tại nhà mất Internet`);
    return out;
  });
  return (
    <>
      <OpsHead crumb="MÁY QUẢN TRỊ / TỔNG QUAN" badge={info.port ? `LAN, CỔNG ${info.port}` : 'HUB CHƯA CHẠY'} title="HeartOS Sentinel Admin" sub={`Máy ${info.hostname}, người vận hành ${info.operator}`} />
      {info.serverError && <div className="card rose"><p className="danger-text">{info.serverError}</p></div>}
      <div className="ops-grid">
        <Metric tint label="Thiết bị đã ghép" value={devices.length} sub={`${devices.filter((d) => online(d.lastSeen)).length} đang trực tuyến`} />
        <Metric label="Lệnh đang chờ" value={pending} sub="Giao ở lần đồng bộ kế tiếp" />
        <Metric label="Nhật ký thiết bị lỗi chuỗi" value={broken} sub={broken ? 'Có bản ghi băm sai hoặc nối sai' : 'Mọi bản ghi kiểm đạt'} />
        <Metric label="Bảo vệ khóa hub" value={info.keyProtection === 'os' ? 'Hệ điều hành' : 'Tệp'} sub={info.keyProtection === 'os' ? 'Mã hóa bằng kho khóa của máy' : 'Không có kho khóa hệ thống'} />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Thiết bị</h2>
          {devices.length === 0 && <Item t="Chưa có thiết bị nào" m="Mở “Ghép thiết bị mới” rồi nhập mã trên điện thoại (Thêm > Máy quản trị Sentinel)." />}
          {devices.map((d) => {
            const s = view.snapshots[d.id];
            return (
              <button key={d.id} className="item" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => nav(`/admin/device/${d.id}`)}>
                <Smartphone size={18} />
                <div style={{ flex: 1 }}>
                  <div className="t">{d.name}</div>
                  <div className="m">{s ? `Thế hệ quyền ${s.sentinel.epoch}, ${SECURITY_STATE_LABEL[s.sentinel.security.state as SecurityState] ?? s.sentinel.security.state}, ${s.home.incidents.length} ca đang mở` : 'Chưa đồng bộ'}, {d.lastSeen ? ago(d.lastSeen, now) : 'chưa kết nối'}</div>
                </div>
                <Badge tone={online(d.lastSeen) ? undefined : 'warm'}>{online(d.lastSeen) ? 'Trực tuyến' : 'Ngoại tuyến'}</Badge>
              </button>
            );
          })}
        </div>
        <div className="panel">
          <h2>Cảnh báo cần xem</h2>
          {alerts.length === 0 && <Item t="Không có cảnh báo" m="Trạng thái an ninh bình thường trên mọi thiết bị đã đồng bộ." />}
          {alerts.map((a) => <Item key={a} t={a} icon={<ShieldAlert size={16} color="#9E3830" />} />)}
          <h2 style={{ marginTop: 6 }}>Kết nối</h2>
          <Item t="Địa chỉ cho điện thoại" m={info.addresses.length ? info.addresses.map((a) => `${a}:${info.port}`).join(', ') : 'Không tìm thấy địa chỉ LAN'} />
          <Item t="Thư mục dữ liệu" m={info.dataDir} right={<button className="btn xs secondary" onClick={() => void api.openDataDir()}><FolderOpen size={14} /> Mở</button>} />
        </div>
      </div>
    </>
  );
}

export function AdminDevices() {
  const { view, api } = useHubView();
  const nav = useNavigate();
  const now = useNow(2000);
  if (!view || !api) return null;
  return (
    <>
      <OpsHead crumb="MÁY QUẢN TRỊ / THIẾT BỊ" badge={`${view.devices.length} THIẾT BỊ`} title="Thiết bị đã ghép" sub="Mỗi thiết bị có khóa ký và khóa trao đổi riêng; gói tin được ký, mã hóa và chống phát lại." />
      <div className="panel">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Thiết bị</th><th>Mã đối chiếu</th><th>Thế hệ quyền</th><th>Trạng thái an ninh</th><th>Nhật ký</th><th>Lần cuối</th><th>Địa chỉ</th><th /></tr></thead>
            <tbody>
              {view.devices.map((d) => {
                const s = view.snapshots[d.id];
                const js = view.journalStats[d.id];
                return (
                  <tr key={d.id}>
                    <td><b>{d.name}</b><div className="small muted">{d.platform}, {d.appVersion}, {d.id}</div></td>
                    <td className="mono">{d.sas}</td>
                    <td>{s?.sentinel.epoch ?? '-'}</td>
                    <td>{s ? SECURITY_STATE_LABEL[s.sentinel.security.state as SecurityState] ?? s.sentinel.security.state : '-'}</td>
                    <td>{js ? `${js.count} bản ghi${js.broken ? `, ${js.broken} lỗi` : ''}` : '-'}</td>
                    <td>{d.revoked ? <Badge tone="line">Đã gỡ</Badge> : d.lastSeen ? ago(d.lastSeen, now) : 'chưa kết nối'}{d.lastError && <div className="small danger-text">{d.lastError}</div>}</td>
                    <td className="mono">{d.lastAddress}</td>
                    <td>
                      <span className="hstack">
                        {!d.revoked && <button className="btn xs" onClick={() => nav(`/admin/device/${d.id}`)}>Mở</button>}
                        {d.revoked && <button className="btn xs ghost" onClick={() => void api.remove(d.id)}><Trash2 size={14} /> Xóa</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {view.devices.length === 0 && <Item t="Chưa có thiết bị" m="Vào “Ghép thiết bị mới”." />}
      </div>
    </>
  );
}

type Tab = 'sentinel' | 'vault' | 'home' | 'journal' | 'commands';

export function AdminDevice() {
  const { id } = useParams();
  const { view, api } = useHubView();
  const nav = useNavigate();
  const now = useNow(2000);
  const [tab, setTab] = useState<Tab>('sentinel');
  const [journal, setJournal] = useState<StoredJournalEntry[]>([]);
  const [confirm, setConfirm] = useState<{ kind: CommandKind; params: Record<string, string | number | boolean>; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('Thu hồi khẩn cấp từ máy quản trị');
  const [member, setMember] = useState('');
  const [perm, setPerm] = useState('');
  const [incident, setIncident] = useState('');
  const [B, setB] = useState(65536);
  const [r, setR] = useState(2048);
  const [mode, setMode] = useState('home');
  const [note, setNote] = useState('Kiểm tra bất thường từ máy quản trị');
  const d = view?.devices.find((x) => x.id === id);
  const s: DeviceSnapshot | undefined = id ? view?.snapshots[id] : undefined;
  useEffect(() => {
    if (!api || !id || tab !== 'journal') return;
    void api.journal(id).then(setJournal);
  }, [api, id, tab, view]);
  const cmds = useMemo(() => (view?.commands ?? []).filter((c) => c.deviceId === id), [view, id]);
  if (!view || !api) return null;
  if (!d) return <div className="panel"><Item t="Không tìm thấy thiết bị" /></div>;
  const send = async (kind: CommandKind, params: Record<string, string | number | boolean> = {}) => {
    const c = await api.command(d.id, kind, params);
    toast(c ? `Đã xếp lệnh "${COMMAND_LABEL[kind]}". Thiết bị nhận ở lần đồng bộ kế tiếp.` : 'Không gửi được lệnh', c ? 'info' : 'warning');
  };
  const ask = (kind: CommandKind, params: Record<string, string | number | boolean>, text: string) => setConfirm({ kind, params, text });
  const filtered = journal.filter((e) => !q || (e.summary + e.kind + e.id).toLowerCase().includes(q.toLowerCase())).slice().reverse();
  return (
    <>
      <OpsHead
        crumb="MÁY QUẢN TRỊ / THIẾT BỊ"
        badge={online(d.lastSeen) ? 'TRỰC TUYẾN' : 'NGOẠI TUYẾN'}
        title={d.name}
        sub={`${d.platform}, ${d.appVersion}, mã đối chiếu ${d.sas}, ${d.lastSeen ? 'đồng bộ ' + ago(d.lastSeen, now) : 'chưa đồng bộ'}, ${d.lastAddress ?? ''}`}
        right={<button className="btn xs secondary" onClick={() => ask('ping', {}, 'Gửi lệnh kiểm tra kết nối?')}><RefreshCw size={14} /> Kiểm tra kết nối</button>}
      />
      {d.lastError && <div className="card rose"><p className="danger-text">Lỗi đồng bộ gần nhất: {d.lastError}</p></div>}
      <Seg<Tab> value={tab} onChange={setTab} options={[{ value: 'sentinel', label: 'Sentinel' }, { value: 'vault', label: 'Két và phục hồi' }, { value: 'home', label: 'Nhà và quyền' }, { value: 'journal', label: 'Nhật ký' }, { value: 'commands', label: `Lệnh (${cmds.length})` }]} />
      {!s && <div className="panel"><Item t="Thiết bị chưa gửi dữ liệu" m="Trên điện thoại: Thêm > Máy quản trị Sentinel > Đồng bộ ngay." /></div>}
      {s && tab === 'sentinel' && (
        <>
          <div className="ops-grid">
            <Metric tint label="Thế hệ quyền" value={s.sentinel.epoch} sub={`Tenant ${s.sentinel.tenant}`} />
            <Metric label="Trạng thái an ninh" value={SECURITY_STATE_LABEL[s.sentinel.security.state as SecurityState] ?? s.sentinel.security.state} sub={`${s.sentinel.security.signals} tín hiệu, xuất hàng loạt ${s.sentinel.security.exportBlocked ? 'bị chặn' : 'bình thường'}`} />
            <Metric label="Hạn mức giải mã" value={fmt(s.sentinel.R.tokens)} sub={`B ${fmt(s.sentinel.R.capacity)}, r ${fmt(s.sentinel.R.rate)}/s, còn ${fmt(s.sentinel.R.quotaRemaining)}`} />
            <Metric label="Đường đọc két" value={s.sentinel.R.locked ? 'Đang khóa' : 'Mở'} sub={`${s.sentinel.R.replays} lần phát lại bị chặn, ${s.sentinel.R.denials} từ chối`} />
          </div>
          <div className="ops-cols">
            <div className="panel">
              <h2>Thành phần</h2>
              <Item t="HSM" m={`KEK v${s.sentinel.hsm.activeVersion} (${s.sentinel.hsm.versions} phiên bản), sinh ${s.sentinel.hsm.generate}, cấp ${s.sentinel.hsm.release}, từ chối ${s.sentinel.hsm.refused}`} />
              <Item t="Enclave Ve" m={`${s.sentinel.ve.name}@${s.sentinel.ve.version}, TCB ${s.sentinel.ve.tcb}, ${s.sentinel.ve.measurement.slice(0, 16)}...`} right={<Badge tone={s.sentinel.ve.accepted ? undefined : 'danger'}>{s.sentinel.ve.accepted ? 'Được chấp nhận' : 'Đã thu hồi'}</Badge>} />
              <Item t="Cổng cấp khóa" m={`Đã cấp ${s.sentinel.gate.released}, từ chối ${s.sentinel.gate.denied}, đặt chỗ chưa đóng ${fmt(s.sentinel.R.outstanding)}`} />
              <Item t="Nhật ký trên thiết bị" m={`${s.sentinel.journalHead.count} bản ghi, đầu chuỗi #${s.sentinel.journalHead.seq} ${s.sentinel.journalHead.hash.slice(0, 14)}...`} />
            </div>
            <div className="panel">
              <h2>Phiên bị hạn chế</h2>
              {s.sentinel.security.restricted.length === 0 ? <Item t="Không có" /> : s.sentinel.security.restricted.map((m) => <Item key={m} t={s.family.members.find((x) => x.id === m)?.name ?? m} />)}
              <h2 style={{ marginTop: 6 }}>Chụp lúc</h2>
              <Item t={new Date(s.at).toLocaleString('vi-VN')} m={`Người dùng trên máy: ${s.family.members.find((x) => x.id === s.device.actingAs)?.name ?? s.device.actingAs}`} />
            </div>
          </div>
        </>
      )}
      {s && tab === 'vault' && (
        <>
          <div className="panel">
            <h2>Đối tượng trong Core Vault của thiết bị</h2>
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Đối tượng</th><th>Loại</th><th>v</th><th>KEK</th><th>Người xem</th><th>Mục đích</th><th>Kích thước</th></tr></thead>
                <tbody>
                  {s.sentinel.vault.map((o) => (
                    <tr key={o.objectId}><td><b>{o.label}</b><div className="mono muted">{o.objectId}</div></td><td>{o.type}</td><td>{o.version}</td><td>v{o.kekVersion}</td><td>{o.viewers.map((v) => s.family.members.find((m) => m.id === v)?.name ?? v).join(', ') || '-'}</td><td>{o.purposes.join(', ')}</td><td>{fmt(o.size)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Máy quản trị chỉ nhận metadata; bản rõ và DEK không rời thiết bị.</p>
          </div>
          <div className="panel">
            <h2>Điểm phục hồi</h2>
            {s.sentinel.recovery.map((c) => <Item key={c.id} t={`${c.id}, ${c.status}`} m={`${new Date(c.createdAt).toLocaleString('vi-VN')}, ${c.objects} đối tượng, epoch ${c.epochAt}`} />)}
          </div>
        </>
      )}
      {s && tab === 'home' && (
        <div className="ops-cols">
          <div className="panel">
            <h2>Nhà</h2>
            <Item t="Chế độ" m={s.home.mode === 'home' ? 'Ở nhà' : s.home.mode === 'away' ? 'Vắng nhà' : 'Ban đêm'} />
            <Item t="Điện" m={`Lưới ${s.home.power.mains === 'on' ? 'có' : 'mất'}, ATS ${s.home.power.ats}, UPS ${Math.round(s.home.power.battery)}%, máy phát ${s.home.power.generator}`} />
            <Item t="Mạng" m={`LAN ${s.home.net.lan ? 'hoạt động' : 'mất'}, Internet ${s.home.net.internet ? 'ổn định' : 'gián đoạn'}`} />
            <Item t="Vùng có tín hiệu" m={`${s.home.roomsFresh}/${s.home.roomsTotal}${s.home.offlineDevices.length ? ', ngoại tuyến: ' + s.home.offlineDevices.join(', ') : ''}`} />
            <h2 style={{ marginTop: 6 }}>Ca Guardian đang mở</h2>
            {s.home.incidents.length === 0 && <Item t="Không có" />}
            {s.home.incidents.map((i) => <Item key={i.id} t={`${i.id}, ${i.title}`} m={`${i.priority}, ${i.status}${i.assignee ? ', ' + i.assignee : ''}, ${hhmm(i.createdAt)}`} />)}
          </div>
          <div className="panel">
            <h2>Quyền chia sẻ</h2>
            {s.family.permissions.map((p) => <Item key={p.id} t={p.title} m={`của ${p.owner}, xem: ${p.viewers.join(', ') || '-'}`} right={<Badge tone={p.status === 'granted' ? undefined : 'warm'}>{p.status === 'granted' ? 'Đã cấp' : 'Đã thu hồi'}</Badge>} />)}
            <Item t="Thiết bị chờ áp dụng quyền mới" m={String(s.family.syncPending)} />
            <h2 style={{ marginTop: 6 }}>Thành viên</h2>
            {s.family.members.map((m) => <Item key={m.id} t={m.name} m={m.role} />)}
          </div>
        </div>
      )}
      {tab === 'journal' && (
        <div className="panel">
          <div className="hstack wrap">
            <h2 style={{ flex: 1 }}>Nhật ký bằng chứng từ thiết bị ({journal.length})</h2>
            <input className="input" style={{ maxWidth: 240, minHeight: 36 }} placeholder="Tìm kiếm" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="small muted" style={{ margin: 0 }}>Máy quản trị tính lại băm SHA-256 của từng bản ghi và kiểm liên kết với bản ghi liền trước.</p>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>#</th><th>Thời điểm</th><th>Sự kiện</th><th>Quyết định</th><th>Kiểm</th></tr></thead>
              <tbody>
                {filtered.slice(0, 300).map((e) => (
                  <tr key={e.seq}>
                    <td className="mono">{e.seq}</td>
                    <td className="mono">{hhmmss(e.ts)}</td>
                    <td><div style={{ fontWeight: 600 }}>{e.summary}</div><div className="small muted">{e.kind}, {e.actor}{e.epoch ? ', epoch ' + e.epoch : ''}</div></td>
                    <td>{e.decision ? <Badge tone={e.decision === 'deny' ? 'danger' : undefined}>{e.decision === 'deny' ? 'Từ chối' : 'Cho phép'}</Badge> : ''}</td>
                    <td><Badge tone={!e.hashOk || e.linkOk === false ? 'danger' : e.linkOk === null ? 'line' : undefined}>{!e.hashOk ? 'Băm sai' : e.linkOk === false ? 'Nối sai' : e.linkOk === null ? 'Đầu đoạn' : 'Đạt'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'commands' && (
        <div className="ops-cols">
          <div className="panel">
            <h2>Gửi lệnh quản trị</h2>
            <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <b className="small">Thu hồi khẩn cấp</b>
              <input className="input" style={{ minHeight: 36 }} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn xs danger" onClick={() => ask('bump_epoch', { reason }, 'Tăng thế hệ quyền trên thiết bị: mọi grant đang lưu hành mất hiệu lực ngay.')}>Tăng thế hệ quyền</button>
            </div>
            <div className="item">
              <b className="small" style={{ flex: 1 }}>Đường đọc trong két</b>
              <button className="btn xs danger" onClick={() => ask('lock_vault', {}, 'Khóa đường đọc: thiết bị từ chối mọi yêu cầu giải mã mới cho tới khi mở lại.')}>Khóa</button>
              <button className="btn xs secondary" onClick={() => ask('unlock_vault', {}, 'Mở lại đường đọc trong két?')}>Mở</button>
            </div>
            <div className="item">
              <select className="input" style={{ minHeight: 36, flex: 1 }} value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">Chọn thành viên</option>
                {s?.family.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="btn xs secondary" disabled={!member} onClick={() => ask('restrict_member', { memberId: member }, 'Hạn chế phiên của thành viên này trên thiết bị?')}>Hạn chế phiên</button>
            </div>
            <div className="item">
              <select className="input" style={{ minHeight: 36, flex: 1 }} value={perm} onChange={(e) => setPerm(e.target.value)}>
                <option value="">Chọn quyền chia sẻ</option>
                {s?.family.permissions.filter((p) => p.status === 'granted').map((p) => <option key={p.id} value={p.id}>{p.title}, {p.owner}</option>)}
              </select>
              <button className="btn xs danger" disabled={!perm} onClick={() => ask('revoke_permission', { permissionId: perm }, 'Thu hồi quyền chia sẻ này trên thiết bị?')}>Thu hồi</button>
            </div>
            <div className="item">
              <input className="input" style={{ minHeight: 36, flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn xs secondary" onClick={() => ask('signal', { note }, 'Gửi tín hiệu nghi vấn: thiết bị chuyển sang “Nghi vấn xâm nhập” và chặn xuất hàng loạt.')}>Gửi tín hiệu</button>
            </div>
            <div className="item">
              <label className="small">B <input className="input" type="number" style={{ minHeight: 34, width: 110 }} value={B} onChange={(e) => setB(Number(e.target.value))} /></label>
              <label className="small">r <input className="input" type="number" style={{ minHeight: 34, width: 100 }} value={r} onChange={(e) => setR(Number(e.target.value))} /></label>
              <button className="btn xs secondary" onClick={() => ask('set_bucket', { capacity: B, rate: r }, `Đặt hạn mức giải mã B = ${B} byte, r = ${r} byte/giây?`)}>Áp dụng</button>
            </div>
            <div className="item">
              <Seg value={mode} onChange={setMode} options={[{ value: 'home', label: 'Ở nhà' }, { value: 'away', label: 'Vắng' }, { value: 'night', label: 'Đêm' }]} />
              <button className="btn xs secondary" onClick={() => ask('set_mode', { mode }, 'Đổi chế độ nhà?')}>Đổi chế độ</button>
            </div>
            <div className="item">
              <select className="input" style={{ minHeight: 36, flex: 1 }} value={incident} onChange={(e) => setIncident(e.target.value)}>
                <option value="">Chọn ca Guardian</option>
                {s?.home.incidents.map((i) => <option key={i.id} value={i.id}>{i.id}, {i.title}</option>)}
              </select>
              <button className="btn xs secondary" disabled={!incident} onClick={() => ask('close_incident', { incidentId: incident }, 'Đóng ca này trên thiết bị?')}>Đóng ca</button>
            </div>
            <div className="hstack wrap">
              <button className="btn xs secondary" onClick={() => ask('checkpoint', {}, 'Niêm phong một điểm phục hồi mới trên thiết bị?')}>Niêm phong điểm phục hồi</button>
              <button className="btn xs secondary" onClick={() => void send('verify_journal')}>Kiểm chuỗi bằng chứng</button>
              <button className="btn xs secondary" onClick={() => void send('run_scenarios')}>Chạy 12 kịch bản trên thiết bị</button>
            </div>
            <div className="divider" />
            <div className="hstack">
              <button className="btn xs ghost" onClick={() => setConfirm({ kind: 'ping', params: { __unpair: true }, text: 'Gỡ ghép nối thiết bị này? Thiết bị sẽ không đồng bộ được nữa cho tới khi ghép lại.' })}><Unplug size={14} /> Gỡ ghép nối</button>
            </div>
          </div>
          <div className="panel">
            <h2>Lịch sử lệnh</h2>
            {cmds.length === 0 && <Item t="Chưa có lệnh" />}
            {cmds.map((c) => <CommandRow key={c.id} c={c} />)}
          </div>
        </div>
      )}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Xác nhận lệnh quản trị">
        <p className="small" style={{ margin: 0 }}>{confirm?.text}</p>
        <p className="small muted" style={{ margin: 0 }}>Lệnh được ký bằng khóa của máy quản trị, mã hóa riêng cho thiết bị và hết hạn sau 15 phút nếu chưa được giao.</p>
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setConfirm(null)}>Hủy</button>
          <button
            className="btn"
            onClick={async () => {
              const c = confirm!;
              setConfirm(null);
              if (c.params.__unpair) {
                await api.unpair(d.id);
                toast('Đã gỡ ghép nối.');
                nav('/admin/devices');
              } else await send(c.kind, c.params);
            }}
          >
            Xác nhận
          </button>
        </div>
      </Sheet>
    </>
  );
}

function CommandRow({ c }: { c: HubCommandRecord }) {
  const tone = c.status === 'done' ? undefined : c.status === 'failed' || c.status === 'expired' ? 'danger' : 'warm';
  const label = { queued: 'Đang chờ', delivered: 'Đã giao', done: 'Đã áp dụng', failed: 'Bị từ chối', expired: 'Hết hạn' }[c.status];
  return (
    <Item
      t={COMMAND_LABEL[c.kind]}
      m={`${hhmmss(c.issuedAt)}, ${c.issuedBy}${c.result ? ', ' + c.result.message : ''}${c.result ? `, epoch ${c.result.epoch}` : ''}`}
      right={<Badge tone={tone}>{label}</Badge>}
    />
  );
}

export function AdminPair() {
  const { view, info, api } = useHubView();
  const now = useNow(500);
  const [known, setKnown] = useState<string[] | null>(null);
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (view && known === null) setKnown(view.devices.map((d) => d.id));
  }, [view, known]);
  if (!view || !info || !api) return null;
  const fresh = view.devices.filter((d) => known && !known.includes(d.id));
  return (
    <>
      <OpsHead crumb="MÁY QUẢN TRỊ / GHÉP NỐI" badge="MÃ MỘT LẦN, 120 GIÂY" title="Ghép thiết bị mới" sub="Điện thoại quản trị: Thêm > Máy quản trị Sentinel. Thành viên khác: màn Tham gia bằng mã khi mở ứng dụng." />
      <div className="ops-cols">
        <div className="panel">
          <h2>Mã ghép nối</h2>
          {view.pairing ? (
            <>
              <div className="mono" style={{ fontSize: 56, fontWeight: 800, letterSpacing: '.12em', color: '#18382D' }}>{view.pairing.code.slice(0, 3)} {view.pairing.code.slice(3)}</div>
              <Item t={view.pairing.memberId ? `Mã tham gia hộ cho ${view.members.find((m) => m.id === view.pairing!.memberId)?.name ?? 'thành viên'}` : 'Mã ghép điện thoại quản trị'} m={`Còn ${mmss(view.pairing.expiresAt - now)}. Sai quá 5 lần thì mã bị hủy.`} right={<button className="btn xs secondary" onClick={() => void api.closePairing()}>Hủy</button>} />
            </>
          ) : (
            <>
              <label className="field">
                <span>Mã dành cho</span>
                <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Điện thoại quản trị hộ (gửi dữ liệu hộ lên hub)</option>
                  {view.members.map((m) => <option key={m.id} value={m.id}>Tham gia hộ: {m.name}{m.relation ? ` (${m.relation})` : ''}</option>)}
                </select>
              </label>
              {!view.household && <Item t="Hub chưa có dữ liệu hộ" m="Ghép điện thoại quản trị trước. Sau lần đồng bộ đầu, danh sách thành viên hiện ở đây để tạo mã tham gia." />}
              <button className="btn" style={{ maxWidth: 260 }} onClick={() => void api.openPairing(target || undefined)}><Link2 size={18} /> Tạo mã</button>
            </>
          )}
          {view.household && <Item t={`Hộ trên hub: ${view.household.name}`} m={`${view.members.length} thành viên, ${view.opsCount} mục dữ liệu đồng bộ`} />}
          <h2 style={{ marginTop: 8 }}>Địa chỉ máy quản trị</h2>
          {info.addresses.length === 0 && <Item t="Không tìm thấy địa chỉ LAN" m="Kiểm tra Wi-Fi/Ethernet của máy tính." />}
          {info.addresses.map((a) => <Item key={a} t={`${a}:${info.port ?? '-'}`} m="Nhập địa chỉ này trên điện thoại cùng mạng Wi-Fi" />)}
          {info.serverError && <Item t="Hub chưa chạy" m={info.serverError} />}
        </div>
        <div className="panel">
          <h2>So khớp mã đối chiếu</h2>
          <p className="small muted" style={{ margin: 0 }}>Sau khi ghép, điện thoại hiển thị một mã đối chiếu. Mã đó phải trùng với mã bên dưới; nếu khác, hãy gỡ ghép nối ngay vì có thể có thiết bị trung gian.</p>
          {fresh.length === 0 && <Item t="Đang chờ thiết bị" />}
          {fresh.map((d) => <Item key={d.id} t={d.name} m={`${d.platform}, ${d.lastAddress}`} right={<span className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{d.sas}</span>} />)}
          <h2 style={{ marginTop: 8 }}>Cổng LAN</h2>
          <PortForm current={info.port} />
        </div>
      </div>
    </>
  );
}

function PortForm({ current }: { current: number | null }) {
  const api = hubApi()!;
  const [port, setPort] = useState(current ?? 7420);
  return (
    <div className="hstack">
      <input className="input" type="number" style={{ maxWidth: 140, minHeight: 36 }} value={port} onChange={(e) => setPort(Number(e.target.value))} />
      <button className="btn xs secondary" disabled={port === current} onClick={() => void api.setPort(port).then((r) => toast(r.ok ? `Hub chuyển sang cổng ${port}.` : r.error ?? 'Lỗi', r.ok ? 'info' : 'warning'))}>Đổi cổng</button>
    </div>
  );
}

export function AdminAudit() {
  const api = hubApi();
  const { view } = useHubView();
  const [list, setList] = useState<JournalEntry[]>([]);
  const [verify, setVerify] = useState('');
  useEffect(() => {
    if (api) void api.audit().then(setList);
  }, [api, view]);
  if (!api) return null;
  return (
    <>
      <OpsHead crumb="MÁY QUẢN TRỊ / NHẬT KÝ" badge="CHUỖI BĂM SHA-256" title="Nhật ký quản trị" sub="Mọi lần ghép nối, lệnh, kết quả và gói tin bị từ chối được ghi nối chuỗi trên máy quản trị." right={<button className="btn xs secondary" onClick={() => void api.verifyAudit().then((r) => setVerify(r.ok ? `Nguyên vẹn (${r.checked} bản ghi)` : `Hỏng tại #${r.brokenAt}`))}><ShieldCheck size={14} /> Kiểm chuỗi</button>} />
      {verify && <div className="card tint"><p>{verify}</p></div>}
      <div className="panel">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Mã</th><th>Thời điểm</th><th>Sự kiện</th><th>Quyết định</th><th>Băm</th></tr></thead>
            <tbody>
              {[...list].reverse().map((e) => (
                <tr key={e.id}><td className="mono">{e.id}</td><td className="mono">{new Date(e.ts).toLocaleString('vi-VN')}</td><td>{e.summary}</td><td>{e.decision ? <Badge tone={e.decision === 'deny' ? 'danger' : undefined}>{e.decision === 'deny' ? 'Từ chối' : 'Cho phép'}</Badge> : ''}</td><td className="mono muted">{e.hash.slice(0, 12)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
