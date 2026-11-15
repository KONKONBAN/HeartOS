import { Bell, Camera, Monitor, Check, Cpu, LogOut, Phone as PhoneIcon, UserPlus, FileText, Fingerprint, Image, KeyRound, Languages, LayoutDashboard, MapPin, RefreshCw, Shield, ShieldCheck, Smartphone, Sparkles, Sun, Trash2, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { SignOutButton } from '../../components/SignOut';
import { Avatar, Badge, Field, Header, KV, Row, Seg, Sheet, Switch, TopBar } from '../../components/ui';
import { draftInvitation } from '../../core/family/genai';
import { SECURITY_STATE_LABEL } from '../../core/sentinel/incident';
import { roleName } from '../../core/smarthome/engine';
import { ago, hhmm } from '../../lib/format';
import { requestApproval, toast } from '../../lib/ui-store';
import { addMember, changeRole, regrantPermission, removeMember, resetEverything, revokePermission, setSyncDeviceOnline, updateMember } from '../../state/actions';
import { leaveHousehold } from '../../state/hublink';
import { approvalPub, useSentinel } from '../../state/services';
import { memberName, namesOf, useApp, useDemo, useHouseholdName, useMe } from '../../state/store';
import type { Member, PermScope } from '../../state/types';

const SCOPE_ICON: Record<PermScope, React.ReactNode> = { calendar: <Users size={18} />, memory: <Image size={18} />, camera: <Camera size={18} />, location: <MapPin size={18} /> };

export function FMore() {
  const me = useMe();
  const s = useSentinel();
  return (
    <Phone tabs>
      <TopBar />
      <Header title="Cài đặt nhà An" sub={`Tài khoản, ${me.name}`} />
      <Row icon={<Users size={18} />} title="Thành viên và vai trò" meta="Quản lý hộ theo quyền của bạn" to="/f/members" />
      <Row icon={<KeyRound size={18} />} title="Quyền chia sẻ" meta="Lịch, ký ức, camera và hỗ trợ" to="/f/permissions" />
      <Row icon={<ShieldCheck size={18} />} title="Bảo mật Sentinel" meta={`Phiên, thiết bị tin cậy, sự kiện, ${SECURITY_STATE_LABEL[s.incident.view().state]}`} to="/f/sentinel" />
      <Row icon={<Monitor size={18} />} title="Máy quản trị Sentinel" meta="Ghép với phần mềm quản trị trên máy tính" to="/f/hub" />
      <Row icon={<Languages size={18} />} title="Ngôn ngữ và giọng đọc" meta="Giao diện, trợ lý và người nhận" to="/f/language" />
      <Row icon={<Sun size={18} />} title="Đổi cách hiển thị" meta="Gia Đình / Thân Quen" to="/mode" />
      <Row icon={<Sparkles size={18} />} tileTone="sand" title="Cài đặt ứng dụng" meta="GenAI, thông báo, dùng với tư cách, dữ liệu mẫu" to="/f/settings" />
      {me.role === 'admin' && <Row icon={<LayoutDashboard size={18} />} tileTone="deep" title="Bàn vận hành Sentinel" meta="Live, Replay, nhật ký, vault, phục hồi, phòng thí nghiệm" to="/ops/live" />}
      <SignOutButton />
    </Phone>
  );
}

export function FMembers() {
  const me = useMe();
  const members = useApp((s) => s.members);
  const demo = useDemo();
  const homeName = useHouseholdName();
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title={`Thành viên ${homeName.replace(/^Nhà /, 'nhà ')}`} sub="Quyền theo hộ và mục đích sử dụng." />
      {members.map((m) => (
        <Row key={m.id} icon={<Avatar name={m.name} color={m.color} />} tileTone="white" title={m.id === me.id ? `${m.name} (bạn)` : m.name} meta={m.role === 'child' ? `Hồ sơ trẻ, theo cấu hình người giám hộ ${memberName(m.guardian ?? '')}` : m.role === 'carer' ? `Người hỗ trợ theo ca${m.expiresAt ? `, hết hạn ${hhmm(m.expiresAt)}` : ''}` : `${m.relation || roleName(m.role)}, ${m.mode === 'simple' ? 'Thân Quen' : 'Gia Đình'}`} to={`/f/member/${m.id}`} />
      ))}
      {me.role === 'admin' && <Link to="/f/member-new" className="btn"><UserPlus size={18} /> Thêm thành viên</Link>}
      {!demo && (
        <Row tone="tint" icon={<Monitor size={18} />} tileTone="white" title="Người thân dùng HeartOS trên điện thoại riêng" meta="Trên HeartOS Sentinel Admin: Ghép thiết bị mới, chọn đúng thành viên, rồi người đó mở ứng dụng và chọn Tham gia bằng mã. Lời mời, việc và ký ức sẽ đồng bộ qua hub trong nhà." chevron={false} />
      )}
    </Phone>
  );
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Quản trị' },
  { value: 'member', label: 'Thành viên' },
  { value: 'child', label: 'Trẻ' },
  { value: 'carer', label: 'Hỗ trợ' },
] as const;

