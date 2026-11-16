import { Brain, Check, Pill, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Chips, Field, Header, Row, Seg, Switch, TopBar } from '../../components/ui';
import { clockOf, describeHabit } from '../../core/family/habits';
import { daysLeft, dosesOn, lowStock, MEAL_TEXT, normalizeTimes, type Medication } from '../../core/family/meds';
import { WEEKDAYS } from '../../core/family/recurrence';
import { toast } from '../../lib/ui-store';
import { markDose, newMedication } from '../../state/butler';
import { forgetHabit, useHabits } from '../../state/habits';
import { memberName, useApp, useMe } from '../../state/store';

const STATE_TEXT = { taken: 'Đã uống', skipped: 'Bỏ qua', due: 'Đến giờ', missed: 'Quá giờ', later: 'Chưa tới giờ' } as const;

export function FMeds() {
  const me = useMe();
  const meds = useApp((s) => s.medications);
  const logs = useApp((s) => s.medLogs);
  const members = useApp((s) => s.members);
  const visible = meds.filter((m) => m.memberId === me.id || m.caregivers.includes(me.id) || me.role === 'admin');
  const doses = dosesOn(visible, logs, new Date());
  const people = [...new Set(visible.map((m) => m.memberId))];
  return (
    <Phone tabs>
      <TopBar back backTo="/f" />
      <Header title="Nhắc uống thuốc" sub="Đến giờ HeartOS nhắc người uống; quá 30 phút chưa uống thì báo người thân được chọn." />
      {visible.length === 0 && <div className="card sand"><p>Chưa có thuốc nào. Thêm thuốc theo đơn của bác sĩ để HeartOS nhắc đúng giờ.</p></div>}
      {people.map((pid) => (
        <div key={pid} className="card stack">
          <h3 style={{ margin: 0 }}>{memberName(pid, members)}, hôm nay</h3>
          {doses.filter((d) => d.med.memberId === pid).map((d) => (
            <div key={`${d.med.id}-${d.due}`} className={'dose ' + d.state}>
              <span className="dose-time">{d.time}</span>
              <span className="dose-text">
                <b>{d.med.name}</b>
                <small>{d.med.dose}{MEAL_TEXT[d.med.meal] ? `, ${MEAL_TEXT[d.med.meal]}` : ''}</small>
              </span>
              {d.state === 'due' || d.state === 'missed' ? (
                <button className="btn xs" onClick={() => { markDose(d.med, d.due, 'taken', me.id); toast(`Đã ghi ${d.med.name} lúc ${d.time}.`); }}>
                  <Check size={14} /> Đã uống
                </button>
              ) : (
                <span className={'dose-state ' + d.state}>{STATE_TEXT[d.state]}</span>
              )}
            </div>
          ))}
          {!doses.some((d) => d.med.memberId === pid) && <p className="small muted" style={{ margin: 0 }}>Hôm nay không có liều nào.</p>}
        </div>
      ))}
      {visible.map((m) => (
        <Row key={m.id} icon={<Pill size={18} />} tileTone={lowStock(m) ? 'rose' : 'peach'} title={m.name} meta={`${memberName(m.memberId, members)}, ${m.times.join(', ')}${m.weekdays ? `, ${m.weekdays.map((w) => WEEKDAYS[w]).join(', ')}` : ', hằng ngày'}${m.stock !== null ? `, còn ${m.stock} (khoảng ${daysLeft(m)} ngày)` : ''}${m.active ? '' : ', đang tạm dừng'}`} to={`/f/med-new?id=${m.id}`} />
      ))}
      <Link to="/f/med-new" className="btn"><Plus size={18} /> Thêm thuốc</Link>
      <p className="small muted" style={{ margin: 0 }}>HeartOS chỉ nhắc theo lịch gia đình nhập, không thay lời khuyên của bác sĩ. Quên một liều thì không uống bù gấp đôi khi chưa hỏi bác sĩ.</p>
    </Phone>
  );
}

