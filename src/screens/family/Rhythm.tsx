import { CalendarClock, CalendarDays, Check, Heart, Lock, Moon, Pencil, Phone as PhoneIcon, Plus, ShieldAlert, Sparkles, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Chips, Field, Header, Row, Seg, Sheet, Steps, TopBar, TraceView } from '../../components/ui';
import { fmtSlot } from '../../core/family/calendar';
import { checkDraft, type InviteFacts } from '../../core/family/genai';
import { fmtDate } from '../../core/family/recurrence';
import { hhmm } from '../../lib/format';
import { requestApproval, toast } from '../../lib/ui-store';
import {
  computeRhythm,
  createInvitation,
  markInvitationApproved,
  regenerateInvitation,
  releaseInvitation,
  respondInvitation,
  saveMyWindows,
  setInvitationRecipientLang,
  setInvitationStatus,
  updateInvitationText,
  type RhythmResult,
} from '../../state/actions';
import { memberName, namesOf, useApp, useMe } from '../../state/store';
import type { Invitation } from '../../state/types';

const statusBadge = (i: Invitation) =>
  ({
    draft: <Badge tone="warm">Bản nháp</Badge>,
    queued: <Badge>Đang chờ gửi</Badge>,
    delivered: <Badge>Đã chuyển giao</Badge>,
    blocked: <Badge tone="danger">Cần duyệt lại</Badge>,
    snoozed: <Badge tone="line">Đã hoãn</Badge>,
    dismissed: <Badge tone="line">Đã bỏ qua</Badge>,
  })[i.status];

const linkFor = (i: Invitation) => (i.status === 'draft' || i.status === 'snoozed' ? `/f/draft/${i.id}` : `/f/queued/${i.id}`);

export function FRhythm() {
  const me = useMe();
  const nav = useNavigate();
  const invitations = useApp((s) => s.invitations).filter((i) => i.status !== 'dismissed');
  const members = useApp((s) => s.members);
  const tasks = useApp((s) => s.tasks);
  const [open, setOpen] = useState(false);
  const [occasion, setOccasion] = useState('Bữa cơm cùng nhà');
  const [recips, setRecips] = useState<string[]>(['u-lan', 'u-linh'].filter((x) => x !== me.id));
  const [tone, setTone] = useState<InviteFacts['tone']>('warm');
  const [busy, setBusy] = useState(false);
  const call = tasks.find((t) => t.kind === 'call' && t.assignee === me.id && t.status !== 'done');
  const create = async () => {
    setBusy(true);
    const r = await createInvitation({ hostId: me.id, occasion, recipients: recips, tone });
    setBusy(false);
    if (r.ok) nav(`/f/draft/${r.id}`);
    else toast(r.error ?? 'Không tìm được khung chung', 'warning');
  };
  return (
    <Phone tabs>
      <TopBar />
      <Header title="Nhịp Nhà" sub="Lịch, lời mời và khoảng rảnh của gia đình." />
      {invitations.map((i) => (
        <Row key={i.id} icon={<CalendarDays size={18} />} tileTone="peach" title={i.occasion} meta={`Hôm nay · ${fmtSlot(i.slot)}`} badge={statusBadge(i)} to={linkFor(i)} />
      ))}
      {call && <Row icon={<PhoneIcon size={18} />} tileTone="peach" title={call.title} meta={fmtDate(new Date(call.remindAt))} to={`/f/task/${call.id}`} />}
      <button className="btn soft" onClick={() => setOpen(true)}>
        <Sparkles size={18} /> Tạo lời mời mới
      </button>
      <Row icon={<CalendarClock size={18} />} title="Lịch rảnh và giờ yên tĩnh" meta="Chia sẻ khoảng rảnh theo mục đích" to="/f/calendar" />
      <div className="grid2">
        <Link to="/f/tasks" className="btn secondary"><Check size={18} /> Việc chung</Link>
        <Link to="/f/rituals" className="btn secondary"><Heart size={18} /> Nghi thức</Link>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Lời mời mới">
        <Field label="Dịp">
          <input className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)} />
        </Field>
        <div className="label">Người nhận</div>
        <Chips options={members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={recips} onChange={setRecips} />
        <div className="label">Giọng điệu</div>
        <Seg value={tone} onChange={setTone} options={[{ value: 'warm', label: 'Ấm áp' }, { value: 'short', label: 'Ngắn gọn' }, { value: 'formal', label: 'Trang trọng' }]} />
        <p className="small muted" style={{ margin: 0 }}>Nhịp Nhà chỉ đọc khoảng rảnh/bận được chia sẻ cho bạn (qua Sentinel), cắt theo giờ yên tĩnh, rồi GenAI soạn bản nháp chờ duyệt.</p>
        <button className="btn" disabled={busy || !recips.length || !occasion.trim()} onClick={() => void create()}>{busy ? 'Đang tìm khung chung…' : 'Tìm khung chung và soạn nháp'}</button>
      </Sheet>
    </Phone>
  );
}

