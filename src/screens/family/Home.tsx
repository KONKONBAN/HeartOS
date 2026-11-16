import { Bell, Check, Eye, Heart, Lightbulb, PiggyBank, Plus, ShieldCheck, Sparkles, UserRound, Map as MapIcon, MessageCircleHeart, Newspaper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { CareSuggestions } from './Caring';
import { Badge, Field, Header, ModePicker, Row, Seg, TopBar } from '../../components/ui';
import { fmtSlot } from '../../core/family/calendar';
import { fmtDate, nextOccurrence } from '../../core/family/recurrence';
import { ago, dayLong, hhmm, vnd } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { addContribution, computeRhythm, createGoal, createInvitation, readContribution, type RhythmResult } from '../../state/actions';
import { useHome } from '../../state/services';
import { adultIds, memberName, namesOf, useApp, useDemo, useHouseholdName, useMe } from '../../state/store';

export function FHome() {
  const me = useMe();
  const home = useHome();
  const nav = useNavigate();
  const invitations = useApp((s) => s.invitations);
  const rituals = useApp((s) => s.rituals);
  const goals = useApp((s) => s.goals);
  const members = useApp((s) => s.members);
  const demo = useDemo();
  const homeName = useHouseholdName();
  const others = adultIds(members, me.id);
  const [rhythm, setRhythm] = useState<RhythmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = invitations.find((i) => i.status === 'draft' && i.hostId === me.id);
  const queued = invitations.find((i) => (i.status === 'queued' || i.status === 'blocked') && i.hostId === me.id);
  useEffect(() => {
    if (others.length) void computeRhythm(me.id, [me.id, ...others]).then(setRhythm);
  }, [me.id, others.join(',')]);
  const unread = home.s.notices.filter((n) => !n.read).length;
  const open = home.openIncidents();
  const staleRooms = home.s.rooms.filter((r) => r.stale || Date.now() - r.lastSignal > 5 * 60_000);
  const next = rituals.map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(), r.skip) })).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const lightsOn = home.s.devices.filter((d) => d.kind === 'light' && d.state.on).length;
  const startDraft = async () => {
    setBusy(true);
    const r = await createInvitation({ hostId: me.id, occasion: 'Bữa cơm cùng nhà', recipients: others });
    setBusy(false);
    if (r.ok) nav(`/f/draft/${r.id}`);
    else toast(r.error ?? 'Không tạo được bản nháp', 'warning');
  };
  return (
    <Phone tabs>
      <div className="topbar">
        <Link to="/f" className="brand" style={{ textDecoration: 'none' }}>
          <img src="./logo.svg" width={36} height={36} alt="" />
          HeartOS
        </Link>
        <div className="hstack">
          <Link to="/f/notices" className="back" style={{ padding: '0 10px', position: 'relative' }} aria-label={`Thông báo, ${unread} chưa đọc`}>
            <Bell size={18} />
            {unread > 0 && <span className="badge danger" style={{ position: 'absolute', top: -6, right: -6, padding: '0 6px' }}>{unread}</span>}
          </Link>
          <ModePicker mode="family" />
        </div>
      </div>
      <Header date={dayLong()} title={`Chào ${homeName.replace(/^Nhà /, 'nhà ')}!`} />
      {demo && me.id !== 'u-an' && <Row tone="peach" icon={<UserRound size={18} />} tileTone="white" title={`Đang dùng với tư cách ${me.name}`} meta={`Vai trò: ${me.relation}. Quyền hiển thị theo tài khoản này.`} to="/f/settings" />}
      {draft || queued ? (
        <Link to={draft ? `/f/draft/${draft.id}` : `/f/queued/${queued!.id}`} className="hero" style={{ textDecoration: 'none' }}>
          <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
            <span className="badge">GỢI Ý NHỊP NHÀ, {fmtSlot((draft ?? queued)!.slot).split('-')[0]}</span>
          </div>
          <div className="body">
            <h2>{(draft ?? queued)!.occasion}</h2>
            <p>{draft ? 'Bản nháp GenAI đang chờ bạn duyệt.' : queued!.status === 'blocked' ? 'Cần duyệt lại, quyền chia sẻ đã thay đổi.' : 'Đã duyệt, đang chờ gửi.'}</p>
            <div className="cta">{draft ? 'Xem bản nháp' : 'Xem trạng thái'} <span>›</span></div>
          </div>
        </Link>
      ) : !others.length ? (
        <Link to="/f/members" className="hero peach" style={{ textDecoration: 'none' }}>
          <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
            <span className="badge">BẮT ĐẦU</span>
          </div>
          <div className="body">
            <h2>Thêm người thân vào nhà</h2>
            <p>Thêm thành viên để Nhịp Nhà tìm giờ rảnh chung, gửi lời mời và cùng giữ ký ức.</p>
            <div className="cta">Thêm thành viên <span>›</span></div>
          </div>
        </Link>
      ) : (
        <button className="hero" onClick={startDraft} disabled={busy || !rhythm?.slot}>
          <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
            <span className="badge">GỢI Ý NHỊP NHÀ{rhythm?.slot ? ', ' + fmtSlot(rhythm.slot).split('-')[0] : ''}</span>
          </div>
          <div className="body">
            <h2>Bữa cơm cùng nhà</h2>
            <p>{!rhythm ? 'Đang đọc lịch rảnh được chia sẻ' : rhythm.slot ? `Tìm thấy ${Math.round((rhythm.slot.end - rhythm.slot.start) / 60)} giờ rảnh chung${rhythm.denied.length ? `, thiếu lịch của ${namesOf(rhythm.denied.map((d) => d.memberId))}` : ''}.` : rhythm.reason}</p>
            <div className="cta">{busy ? 'GenAI đang soạn' : 'Xem bản nháp'} <span>›</span></div>
          </div>
        </button>
      )}
      <div className="grid2">
        <Link to="/f/ai" className="btn secondary" style={{ minHeight: 48 }}>
          <Sparkles size={18} /> Trợ lý
        </Link>
        <Link to="/f/tasks" className="btn secondary" style={{ minHeight: 48 }}>
          <Check size={18} /> Việc chung
        </Link>
      </div>
      <div className="grid2">
        <Link to="/f/maps" className="btn secondary" style={{ minHeight: 48 }}>
          <MapIcon size={18} /> Bản đồ
        </Link>
        <Link to="/f/soften" className="btn secondary" style={{ minHeight: 48 }}>
          <MessageCircleHeart size={18} /> Lựa lời
        </Link>
      </div>
      <CareSuggestions />
      <Row icon={<ShieldCheck size={18} />} title="An toàn tại nhà" meta={open.length ? `${open.length} ca đang mở` : `${staleRooms.length} vùng cần kiểm tra`} badge={open.length || staleRooms.length ? <Badge tone={open.some((i) => i.priority === 'P1') ? 'danger' : undefined}>Có cập nhật</Badge> : undefined} to="/f/safe" />
      <Row icon={<Lightbulb size={18} />} tileTone="sand" title="Nhà thông minh" meta={home.real && !home.s.devices.length ? 'Chưa kết nối thiết bị, kết nối Home Assistant' : `${lightsOn} đèn đang bật, ${home.s.mode === 'home' ? 'Ở nhà' : home.s.mode === 'away' ? 'Vắng nhà' : 'Ban đêm'}`} to="/f/smart" />
      {next && <Row icon={<Heart size={18} />} tileTone="peach" title="Nghi thức gia đình" meta={`${next.r.name}, ${fmtDate(next.at)}`} to="/f/rituals" />}
      <Row icon={<Newspaper size={18} />} tileTone="peach" title="Bản tin gia đình" meta="Trợ lý tóm tắt tuần qua để gửi cả nhà" to="/f/newsletter" />
      <Row icon={<PiggyBank size={18} />} tileTone="sand" title="Quỹ Nếp Nhà" meta={goals[0]?.name ?? 'Tạo mục tiêu chung của gia đình'} to="/f/fund" />
    </Phone>
  );
}

