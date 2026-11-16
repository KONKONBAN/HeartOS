import { CalendarDays, Check, Clock, Mic, Phone as PhoneIcon, PlayCircle, Siren, Square, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Missing } from '../../components/Missing';
import { Avatar, Badge, Chips, Field, Header, ModePicker, Row, TopBar } from '../../components/ui';
import { fmtSlot, viTime } from '../../core/family/calendar';
import { nextOccurrence } from '../../core/family/recurrence';
import { dayLong, hhmm, isToday } from '../../lib/format';
import { speak, useRecorder } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { addMemory, openMemory, respondInvitation, supportContacts } from '../../state/actions';
import { useHome } from '../../state/services';
import { capFirst, honorific, memberName, namesOf, useApp, useMe } from '../../state/store';

function useLanInvite() {
  const me = useMe();
  const invs = useApp((s) => s.invitations);
  return invs.find((i) => i.status === 'delivered' && i.recipients.includes(me.id));
}

export function SHome() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const inv = useLanInvite();
  const rituals = useApp((s) => s.rituals);
  const members = useApp((s) => s.members);
  const home = useHome();
  const sosOpen = home.openIncidents().find((i) => i.kind === 'sos');
  const contacts = supportContacts(me.id);
  const allTasks = useApp((s) => s.tasks);
  const invites = useApp((s) => s.invitations);
  const todayTasks = allTasks.filter((t) => (t.assignee === me.id || t.target === me.id) && t.status !== 'done' && isToday(t.remindAt));
  const callsToday = todayTasks.filter((t) => t.kind === 'call').length;
  const meals = invites.filter((i) => i.status === 'delivered' && i.recipients.includes(me.id) && i.receipts[me.id] !== 'declined').length;
  const ritualsToday = rituals.filter((r) => r.participants.includes(me.id) && isToday(nextOccurrence(r.recurrence, new Date(new Date().setHours(0, 0, 0, 0)), r.skip).getTime())).length;
  const todayParts = [meals && `${meals} bữa cơm`, ritualsToday && `${ritualsToday} buổi sum họp`, callsToday && `${callsToday} cuộc gọi`, todayTasks.length - callsToday && `${todayTasks.length - callsToday} việc nhà`].filter(Boolean);
  const todaySummary = todayParts.length ? capFirst(todayParts.join(', ')) : 'Hôm nay chưa có việc gì';
  const callees = members.filter((m) => m.id !== me.id && m.phone && m.role !== 'carer' && m.role !== 'child');
  const nextRitual = rituals
    .filter((r) => r.participants.includes(me.id))
    .map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(), r.skip) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const accepted = inv && inv.receipts[me.id] === 'accepted';
  return (
    <Phone tabs simple>
      <TopBar right={<ModePicker mode="simple" />} brandTo="/s" />
      <Header date={dayLong()} title={`Chào ${me.name.toLowerCase().startsWith(`${hon}`) ? `${hon} ` + me.name.slice(3) : me.name}!`} read={`Chào ${me.name}. Hôm nay là ${dayLong()}.`} />
      {sosOpen && <Row tone="rose" icon={<Siren size={20} />} tileTone="white" title="SOS đang mở" meta={sosOpen.steps.helper.by ? `${sosOpen.steps.helper.by} đã nhận hỗ trợ` : 'Đang chờ người thân nhận việc'} to={`/s/sos/${sosOpen.id}`} />}
      <Row tone="tint" icon={<PhoneIcon size={22} />} tileTone="white" title="Gọi người thân" meta={namesOf(callees.map((c) => c.id))} to="/s/call" />
      {inv ? (
        <Link to={`/s/invite/${inv.id}`} className="hero peach" style={{ textDecoration: 'none' }}>
          <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
            <span className="badge">HÔM NAY, {fmtSlot(inv.slot).split('-')[0]}</span>
          </div>
          <div className="body">
            <h2>{inv.occasion}</h2>
            <p>{accepted ? `${Hon} đã xác nhận tham gia.` : `${memberName(inv.hostId)} mời ${hon} ăn cơm tối.`}</p>
            <div className="cta">Xem lời mời <span>›</span></div>
          </div>
        </Link>
      ) : (
        nextRitual && (
          <div className="hero peach">
            <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
              <span className="badge">NGHI THỨC, {hhmm(nextRitual.at.getTime())}</span>
            </div>
            <div className="body">
              <h2>{nextRitual.r.name}</h2>
              <p>{dayLong(nextRitual.at.getTime())}</p>
            </div>
          </div>
        )
      )}
      <Row icon={<CalendarDays size={22} />} tileTone="peach" title="Lịch hôm nay" meta={todaySummary} to="/s/today" />
      <Row tone="rose" icon={<Siren size={22} />} tileTone="white" title="Cần giúp ngay" meta={home.s.real ? (contacts.length ? `Gửi SOS cho ${namesOf(contacts.map((m) => m.id))}` : 'Gửi SOS và gọi cấp cứu 115') : `Gửi SOS cho ${namesOf(home.s.helpers.map((h) => h.id))}`} to="/s/help" />
    </Phone>
  );
}