export function FCalendar() {
  const me = useMe();
  const cal = useApp((s) => s.calendars.find((c) => c.memberId === me.id));
  const prefs = useApp((s) => s.prefs);
  const set = useApp((s) => s.set);
  const [rhythm, setRhythm] = useState<RhythmResult | null>(null);
  const [windows, setWindows] = useState(cal?.windows ?? []);
  const [showTrace, setShowTrace] = useState(false);
  const reload = () => void computeRhythm(me.id, ['u-an', 'u-linh', 'u-lan']).then(setRhythm);
  useEffect(() => {
    reload();
  }, [me.id]);
  const dirty = JSON.stringify(windows) !== JSON.stringify(cal?.windows ?? []);
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rhythm" />
      <Header title="Lịch rảnh đã chia sẻ" sub="Nhịp Nhà dùng các khoảng rảnh/bận đã được cấp quyền." />
      {rhythm?.readable.map((r) => (
        <Row key={r.memberId} icon={<Users size={18} />} title={memberName(r.memberId)} meta={`${r.windows.map((w) => `${w.start}–${w.end}`).join(', ')} · Hôm nay`} badge={<Badge>Đọc được qua Sentinel</Badge>} chevron={false} />
      ))}
      {rhythm?.denied.map((d) => (
        <Row key={d.memberId} icon={<Lock size={18} />} tileTone="rose" title={memberName(d.memberId)} meta={d.reason} badge={<Badge tone="danger">Không có quyền</Badge>} chevron={false} />
      ))}
      {rhythm && (
        <div className="card tint">
          <h3>Khung chung gợi ý</h3>
          <p>{rhythm.slot ? `${fmtSlot(rhythm.slot)} · GMT+7` : rhythm.reason}</p>
          <button className="btn xs ghost" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => setShowTrace((v) => !v)}>{showTrace ? 'Ẩn' : 'Xem'} đường đọc qua Sentinel</button>
          {showTrace && rhythm.traces[0] && <div style={{ marginTop: 8 }}><TraceView trace={rhythm.traces[0]} /></div>}
        </div>
      )}
      <div className="section-title">Khoảng rảnh của tôi</div>
      <div className="card stack">
        {windows.map((w, i) => (
          <div key={i} className="hstack">
            <input className="input" type="time" style={{ flex: 1, minWidth: 0, padding: '0 8px' }} value={w.start} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <span>–</span>
            <input className="input" type="time" style={{ flex: 1, minWidth: 0, padding: '0 8px' }} value={w.end} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <button className="btn xs ghost" style={{ flexShrink: 0 }} aria-label="Xóa khoảng" onClick={() => setWindows(windows.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="hstack">
          <button className="btn xs secondary" onClick={() => setWindows([...windows, { start: '19:00', end: '20:00' }])}><Plus size={14} /> Thêm khoảng</button>
          <span className="spacer" />
          <button
            className="btn xs"
            disabled={!dirty}
            onClick={() =>
              void saveMyWindows(me.id, windows).then(() => {
                toast('Đã lưu phiên bản mới của lịch rảnh vào Core Vault.');
                reload();
              })
            }
          >
            Lưu
          </button>
        </div>
      </div>
      <Row
        icon={<Moon size={18} />}
        title="Giờ yên tĩnh"
        meta={`Từ ${prefs.quietFrom} · GMT+7`}
        chevron={false}
        right={<input className="input" type="time" style={{ width: 110 }} value={prefs.quietFrom} onChange={(e) => set((s) => void (s.prefs.quietFrom = e.target.value))} />}
      />
      <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Phạm vi" meta={`Các thành viên được chọn thấy khoảng rảnh/bận: ${cal?.shared ? namesOf(cal.viewers) : 'đang tắt chia sẻ'}. Nội dung lịch không được chia sẻ.`} />
    </Phone>
  );
}

function useInv() {
  const { id } = useParams();
  return useApp((s) => s.invitations.find((i) => i.id === id));
}

export function FDraft() {
  const inv = useInv();
  const me = useMe();
  const nav = useNavigate();
  const [showChecks, setShowChecks] = useState(false);
  if (!inv) return <Phone tabs><TopBar back backTo="/f/rhythm" /><div className="empty">Không tìm thấy bản nháp.</div></Phone>;
  const approve = async () => {
    const rec = await requestApproval(`Gửi lời mời "${inv.occasion}" ${fmtSlot(inv.slot)}`, inv.draft.messages.map((m) => `${memberName(m.recipientId)} (${m.lang === 'vi' ? 'Tiếng Việt' : 'English'}): “${m.text}”`), inv.recipients.join(','));
    if (!rec) return;
    markInvitationApproved(inv.id, me.id, rec);
    nav(`/f/queued/${inv.id}`);
  };
  const okChecks = inv.gen.checks.filter((c) => c.ok).length;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rhythm" />
      <Header title="Duyệt lời mời" sub="GenAI soạn lời mời dựa trên lịch được chia sẻ." />
      <div className="hero peach">
        <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
          <span className="badge">{inv.status === 'snoozed' ? 'ĐÃ HOÃN' : 'CHỜ DUYỆT'} · HÔM NAY</span>
        </div>
        <div className="body">
          <h2>{fmtSlot(inv.slot)}</h2>
          <p style={{ marginBottom: 0 }}>Khung giờ rảnh chung · {inv.tz}</p>
        </div>
      </div>
      {inv.draft.messages.map((m) => (
        <div key={m.recipientId} className="card">
          <div className="label">{m.lang === 'vi' ? 'Tiếng Việt' : 'English'} · {memberName(m.recipientId)}</div>
          <p className="quote">“{m.text}”</p>
        </div>
      ))}
      <div className="card flat">
        <div className="hstack">
          <Badge tone={inv.gen.provider === 'claude' ? 'dark' : undefined}>{inv.gen.provider === 'claude' ? `Claude · ${inv.gen.model}` : 'Mẫu trên thiết bị'}</Badge>
          <Badge tone={okChecks === inv.gen.checks.length ? undefined : 'danger'}>Kiểm dữ kiện {okChecks}/{inv.gen.checks.length}</Badge>
          <span className="spacer" />
          <button className="btn xs ghost" onClick={() => setShowChecks((v) => !v)}>{showChecks ? 'Ẩn' : 'Chi tiết'}</button>
        </div>
        {inv.gen.fellBack && <p className="small" style={{ marginTop: 8, color: '#6E4E20' }}>{inv.gen.fellBack}</p>}
        {showChecks && (
          <div className="list" style={{ marginTop: 6 }}>
            {inv.gen.checks.map((c) => (
              <div className="li" key={c.name}>
                {c.ok ? <Check size={16} color="#244C3E" /> : <ShieldAlert size={16} color="#9E3830" />}
                <div style={{ flex: 1 }}>
                  <b>{c.name}</b>
                  <div className="small muted">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Row icon={<Pencil size={18} />} title="Sửa câu mời và người nhận" meta="Chọn ngôn ngữ theo từng người" to={`/f/compose/${inv.id}`} />
      <div className="btnrow">
        <button className="btn secondary" onClick={() => { setInvitationStatus(inv.id, 'snoozed'); nav('/f/rhythm'); }}>Hoãn</button>
        <button className="btn secondary" onClick={() => { setInvitationStatus(inv.id, 'dismissed'); nav('/f/rhythm'); }}>Bỏ qua</button>
      </div>
      <button className="btn" onClick={() => void approve()} disabled={okChecks !== inv.gen.checks.length}><Check size={18} /> Duyệt và xếp hàng gửi</button>
    </Phone>
  );
}

export function FCompose() {
  const inv = useInv();
  const app = useApp();
  const [tone, setTone] = useState<InviteFacts['tone']>('warm');
  const [busy, setBusy] = useState(false);
  if (!inv) return null;
  const host = app.members.find((m) => m.id === inv.hostId)!;
  const facts: InviteFacts = {
    occasion: inv.occasion,
    slot: inv.slot,
    tz: inv.tz,
    host: host.name,
    hostSelf: host.selfRef,
    place: inv.place,
    tone,
    recipients: inv.draft.messages.map((m) => {
      const mem = app.members.find((x) => x.id === m.recipientId)!;
      return { id: mem.id, name: mem.name, address: mem.address, lang: m.lang };
    }),
  };
  const live = checkDraft(inv.draft, facts);
  return (
    <Phone tabs>
      <TopBar back backTo={`/f/draft/${inv.id}`} />
      <Header title="Sửa bản nháp" sub="Xem trước từng phiên bản lời mời theo người nhận." />
      {inv.draft.messages.map((m) => (
        <div key={m.recipientId} className="card stack" style={{ gap: 8 }}>
          <div className="hstack">
            <b style={{ flex: 1 }}>{memberName(m.recipientId)}</b>
            <Seg value={m.lang} onChange={(v) => setInvitationRecipientLang(inv.id, m.recipientId, v)} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
          </div>
          <textarea className="input" value={m.text} maxLength={240} onChange={(e) => updateInvitationText(inv.id, m.recipientId, e.target.value)} />
        </div>
      ))}
      <div className="card flat">
        <h3>Dữ kiện lời mời</h3>
        <p>Giờ và người nhận được kiểm lại khi duyệt phát hành. Người nhận: {namesOf(inv.recipients)}.</p>
        <div className="list" style={{ marginTop: 6 }}>
          {live.checks.map((c) => (
            <div className="li" key={c.name}>
              {c.ok ? <Check size={16} color="#244C3E" /> : <ShieldAlert size={16} color="#9E3830" />}
              <span className="small">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="label">Tạo lại bằng GenAI</div>
      <Seg value={tone} onChange={setTone} options={[{ value: 'warm', label: 'Ấm áp' }, { value: 'short', label: 'Ngắn gọn' }, { value: 'formal', label: 'Trang trọng' }]} />
      <button className="btn soft" disabled={busy} onClick={() => { setBusy(true); void regenerateInvitation(inv.id, tone).finally(() => setBusy(false)); }}>
        <Sparkles size={18} /> {busy ? 'Đang soạn…' : 'Soạn lại'}
      </button>
      <Link to={`/f/draft/${inv.id}`} className="btn secondary">Về bản xem trước</Link>
    </Phone>
  );
}

export function FQueued() {
  const inv = useInv();
  const nav = useNavigate();
  const me = useMe();
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (inv?.status !== 'queued') return;
    const t = setTimeout(() => {
      setSending(true);
      void releaseInvitation(inv.id).finally(() => setSending(false));
    }, 3500);
    return () => clearTimeout(t);
  }, [inv?.status, inv?.id]);
  if (!inv) return null;
  if (inv.status === 'draft') return <Navigate to={`/f/draft/${inv.id}`} replace />;
  if (inv.status === 'blocked')
    return (
      <Phone tabs>
        <TopBar back backTo="/f/rhythm" />
        <Header title="Cần duyệt lại" sub={inv.blockedReason ?? 'Quyền chia sẻ đã thay đổi.'} />
        <Row tone="rose" icon={<ShieldAlert size={18} />} tileTone="white" title="Lời mời chưa được chuyển giao" meta="Xem lại giờ và người nhận theo quyền hiện tại." />
        <button
          className="btn"
          onClick={async () => {
            const recips = inv.recipients;
            const r = await createInvitation({ hostId: me.id, occasion: inv.occasion, recipients: recips });
            setInvitationStatus(inv.id, 'dismissed');
            if (r.ok) nav(`/f/draft/${r.id}`);
            else toast(r.error ?? 'Không còn khung chung', 'warning');
          }}
        >
          Mở lại Nhịp Nhà
        </button>
        <Link to="/f/permissions" className="btn secondary">Xem quyền chia sẻ</Link>
      </Phone>
    );
  const receipts = Object.entries(inv.receipts);
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rhythm" />
      <Header title={inv.status === 'delivered' ? 'Đã chuyển giao lời mời' : 'Đã duyệt lời mời'} sub={`${inv.occasion} · ${inv.status === 'delivered' ? 'Chờ biên nhận' : 'Đang chờ gửi'}`} />
      <div className="card">
        <Steps
          items={[
            { title: 'Bản xem trước', meta: `Đã được ${memberName(inv.approvedBy ?? '')} duyệt · ${inv.approvedAt ? hhmm(inv.approvedAt) : ''}`, state: 'done' },
            { title: 'Hàng đợi', meta: inv.status === 'delivered' ? `Đã chuyển giao · ${hhmm(inv.deliveredAt!)}` : sending ? 'Đang kiểm lại quyền theo epoch hiện hành…' : 'Đã xếp chuyển giao', state: inv.status === 'delivered' ? 'done' : 'active' },
            { title: 'Biên nhận người nhận', meta: receipts.map(([id, r]) => `${memberName(id)}: ${r === 'pending' ? 'chưa có' : r === 'accepted' ? 'sẽ tham gia' : r === 'declined' ? 'không tham gia' : 'trả lời sau'}`).join(' · '), state: receipts.every(([, r]) => r !== 'pending') ? 'done' : 'todo' },
          ]}
        />
      </div>
      {inv.status === 'queued' && <button className="btn" disabled={sending} onClick={() => { setSending(true); void releaseInvitation(inv.id).finally(() => setSending(false)); }}>Gửi ngay</button>}
      <Row icon={<ShieldAlert size={18} />} title="Trạng thái kiểm quyền" meta="Xem trường hợp quyền thay đổi: thu hồi lịch của Linh trước khi gửi" to="/f/revoke/p-cal" />
      {inv.status === 'delivered' && inv.recipients.filter((r) => r !== 'u-lan' && inv.receipts[r] === 'pending').map((r) => (
        <div key={r} className="card flat">
          <p className="small">Mô phỏng phản hồi từ điện thoại của {memberName(r)}:</p>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn sm secondary" onClick={() => respondInvitation(inv.id, r, 'declined')}>Không tham gia</button>
            <button className="btn sm" onClick={() => respondInvitation(inv.id, r, 'accepted')}>Sẽ tham gia</button>
          </div>
        </div>
      ))}
      <div className="card flat">
        <div className="label">Lịch sử</div>
        <div className="list">
          {inv.history.map((h, i) => (
            <div key={i} className="li small"><span className="muted mono">{hhmm(h.at)}</span>{h.text}</div>
          ))}
        </div>
      </div>
      <Link to="/f/rhythm" className="btn secondary">Về Nhịp Nhà</Link>
    </Phone>
  );
}