export function FNotices() {
  const home = useHome();
  const nav = useNavigate();
  return (
    <Phone tabs>
      <TopBar back backTo="/f" right={<button className="btn xs secondary" onClick={() => home.markAllRead()}>Đánh dấu đã đọc</button>} />
      <Header title="Thông báo" sub="Từ hub tại nhà, Guardian và luật tự động." />
      {home.s.notices.length === 0 && <div className="empty">Chưa có thông báo.</div>}
      {home.s.notices.map((n) => (
        <Row key={n.id} icon={<Bell size={18} />} tileTone={n.severity === 'critical' ? 'rose' : n.severity === 'warning' ? 'sand' : undefined} title={n.title} meta={`${n.body}, ${ago(n.at)}`} badge={!n.read ? <Badge tone="warm">Mới</Badge> : undefined} onClick={n.link ? () => nav(n.link!) : undefined} />
      ))}
    </Phone>
  );
}

export function FFund() {
  const me = useMe();
  const goals = useApp((s) => s.goals);
  const contributions = useApp((s) => s.contributions);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [gid, setGid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState(2_000_000);
  const goal = goals.find((g) => g.id === gid) ?? goals[0];
  const reveal = async (id: string) => {
    const r = await readContribution(id, me.id);
    setRevealed((x) => ({ ...x, [id]: r.ok && r.data ? vnd((r.data as { amount: number }).amount) : 'Không có quyền xem chi tiết' }));
  };
  const create = () => {
    const g = createGoal(name, target, me.id);
    setGid(g.id);
    setCreating(false);
    setName('');
    toast(`Đã tạo mục tiêu ${g.name}.`);
  };
  const form = (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Mục tiêu chung mới</h3>
      <Field label="Tên mục tiêu">
        <input className="input" placeholder="Ví dụ: Chuyến đi cùng ông bà" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Số tiền mục tiêu">
        <input className="input" inputMode="numeric" value={target.toLocaleString('vi-VN')} onChange={(e) => setTarget(Number(e.target.value.replace(/\D/g, '')) || 0)} />
      </Field>
      <div className="btnrow">
        {goals.length > 0 && <button className="btn secondary" onClick={() => setCreating(false)}>Hủy</button>}
        <button className="btn" disabled={name.trim().length < 2 || target <= 0} onClick={create}>Tạo mục tiêu</button>
      </div>
    </div>
  );
  if (!goal)
    return (
      <Phone tabs>
        <TopBar back backTo="/f" />
        <Header title="Quỹ Nếp Nhà" sub="Mục tiêu chung và khoản do gia đình tự ghi." />
        <div className="card flat"><p>Chưa có mục tiêu nào. Tạo một mục tiêu chung để cả nhà cùng ghi khoản đóng góp. Chi tiết từng khoản được Sentinel mã hóa, chỉ người ghi và người được chọn mở được.</p></div>
        {form}
      </Phone>
    );
  const total = contributions.filter((c) => c.goalId === goal.id).reduce((n, c) => n + c.amount, 0);
  const pct = goal.target ? Math.round((total / goal.target) * 100) : 0;
  return (
    <Phone tabs>
      <TopBar back backTo="/f" />
      <Header title="Quỹ Nếp Nhà" sub="Mục tiêu chung và khoản do gia đình tự ghi." />
      {goals.length > 1 && (
        <div className="chips">
          {goals.map((g) => <button key={g.id} className="chip" aria-pressed={g.id === goal.id} onClick={() => setGid(g.id)}>{g.name}</button>)}
        </div>
      )}
      <div className="card sand">
        <h3>{goal.name}</h3>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 8px' }}>{vnd(total)} / {vnd(goal.target)}</div>
        <div className="progress"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <p style={{ marginTop: 8, color: '#6E4E20' }}>Đã tự ghi {pct}% mục tiêu, người quản quỹ: {memberName(goal.managerId)}</p>
      </div>
      <div className="section-title">Sổ theo dõi</div>
      {!contributions.some((c) => c.goalId === goal.id) && <div className="empty">Chưa có khoản nào được ghi.</div>}
      {contributions
        .filter((c) => c.goalId === goal.id)
        .map((c) => (
          <Row
            key={c.id}
            icon={<PiggyBank size={18} />}
            tileTone="sand"
            title={`${memberName(c.by)}, khoản tự ghi`}
            meta={`${revealed[c.id] ?? 'Chi tiết được Sentinel bảo vệ'}, ${hhmm(c.at)} ${new Date(c.at).toLocaleDateString('vi-VN')}`}
            badge={<Badge tone="line">Xem: {namesOf(c.visibleTo)}</Badge>}
            right={!revealed[c.id] && <button className="btn xs soft" onClick={() => void reveal(c.id)}><Eye size={14} /> Mở</button>}
            chevron={false}
          />
        ))}
      <div className="card flat">
        <p>Mỗi khoản có người ghi, thời điểm và phạm vi người xem. Chi tiết được mã hóa trong Core Vault; chỉ người ghi và người được chọn mở được. Đây là sổ tự ghi, không phải ví hay tài khoản ngân hàng.</p>
      </div>
      <Link to={`/f/fund-add?goal=${goal.id}`} className="btn">
        <Plus size={18} /> Ghi khoản đóng góp
      </Link>
      {creating ? form : <button className="btn ghost" onClick={() => setCreating(true)}><Plus size={18} /> Tạo mục tiêu mới</button>}
    </Phone>
  );
}

export function FFundAdd() {
  const me = useMe();
  const goals = useApp((s) => s.goals);
  const members = useApp((s) => s.members);
  const contributions = useApp((s) => s.contributions);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [amount, setAmount] = useState(250_000);
  const [scope, setScope] = useState<'manager' | 'family'>('manager');
  const [saved, setSaved] = useState(false);
  const [gid, setGid] = useState(params.get('goal') ?? goals[0]?.id ?? '');
  const goal = goals.find((g) => g.id === gid) ?? goals[0];
  if (!goal) return <Navigate to="/f/fund" replace />;
  const total = contributions.filter((c) => c.goalId === goal.id).reduce((n, c) => n + c.amount, 0);
  const save = async () => {
    const visible = scope === 'manager' ? [me.id, goal.managerId] : [me.id, ...adultIds(members, me.id)];
    const r = await addContribution(goal.id, amount, me.id, [...new Set(visible)]);
    if (r.ok) setSaved(true);
    else toast(r.error ?? 'Không lưu được', 'warning');
  };
  if (saved)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/fund" />
        <Header title="Đã lưu khoản tự ghi" sub={goal.name} />
        <div className="card sand">
          <div className="label">Tiến độ sau khi ghi</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 8px' }}>{vnd(total)} / {vnd(goal.target)}</div>
          <div className="progress"><i style={{ width: `${Math.min(100, Math.round((total / goal.target) * 100))}%` }} /></div>
          <p style={{ marginTop: 8 }}>Đã tự ghi {Math.round((total / goal.target) * 100)}% mục tiêu</p>
        </div>
        <Row tone="tint" icon={<Check size={18} />} tileTone="white" title={`Đã ghi ${vnd(amount)}`} meta={scope === 'manager' ? 'Chi tiết hiển thị cho bạn và người quản quỹ.' : 'Chi tiết hiển thị cho cả nhà.'} />
        <button className="btn" onClick={() => nav('/f/fund')}>Về Quỹ Nếp Nhà</button>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/fund" />
      <Header title="Ghi khoản đóng góp" sub="Lưu vào sổ mục tiêu đã chọn." />
      <Field label="Mục tiêu">
        <select className="input" value={goal.id} onChange={(e) => setGid(e.target.value)}>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <Field label="Số tiền tự ghi">
        <input className="input" inputMode="numeric" value={amount.toLocaleString('vi-VN')} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} />
      </Field>
      <div className="chips">
        {[100_000, 250_000, 500_000].map((v) => (
          <button key={v} className="chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>{vnd(v)}</button>
        ))}
      </div>
      <div className="label">Ai xem chi tiết</div>
      <Seg value={scope} onChange={setScope} options={[{ value: 'manager', label: 'Tôi và người quản quỹ' }, { value: 'family', label: 'Cả nhà' }]} />
      <button className="btn" disabled={amount <= 0} onClick={() => void save()}>Lưu khoản tự ghi</button>
    </Phone>
  );
}
