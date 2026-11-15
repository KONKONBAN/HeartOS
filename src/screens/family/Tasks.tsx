import { CalendarDays, Check, Clock, Heart, Image, Phone as PhoneIcon, Plus, Repeat, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Chips, Field, Header, KV, Row, Seg, TopBar } from '../../components/ui';
import { describe, fmtDate, nextOccurrence, WEEKDAYS, type Recurrence } from '../../core/family/recurrence';
import { hhmm, isToday } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { getSentinel } from '../../state/services';
import { memberName, namesOf, useApp, useMe } from '../../state/store';
import type { Task } from '../../state/types';

const statusBadge = (t: Task) =>
  t.status === 'done' ? <Badge>Đã hoàn thành</Badge> : t.status === 'accepted' ? <Badge>Đã nhận</Badge> : t.status === 'scheduled' ? <Badge tone="warm">Đã lên lịch</Badge> : <Badge tone="line">Chờ nhận</Badge>;


const TASK_STATUS: Record<'open' | 'accepted' | 'scheduled' | 'done', string> = { open: 'chưa có người nhận', accepted: 'đã nhận việc', scheduled: 'đã lên lịch', done: 'đã xong' };
export function FTasks() {
  const me = useMe();
  const tasks = useApp((s) => s.tasks);
  const [justAdded] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('added'));
  const visible = tasks.filter((t) => t.visibleTo.includes(me.id) || t.assignee === me.id || me.role === 'admin').sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.remindAt - b.remindAt);
  return (
    <Phone tabs>
      <TopBar back backTo="/f" />
      <Header title="Việc chung" sub={justAdded ? `Đã thêm việc của ${memberName(tasks.find((t) => t.id === justAdded)?.assignee ?? '')} vào danh sách.` : 'Việc trong nhà, phân công và hỏi thăm.'} />
      {visible.map((t) => (
        <Row
          key={t.id}
          icon={t.kind === 'call' ? <PhoneIcon size={18} /> : <Check size={18} />}
          tileTone={t.kind === 'call' ? 'peach' : 'sand'}
          title={t.title}
          meta={`${memberName(t.assignee)} · ${isToday(t.remindAt) ? (t.kind === 'chore' ? 'Trước ' : '') + hhmm(t.remindAt) : fmtDate(new Date(t.remindAt))}`}
          badge={t.id === justAdded ? <Badge tone="warm">Vừa thêm</Badge> : statusBadge(t)}
          to={`/f/task/${t.id}`}
        />
      ))}
      <Link to="/f/task-new" className="btn">
        <Plus size={18} /> Tạo việc chung
      </Link>
    </Phone>
  );
}