export function FMemberNew() {
  const me = useMe();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<Member['role']>('member');
  const [phone, setPhone] = useState('');
  const [lang, setLang] = useState<Member['lang']>('vi');
  const [mode, setMode] = useState<Member['mode']>('family');
  const [address, setAddress] = useState('');
  const [selfRef, setSelfRef] = useState('');
  const [busy, setBusy] = useState(false);
  if (me.role !== 'admin') return <Navigate to="/f/members" replace />;
  const save = async () => {
    setBusy(true);
    const m = await addMember({ name, relation, role, phone, lang, mode, address, selfRef }, me.id);
    setBusy(false);
    toast(`Đã thêm ${m.name} vào nhà.`);
    nav(`/f/member/${m.id}`, { replace: true });
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/members" />
      <Header title="Thêm thành viên" sub="Hồ sơ dùng cho lời mời, SOS, quyền chia sẻ và cách xưng hô của GenAI." />
      <Field label="Họ tên">
        <input className="input" placeholder="Ví dụ: Bà Lan" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Quan hệ trong nhà">
        <input className="input" placeholder="Ví dụ: Bà nội, Con gái" value={relation} onChange={(e) => setRelation(e.target.value)} />
      </Field>
      <Field label="Số điện thoại">
        <input className="input" type="tel" placeholder="Để gọi và nhận tin SOS" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Vai trò">
        <Seg value={role} onChange={setRole} options={[...ROLE_OPTIONS]} />
      </Field>
      <Field label="Cách dùng ứng dụng">
        <Seg value={mode} onChange={setMode} options={[{ value: 'family', label: 'Gia Đình' }, { value: 'simple', label: 'Thân Quen (chữ lớn)' }]} />
      </Field>
      <Field label="Ngôn ngữ nhận lời mời">
        <Seg value={lang} onChange={setLang} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
      </Field>
      <Field label="Bạn gọi người này là">
        <input className="input" placeholder="Ví dụ: mẹ, bà, em" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Bạn xưng với người này là">
        <input className="input" placeholder="Ví dụ: con, cháu, anh" value={selfRef} onChange={(e) => setSelfRef(e.target.value)} />
      </Field>
      <button className="btn" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? 'Đang thêm...' : 'Thêm thành viên'}</button>
    </Phone>
  );
}