export function SCall() {
  const me = useMe();
  const hon = honorific(me);
  const members = useApp((s) => s.members);
  const list = members.filter((m) => m.id !== me.id && m.phone && m.role !== 'carer' && m.role !== 'child');
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <Header title="Gọi người thân" sub={`Chọn người ${hon} muốn gọi.`} />
      {list.map((m) => (
        <Row key={m.id} icon={<Avatar name={m.name} color={m.color} />} tileTone="white" title={m.name} meta={m.relation.split(', ')[0]} to={`/s/call/${m.id}`} right={<PhoneIcon size={20} color="#244C3E" />} />
      ))}
      <Row tone="tint" icon={<Check size={20} />} tileTone="white" title="Xem lại trước khi gọi" meta={`Ở bước tiếp theo, ${hon} kiểm tra tên rồi mở ứng dụng Điện thoại.`} />
    </Phone>
  );
}

export function SCallPerson() {
  const me = useMe();
  const hon = honorific(me);
  const { id } = useParams();
  const m = useApp((s) => s.members.find((x) => x.id === id));
  const [opened, setOpened] = useState(false);
  const nav = useNavigate();
  if (!m) return <Missing simple title="Không tìm thấy người này" back="/s/call" label="Về danh sách gọi" />;
  return (
    <Phone simple>
      <TopBar back backTo="/s/call" />
      <Header title={opened ? 'Mở Điện thoại' : `Gọi cho ${m.name}`} sub={opened ? `Cuộc gọi tới ${m.name}.` : 'Kiểm tra tên trước khi mở Điện thoại.'} />
      <div className="card center" style={{ padding: 24 }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Avatar name={m.name} color={m.color} size="lg" />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10 }}>{m.name}</div>
        <div className="muted" style={{ fontSize: 16 }}>{m.relation.split(', ')[0]}</div>
        <div style={{ marginTop: 8 }}><Badge>Đã lưu trong danh bạ</Badge></div>
      </div>
      {opened && <Row tone="tint" icon={<Check size={20} />} tileTone="white" title={`Đã chọn ${m.name}`} meta={`Điện thoại hiển thị tên người nhận trước khi ${hon} bấm gọi.`} />}
      {!opened ? (
        <>
          <a className="btn" href={`tel:${m.phone}`} onClick={() => setOpened(true)}>
            <PhoneIcon size={20} /> Mở Điện thoại
          </a>
          <button className="btn secondary" onClick={() => nav('/s/call')}>Để sau</button>
        </>
      ) : (
        <button className="btn secondary" onClick={() => setOpened(false)}>Về bước xác nhận</button>
      )}
    </Phone>
  );
}