export function FTask() {
  const { id } = useParams();
  const me = useMe();
  const t = useApp((s) => s.tasks.find((x) => x.id === id));
  const set = useApp((s) => s.set);
  const members = useApp((s) => s.members);
  const nav = useNavigate();
  const [assignee, setAssignee] = useState(t?.assignee ?? '');
  const [remind, setRemind] = useState(t ? hhmm(t.remindAt) : '18:30');
  const [visibleTo, setVisibleTo] = useState<string[]>(t?.visibleTo ?? []);
  if (!t) return null;
  const canEdit = me.role === 'admin' || t.createdBy === me.id;
  const save = () => {
    set((s) => {
      const x = s.tasks.find((y) => y.id === id)!;
      const d = new Date(x.remindAt);
      const [h, m] = remind.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      x.assignee = assignee;
      x.remindAt = d.getTime();
      x.visibleTo = [...new Set([...visibleTo, assignee])];
    });
    toast('Đã lưu việc chung.');
    nav('/f/tasks');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/tasks" />
      <Header title={t.kind === 'call' ? t.title : 'Chi tiết việc chung'} sub={t.kind === 'call' ? `Nhắc ${memberName(t.assignee)} · ${fmtDate(new Date(t.remindAt))}` : t.title} />
      {t.kind === 'call' ? (
        <div className="card">
          <KV items={[['Người hỏi thăm', memberName(t.assignee)], ['Nhắc lúc', fmtDate(new Date(t.remindAt))], ['Người được hỏi thăm', memberName(t.target ?? '')], ['Ghi chú', t.note]]} />
          {t.target && (
            <a className="btn soft sm" style={{ marginTop: 12 }} href={`tel:${members.find((m) => m.id === t.target)?.phone ?? ''}`}>
              <PhoneIcon size={16} /> Gọi {memberName(t.target)}
            </a>
          )}
        </div>
      ) : (
        <>
          <Field label="Người nhận việc">
            <select className="input" value={assignee} disabled={!canEdit} onChange={(e) => setAssignee(e.target.value)}>
              {members.filter((m) => m.role !== 'carer').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Nhắc lúc">
            <input className="input" type="time" value={remind} disabled={!canEdit} onChange={(e) => setRemind(e.target.value)} />
          </Field>
          <div className="label">Ai thấy việc này</div>
          <Chips options={members.filter((m) => m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={visibleTo} onChange={canEdit ? setVisibleTo : () => undefined} />
          <div className="card flat"><p>{t.note || 'Không có ghi chú.'} · Trạng thái: {t.status === 'done' ? `đã xong lúc ${hhmm(t.doneAt ?? Date.now())}` : TASK_STATUS[t.status]}</p></div>
          {canEdit && <button className="btn" onClick={save}>Lưu việc chung</button>}
        </>
      )}
      {t.status !== 'done' && (
        <button
          className="btn secondary"
          onClick={() => {
            set((s) => {
              const x = s.tasks.find((y) => y.id === id)!;
              x.status = 'done';
              x.doneAt = Date.now();
            });
            nav('/f/tasks');
          }}
        >
          <Check size={18} /> Đánh dấu đã xong
        </button>
      )}
      <Link to="/f/tasks" className="btn ghost">Về Việc chung</Link>
    </Phone>
  );
}

export function FTaskNew() {
  const me = useMe();
  const [params] = useSearchParams();
  const members = useApp((s) => s.members);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const [title, setTitle] = useState(params.get('title') ?? 'Chuẩn bị bữa cơm');
  const [kind, setKind] = useState<'chore' | 'call'>('chore');
  const [assignee, setAssignee] = useState(me.id);
  const [target, setTarget] = useState('u-lan');
  const [visibleTo, setVisibleTo] = useState<string[]>([me.id, 'u-linh'].filter((v, i, a) => a.indexOf(v) === i));
  const [time, setTime] = useState('17:30');
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const save = () => {
    const d = new Date();
    if (day === 'tomorrow') d.setDate(d.getDate() + 1);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    const id = 't-' + Date.now().toString(36);
    set((s) => {
      s.tasks.unshift({ id, title, place: '', note: '', kind, assignee, target: kind === 'call' ? target : undefined, visibleTo: [...new Set([...visibleTo, assignee])], remindAt: d.getTime(), status: assignee === me.id ? 'accepted' : 'open', createdBy: me.id, createdAt: Date.now() });
    });
    void getSentinel().log({ kind: 'note', actor: 'A', summary: `${me.name} tạo việc chung "${title}" cho ${memberName(assignee)}` });
    nav(`/f/tasks?added=${id}`);
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/tasks" />
      <Header title="Tạo việc chung" sub="Chọn việc, người phụ trách và thời gian nhắc." />
      <Seg value={kind} onChange={setKind} options={[{ value: 'chore', label: 'Việc nhà' }, { value: 'call', label: 'Gọi hỏi thăm' }]} />
      <Field label="Tên việc">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Người phụ trách">
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {members.filter((m) => m.role !== 'carer').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      {kind === 'call' && (
        <Field label="Người được hỏi thăm">
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {members.filter((m) => m.phone).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      )}
      <div className="label">Ai thấy việc</div>
      <Chips options={members.filter((m) => m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={visibleTo} onChange={setVisibleTo} />
      <div className="grid2">
        <Field label="Nhắc lúc">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Ngày">
          <select className="input" value={day} onChange={(e) => setDay(e.target.value as 'today' | 'tomorrow')}>
            <option value="today">Hôm nay</option>
            <option value="tomorrow">Ngày mai</option>
          </select>
        </Field>
      </div>
      <button className="btn" disabled={!title.trim()} onClick={save}>Lưu việc</button>
    </Phone>
  );
}

export function FRituals() {
  const rituals = useApp((s) => s.rituals);
  const [added] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('added'));
  const list = rituals.map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(), r.skip) }));
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rhythm" />
      <Header title="Nghi thức gia đình" sub={added ? 'Đã thêm lịch lặp cho cả nhà.' : 'Duy trì những dịp gặp nhau.'} />
      {list.map(({ r, at }, i) =>
        i === 0 && !added ? (
          <Link key={r.id} to={`/f/ritual/${r.id}`} className="hero peach" style={{ textDecoration: 'none' }}>
            <div className="img" style={{ backgroundImage: 'url(./media/family-dinner.jpg)' }}>
              <span className="badge">{r.recurrence.freq === 'weekly' ? `LẶP MỖI ${WEEKDAYS[r.recurrence.weekday].toUpperCase()}` : 'LẶP HÀNG THÁNG'}</span>
            </div>
            <div className="body">
              <h2>{r.name}</h2>
              <p>{r.recurrence.time} · {r.participants.length} thành viên · lần tới {fmtDate(at)}</p>
              <div className="cta">Xem lịch lặp <span>›</span></div>
            </div>
          </Link>
        ) : (
          <Row key={r.id} icon={<Heart size={18} />} tileTone="peach" title={r.name} meta={`${describe(r.recurrence)} · lần tới ${fmtDate(at)}`} badge={r.id === added ? <Badge tone="warm">Vừa thêm</Badge> : undefined} to={`/f/ritual/${r.id}`} />
        ),
      )}
      <Link to="/f/ritual-new" className="btn">
        <Plus size={18} /> Tạo nghi thức
      </Link>
    </Phone>
  );
}

export function FRitual() {
  const { id } = useParams();
  const r = useApp((s) => s.rituals.find((x) => x.id === id));
  const mems = useApp((s) => s.memories);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const [scope, setScope] = useState<'once' | 'series'>('once');
  const [time, setTime] = useState(r?.recurrence.time ?? '19:00');
  if (!r) return null;
  const next = nextOccurrence(r.recurrence, new Date(), r.skip);
  const save = () => {
    set((s) => {
      const x = s.rituals.find((y) => y.id === id)!;
      if (scope === 'series') x.recurrence = { ...x.recurrence, time } as Recurrence;
      else x.overrideNext = { time, scope };
    });
    toast(scope === 'series' ? 'Đã đổi giờ cho cả chuỗi.' : `Đã đổi giờ riêng lần ${fmtDate(next)}.`);
    nav('/f/rituals');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rituals" />
      <Header title={r.name} sub={`Lần tiếp theo · ${fmtDate(next)}`} />
      <Row icon={<Repeat size={18} />} tileTone="peach" title="Lịch lặp" meta={`${describe(r.recurrence)} · GMT+7`} chevron={false} />
      <Row icon={<Users size={18} />} tileTone="peach" title="Người tham gia" meta={namesOf(r.participants)} chevron={false} />
      <Field label="Giờ diễn ra">
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <div className="label">Phạm vi thay đổi</div>
      <Seg value={scope} onChange={setScope} options={[{ value: 'once', label: 'Chỉ lần này' }, { value: 'series', label: 'Cả chuỗi' }]} />
      <button
        className="btn secondary sm"
        style={{ width: '100%' }}
        onClick={() => {
          set((s) => void s.rituals.find((y) => y.id === id)!.skip.push(next.toISOString().slice(0, 10)));
          toast(`Đã bỏ qua lần ${fmtDate(next)}.`);
        }}
      >
        <CalendarDays size={16} /> Bỏ qua lần này
      </button>
      <Row icon={<Image size={18} />} title="Thêm ảnh hoặc lời kể" meta={`Gắn ký ức với lần diễn ra · ${r.memoryIds.length} ký ức đã gắn`} to={`/f/memory-new?ritual=${r.id}`} />
      {r.memoryIds.map((mid) => {
        const m = mems.find((x) => x.id === mid);
        return m ? <Row key={mid} icon={<Image size={18} />} tileTone="sand" title={m.title} meta={memberName(m.narrator)} to={`/f/memory/${m.id}`} /> : null;
      })}
      <button className="btn" onClick={save}>Lưu lịch nghi thức</button>
    </Phone>
  );
}

export function FRitualNew() {
  const members = useApp((s) => s.members);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const [name, setName] = useState('Đi dạo cùng ông bà');
  const [freq, setFreq] = useState<'weekly' | 'monthly-last' | 'daily'>('weekly');
  const [weekday, setWeekday] = useState(6);
  const [time, setTime] = useState('17:30');
  const [people, setPeople] = useState<string[]>(['u-lan', 'u-an', 'u-linh']);
  const save = () => {
    const id = 'r-' + Date.now().toString(36);
    const recurrence: Recurrence = freq === 'daily' ? { freq, time } : { freq, weekday, time };
    set((s) => {
      s.rituals.unshift({ id, name, recurrence, participants: people, skip: [], note: '', createdAt: Date.now(), memoryIds: [] });
    });
    nav(`/f/rituals?added=${id}`);
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/rituals" />
      <Header title="Tạo nghi thức" sub="Đặt lịch và chọn người tham gia." />
      <Field label="Tên nghi thức">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="label">Lặp lại</div>
      <Seg value={freq} onChange={setFreq} options={[{ value: 'weekly', label: 'Hằng tuần' }, { value: 'monthly-last', label: 'Cuối tháng' }, { value: 'daily', label: 'Hằng ngày' }]} />
      <div className="grid2">
        {freq !== 'daily' && (
          <Field label="Thứ">
            <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
            </select>
          </Field>
        )}
        <Field label="Giờ">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="label">Người được mời</div>
      <Chips options={members.filter((m) => m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={people} onChange={setPeople} />
      <div className="card flat"><p><Clock size={14} style={{ verticalAlign: -2 }} /> Lần đầu: {fmtDate(nextOccurrence(freq === 'daily' ? { freq, time } : { freq, weekday, time }, new Date()))}</p></div>
      <button className="btn" disabled={!name.trim() || !people.length} onClick={save}>Lưu nghi thức</button>
    </Phone>
  );
}
