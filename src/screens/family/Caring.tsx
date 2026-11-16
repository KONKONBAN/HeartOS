import { CalendarHeart, Check, Copy, HeartHandshake, ImagePlus, ListChecks, MessageCircleHeart, Newspaper, Phone as PhoneIcon, Send, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Chips, Field, Header, Seg, Sheet, TopBar } from '../../components/ui';
import { fmtSlot } from '../../core/family/calendar';
import { empathyAI, newsletterAI, rephrase, SITUATIONS, type Check as GenCheck, type Newsletter, type Rephrase, type Situation, type Suggestion } from '../../core/family/caring';
import { fmtDate, nextOccurrence } from '../../core/family/recurrence';
import { randomId } from '../../core/sentinel/encoding';
import { hhmm, isToday } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { addMemory, computeRhythm, createInvitation, smsLink } from '../../state/actions';
import { genConfig } from '../../state/genai';
import { aiReady } from '../../state/aiConfig';
import { adultIds, getApp, memberName, useApp, useMe } from '../../state/store';
import type { Member } from '../../state/types';

function Checks({ checks, ai, fellBack }: { checks: GenCheck[]; ai: boolean; fellBack?: string }) {
  return (
    <div className="card flat">
      <p className="small" style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>{ai ? 'Bản nháp của trợ lý AI, đã qua kiểm tra' : 'Bản nháp từ mẫu trên thiết bị'}</p>
      {checks.map((c) => (
        <p key={c.name} className="small" style={{ margin: '2px 0', color: c.ok ? 'var(--leaf)' : 'var(--rose-ink)' }}>
          {c.ok ? '✓' : '✕'} {c.name}: {c.detail}
        </p>
      ))}
      {fellBack && <p className="small" style={{ margin: '6px 0 0', color: 'var(--sand-ink)' }}>{fellBack}</p>}
    </div>
  );
}