export function SToday() {
  const me = useMe();
  const hon = honorific(me);
  const tasks = useApp((s) => s.tasks);
  const invs = useApp((s) => s.invitations);
  const rituals = useApp((s) => s.rituals);
  const mine = tasks.filter((t) => (t.assignee === me.id || t.target === me.id) && isToday(t.remindAt)).sort((a, b) => a.remindAt - b.remindAt);
  const inv = invs.find((i) => i.status === 'delivered' && i.recipients.includes(me.id));
  const ritualToday = rituals.filter((r) => r.participants.includes(me.id)).map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(new Date().setHours(0, 0, 0, 0)), r.skip) })).filter((x) => isToday(x.at.getTime()));
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <Header title="Lịch hôm nay" sub={dayLong()} />
      {mine
        .filter((t) => t.kind === 'call')
        .map((t) => (
          <Row key={t.id} icon={<PhoneIcon size={20} />} tileTone="peach" title={`${hhmm(t.remindAt)}, ${t.title}`} meta={t.note} to={t.target ? `/s/call/${t.target === me.id ? t.assignee : t.target}` : undefined} />
        ))}
      {inv && (
        <Row
          icon={<CalendarDays size={20} />}
          tileTone="peach"
          title={`${fmtSlot(inv.slot).split('-')[0]}, Bữa cơm`}
          meta={inv.receipts[me.id] === 'accepted' ? inv.place : `${memberName(inv.hostId)} mời cả nhà cùng ăn tối`}
          badge={inv.receipts[me.id] === 'accepted' ? <Badge>Đã xác nhận tham gia</Badge> : undefined}
          to={`/s/invite/${inv.id}`}
        />
      )}
      {ritualToday.map(({ r, at }) => (
        <Row key={r.id} icon={<CalendarDays size={20} />} tileTone="sand" title={`${hhmm(at.getTime())}, ${r.name}`} meta={r.note} />
      ))}
      <div className="section-title">Việc đã nhận</div>
      {mine
        .filter((t) => t.kind === 'chore')
        .map((t) => (
          <Row key={t.id} icon={<Check size={20} />} tileTone={t.status === 'done' ? undefined : 'sand'} title={t.title} meta={t.status === 'done' ? `Việc ${hon} đã nhận` : `Trước ${hhmm(t.remindAt + 30 * 60_000)}`} badge={t.status === 'done' ? <Badge>Đã hoàn thành</Badge> : undefined} to={`/s/task/${t.id}`} />
        ))}
      {mine.length === 0 && !inv && <div className="empty">Hôm nay chưa có việc nào.</div>}
    </Phone>
  );
}

export function STask() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const { id } = useParams();
  const t = useApp((s) => s.tasks.find((x) => x.id === id));
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  if (!t) return <Missing simple title="Không tìm thấy việc" back="/s/today" label="Về việc hôm nay" />;
  if (t.status === 'done')
    return (
      <Phone simple>
        <TopBar back backTo="/s/today" />
        <Header title={`${Hon} đã làm xong`} sub={`Việc ${t.title.toLowerCase()} đã được đánh dấu hoàn thành.`} />
        <Row tone="tint" icon={<Check size={22} />} tileTone="white" title="Đã lưu" meta={`${Hon} có thể xem lại trong lịch hôm nay.`} />
        <button className="btn" onClick={() => nav('/s/today')}>Về lịch hôm nay</button>
      </Phone>
    );
  return (
    <Phone simple>
      <TopBar back backTo="/s/today" />
      <Header title={t.title.replace(' ngoài ban công', '')} sub={`Việc ${hon} đã nhận, Hôm nay`} />
      <div className="card peach" style={{ padding: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{t.place || 'Trong nhà'}</div>
        <p style={{ fontSize: 16, color: '#753F30', marginTop: 4 }}>{t.note}</p>
      </div>
      <button
        className="btn"
        onClick={() =>
          set((s) => {
            const x = s.tasks.find((y) => y.id === id)!;
            x.status = 'done';
            x.doneAt = Date.now();
          })
        }
      >
        <Check size={20} /> Đánh dấu đã xong
      </button>
      <button
        className="btn secondary"
        onClick={() => {
          set((s) => {
            s.tasks.find((y) => y.id === id)!.remindAt += 30 * 60_000;
          });
          toast('Sẽ nhắc lại sau 30 phút.');
          nav('/s/today');
        }}
      >
        <Clock size={20} /> Nhắc lại sau
      </button>
    </Phone>
  );
}

export function SInvite() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const { id } = useParams();
  const inv = useApp((s) => s.invitations.find((x) => x.id === id));
  const nav = useNavigate();
  if (!inv) return <Missing simple title="Không tìm thấy lời mời" back="/s" label="Về màn hình chính" />;
  const msg = inv.draft.messages.find((m) => m.recipientId === me.id);
  const accepted = inv.receipts[me.id] === 'accepted';
  if (accepted)
    return (
      <Phone simple>
        <TopBar back backTo="/s" />
        <Header title={`Hẹn ${hon} lúc ${viTime(inv.slot.start).replace(/ (sáng|trưa|chiều|tối)$/, '')}!`} sub="Phản hồi tham gia đã được lưu." />
        <Row tone="tint" icon={<CalendarDays size={22} />} tileTone="white" title="Đã thêm vào lịch" meta={`${inv.occasion}, ${fmtSlot(inv.slot).split('-')[0]} hôm nay.`} />
        <button className="btn" onClick={() => nav('/s/today')}>Xem lịch hôm nay</button>
        <button className="btn secondary" onClick={() => nav('/s')}>Về trang nhà</button>
      </Phone>
    );
  return (
    <Phone simple>
      <TopBar back backTo="/s" />
      <Header title={inv.occasion} sub={`Lời mời từ ${memberName(inv.hostId)}`} read={msg?.text} />
      <div className="hero peach">
        <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
          <span className="badge">{dayLong().toUpperCase()}</span>
        </div>
        <div className="body">
          <h2>{fmtSlot(inv.slot)}</h2>
          <p style={{ marginBottom: 0 }}>Tại {inv.place}</p>
        </div>
      </div>
      <div className="card">
        <div className="label">Lời mời</div>
        <p className="quote" style={{ fontSize: 18 }}>“{msg?.text}”</p>
        <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => msg && speak(msg.text)}>
          <Volume2 size={18} /> Đọc to
        </button>
      </div>
      <button className="btn" onClick={() => respondInvitation(inv.id, me.id, 'accepted')}>
        <Check size={20} /> {Hon} sẽ tham gia
      </button>
      <button
        className="btn secondary"
        onClick={() => {
          respondInvitation(inv.id, me.id, 'later');
          nav('/s/today');
        }}
      >
        Trả lời sau
      </button>
    </Phone>
  );
}

