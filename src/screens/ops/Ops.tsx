import { Activity, ArrowLeft, Beaker, Calculator, CircleDot, Clock, Download, FileText, FlaskConical, KeyRound, LayoutDashboard, LineChart as LineIcon, Lock, RefreshCw, ShieldAlert, ShieldCheck, Shuffle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/ui';
import { fmtSlot } from '../../core/family/calendar';
import { SECURITY_STATE_LABEL } from '../../core/sentinel/incident';
import { fmt } from '../../core/sentinel/state';
import { hhmm, hhmmss } from '../../lib/format';
import { requestApproval, toast } from '../../lib/ui-store';
import { useHome, useSentinel } from '../../state/services';
import { DEFAULT_FACTS, runReplay, useReplay } from '../../state/replay';
import { memberName, useApp, useMe } from '../../state/store';

const NAV: { to: string; label: string; icon: ReactNode; grp?: string }[] = [
  { to: 'live', label: 'Live · Tổng quan', icon: <LayoutDashboard size={16} />, grp: 'BÀN VẬN HÀNH' },
  { to: 'replay', label: 'Replay · Dữ liệu thử', icon: <Clock size={16} /> },
  { to: 'trace', label: 'Replay · Kết quả', icon: <LineIcon size={16} /> },
  { to: 'audit', label: 'Nhật ký truy vết', icon: <FileText size={16} /> },
  { to: 'vault', label: 'Sentinel · Vault', icon: <ShieldCheck size={16} /> },
  { to: 'recovery', label: 'Sentinel · Phục hồi', icon: <Lock size={16} /> },
  { to: 'lab', label: 'Kịch bản T1–T7 & bất biến', icon: <FlaskConical size={16} />, grp: 'PHÒNG THÍ NGHIỆM SENTINEL' },
  { to: 'gate', label: 'Cổng cấp khóa & hạn mức', icon: <KeyRound size={16} /> },
  { to: 'math', label: 'Cận đầu ra & entropy', icon: <Calculator size={16} /> },
  { to: 'sources', label: 'Nguồn ngẫu nhiên', icon: <Shuffle size={16} /> },
  { to: 'incident', label: 'Sự cố & tác tử AI', icon: <ShieldAlert size={16} /> },
];

export function OpsLayout() {
  const me = useMe();
  if (me.role !== 'admin')
    return (
      <div className="splash">
        <div className="card" style={{ maxWidth: 420 }}>
          <h3>Bàn vận hành dành cho vai trò được cấp quyền</h3>
          <p>Bạn đang dùng với tư cách {me.name}. Chuyển sang tài khoản quản trị trong Cài đặt ứng dụng.</p>
          <Link className="btn" to="/f/settings" style={{ marginTop: 12 }}>Mở cài đặt</Link>
        </div>
      </div>
    );
  return (
    <div className="ops">
      <aside className="ops-side">
        <div className="brand"><Logo size={42} /> HeartOS</div>
        {NAV.map((n) => (
          <div key={n.to} style={{ display: 'contents' }}>
            {n.grp && <div className="grp">{n.grp}</div>}
            <NavLink to={n.to} className={({ isActive }) => (isActive ? 'active' : '')} aria-current={undefined} end style={({ isActive }) => (isActive ? { background: '#2c5646', color: '#fff' } : undefined)}>
              {n.icon}
              {n.label}
            </NavLink>
          </div>
        ))}
        <div className="foot">
          <Link to="/f" style={{ padding: 0, color: '#ACDFE5' }}><ArrowLeft size={14} /> Về ứng dụng gia đình</Link>
          <span>Dữ liệu tình huống trên thiết bị này</span>
        </div>
      </aside>
      <main className="ops-main">
        <Outlet />
      </main>
    </div>
  );
}

export function OpsHead({ crumb, badge, title, sub, right }: { crumb: string; badge: string; title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="ops-head">
      <div>
        <div className="crumb">{crumb}</div>
        <h1 className="h1" style={{ marginTop: 8 }}>{title}</h1>
        <p className="sub" style={{ margin: 0 }}>{sub}</p>
      </div>
      <div className="stack" style={{ alignItems: 'flex-end', gap: 8 }}>
        <span className="badge">{badge}</span>
        {right}
      </div>
    </div>
  );
}

export function Metric({ label, value, sub, tint }: { label: string; value: ReactNode; sub?: ReactNode; tint?: boolean }) {
  return (
    <div className={'metric' + (tint ? ' tint' : '')}>
      <div className="l">{label}</div>
      <b>{value}</b>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function Item({ t, m, right, icon }: { t: ReactNode; m?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="item">
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t">{t}</div>
        {m && <div className="m">{m}</div>}
      </div>
      {right}
    </div>
  );
}

export function OpsLive() {
  const home = useHome();
  const s = useSentinel();
  const invitations = useApp((st) => st.invitations);
  const nav = useNavigate();
  const open = home.openIncidents();
  const fresh = home.freshRooms();
  const stale = home.s.rooms.filter((r) => !fresh.includes(r));
  const R = s.R.snapshotView();
  const hub = home.device('hub')!;
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / LIVE" badge="LIVE · MÔ PHỎNG" title="Tổng quan tại nhà" sub={`Nhà An · Dữ liệu tại hub · ${new Date().toLocaleDateString('vi-VN')}, ${hhmm(Date.now())}`} />
      <div className="ops-grid">
        <Metric tint label="Ca đang mở" value={String(open.length).padStart(2, '0')} sub="Guardian" />
        <Metric label="Vùng có dữ liệu" value={`${String(fresh.length).padStart(2, '0')}/${String(home.s.rooms.length).padStart(2, '0')}`} sub={stale.length ? `${stale.map((r) => r.name).join(', ')} chờ tín hiệu` : 'Đủ vùng'} />
        <Metric label="Pin UPS" value={`${Math.round(home.s.power.ups.battery)}%`} sub={`${home.s.power.ups.loadW} W tải thiết yếu`} />
        <Metric label="Thế hệ quyền" value={s.epoch()} sub={`${SECURITY_STATE_LABEL[s.incident.view().state]} · bucket ${fmt(R.bucket.tokens)}`} />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Ca đang xử lý</h2>
          {open.length === 0 && <Item t="Không có ca đang mở" m="Thử ở ứng dụng: An toàn → Mô phỏng tình huống" />}
          {open.map((i) => (
            <Item key={i.id} t={`${i.id} · ${i.title}`} m={`${i.priority} · ${i.status === 'verifying' ? 'Đang xác minh' : i.assignee ? `${i.assignee} đã nhận việc` : 'Chờ người hỗ trợ'}`} right={<span className="badge line">{hhmm(i.createdAt)}</span>} />
          ))}
        </div>
        <div className="panel">
          <h2>Lời mời và thiết bị</h2>
          {invitations.slice(0, 3).map((i) => (
            <Item key={i.id} t={i.occasion} m={`Nhịp Nhà · ${i.status === 'draft' ? 'Chờ người dùng duyệt' : i.status === 'queued' ? 'Đang chờ gửi' : i.status === 'blocked' ? 'Đã chặn — cần duyệt lại' : i.status === 'delivered' ? 'Đã chuyển giao' : i.status}`} right={<span className="badge line">{fmtSlot(i.slot).split('–')[0]}</span>} />
          ))}
          <Item t="Hub phòng khách" m={`LAN · ${home.s.net.internet ? 'Internet ổn định' : 'mất Internet'} · dữ liệu mới`} right={<span className="badge line">{hhmm(hub.lastSeen)}</span>} />
          <Item t="Lệnh thiết bị đang chờ" m={`${home.s.commands.filter((c) => ['queued', 'sent', 'awaiting'].includes(c.status)).length} lệnh · ${home.s.devices.filter((d) => !d.online).length} thiết bị ngoại tuyến`} />
        </div>
      </div>
      <button className="btn" style={{ maxWidth: 260 }} onClick={() => nav('/ops/audit')}>Xem nhật ký truy vết</button>
    </>
  );
}

export function OpsReplay() {
  const { facts, running } = useReplay();
  const nav = useNavigate();
  const set = (patch: Partial<typeof facts>) => useReplay.setState((s) => ({ facts: { ...s.facts, ...patch } }));
  const T = ({ k }: { k: keyof typeof facts }) => <input className="input" type="time" value={String(facts[k])} onChange={(e) => set({ [k]: e.target.value })} style={{ maxWidth: 130 }} />;
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / REPLAY" badge="REPLAY · SANDBOX" title="Diễn tập lời mời ăn cơm" sub="Kịch bản F.8 · Đồng hồ và người nhận giả lập" />
      <div className="ops-grid">
        <div className="metric"><div className="l">Lịch A</div><div className="hstack" style={{ margin: '8px 0' }}><T k="aStart" />–<T k="aEnd" /></div><div className="s">Đã chia sẻ trong kịch bản</div></div>
        <div className="metric"><div className="l">Lịch B</div><div className="hstack" style={{ margin: '8px 0' }}><T k="bStart" />–<T k="bEnd" /></div><div className="s">Đã chia sẻ trong kịch bản</div></div>
        <div className="metric"><div className="l">Giờ yên tĩnh</div><div style={{ margin: '8px 0' }}><T k="quiet" /></div><div className="s">Múi giờ GMT+7</div></div>
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Nguồn dữ kiện thử</h2>
          <Item t="facts-f8 (theo giá trị trên)" m="Hai lịch và giới hạn giờ" right={<span className="badge">Sẵn sàng</span>} />
          <Item t="Người nhận" m="A và B · Tài khoản thử trong Sentinel sandbox riêng" right={<span className="badge">Sandbox</span>} />
          <Item t="Thu hồi quyền B trước khi phát hành" m="Kiểm I4: grant cũ mất hiệu lực, chặn chuyển giao" right={<input type="checkbox" checked={facts.revokeBBeforeRelease} onChange={(e) => set({ revokeBBeforeRelease: e.target.checked })} />} />
          <button className="btn secondary sm" onClick={() => useReplay.setState({ facts: DEFAULT_FACTS })}>Đặt lại dữ kiện F.8</button>
        </div>
        <div className="panel">
          <h2>Điểm kiểm</h2>
          <Item t="Tính giao lịch" m="Oracle quét từng phút, độc lập với thuật toán chính" right={<span className="badge">Kỳ vọng</span>} />
          <Item t="Tạo bản nháp" m="Chờ người dùng duyệt — không tự gửi" right={<span className="badge">Kỳ vọng</span>} />
          <Item t="Kiểm quyền khi phát hành" m="Đọc lại lịch B qua cổng cấp khóa" right={<span className="badge">Kỳ vọng</span>} />
          <Item t="Tách biệt sandbox" m="Nhật ký Live không đổi trong lúc chạy" right={<span className="badge">Kỳ vọng</span>} />
        </div>
      </div>
      <button className="btn" style={{ maxWidth: 260 }} disabled={running} onClick={() => void runReplay().then(() => nav('/ops/trace'))}>
        <Beaker size={18} /> {running ? 'Đang chạy…' : 'Chạy mô phỏng'}
      </button>
    </>
  );
}

export function OpsTrace() {
  const { results } = useReplay();
  const nav = useNavigate();
  const r = results[0];
  if (!r)
    return (
      <>
        <OpsHead crumb="VẬN HÀNH / REPLAY" badge="REPLAY · SANDBOX" title="Đối chiếu kết quả mô phỏng" sub="Chưa có lần chạy nào." />
        <button className="btn" style={{ maxWidth: 260 }} onClick={() => nav('/ops/replay')}>Về dữ liệu thử</button>
      </>
    );
  const ok = r.rows.filter((x) => x.match).length;
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / REPLAY" badge="REPLAY · SANDBOX" title="Đối chiếu kết quả mô phỏng" sub={`${r.id} · ${r.factsVersion} · ${r.rule} · ${r.ms} ms`} />
      <div className="ops-grid">
        <Metric tint={r.rows[0].match} label="Khung giờ quan sát" value={r.slot} sub={r.rows[0].match ? 'Khớp kỳ vọng' : 'Lệch kỳ vọng ' + r.rows[0].expected} />
        <Metric label="Người nhận giả lập" value="02" sub="A và B" />
        <Metric label="Trạng thái bản nháp" value={r.draftStatus} sub={r.released} />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Kỳ vọng và quan sát · {ok}/{r.rows.length} khớp</h2>
          {r.rows.map((row) => (
            <Item key={row.name} t={row.name} m={`${row.expected} / ${row.observed}`} right={<span className={'badge' + (row.match ? '' : ' danger')}>{row.match ? 'Khớp' : 'Lệch'}</span>} />
          ))}
        </div>
        <div className="panel">
          <h2>Đích thử</h2>
          <Item t="Adapter Replay" m="Tác động ghi trong sandbox — không phát hành tới người thật" right={<span className="badge">Tách biệt</span>} />
          <Item t="Dấu bản xem trước" m={r.previewHash} right={<span className="badge">Đã ghi</span>} />
          <Item t="Nhật ký Live" m={`${r.liveEventsBefore} → ${r.liveEventsAfter} sự kiện trong lúc chạy`} />
          <h2 style={{ marginTop: 8 }}>Các lần chạy</h2>
          {results.slice(0, 6).map((x) => (
            <Item key={x.id} t={x.id} m={`${x.facts.aStart}–${x.facts.aEnd} ∩ ${x.facts.bStart}–${x.facts.bEnd} → ${x.slot}${x.facts.revokeBBeforeRelease ? ' · thu hồi B' : ''}`} right={<span className="badge line">{hhmmss(x.at)}</span>} />
          ))}
        </div>
      </div>
      <button className="btn" style={{ maxWidth: 260 }} onClick={() => nav('/ops/replay')}>Về dữ liệu thử</button>
    </>
  );
}