export function FMember() {
  const { id } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const m = useApp((s) => s.members.find((x) => x.id === id));
  const [confirm, setConfirm] = useState(false);
  if (!m) return <Navigate to="/f/members" replace />;
  const scope = {
    admin: 'Quản lý thành viên và thiết bị theo phạm vi được cấp.',
    member: 'Tự chọn quyền lịch, lời kể và người hỗ trợ.',
    child: 'Xem lịch chung và ký ức được chia sẻ. Camera, vận hành và dữ liệu riêng dùng quyền riêng.',
    carer: 'Xem thông tin tối thiểu của ca đang được giao.',
  }[m.role];
  const canEdit = me.role === 'admin' || me.id === m.id;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/members" />
      <Header title="Vai trò và phạm vi" sub={`Hồ sơ, ${m.name}`} />
      <div className="card center"><div style={{ display: 'grid', placeItems: 'center' }}><Avatar name={m.name} color={m.color} size="lg" /></div><div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{m.name}</div><div className="muted">{m.relation || roleName(m.role)}</div></div>
      <Row icon={<UserCog size={18} />} title="Vai trò" meta={m.role === 'child' ? 'Thành viên trẻ' : m.role === 'carer' ? 'Người hỗ trợ có thời hạn' : roleName(m.role)} chevron={false} />
      {m.guardian && <Row icon={<Shield size={18} />} title="Người giám hộ" meta={`${memberName(m.guardian)}, liên kết đang hiệu lực`} chevron={false} />}
      {m.expiresAt && <Row icon={<Shield size={18} />} title="Hạn quyền" meta={`Hết hạn lúc ${hhmm(m.expiresAt)} ${new Date(m.expiresAt).toLocaleDateString('vi-VN')}`} chevron={false} />}
      <div className="card tint"><h3>Phạm vi mặc định</h3><p>{scope}</p></div>
      {canEdit && (
        <div className="card stack">
          <div className="label">Thông tin liên hệ</div>
          <Field label="Số điện thoại">
            <input className="input" type="tel" value={m.phone} onChange={(e) => updateMember(m.id, { phone: e.target.value })} />
          </Field>
          <Field label="Quan hệ trong nhà">
            <input className="input" value={m.relation} onChange={(e) => updateMember(m.id, { relation: e.target.value })} />
          </Field>
          <Field label="Ngôn ngữ nhận lời mời">
            <Seg value={m.lang} onChange={(v) => updateMember(m.id, { lang: v })} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
          </Field>
        </div>
      )}
      {me.role === 'admin' && m.id !== me.id && (
        <div className="card stack">
          <div className="label">Đổi vai trò (tăng thế hệ quyền, ghi bằng chứng)</div>
          <Seg value={m.role} onChange={(r) => void changeRole(m.id, r, me.id).then((x) => toast(x.ok ? 'Đã đổi vai trò.' : x.reason ?? '', x.ok ? 'info' : 'warning'))} options={[...ROLE_OPTIONS]} />
        </div>
      )}
      {m.phone && m.id !== me.id && <a className="btn secondary" href={`tel:${m.phone}`}><PhoneIcon size={18} /> Gọi {m.name}</a>}
      {me.role === 'admin' && m.id !== me.id && (confirm ? (
        <div className="card rose stack">
          <p style={{ margin: 0 }}>Gỡ {m.name} khỏi nhà sẽ thu hồi mọi quyền xem lịch, ký ức và vị trí của người này (tăng thế hệ quyền).</p>
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setConfirm(false)}>Hủy</button>
            <button className="btn danger" onClick={() => void removeMember(m.id, me.id).then((ok) => { toast(ok ? `Đã gỡ ${m.name}.` : 'Không gỡ được quản trị duy nhất.', ok ? 'info' : 'warning'); if (ok) nav('/f/members', { replace: true }); })}>Gỡ khỏi nhà</button>
          </div>
        </div>
      ) : <button className="btn ghost" onClick={() => setConfirm(true)}><Trash2 size={18} /> Gỡ khỏi nhà</button>)}
      <Link to="/f/members" className="btn secondary">Về danh sách thành viên</Link>
    </Phone>
  );
}

export function FPermissions() {
  const me = useMe();
  const perms = useApp((s) => s.permissions);
  const jobs = useApp((s) => s.syncJobs);
  const pending = jobs.flatMap((j) => j.devices).filter((d) => d.status === 'pending').length;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title="Quyền chia sẻ" sub="Mỗi mục có người xem, mục đích và thời hạn." />
      {perms.map((p) => (
        <Row
          key={p.id}
          icon={SCOPE_ICON[p.scope]}
          tileTone={p.status === 'granted' ? undefined : 'sand'}
          title={p.title}
          meta={`${p.subtitle}, của ${memberName(p.ownerId)}, xem: ${namesOf(p.viewers)}`}
          badge={<Badge tone={p.status === 'granted' ? undefined : 'warm'}>{p.status === 'granted' ? 'Đã cấp' : 'Đã thu hồi'}</Badge>}
          to={p.ownerId === me.id || me.role === 'admin' ? `/f/revoke/${p.id}` : undefined}
        />
      ))}
      <Row icon={<RefreshCw size={18} />} title="Trạng thái đồng bộ quyền" meta={pending ? `${pending} thiết bị chờ áp dụng` : 'Mọi thiết bị đã áp dụng'} to="/f/sync" />
    </Phone>
  );
}