export function SMemory() {
  const me = useMe();
  const mems = useApp((s) => s.memories).filter((m) => m.narrator === me.id || m.viewers.includes(me.id));
  const story = mems.find((m) => m.kind === 'story');
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <Header title="Ký ức nhà mình" sub="Nghe lại lời kể và xem ảnh người thân chia sẻ." />
      {story && (
        <Link to={`/s/story/${story.id}`} className="hero peach" style={{ textDecoration: 'none' }}>
          <div className="img" style={{ backgroundImage: `url(${story.image ?? './media/grandma-album.jpg'})` }}>
            <span className="badge">LỜI KỂ CỦA {memberName(story.narrator).toUpperCase()}</span>
          </div>
          <div className="body">
            <h2>{story.title}</h2>
            <p>{story.audioKey && story.durationSec ? `Đoạn ghi âm, ${Math.floor(story.durationSec / 60)} phút ${story.durationSec % 60} giây` : story.audioKey ? 'Đoạn ghi âm' : 'Lời kể chép lại, bấm để nghe'}</p>
            <div className="cta">Mở lời kể <span>›</span></div>
          </div>
        </Link>
      )}
      <Row icon={<Mic size={22} />} tileTone="peach" title="Thu âm lời kể" meta="Tự chọn người được nghe" to="/s/record" />
      {mems
        .filter((m) => m.id !== story?.id)
        .map((m) => (
          <Row key={m.id} icon={<PlayCircle size={22} />} tileTone="sand" title={m.title} meta={`${memberName(m.narrator)}, ${m.kind === 'story' ? 'Lời kể' : 'Ảnh'}`} to={`/s/story/${m.id}`} />
        ))}
    </Phone>
  );
}

export function SStory() {
  const { id } = useParams();
  const me = useMe();
  const mem = useApp((s) => s.memories.find((m) => m.id === id));
  const [data, setData] = useState<{ transcript: string; caption: string } | null>(null);
  const [audio, setAudio] = useState<string>();
  const [err, setErr] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    if (!mem) return;
    void openMemory(mem.id, me.id).then((r) => {
      if (r.ok) {
        setData(r.data);
        setAudio(r.audioUrl);
      } else setErr(r.error);
    });
  }, [mem, me.id]);
  if (!mem) return <Missing simple title="Không tìm thấy lời kể" back="/s/memory" label="Về ký ức" />;
  return (
    <Phone simple>
      <TopBar back backTo="/s/memory" />
      <Header title={mem.title} sub={`${memberName(mem.narrator)} kể, Chia sẻ với ${namesOf(mem.viewers)}`} />
      {mem.image && <img src={mem.image} alt="" style={{ borderRadius: 18, height: 180, objectFit: 'cover', width: '100%' }} />}
      {err && <div className="card rose"><p className="danger-text">{err}</p></div>}
      {data && (
        <>
          <div className="card tint">
            <div className="hstack">
              <PlayCircle size={26} color="#244C3E" />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 18 }}>{mem.audioKey ? 'Lời kể đã ghi âm' : 'Lời kể chép lại'}</b>
                <div className="muted">{mem.audioKey && mem.durationSec ? `${String(Math.floor(mem.durationSec / 60)).padStart(2, '0')}:${String(mem.durationSec % 60).padStart(2, '0')}, ` : ''}Tiếng Việt</div>
              </div>
            </div>
            {audio ? <audio controls src={audio} style={{ width: '100%', marginTop: 10 }} /> : (
              <button className="btn soft sm" style={{ marginTop: 10 }} onClick={() => speak(data.transcript || data.caption)}>
                <Volume2 size={18} /> Nghe lời kể
              </button>
            )}
          </div>
          <div className="card">
            <div className="label">Chú thích</div>
            <p className="quote" style={{ fontSize: 18 }}>{data.caption || data.transcript}</p>
            {data.transcript && data.caption !== data.transcript && <p style={{ marginTop: 8 }}>{data.transcript}</p>}
          </div>
        </>
      )}
      <button className="btn secondary" onClick={() => nav('/s/memory')}>Về Ký ức</button>
    </Phone>
  );
}