export function OpsAudit() {
  const s = useSentinel();
  const home = useHome();
  const perms = useApp((st) => st.permissions);
  const jobs = useApp((st) => st.syncJobs);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [verify, setVerify] = useState('');
  const [root, setRoot] = useState('');
  const all = [...s.journal.all()].reverse();
  const list = all.filter((e) => (!kind || e.kind.startsWith(kind)) && (!q || (e.summary + e.id + (e.objectId ?? '')).toLowerCase().includes(q.toLowerCase()))).slice(0, 120);
  const lastInc = home.s.incidents[0];
  const chain = all.filter((e) => e.kind === 'guardian.event' || e.kind === 'incident.signal').slice(0, 4);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(s.journal.all(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `heartos-journal-${Date.now()}.json`;
    a.click();
  };
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / NHẬT KÝ" badge="SENTINEL" title="Nhật ký và bằng chứng" sub="Nhà An · Phạm vi của người được cấp quyền" />
      <div className="ops-grid">
        <Metric tint label="Mã ca" value={lastInc?.id ?? '—'} sub="Guardian" />
        <Metric label="Sự kiện trong chuỗi" value={s.journal.all().length} sub={verify || 'Chưa kiểm'} />
        <Metric label="Phiên bản quyền" value={s.epoch()} sub="Áp dụng theo thiết bị" />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Chuỗi tiếp nhận</h2>
          {chain.length === 0 && <Item t="Chưa có sự kiện Guardian" />}
          {chain.map((e) => <Item key={e.id} t={`${hhmm(e.ts)} · ${e.summary}`} m={`${e.id} · ${e.hash.slice(0, 16)}…`} right={<span className="badge">Đã lưu</span>} />)}
        </div>
        <div className="panel">
          <h2>Đối chiếu quyền</h2>
          {perms.map((p) => {
            const pending = jobs.filter((j) => j.permissionId === p.id).flatMap((j) => j.devices).some((d) => d.status === 'pending');
            return <Item key={p.id} t={p.title} m={`${memberName(p.ownerId)} · ${p.purpose}`} right={<span className={'badge' + (p.status === 'revoked' ? (pending ? ' warm' : ' line') : '')}>{p.status === 'granted' ? 'Có hiệu lực' : pending ? 'Chờ áp dụng' : 'Đã thu hồi'}</span>} />;
          })}
        </div>
      </div>
      <div className="panel">
        <div className="hstack wrap">
          <h2 style={{ flex: 1 }}>Nhật ký nối chuỗi băm</h2>
          <input className="input" style={{ maxWidth: 220, minHeight: 36 }} placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ maxWidth: 180, minHeight: 36 }} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Mọi loại</option>
            {['grant', 'gate', 'vault', 'policy', 'incident', 'ai', 'source', 'recovery', 'smarthome', 'guardian', 'approval', 'session'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="btn xs secondary" onClick={() => void s.journal.verify().then((r) => setVerify(r.ok ? `✓ nguyên vẹn (${r.checked})` : `✗ hỏng tại #${r.brokenAt}`))}><ShieldCheck size={14} /> Kiểm chuỗi</button>
          <button className="btn xs secondary" onClick={() => void s.journal.merkleRoot().then(setRoot)}><CircleDot size={14} /> Root Merkle</button>
          <button className="btn xs secondary" onClick={exportJson}><Download size={14} /> Xuất JSON</button>
        </div>
        {root && <div className="mono small">Root Merkle để neo: {root}</div>}
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Thời điểm</th><th>Mã</th><th>Chủ thể</th><th>Sự kiện</th><th>Quyết định</th><th>Epoch</th><th>Băm</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{hhmmss(e.ts)}</td>
                  <td className="mono">{e.id}</td>
                  <td>{e.actor}</td>
                  <td><div style={{ fontWeight: 600 }}>{e.summary}</div><div className="small muted">{e.kind}{e.subject ? ' · ' + e.subject : ''}{e.objectId ? ' · ' + e.objectId : ''}</div></td>
                  <td>{e.decision ? <span className={'badge' + (e.decision === 'deny' ? ' danger' : '')}>{e.decision === 'deny' ? 'Từ chối' : e.decision === 'allow' ? 'Cho phép' : 'Chờ'}</span> : '—'}</td>
                  <td>{e.epoch ?? ''}</td>
                  <td className="mono muted">{e.hash.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function OpsVault() {
  const s = useSentinel();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const hsm = s.H.status(s.tenant);
  const objs = s.vault.list();
  const cp = s.recovery.list().at(-1);
  const bytes = objs.reduce((n, o) => n + o.size, 0);
  const rotate = async () => {
    const rec = await requestApproval('Luân chuyển KEK và bọc lại DEK', [`Tenant: ${s.tenant}`, `KEK hiện hành: v${hsm.activeVersion} → v${hsm.activeVersion + 1}`, `${objs.length} đối tượng sẽ được bọc lại; KEK cũ chuyển chỉ-giải-mã, không hủy`], s.tenant);
    if (!rec) return;
    setBusy(true);
    const v = await s.H.rotate(s.tenant);
    for (const o of objs) {
      const blob = await s.H.rewrap(s.H.gateIdentity, s.tenant, o.blob);
      s.vault.commit({ ...o, blob });
    }
    await s.log({ kind: 'note', actor: 'K', severity: 'notice', summary: `Luân chuyển KEK sang v${v}, bọc lại ${objs.length} DEK (không thu hồi dữ liệu đã lộ — §3.8)` });
    setBusy(false);
    toast(`Đã luân chuyển KEK sang v${v}.`);
  };
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / SENTINEL" badge="SENTINEL" title="Tình trạng bảo vệ dữ liệu" sub="Hiển thị cho vai trò vận hành có quyền" />
      <div className="ops-grid">
        <Metric tint label="Thế hệ quyền" value={s.epoch()} sub="Cổng chính sách" />
        <Metric label="Điểm phục hồi" value={cp ? (cp.status === 'verified' || cp.status === 'restored' ? 'Đã kiểm' : cp.status === 'corrupt' ? 'Lỗi' : 'Đã niêm phong') : '—'} sub={`Recovery Vault · ${cp?.id ?? ''}`} />
        <Metric label="Khóa vận hành" value="Tách miền" sub={`Core / Recovery · KEK v${hsm.activeVersion}`} />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Miền bảo vệ</h2>
          <Item t="Core Vault" m={`${objs.length} đối tượng · ${fmt(bytes)} bản rõ được bảo vệ · AES-256-GCM + AAD`} right={<span className="badge">Giới hạn</span>} />
          <Item t="Recovery Vault" m={`${s.recovery.list().length} điểm phục hồi · manifest + băm bản mã · khóa lưu giữ`} right={<span className="badge">Tách quyền</span>} />
          <Item t="Nguồn khóa (HSM)" m={`KEK ${hsm.versions.map((v) => `v${v.version}:${v.state === 'active' ? 'hoạt động' : 'chỉ giải mã'}`).join(', ')} · sinh ${hsm.ops.generate} · cấp ${hsm.ops.release} · từ chối ${hsm.ops.refused}`} right={<span className="badge">Đã cấu hình</span>} />
          <Item t="Enclave Ve" m={`${s.Ve.code.name}@${s.Ve.code.version} · TCB ${s.Ve.code.tcb} · measurement ${s.Ve.measurement.slice(0, 14)}…`} right={<span className="badge">{s.verifier.isAccepted(s.Ve.measurement) ? 'Được chấp nhận' : 'Đã thu hồi'}</span>} />
          <button className="btn sm secondary" disabled={busy} onClick={() => void rotate()}><RefreshCw size={14} /> Luân chuyển KEK + bọc lại DEK</button>
        </div>
        <div className="panel">
          <h2>Dữ kiện vận hành</h2>
          <Item t="Đường báo an toàn" m="Đường tối thiểu tại nhà — không phụ thuộc Core Vault" right={<span className="badge">Độc lập</span>} />
          <Item t="Quyền đã thu hồi" m="Áp chính sách hiện hành khi phục hồi (I10)" right={<span className="badge">Đối chiếu</span>} />
          <Item t="Cổng cấp khóa" m={`Đã cấp ${s.gate.stats.released} · từ chối ${s.gate.stats.denied} · G cấp ${s.G.issued} / từ chối ${s.G.denied}`} />
          <Item t="Hạn mức R" m={`Bucket ${fmt(s.R.snapshotView().bucket.tokens)} / B=${fmt(s.R.snapshotView().bucket.capacity)} · r=${fmt(s.R.snapshotView().bucket.rate)}/s · còn ${fmt(s.R.snapshotView().quotaRemaining)}`} />
        </div>
      </div>
      <div className="panel">
        <h2>Đối tượng trong Core Vault</h2>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Đối tượng</th><th>Loại</th><th>v</th><th>KEK</th><th>Chủ</th><th>Người xem</th><th>Mục đích</th><th>Bản mã (host thấy)</th></tr></thead>
            <tbody>
              {objs.map((o) => (
                <tr key={o.meta.objectId}>
                  <td><b>{o.meta.label}</b><div className="mono muted">{o.meta.objectId}</div></td>
                  <td>{o.meta.type}</td>
                  <td>{o.meta.version}</td>
                  <td>v{o.blob.kekVersion}</td>
                  <td>{memberName(o.meta.owner)}</td>
                  <td>{o.meta.viewers.map((v) => memberName(v)).join(', ') || '—'}</td>
                  <td>{o.meta.purposes.join(', ')}</td>
                  <td className="mono muted">{o.ciphertext.slice(0, 22)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button className="btn" style={{ maxWidth: 260 }} onClick={() => nav('/ops/recovery')}>Xem quy trình phục hồi</button>
    </>
  );
}

export function OpsRecovery() {
  const s = useSentinel();
  const me = useMe();
  const [sel, setSel] = useState<string>('');
  const [msg, setMsg] = useState('');
  const cps = s.recovery.list();
  const cp = cps.find((c) => c.id === sel) ?? cps.at(-1);
  const run = s.recovery.latestRun();
  const runForCp = run && run.checkpointId === cp?.id ? run : undefined;
  const st = (n: 1 | 2 | 3) => runForCp?.steps.find((x) => x.id === n);
  const badge = (state?: string) => <span className={'badge' + (state === 'fail' ? ' danger' : state === 'ok' ? '' : ' warm')}>{state === 'ok' ? 'Đã kiểm' : state === 'fail' ? 'Lỗi' : state === 'running' ? 'Đang kiểm' : state === 'waiting' ? 'Chờ duyệt' : 'Chưa chạy'}</span>;
  const approve = async (ai = false) => {
    if (ai) {
      const r = await s.recoveryApprove({ id: 'agent', role: 'admin', isAI: true });
      setMsg(r.reason);
      return;
    }
    const rec = await requestApproval(`Đưa ${cp?.id} vào phục vụ`, [`Áp epoch hiện hành ${s.epoch()} (không hạ về ${cp?.epochAtCheckpoint})`, 'Áp ACL hiện hành; quyền đã thu hồi giữ hiệu lực', `${cp?.manifest.length} đối tượng từ bản sao đã kiểm`], cp?.id ?? '', true);
    if (!rec) return;
    const r = await s.recoveryApprove({ id: me.id, role: me.role });
    setMsg(r.reason);
  };
  return (
    <>
      <OpsHead crumb="VẬN HÀNH / PHỤC HỒI" badge="SENTINEL" title="Kiểm tra trước phục hồi" sub="Màn hình rà soát của vai trò được cấp quyền" right={<button className="btn xs secondary" onClick={() => void s.checkpoint(me.id).then((c) => { setSel(c.id); toast(`Đã niêm phong ${c.id}.`); })}>Niêm phong điểm mới</button>} />
      <div className="ops-grid">
        <Metric tint label="Điểm phục hồi" value={cp?.id ?? '—'} sub={cp ? `Manifest ${cp.status === 'verified' || cp.status === 'restored' ? 'đã kiểm' : cp.status} · ${cp.manifest.length} đối tượng` : ''} />
        <Metric label="Thế hệ quyền hiện hành" value={s.epoch()} sub={cp ? `Checkpoint mang epoch ${cp.epochAtCheckpoint}` : ''} />
        <Metric label="Đưa vào vận hành" value={runForCp?.finishedAt ? 'Đã duyệt' : 'Chờ duyệt'} sub="Cần người có quyền" />
      </div>
      <div className="ops-cols">
        <div className="panel">
          <h2>Trình tự rà soát</h2>
          <Item t="1 · Kiểm điểm phục hồi" m={st(1)?.note ?? 'Manifest, khóa bọc và phạm vi'} right={badge(st(1)?.state)} />
          <Item t="2 · Cô lập tiến trình cũ" m={st(2)?.note ?? 'Kiểm định danh môi trường mới (khóa phiên mới + chứng thực lại)'} right={badge(st(2)?.state)} />
          <Item t="3 · Đưa vào phục vụ" m={st(3)?.state === 'ok' ? `Duyệt bởi ${runForCp?.approvals.map((a) => memberName(a.by)).join(', ')} · epoch ${runForCp?.appliedEpoch}` : 'Đánh giá quan sát, ca và bằng chứng'} right={badge(st(3)?.state)} />
          <div className="hstack wrap">
            <button className="btn sm" disabled={!cp} onClick={() => cp && void s.recoveryStep1(cp.id)}>Chạy bước 1</button>
            <button className="btn sm" disabled={st(1)?.state !== 'ok'} onClick={() => cp && void s.recoveryStep2(cp.id, me.id)}>Chạy bước 2</button>
            <button className="btn sm danger" disabled={st(2)?.state !== 'ok' || st(3)?.state === 'ok'} onClick={() => void approve()}>Duyệt bước 3</button>
            <button className="btn sm secondary" disabled={st(2)?.state !== 'ok'} onClick={() => void approve(true)}>AI thử duyệt</button>
          </div>
          {msg && <div className="small" style={{ fontWeight: 600 }}>{msg}</div>}
        </div>
        <div className="panel">
          <h2>Phạm vi tác động</h2>
          <Item t="Dữ liệu" m="Đọc theo vai trò và mục đích" right={<span className="badge">Giới hạn</span>} />
          <Item t="Quyền" m="Đối chiếu yêu cầu thu hồi mới nhất; snapshot không phải nguồn quyền" right={<span className="badge">Tách bước</span>} />
          <h2 style={{ marginTop: 6 }}>Điểm phục hồi</h2>
          {cps.slice().reverse().map((c) => (
            <Item key={c.id} t={`${c.id} · ${c.status}`} m={`${new Date(c.createdAt).toLocaleString('vi-VN')} · lưu giữ tới ${new Date(c.retentionUntil).toLocaleDateString('vi-VN')}`} right={
              <span className="hstack">
                <button className="btn xs secondary" onClick={() => setSel(c.id)}>Chọn</button>
                <button className="btn xs ghost" title="Thử xóa bằng quyền vận hành (I6)" onClick={() => { const r = s.recovery.requestDelete(c.id, 'ops'); setMsg(r.reason); void s.log({ kind: 'recovery.denied', actor: 'Human', severity: 'warning', summary: `Yêu cầu xóa ${c.id}: ${r.reason}`, decision: r.ok ? 'allow' : 'deny' }); }}>Xóa?</button>
                <button className="btn xs ghost" title="Mô phỏng sửa manifest" onClick={() => { s.recovery.tamper(c.id); setMsg(`Đã sửa trái phép manifest ${c.id} — chạy bước 1 để thấy phát hiện.`); }}>Sửa?</button>
              </span>
            } />
          ))}
        </div>
      </div>
      <p className="small muted"><Activity size={12} /> Phục hồi dữ liệu, khả năng dùng khóa và trạng thái an ninh là các nghĩa vụ đồng thời; hết cảnh báo không tự chứng minh môi trường đã đáng tin (§3.11, §4.5).</p>
    </>
  );
}