export function FRevoke() {
  const { id } = useParams();
  const me = useMe();
  const p = useApp((s) => s.permissions.find((x) => x.id === id));
  const devices = useApp((s) => s.syncDevices);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const affected = devices.filter((d) => p.viewers.includes(d.ownerId) || d.id === 'dev-hub' || d.ownerId === p.ownerId);
  const revoke = async () => {
    const rec = await requestApproval(`Thu hồi quyền ${p.title.toLowerCase()}`, [`Phạm vi: ${p.title} của ${memberName(p.ownerId)}`, `Người xem bị thu hồi: ${namesOf(p.viewers)}`, `Mục đích: ${p.purpose}`, 'Grant cũ mất hiệu lực tại cổng theo epoch mới; thiết bị ngoại tuyến giữ hạn quyền cũ tới khi xác nhận.'], p.viewers.join(','), true);
    if (!rec) return;
    setBusy(true);
    await revokePermission(p.id, me.id);
    setBusy(false);
    nav(`/f/sync?perm=${p.id}`);
  };
  if (p.status === 'revoked')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/permissions" />
        <Header title="Quyền đã thu hồi" sub={`${p.title}, ${memberName(p.ownerId)}`} />
        <Row tone="sand" icon={SCOPE_ICON[p.scope]} tileTone="white" title="Đang thu hồi" meta="Grant mới bị từ chối; thiết bị đồng bộ theo phiên bản quyền mới." />
        <button className="btn" onClick={() => void regrantPermission(p.id, me.id).then(() => toast('Đã cấp lại quyền.'))}>Cấp lại quyền</button>
        <Link to={`/f/sync?perm=${p.id}`} className="btn secondary">Xem trạng thái đồng bộ</Link>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/permissions" />
      <Header title="Thu hồi quyền chia sẻ" sub={`${p.title}, ${memberName(p.ownerId)}`} />
      <KV items={[['Phạm vi', p.title], ['Người xem', namesOf(p.viewers)], ['Mục đích', p.purpose], ['Hạn', p.expiresAt ? hhmm(p.expiresAt) : 'Đến khi thu hồi']]} />
      <div className="card tint">
        <h3>Áp dụng theo thiết bị</h3>
        <p>{affected.map((d) => `${d.name} (${d.online ? 'trực tuyến' : 'ngoại tuyến'})`).join(', ')}. Thiết bị ngoại tuyến sẽ hiển thị chờ áp dụng cùng hạn quyền cũ.</p>
      </div>
      <button className="btn danger" disabled={busy} onClick={() => void revoke()}>Xác nhận thu hồi</button>
      <button className="btn secondary" onClick={() => nav(-1)}>Quay lại</button>
    </Phone>
  );
}

export function FSync() {
  const [params] = useSearchParams();
  const jobs = useApp((s) => s.syncJobs);
  const devices = useApp((s) => s.syncDevices);
  const job = jobs.find((j) => j.permissionId === params.get('perm')) ?? jobs[0];
  return (
    <Phone tabs>
      <TopBar back backTo="/f/permissions" />
      <Header title={job ? 'Đồng bộ quyền đã thu hồi' : 'Trạng thái đồng bộ'} sub={job ? `${job.title}, Cập nhật ${hhmm(job.at)}` : 'Chưa có bản cập nhật quyền nào.'} />
      {job?.devices.map((d) => {
        const dev = devices.find((x) => x.id === d.deviceId)!;
        return (
          <Row
            key={d.deviceId}
            icon={d.deviceId === 'dev-hub' ? <Cpu size={18} /> : <Smartphone size={18} />}
            tileTone={d.status === 'applied' ? undefined : 'sand'}
            title={dev.name}
            meta={d.status === 'applied' ? `Đã áp dụng phiên bản ${job.version}${d.at ? ', ' + hhmm(d.at) : ''}` : dev.online ? 'Đang áp dụng...' : `Ngoại tuyến, Hạn quyền cũ ${d.oldExpiry ? hhmm(d.oldExpiry) : '-'}`}
            badge={<Badge tone={d.status === 'applied' ? undefined : 'warm'}>{d.status === 'applied' ? 'Đã áp dụng' : 'Chờ xác nhận'}</Badge>}
            chevron={false}
            right={d.deviceId !== 'dev-hub' && d.status !== 'applied' ? <Switch label={`${dev.name} trực tuyến`} checked={dev.online} onChange={(v) => setSyncDeviceOnline(dev.id, v)} /> : undefined}
          />
        );
      })}
      {job && <div className="card flat"><p>Trạng thái sẽ đổi khi có xác nhận từ thiết bị. Bật công tắc để mô phỏng thiết bị trực tuyến trở lại.</p></div>}
      {jobs.length > 1 && <div className="section-title">Các bản cập nhật trước</div>}
      {jobs.slice(1, 6).map((j) => (
        <Row key={j.id} icon={<RefreshCw size={18} />} title={`${j.title}, phiên bản ${j.version}`} meta={`${hhmm(j.at)}, ${j.devices.filter((d) => d.status === 'applied').length}/${j.devices.length} đã áp dụng`} chevron={false} />
      ))}
      <Link to="/f/permissions" className="btn secondary">Về quyền chia sẻ</Link>
    </Phone>
  );
}