export function FMedNew() {
  const me = useMe();
  const [params] = useSearchParams();
  const meds = useApp((s) => s.medications);
  const members = useApp((s) => s.members).filter((m) => m.role !== 'carer');
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const editing = meds.find((m) => m.id === params.get('id'));
  const [memberId, setMemberId] = useState(editing?.memberId ?? members.find((m) => m.mode === 'simple')?.id ?? me.id);
  const [name, setName] = useState(editing?.name ?? '');
  const [dose, setDose] = useState(editing?.dose ?? '1 viên');
  const [times, setTimes] = useState<string[]>(editing?.times ?? ['07:00']);
  const [newTime, setNewTime] = useState('19:00');
  const [meal, setMeal] = useState<Medication['meal']>(editing?.meal ?? 'after');
  const [daily, setDaily] = useState(!editing?.weekdays);
  const [weekdays, setWeekdays] = useState<string[]>((editing?.weekdays ?? [1, 2, 3, 4, 5]).map(String));
  const [stock, setStock] = useState(editing?.stock?.toString() ?? '');
  const [caregivers, setCaregivers] = useState<string[]>(editing?.caregivers ?? members.filter((m) => m.role === 'admin' && m.id !== memberId).map((m) => m.id));
  const [note, setNote] = useState(editing?.note ?? '');
  const [active, setActive] = useState(editing?.active ?? true);
  const valid = name.trim() && normalizeTimes(times).length;
  const save = () => {
    const data = { memberId, name: name.trim(), dose: dose.trim() || '1 viên', times: normalizeTimes(times), weekdays: daily ? null : weekdays.map(Number).sort(), meal, note: note.trim(), stock: stock.trim() ? Math.max(0, Number(stock)) : null, perDose: Math.max(1, parseInt(dose, 10) || 1), caregivers: caregivers.filter((c) => c !== memberId), createdBy: me.id };
    if (editing) set((s) => void Object.assign(s.medications.find((m) => m.id === editing.id)!, data, { active }));
    else newMedication(data);
    toast(editing ? 'Đã lưu thay đổi.' : `Đã thêm ${data.name}. HeartOS sẽ nhắc lúc ${data.times.join(', ')}.`);
    nav('/f/meds');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/meds" />
      <Header title={editing ? 'Sửa thuốc' : 'Thêm thuốc'} sub="Nhập đúng theo đơn của bác sĩ." />
      <Field label="Người uống">
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Tên thuốc">
        <input className="input" placeholder="Ví dụ: Amlodipine 5 mg" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Liều mỗi lần">
        <input className="input" value={dose} onChange={(e) => setDose(e.target.value)} />
      </Field>
      <div className="card stack">
        <b className="small">Giờ uống</b>
        <div className="hstack wrap">
          {normalizeTimes(times).map((t) => (
            <span key={t} className="badge" style={{ fontSize: 13, padding: '5px 10px' }}>
              {t}
              <button className="iconbtn" style={{ width: 22, height: 22, border: 0, background: 'transparent' }} aria-label={`Bỏ giờ ${t}`} onClick={() => setTimes(times.filter((x) => x.padStart(5, '0') !== t))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="hstack">
          <input className="input" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ flex: 1 }} />
          <button className="btn sm secondary" onClick={() => setTimes([...times, newTime])}><Plus size={14} /> Thêm giờ</button>
        </div>
      </div>
      <Field label="Uống khi nào">
        <Seg value={meal} onChange={setMeal} options={[{ value: 'before', label: 'Trước ăn' }, { value: 'after', label: 'Sau ăn' }, { value: 'any', label: 'Lúc nào cũng được' }]} />
      </Field>
      <Row title="Uống mỗi ngày" chevron={false} right={<Switch label="Uống mỗi ngày" checked={daily} onChange={setDaily} />} />
      {!daily && <Chips options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} value={weekdays} onChange={setWeekdays} />}
      <Field label="Số viên còn lại (để nhắc mua thêm)">
        <input className="input" inputMode="numeric" placeholder="Bỏ trống nếu không theo dõi" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Field label="Báo người thân khi quá giờ chưa uống">
        <Chips options={members.filter((m) => m.id !== memberId).map((m) => ({ value: m.id, label: m.name }))} value={caregivers} onChange={setCaregivers} />
      </Field>
      <Field label="Ghi chú">
        <input className="input" placeholder="Ví dụ: uống với nhiều nước" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {editing && <Row title="Đang dùng thuốc này" chevron={false} right={<Switch label="Đang dùng" checked={active} onChange={setActive} />} />}
      <button className="btn" disabled={!valid} onClick={save}><Check size={18} /> {editing ? 'Lưu thay đổi' : 'Thêm và bật nhắc'}</button>
      {editing && (
        <button className="btn ghost" onClick={() => { set((s) => void (s.medications = s.medications.filter((m) => m.id !== editing.id))); toast('Đã xóa thuốc.'); nav('/f/meds'); }}>
          <Trash2 size={16} /> Xóa thuốc này
        </button>
      )}
    </Phone>
  );
}

export function FHabits() {
  const me = useMe();
  const { habits, enabled } = useHabits(me.id);
  const set = useApp((s) => s.set);
  const mine = habits.filter((h) => h.who === me.id || (me.role === 'admin' && h.kind === 'device'));
  return (
    <Phone tabs>
      <TopBar back backTo="/f/ai-settings" />
      <Header title="Thói quen trợ lý đã học" sub="Trợ lý tự để ý việc lặp lại để nhắc đúng lúc và đề nghị tự động. Dữ liệu chỉ nằm trên điện thoại này, đã mã hóa." />
      <Row icon={<Brain size={18} />} title="Tự học thói quen" meta={enabled ? 'Đang bật' : 'Đang tắt, trợ lý không ghi thêm'} chevron={false} right={<Switch label="Tự học thói quen" checked={enabled} onChange={(v) => set((s) => void (s.habits.enabled = v))} />} />
      {mine.length === 0 && <div className="card flat"><p>Trợ lý chưa thấy thói quen nào rõ ràng. Cần một việc lặp lại vào khoảng cùng giờ ít nhất 3 ngày.</p></div>}
      {mine.map((h) => (
        <div key={h.id} className="card stack">
          <div className="hstack">
            <b style={{ flex: 1 }}>{memberName(h.who)} {describeHabit(h)}</b>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Thấy {h.days} lần gần đây, độ tin {Math.round(h.confidence * 100)}%, gần nhất lúc {clockOf(new Date(h.lastAt).getHours() * 60 + new Date(h.lastAt).getMinutes())}.</p>
          <button className="btn xs ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { forgetHabit(h.id); toast('Trợ lý đã quên thói quen này.'); }}>
            <Trash2 size={14} /> Quên thói quen này
          </button>
        </div>
      ))}
      {mine.length > 0 && (
        <button className="btn ghost" onClick={() => { set((s) => { s.habits.events = []; s.habits.feedback = {}; }); toast('Đã xóa toàn bộ dữ liệu thói quen.'); }}>
          <Trash2 size={16} /> Xóa toàn bộ dữ liệu thói quen
        </button>
      )}
    </Phone>
  );
}