export function FSoften() {
  const me = useMe();
  const members = useApp((s) => s.members).filter((m) => m.id !== me.id);
  const [to, setTo] = useState(members[0]?.id ?? '');
  const [situation, setSituation] = useState<Situation>('disagree');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ data: Rephrase; ai: boolean; checks: GenCheck[]; fellBack?: string } | null>(null);
  const target = members.find((m) => m.id === to);
  const run = async () => {
    if (!target || !text.trim()) return;
    setBusy(true);
    setRes(null);
    const r = await rephrase(await genConfig(), { text: text.trim(), situation, to: { name: target.name, relation: target.relation, address: target.address }, from: { name: me.name, selfRef: me.selfRef } });
    setRes(r);
    setBusy(false);
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/ai" />
      <Header title="Lựa lời" sub="Nói điều khó một cách nhẹ nhàng, đúng xưng hô trong nhà." />
      {members.length === 0 ? (
        <div className="card sand"><p>Nhà chưa có thành viên khác. Thêm người thân để dùng lựa lời.</p></div>
      ) : (
        <>
          <Field label="Nói với">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.relation ? `, ${m.relation}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Tình huống">
            <Seg value={situation} onChange={setSituation} options={SITUATIONS} />
          </Field>
          <Field label="Điều bạn muốn nói">
            <textarea className="input" placeholder="Ví dụ: Con muốn mẹ đi khám sức khỏe định kỳ, đừng ngại tốn tiền" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <button className="btn" disabled={busy || !text.trim()} onClick={() => void run()}>
            <MessageCircleHeart size={18} /> {busy ? 'Trợ lý đang lựa lời' : 'Gợi ý cách nói'}
          </button>
          {res && (
            <>
              {res.data.variants.map((v) => (
                <div key={v.label} className="card stack">
                  <span className="badge">{v.label}</span>
                  <p style={{ color: 'var(--ink)', fontSize: 15 }}>{v.text}</p>
                  <div className="hstack wrap">
                    <button className="btn sm secondary" onClick={() => void navigator.clipboard?.writeText(v.text).then(() => toast('Đã chép câu nói.'))}>
                      <Copy size={15} /> Chép
                    </button>
                    {target?.phone && (
                      <a className="btn sm" href={smsLink([target.phone], v.text)}>
                        <Send size={15} /> Gửi tin nhắn
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <Checks checks={res.checks} ai={res.ai} fellBack={res.fellBack} />
            </>
          )}
          <p className="small muted" style={{ margin: 0 }}>Câu gợi ý chỉ hiện trên máy bạn. Không có gì được gửi đi cho tới khi bạn chép hoặc bấm gửi.</p>
        </>
      )}
    </Phone>
  );
}

function weekFacts(me: Member) {
  const app = getApp();
  const now = Date.now();
  const weekAgo = now - 7 * 86400_000;
  const visible = app.tasks.filter((t) => t.visibleTo.includes(me.id) || t.assignee === me.id || t.createdBy === me.id);
  const when = (ts: number) => `${hhmm(ts)} ${isToday(ts) ? 'hôm nay' : fmtDate(new Date(ts))}`;
  return {
    household: app.household?.name ?? 'Nhà mình',
    author: me.name,
    weekLabel: `tuần ${fmtDate(new Date(weekAgo))} tới ${fmtDate(new Date(now))}`,
    doneTasks: visible.filter((t) => t.status === 'done' && (t.doneAt ?? t.createdAt) >= weekAgo).map((t) => ({ title: t.title, by: memberName(t.assignee) })),
    openTasks: visible.filter((t) => t.status !== 'done' && t.remindAt < now + 7 * 86400_000).map((t) => ({ title: t.title, by: memberName(t.assignee), when: when(t.remindAt) })),
    rituals: app.rituals.map((r) => ({ name: r.name, at: nextOccurrence(r.recurrence, new Date(), r.skip).getTime() })).filter((r) => r.at < now + 8 * 86400_000).map((r) => ({ name: r.name, when: when(r.at) })),
    memories: app.memories.filter((m) => m.createdAt >= weekAgo && (m.narrator === me.id || m.viewers.includes(me.id))).map((m) => ({ title: m.title, by: memberName(m.narrator) })),
    invitations: app.invitations.filter((i) => i.status === 'delivered' || i.status === 'queued').map((i) => ({ occasion: i.occasion, when: fmtSlot(i.slot) })),
  };
}

export function FNewsletter() {
  const me = useMe();
  const members = useApp((s) => s.members);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<Newsletter | null>(null);
  const [meta, setMeta] = useState<{ ai: boolean; checks: GenCheck[]; fellBack?: string } | null>(null);
  const [viewers, setViewers] = useState<string[]>(() => members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => m.id));
  const [saving, setSaving] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await newsletterAI(await genConfig(), weekFacts(me));
    setDoc(r.data);
    setMeta({ ai: r.ai, checks: r.checks, fellBack: r.fellBack });
    setBusy(false);
  };
  const full = (d: Newsletter) => [d.greeting, ...d.sections.map((s) => `${s.heading}\n${s.body}`), d.closing].join('\n\n');
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    const r = await addMemory({ by: me.id, title: doc.title, kind: 'story', transcript: full(doc), caption: doc.greeting, viewers, derivedAllowed: true, retention: '1 năm', share: viewers.length > 0 });
    setSaving(false);
    if (r.ok) {
      toast(viewers.length ? 'Đã lưu bản tin và chia sẻ với người được chọn.' : 'Đã lưu bản tin riêng.');
      nav(`/f/memory/${r.id}`);
    } else toast('Chưa lưu được bản tin.', 'warning');
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f" />
      <Header title="Bản tin gia đình" sub="Trợ lý tóm tắt tuần qua từ việc chung, nếp nhà và ký ức. Bạn xem lại, sửa rồi mới gửi." />
      {!doc && (
        <button className="btn" disabled={busy} onClick={() => void run()}>
          <Newspaper size={18} /> {busy ? 'Trợ lý đang soạn bản tin' : 'Soạn bản tin tuần này'}
        </button>
      )}
      {doc && meta && (
        <>
          <Field label="Tiêu đề">
            <input className="input" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          </Field>
          <Field label="Lời mở đầu">
            <textarea className="input" value={doc.greeting} onChange={(e) => setDoc({ ...doc, greeting: e.target.value })} />
          </Field>
          {doc.sections.map((s, i) => (
            <div key={i} className="card stack">
              <input className="input" value={s.heading} aria-label={`Mục ${i + 1}`} onChange={(e) => setDoc({ ...doc, sections: doc.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })} />
              <textarea className="input" value={s.body} aria-label={`Nội dung mục ${i + 1}`} onChange={(e) => setDoc({ ...doc, sections: doc.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
              <button className="btn xs ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setDoc({ ...doc, sections: doc.sections.filter((_, j) => j !== i) })}>
                <X size={14} /> Bỏ mục này
              </button>
            </div>
          ))}
          <Field label="Lời kết">
            <input className="input" value={doc.closing} onChange={(e) => setDoc({ ...doc, closing: e.target.value })} />
          </Field>
          <Checks checks={meta.checks} ai={meta.ai} fellBack={meta.fellBack} />
          <Field label="Người được xem">
            <Chips options={members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={viewers} onChange={setViewers} />
          </Field>
          <div className="btnrow">
            <button className="btn secondary" disabled={busy} onClick={() => void run()}>Soạn lại</button>
            <button className="btn" disabled={saving} onClick={() => void save()}>
              <Check size={18} /> {viewers.length ? 'Duyệt và chia sẻ' : 'Lưu riêng'}
            </button>
          </div>
        </>
      )}
    </Phone>
  );
}

const cache: { key: string; at: number; list: Suggestion[]; ai: boolean } = { key: '', at: 0, list: [], ai: false };

function careFacts(me: Member, slot: string | null) {
  const app = getApp();
  const now = Date.now();
  const lastCall = (id: string) => {
    const t = app.tasks.filter((x) => x.kind === 'call' && x.target === id && x.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))[0];
    return t?.doneAt ? Math.floor((now - t.doneAt) / 86400_000) : null;
  };
  return {
    now: new Date().toLocaleString('vi-VN', { weekday: 'long', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
    me: { name: me.name, relation: me.relation },
    members: app.members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ name: m.name, relation: m.relation, elder: m.mode === 'simple', lastCallDays: lastCall(m.id), hasPhone: !!m.phone })),
    rituals: app.rituals.map((r) => ({ name: r.name, at: nextOccurrence(r.recurrence, new Date(), r.skip).getTime() })).filter((r) => r.at - now < 7 * 86400_000).map((r) => ({ name: r.name, when: `${hhmm(r.at)} ${fmtDate(new Date(r.at))}`, inDays: Math.floor((r.at - now) / 86400_000) })),
    myOpenTasks: app.tasks.filter((t) => t.assignee === me.id && t.status !== 'done' && t.remindAt < now + 86400_000).map((t) => ({ title: t.title, when: `${hhmm(t.remindAt)} ${isToday(t.remindAt) ? 'hôm nay' : 'ngày mai'}` })),
    sharedSlotToday: slot,
    memoriesThisMonth: app.memories.filter((m) => new Date(m.createdAt).getMonth() === new Date().getMonth() && new Date(m.createdAt).getFullYear() === new Date().getFullYear()).length,
  };
}

const KIND_ICON: Record<Suggestion['kind'], ReactNode> = {
  call: <PhoneIcon size={18} />,
  meal: <UtensilsCrossed size={18} />,
  care: <ListChecks size={18} />,
  ritual: <CalendarHeart size={18} />,
  memory: <ImagePlus size={18} />,
};

export function CareSuggestions() {
  const me = useMe();
  const members = useApp((s) => s.members);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const aiOn = useApp((s) => aiReady(s.prefs.ai));
  const key = `${me.id}:${aiOn}`;
  const [list, setList] = useState<Suggestion[] | null>(cache.key === key && Date.now() - cache.at < 6 * 3600_000 ? cache.list : null);
  const [ai, setAi] = useState(cache.ai);
  const [pick, setPick] = useState<Suggestion | null>(null);
  useEffect(() => {
    if (cache.key === key && Date.now() - cache.at < 6 * 3600_000) {
      setList(cache.list);
      setAi(cache.ai);
      return;
    }
    let alive = true;
    void (async () => {
      const others = adultIds(getApp().members, me.id);
      const rhythm = others.length ? await computeRhythm(me.id, [me.id, ...others]).catch(() => null) : null;
      const r = await empathyAI(await genConfig(), careFacts(me, rhythm?.slot ? fmtSlot(rhythm.slot) : null));
      if (!alive) return;
      Object.assign(cache, { key, at: Date.now(), list: r.data.suggestions, ai: r.ai });
      setList(r.data.suggestions);
      setAi(r.ai);
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  if (!list?.length) return null;
  const memberOf = (s: Suggestion) => members.find((m) => m.name === s.member);
  const act = async (s: Suggestion) => {
    if (s.kind === 'call') return setPick(s);
    if (s.kind === 'meal') {
      const r = await createInvitation({ hostId: me.id, occasion: 'Bữa cơm cùng nhà', recipients: adultIds(getApp().members, me.id) });
      return r.ok ? nav(`/f/draft/${r.id}`) : toast(r.error ?? 'Chưa soạn được lời mời', 'warning');
    }
    if (s.kind === 'ritual') return nav('/f/rituals');
    if (s.kind === 'memory') return nav('/f/memory-new');
    nav('/f/tasks');
  };
  const remind = (m: Member) => {
    const d = new Date();
    d.setHours(19, 30, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    set((s) => void s.tasks.unshift({ id: randomId('t', 6), title: `Gọi hỏi thăm ${m.name}`, place: '', note: 'Gợi ý từ Nhịp Nhà', kind: 'call', assignee: me.id, target: m.id, visibleTo: [me.id], remindAt: d.getTime(), status: 'accepted', createdBy: me.id, createdAt: Date.now() }));
    toast(`Đã đặt nhắc gọi ${m.name} lúc ${hhmm(d.getTime())}.`);
    setPick(null);
  };
  return (
    <div className="care">
      <div className="care-head">
        <HeartHandshake size={18} />
        <span>Gợi ý thấu cảm hôm nay</span>
        {ai && <span className="badge"><Sparkles size={11} /> Trợ lý AI</span>}
      </div>
      {list.map((s, i) => (
        <button key={i} className="care-row" onClick={() => void act(s)}>
          <span className="tile peach">{KIND_ICON[s.kind]}</span>
          <span className="care-text">
            <span className="t">{s.text}</span>
            <span className="m">{s.reason}</span>
          </span>
        </button>
      ))}
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick?.text ?? ''}>
        {pick && memberOf(pick)?.phone && (
          <a className="btn" href={`tel:${memberOf(pick)!.phone}`} onClick={() => setPick(null)}>
            <PhoneIcon size={18} /> Gọi ngay cho {pick.member}
          </a>
        )}
        {pick && memberOf(pick) && (
          <button className="btn secondary" onClick={() => remind(memberOf(pick)!)}>
            Nhắc tôi gọi lúc 19:30
          </button>
        )}
        <Link to="/f/soften" className="btn ghost" onClick={() => setPick(null)}>
          <MessageCircleHeart size={18} /> Nhờ trợ lý lựa lời trước khi gọi
        </Link>
      </Sheet>
    </div>
  );
}