export function FSentinel() {
  const homeName = useHouseholdName();
  const s = useSentinel();
  const session = useApp((st) => st.session);
  const jobs = useApp((st) => st.syncJobs);
  const [verify, setVerify] = useState<string>('');
  const last = [...s.journal.all()].reverse().find((e) => ['session', 'approval', 'policy.revoke'].includes(e.kind));
  const pending = jobs.flatMap((j) => j.devices).filter((d) => d.status === 'pending').length;
  const st = s.incident.view();
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title="Bảo mật Sentinel" sub={`${homeName}, trạng thái phạm vi của bạn`} />
      <Row icon={<Fingerprint size={18} />} title="Phiên và thiết bị tin cậy" meta={`1 phiên trên máy này, ${session.passkey?.kind === 'webauthn' ? 'passkey' : 'khóa thiết bị'}, từ ${hhmm(session.startedAt)}`} chevron={false} />
      <Row icon={<ShieldCheck size={18} />} title="Quyền và thu hồi" meta={`Thế hệ quyền ${s.epoch()}, ${pending ? pending + ' thiết bị chờ áp dụng' : 'trạng thái áp dụng theo thiết bị'}`} to="/f/sync" />
      <Row icon={<FileText size={18} />} tileTone="sand" title="Sự kiện bảo mật" meta={last ? `${last.summary}, ${hhmm(last.ts)}` : 'Chưa có'} to="/f/security-log" />
      <Row icon={<Shield size={18} />} tileTone={st.state === 'normal' ? undefined : 'rose'} title="Trạng thái an ninh" meta={`${SECURITY_STATE_LABEL[st.state]}, ${st.signals.length} tín hiệu`} to="/ops/incident" />
      <div className="card tint">
        <div className="hstack"><KeyRound size={18} color="#244C3E" /><h3 style={{ margin: 0 }}>Tác vụ nhạy cảm</h3></div>
        <p style={{ marginTop: 6 }}>Mở khóa cửa, thu hồi quyền, duyệt lời mời và phục hồi yêu cầu khóa phê duyệt trên thiết bị (ECDSA P-256, không xuất được). Dấu khóa: <span className="mono">{approvalPub().slice(0, 18)}...</span></p>
      </div>
      <div className="card">
        <h3>Chuỗi bằng chứng</h3>
        <p>{s.journal.all().length} sự kiện nối chuỗi SHA-256. {verify}</p>
        <button className="btn sm secondary" style={{ marginTop: 8 }} onClick={() => void s.journal.verify().then((r) => setVerify(r.ok ? `Kiểm ${r.checked} sự kiện: nguyên vẹn.` : `Hỏng tại sự kiện #${r.brokenAt}.`))}>Kiểm tra toàn vẹn</button>
      </div>
      <Link to="/f/hub" className="btn secondary"><Monitor size={18} /> Máy quản trị Sentinel</Link>
      <Link to="/ops/live" className="btn"><LayoutDashboard size={18} /> Mở bàn vận hành</Link>
    </Phone>
  );
}