export function SRecord() {
  const me = useMe();
  const hon = honorific(me);
  const Hon = capFirst(hon);
  const members = useApp((s) => s.members);
  const rec = useRecorder();
  const nav = useNavigate();
  const [title, setTitle] = useState('Lời kể mới');
  const [listeners, setListeners] = useState<string[]>(() => members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => m.id));
  const [saving, setSaving] = useState(false);
  const options = members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }));
  const save = async (share: boolean) => {
    setSaving(true);
    const r = await addMemory({ by: me.id, title, kind: 'story', transcript: '', caption: title, audio: rec.blob ?? undefined, durationSec: rec.seconds, viewers: listeners, derivedAllowed: false, retention: 'Theo lựa chọn của người kể', share });
    setSaving(false);
    if (r.ok) {
      toast(share ? `Đã chia sẻ với ${namesOf(listeners)}.` : `Đã lưu riêng cho ${hon}.`);
      nav('/s/memory');
    } else toast('Chưa lưu được: ' + r.error, 'warning');
  };
  return (
    <Phone simple>
      <TopBar back backTo="/s/memory" />
      <Header title={rec.state === 'done' ? 'Ai được nghe?' : 'Thu âm lời kể'} sub={rec.state === 'done' ? `Chọn người nghe bản thu ${title}.` : `${Hon} có thể nghe lại trước khi chia sẻ.`} />
      {rec.state !== 'done' && (
        <div className="card peach center" style={{ padding: 24 }}>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{String(Math.floor(rec.seconds / 60)).padStart(2, '0')}:{String(rec.seconds % 60).padStart(2, '0')}</div>
          <div className="muted" style={{ marginBottom: 14 }}>Tiếng Việt</div>
          {rec.state === 'recording' ? (
            <button className="btn danger" onClick={rec.stop}>
              <Square size={20} /> Dừng ghi
            </button>
          ) : (
            <button className="btn" onClick={() => void rec.start()}>
              <Mic size={20} /> Bắt đầu ghi
            </button>
          )}
        </div>
      )}
      {rec.error && <div className="card rose"><p className="danger-text">{rec.error}</p></div>}
      {rec.state !== 'done' && <Row tone="tint" icon={<Mic size={20} />} tileTone="white" title="Chọn quyền mic" meta={`Điện thoại hỏi quyền dùng mic khi ${hon} bắt đầu ghi.`} />}
      {rec.state === 'done' && (
        <>
          <div className="card tint">
            <b>Bản thu, {rec.seconds} giây</b>
            <audio controls src={rec.url} style={{ width: '100%', marginTop: 8 }} />
          </div>
          <Field label="Tên lời kể">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="label">Người được nghe</div>
          <Chips options={options} value={listeners} onChange={setListeners} />
          <Row tone="tint" icon={<Check size={20} />} tileTone="white" title={`${Hon} chọn trước khi gửi`} meta="Bản gốc và lời chép có phạm vi riêng. Bản ghi được mã hóa trên thiết bị." />
          <div className="btnrow">
            <button className="btn secondary" disabled={saving} onClick={() => void save(false)}>Lưu riêng</button>
            <button className="btn" disabled={saving || listeners.length === 0} onClick={() => void save(true)}>Duyệt chia sẻ</button>
          </div>
          <button className="btn ghost" onClick={rec.reset}>Ghi lại</button>
        </>
      )}
      {rec.state !== 'done' && <button className="btn secondary" onClick={() => nav('/s/memory')}>Quay về Ký ức</button>}
    </Phone>
  );
}