export function FSecurityLog() {
  const homeName = useHouseholdName();
  const s = useSentinel();
  const kinds = ['session', 'approval', 'policy.revoke', 'policy.change', 'device.sync', 'gate.deny', 'grant.denied', 'incident.signal', 'incident.state', 'budget.deny', 'recovery.step'];
  const list = [...s.journal.all()].reverse().filter((e) => kinds.includes(e.kind)).slice(0, 50);
  return (
    <Phone tabs>
      <TopBar back backTo="/f/sentinel" />
      <Header title="Sự kiện bảo mật" sub={`${homeName}, nhật ký nối chuỗi băm`} />
      {list.length === 0 && <div className="empty">Chưa có sự kiện.</div>}
      {list.map((e) => (
        <Row key={e.id} icon={e.decision === 'deny' ? <Shield size={18} /> : <Check size={18} />} tileTone={e.severity === 'critical' ? 'rose' : e.severity === 'warning' ? 'sand' : undefined} title={e.summary} meta={`${hhmm(e.ts)}, ${e.id}, ${e.kind}${e.epoch ? ', epoch ' + e.epoch : ''}`} chevron={false} />
      ))}
      <Link to="/f/sentinel" className="btn secondary">Về Bảo mật Sentinel</Link>
    </Phone>
  );
}

export function FSettings() {
  const me = useMe();
  const members = useApp((s) => s.members);
  const prefs = useApp((s) => s.prefs);
  const set = useApp((s) => s.set);
  const actAs = useApp((s) => s.actAs);
  const [key, setKey] = useState(prefs.claudeKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const demo = useDemo();
  const homeName = useHouseholdName();
  const nav = useNavigate();
  useEffect(() => {
    setKey(prefs.claudeKey);
  }, [prefs.claudeKey]);
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await draftInvitation(
      { occasion: 'Bữa cơm cùng nhà', slot: { start: 1140, end: 1200 }, tz: 'GMT+7', host: 'An', hostSelf: 'con', place: 'nhà An', tone: 'warm', recipients: [{ id: 'u-lan', name: 'Bà Lan', address: 'mẹ', lang: 'vi' }, { id: 'u-linh', name: 'Linh', address: 'em', lang: 'en' }] },
      { apiKey: key, model: prefs.claudeModel },
    );
    setTesting(false);
    setTestResult(r.provider === 'claude' ? { ok: true, text: `${r.model}, ${r.ms} ms, ${r.draft.messages.map((m) => m.text).join(' | ')}` } : { ok: false, text: r.fellBack ?? 'Không gọi được Claude' });
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title="Cài đặt ứng dụng" sub="Tùy chọn trên thiết bị này." />
      {demo && <div className="card stack">
        <h3>Dùng với tư cách</h3>
        <p>Đổi tài khoản thành viên để thấy quyền khác nhau (thiết bị dùng chung trong nhà).</p>
        <select className="input" value={me.id} onChange={(e) => { actAs(e.target.value); toast(`Đang dùng với tư cách ${memberName(e.target.value)}.`); }}>
          {members.filter((m) => m.mode === 'family').map((m) => <option key={m.id} value={m.id}>{m.name}, {roleName(m.role)}</option>)}
        </select>
      </div>}
      <div className="card stack">
        <div className="hstack"><Sparkles size={18} color="#244C3E" /><h3 style={{ margin: 0, flex: 1 }}>GenAI bằng Claude (tùy chọn)</h3><Switch label="Bật Claude" checked={prefs.claudeEnabled} onChange={(v) => set((s) => void (s.prefs.claudeEnabled = v))} /></div>
        <p>Mặc định HeartOS soạn lời mời bằng mẫu trên thiết bị. Bật mục này để dùng Claude với khóa API của chính bạn. Khóa chỉ lưu trên thiết bị và được gửi thẳng tới api.anthropic.com; chỉ dữ kiện tối thiểu (dịp, khung giờ, cách xưng hô, ngôn ngữ) được gửi, không gửi lịch hay ký ức.</p>
        <Field label="Khóa API Anthropic">
          <input className="input mono" type="password" autoComplete="off" placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => set((s) => void (s.prefs.claudeKey = key.trim()))} />
        </Field>
        <Field label="Mô hình">
          <select className="input" value={prefs.claudeModel} onChange={(e) => set((s) => void (s.prefs.claudeModel = e.target.value))}>
            <option value="claude-opus-5-5">Claude Opus 5.5 (mặc định)</option>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
            <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
          </select>
        </Field>
        <div className="hstack">
          <button className="btn sm secondary" disabled={!key.trim() || testing} onClick={() => { set((s) => void (s.prefs.claudeKey = key.trim())); void test(); }}>{testing ? 'Đang thử...' : 'Thử soạn một lời mời'}</button>
          {prefs.claudeKey && <button className="btn sm ghost" onClick={() => { set((s) => { s.prefs.claudeKey = ''; s.prefs.claudeEnabled = false; }); setKey(''); }}><Trash2 size={14} /> Xóa khóa</button>}
        </div>
        {testResult && <p className="small" style={{ color: testResult.ok ? '#244C3E' : '#9E3830' }}>{testResult.ok ? 'Claude trả lời: ' : 'Chưa dùng được Claude: '}{testResult.text}</p>}
        <p className="small muted">Bản nháp luôn qua kiểm schema và dữ kiện; nếu chưa đạt sẽ dùng mẫu sẵn. Yêu cầu bật dự phòng phía máy chủ (fallbacks) khi mô hình từ chối.</p>
      </div>
      <Row
        icon={<Bell size={18} />}
        title="Thông báo hệ thống"
        meta={typeof Notification === 'undefined' ? 'Trình duyệt không hỗ trợ' : `Quyền: ${Notification.permission}`}
        chevron={false}
        right={
          <Switch
            label="Thông báo hệ thống"
            checked={prefs.notifications}
            onChange={async (v) => {
              if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') return toast('Chưa được cấp quyền thông báo.', 'warning');
              }
              set((s) => void (s.prefs.notifications = v));
            }}
          />
        }
      />
      <Row icon={<Sun size={18} />} title="Chữ lớn hơn" chevron={false} right={<Switch label="Chữ lớn hơn" checked={prefs.largeText} onChange={(v) => set((s) => void (s.prefs.largeText = v))} />} />
      <Row icon={<Languages size={18} />} title="Nút đọc to ở tiêu đề" chevron={false} right={<Switch label="Nút đọc to" checked={prefs.readAloud} onChange={(v) => set((s) => void (s.prefs.readAloud = v))} />} />
      <div className="card flat">
        <KV items={[['Phiên bản', 'HeartOS 1.0.0'], ['Dữ liệu', 'Mã hóa AES-256-GCM trên thiết bị, khóa không xuất được'], ['Font', 'Inter, SIL OFL 1.1'], ['Đăng nhập', ago(useApp.getState().session.startedAt)]]} />
      </div>
      {demo ? <button className="btn ghost" onClick={() => setConfirmReset(true)}><RefreshCw size={16} /> Đặt lại dữ liệu mẫu</button> : <button className="btn ghost" onClick={() => setConfirmLeave(true)}><LogOut size={16} /> Rời hộ trên máy này</button>}
      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Rời hộ trên máy này?">
        <p className="small muted" style={{ margin: 0 }}>Xóa dữ liệu của {homeName} khỏi điện thoại này và gỡ ghép với hub. Tài khoản và khóa truy cập vẫn giữ để bạn tạo hoặc tham gia hộ khác. Dữ liệu trên máy của người khác và trên hub không bị xóa.</p>
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setConfirmLeave(false)}>Hủy</button>
          <button className="btn danger" onClick={() => void leaveHousehold().then(() => nav('/choose-home', { replace: true }))}>Rời hộ</button>
        </div>
      </Sheet>
      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Đặt lại dữ liệu mẫu?">
        <p className="small muted" style={{ margin: 0 }}>Xóa lời mời, việc, ký ức mới, nhật ký Sentinel, két và trạng thái hub trên thiết bị này rồi gieo lại dữ liệu mẫu. KEK được luân chuyển sang phiên bản mới.</p>
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setConfirmReset(false)}>Hủy</button>
          <button className="btn danger" onClick={() => void resetEverything().then(() => { setConfirmReset(false); toast('Đã đặt lại dữ liệu mẫu.'); })}>Đặt lại</button>
        </div>
      </Sheet>
    </Phone>
  );
}
