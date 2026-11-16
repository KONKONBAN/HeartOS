import { Bot, CalendarHeart, Check, Siren, ChevronRight, Home as HomeIcon, Languages, Lightbulb, ListChecks, MapPin, MessageSquarePlus, Mic, MicOff, Navigation, Phone as PhoneIcon, Send, Settings2, Sparkles, Square, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { RichText } from '../../components/RichText';
import { Badge, Field, Header, Row, Seg, TopBar } from '../../components/ui';
import { CLAUDE_MODELS, PROVIDER_NAME } from '../../core/ai/types';
import { speak, useSpeechInput, useVoiceSupport } from '../../lib/media';
import { nextOccurrence } from '../../core/family/recurrence';
import { hhmm, isToday } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { aiReady, isNeutral, providerOrder } from '../../state/aiConfig';
import { approveAction, askAssistant, dismissAction, startNewConversation, stopAssistant, toolLabel, useAiLive } from '../../state/assistant';
import { useHome } from '../../state/services';
import { greetName, useApp, useMe } from '../../state/store';
import type { AiAction, ChatMsg, Member } from '../../state/types';

const KIN = ['mẹ', 'má', 'ba', 'bố', 'cha', 'ông', 'bà', 'ngoại', 'nội', 'cô', 'dì', 'chú', 'bác'];

export function modelName(provider?: string, model?: string, managed?: boolean) {
  if (managed && provider !== 'local' && provider) return 'Trợ lý HeartOS';
  if (provider === 'claude') return CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model ?? 'Claude';
  if (provider === 'openai') return `ChatGPT, ${model ?? ''}`.replace(/, $/, '');
  return 'Mẫu trên thiết bị';
}

const ACTION_ICON: Record<AiAction['kind'], ReactNode> = {
  task: <ListChecks size={18} />,
  device: <Lightbulb size={18} />,
  scene: <Sparkles size={18} />,
  route: <Navigation size={18} />,
  call: <PhoneIcon size={18} />,
  invite: <MessageSquarePlus size={18} />,
  open: <ChevronRight size={18} />,
};

function ActionCard({ msg, a, me, simple }: { msg: ChatMsg; a: AiAction; me: Member; simple?: boolean }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (a.kind === 'open') {
    return (
      <button className={'btn ' + (simple ? '' : 'sm secondary')} onClick={() => void approveAction(msg.id, a.id, me.id, nav)}>
        {a.title} <ChevronRight size={16} />
      </button>
    );
  }
  const done = a.status !== 'pending';
  return (
    <div className={'aicard' + (done ? ` ${a.status}` : '')} data-kind={a.kind}>
      <div className="aicard-head">
        <span className="tile">{ACTION_ICON[a.kind]}</span>
        <span className="aicard-text">
          <span className="t">{a.title}</span>
          {a.detail && <span className="m">{a.detail}</span>}
        </span>
      </div>
      {done ? (
        <div className={'aicard-status ' + a.status}>
          {a.status === 'done' ? <Check size={15} /> : a.status === 'failed' ? <X size={15} /> : null}
          {a.note ?? (a.status === 'done' ? 'Đã duyệt' : a.status === 'failed' ? 'Không thực hiện được' : 'Đã bỏ qua')}
        </div>
      ) : (
        <div className="aicard-actions">
          <button
            className={'btn ' + (simple ? '' : 'sm')}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await approveAction(msg.id, a.id, me.id, nav);
              setBusy(false);
            }}
          >
            <Check size={16} /> {a.kind === 'route' ? 'Mở chỉ đường' : a.kind === 'call' ? 'Gọi ngay' : 'Duyệt'}
          </button>
          <button className={'btn ghost ' + (simple ? '' : 'sm')} disabled={busy} onClick={() => dismissAction(msg.id, a.id)}>
            Bỏ qua
          </button>
        </div>
      )}
    </div>
  );
}

function Bubble({ m, me, simple, voiceLang, managed }: { m: ChatMsg; me: Member; simple?: boolean; voiceLang: string; managed: boolean }) {
  if (m.from === 'user') {
    return (
      <div className="bubble user">
        <p>{m.text}</p>
      </div>
    );
  }
  return (
    <div className={'bubble bot' + (m.error ? ' error' : '')}>
      <RichText text={m.text} />
      {m.action && (
        <Link to={m.action.to} className="btn sm secondary" style={{ marginTop: 10 }}>
          {m.action.label}
        </Link>
      )}
      {m.actions && m.actions.length > 0 && (
        <div className="aicards">
          {m.actions.map((a) => (
            <ActionCard key={a.id} msg={m} a={a} me={me} simple={simple} />
          ))}
        </div>
      )}
      {m.notice && <p className="bubble-notice">{m.notice}</p>}
      <div className="bubble-meta">
        <span>{m.error ? '' : modelName(m.provider, m.model, managed)}</span>
        <button className="iconbtn" aria-label="Đọc to câu trả lời" onClick={() => speak(m.text.replace(/\*\*/g, ''), voiceLang)}>
          <Volume2 size={15} />
        </button>
      </div>
    </div>
  );
}

function useSuggestions(me: Member, simple?: boolean) {
  const members = useApp((s) => s.members);
  const hasHome = useApp((s) => !!s.household?.home);
  const home = useHome();
  const devices = home.s.devices.filter((d) => d.kind === 'light' && d.paired).length;
  const others = members.filter((m) => m.id !== me.id && m.role !== 'carer');
  const elder = others.find((m) => m.mode === 'simple');
  const callName = (m: Member) => (KIN.includes(m.address) ? m.address : m.name);
  return useMemo(() => {
    if (simple) {
      const child = others.find((m) => m.phone && m.role !== 'child');
      return [
        { icon: <ListChecks size={20} />, text: 'Hôm nay tôi có việc gì?' },
        ...(hasHome ? [{ icon: <HomeIcon size={20} />, text: 'Chỉ đường cho tôi về nhà' }] : []),
        ...(child ? [{ icon: <PhoneIcon size={20} />, text: `Gọi cho ${child.name}` }] : []),
        { icon: <MapPin size={20} />, text: 'Nhà thuốc gần đây ở đâu?' },
      ];
    }
    return [
      { icon: <ListChecks size={18} />, text: 'Tuần này nhà mình có việc gì?' },
      ...(devices ? [{ icon: <Lightbulb size={18} />, text: 'Tắt hết đèn trước khi đi ngủ' }] : []),
      { icon: <Navigation size={18} />, text: 'Đi xe máy tới bệnh viện gần nhất mất bao lâu?' },
      ...(elder ? [{ icon: <PhoneIcon size={18} />, text: `Nhắc mình gọi cho ${callName(elder)} lúc 19:30` }] : []),
      ...(others.length ? [{ icon: <MessageSquarePlus size={18} />, text: 'Soạn lời mời cả nhà ăn cơm tối nay' }] : []),
    ];
  }, [simple, others.length, hasHome, devices, elder?.id]);
}

function TodayBrief({ me, simple, onAsk }: { me: Member; simple?: boolean; onAsk: (q: string) => void }) {
  const tasks = useApp((s) => s.tasks);
  const rituals = useApp((s) => s.rituals);
  const members = useApp((s) => s.members);
  const home = useHome();
  const nav = useNavigate();
  const now = Date.now();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const mine = tasks.filter((t) => t.status !== 'done' && (t.assignee === me.id || t.target === me.id) && t.remindAt <= end.getTime()).sort((a, b) => a.remindAt - b.remindAt);
  const overdue = mine.filter((t) => t.remindAt < now).length;
  const next = rituals.map((r) => ({ r, at: nextOccurrence(r.recurrence, new Date(), r.skip).getTime() })).filter((x) => x.r.participants.includes(me.id) && x.at - now < 36 * 3600_000).sort((a, b) => a.at - b.at)[0];
  const incidents = home.openIncidents();
  const lastCall = (id: string) => tasks.filter((t) => t.kind === 'call' && t.target === id && t.status === 'done').reduce((m, t) => Math.max(m, t.doneAt ?? 0), 0);
  const elder = members.find((m) => m.id !== me.id && m.mode === 'simple' && m.phone && now - lastCall(m.id) > 3 * 86400_000);
  const items: { icon: ReactNode; text: string; act: () => void; tone?: string }[] = [];
  if (incidents.length) items.push({ icon: <Siren size={18} />, text: `${incidents.length} sự cố đang mở: ${incidents[0].title}`, act: () => nav(simple ? '/s/help' : `/f/incident/${incidents[0].id}`), tone: 'rose' });
  if (mine.length) items.push({ icon: <ListChecks size={18} />, text: `${mine.length} việc hôm nay${overdue ? `, ${overdue} việc đã quá giờ` : ''}: ${mine[0].title} lúc ${hhmm(mine[0].remindAt)}`, act: () => onAsk('Hôm nay tôi có những việc gì, việc nào nên làm trước?') });
  if (next) items.push({ icon: <CalendarHeart size={18} />, text: `${next.r.name} lúc ${hhmm(next.at)} ${isToday(next.at) ? 'hôm nay' : 'ngày mai'}`, act: () => onAsk(`Giúp tôi chuẩn bị cho ${next.r.name}`) });
  if (elder) items.push({ icon: <PhoneIcon size={18} />, text: `Đã lâu chưa gọi hỏi thăm ${elder.name}`, act: () => onAsk(`Nhắc tôi gọi cho ${elder.name} tối nay`) });
  if (!items.length) return null;
  return (
    <div className={'brief' + (simple ? ' big' : '')}>
      <div className="brief-head">Hôm nay của {greetName(me)}</div>
      {items.map((it, i) => (
        <button key={i} className={'brief-row' + (it.tone ? ` ${it.tone}` : '')} onClick={it.act}>
          <span className="tile">{it.icon}</span>
          <span>{it.text}</span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

export function ChatView({ simple }: { simple?: boolean }) {
  const me = useMe();
  const chat = useApp((s) => s.chat);
  const prefs = useApp((s) => s.prefs);
  const live = useAiLive();
  const ready = aiReady(prefs.ai);
  const managed = isNeutral(prefs.ai);
  const order = providerOrder(prefs.ai);
  const [text, setText] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('text') ?? '');
  const sp = useSpeechInput(prefs.voiceLang);
  const end = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const suggestions = useSuggestions(me, simple);
  const mine = chat.filter((m) => !m.by || m.by === me.id);
  const busy = live.busy && live.owner === me.id;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mine.length, live.text.length > 0, busy]);
  useEffect(() => {
    if (sp.text) setText(sp.text);
  }, [sp.text]);
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !sp.listening && sp.text.trim() && simple) void send(sp.text);
    wasListening.current = sp.listening;
  }, [sp.listening]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(140, el.scrollHeight) + 'px';
  }, [text]);
  const send = async (t = text) => {
    const v = t.trim();
    if (!v || busy) return;
    setText('');
    sp.setText('');
    await askAssistant(v, me.id, { simple });
  };
  const label = managed ? 'trí tuệ nhân tạo' : order.length ? `${PROVIDER_NAME[order[0]]}${order[1] ? `, dự phòng ${PROVIDER_NAME[order[1]]}` : ''}` : 'Mẫu trên thiết bị';
  return (
    <>
      {mine.length === 0 && !busy && (
        <div className="chat-empty">
          <span className="chat-orb">
            <Bot size={simple ? 34 : 28} />
          </span>
          <h2>{`Chào ${greetName(me)}, mình giúp gì cho cả nhà?`}</h2>
          <p>{ready ? (managed ? 'Hỏi tự do bằng chữ hoặc giọng nói.' : `Trợ lý dùng ${label}. Hỏi tự do bằng chữ hoặc giọng nói.`) : 'Trợ lý đang dùng mẫu trên thiết bị, hiểu các câu đơn giản.'}</p>
          <TodayBrief me={me} simple={simple} onAsk={(q) => void send(q)} />
          {!ready && !simple && !managed && me.role === 'admin' && (
            <Link to="/f/ai-settings" className="row" style={{ marginTop: 6 }}>
              <span className="tile sand">
                <Sparkles size={18} />
              </span>
              <span>
                <div className="t">Bật trợ lý AI nâng cao</div>
                <div className="m">Để trợ lý hiểu mọi câu hỏi, xem lịch, tìm đường và đề xuất việc cho cả nhà</div>
              </span>
              <ChevronRight size={18} className="chev" />
            </Link>
          )}
          <div className="suggest">
            {suggestions.map((s) => (
              <button key={s.text} className="suggest-item" onClick={() => void send(s.text)}>
                <span className="tile">{s.icon}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat-log" aria-live="polite">
        {mine.map((m) => (
          <Bubble key={m.id} m={m} me={me} simple={simple} voiceLang={prefs.voiceLang} managed={managed} />
        ))}
        {busy && (
          <div className="bubble bot live">
            {live.text ? <RichText text={live.text} className="streaming" /> : <p className="thinking">{live.tool ? toolLabel(live.tool) : live.provider && !managed ? `${PROVIDER_NAME[live.provider]} đang suy nghĩ` : 'Trợ lý đang suy nghĩ'}</p>}
            {live.text && live.tool && <p className="thinking small">{toolLabel(live.tool)}</p>}
          </div>
        )}
        <div ref={end} />
      </div>
      {sp.error && <p className="small danger-text" style={{ margin: 0 }}>{sp.error}</p>}
      <div className={'composer' + (simple ? ' big' : '')}>
        <button className={'iconbtn round' + (sp.listening ? ' on' : '')} aria-label={sp.listening ? 'Dừng nghe' : 'Nói với trợ lý'} onClick={sp.listening ? sp.stop : sp.start}>
          {sp.listening ? <MicOff size={simple ? 24 : 20} /> : <Mic size={simple ? 24 : 20} />}
        </button>
        <textarea
          ref={area}
          rows={1}
          className="composer-input"
          placeholder={sp.listening ? 'Đang nghe' : simple ? 'Nói hoặc gõ câu hỏi' : 'Nhắn cho trợ lý'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <button className="iconbtn round dark" aria-label="Dừng trả lời" onClick={stopAssistant}>
            <Square size={simple ? 20 : 16} />
          </button>
        ) : (
          <button className="iconbtn round dark" aria-label="Gửi" disabled={!text.trim()} onClick={() => void send()}>
            <Send size={simple ? 22 : 18} />
          </button>
        )}
      </div>
    </>
  );
}

export function FAi() {
  const me = useMe();
  const prefs = useApp((s) => s.prefs);
  const order = providerOrder(prefs.ai);
  const hasChat = useApp((s) => s.chat.some((m) => !m.by || m.by === me.id));
  return (
    <Phone tabs>
      <TopBar
        back
        backTo="/f"
        right={
          <div className="hstack">
            {hasChat && (
              <button className="iconbtn" aria-label="Cuộc trò chuyện mới" onClick={() => startNewConversation(me.id)}>
                <MessageSquarePlus size={20} />
              </button>
            )}
            <Link to="/f/ai-settings" className="iconbtn" aria-label="Cài đặt trợ lý AI">
              <Settings2 size={20} />
            </Link>
          </div>
        }
      />
      <div className="chat-title">
        <h1 className="h1" style={{ fontSize: 26 }}>Trợ lý HeartOS</h1>
        <Badge tone={order.length ? 'dark' : 'line'}>{order.length ? modelName(order[0], order[0] === 'claude' ? prefs.ai.claudeModel : prefs.ai.openaiModel, isNeutral(prefs.ai)) : 'Mẫu trên thiết bị'}</Badge>
      </div>
      <ChatView />
      <p className="small muted" style={{ margin: 0 }}>Trợ lý chỉ đề xuất. Việc, lệnh thiết bị, chỉ đường và cuộc gọi chỉ thực hiện khi bạn bấm duyệt.</p>
    </Phone>
  );
}

export function FLanguage() {
  const prefs = useApp((s) => s.prefs);
  const members = useApp((s) => s.members);
  const set = useApp((s) => s.set);
  const v = useVoiceSupport(prefs.voiceLang);
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title="Ngôn ngữ và giọng đọc" sub="Tùy chọn độc lập theo từng tác vụ." />
      <Row icon={<Languages size={18} />} title="Giao diện" meta="Tiếng Việt, vi-VN" chevron={false} />
      <Field label="Trợ lý trả lời">
        <Seg value={prefs.assistantLang} onChange={(x) => set((s) => void (s.prefs.assistantLang = x))} options={[{ value: 'vi-VN', label: 'Tiếng Việt, vi-VN' }, { value: 'en-US', label: 'English, en-US' }]} />
      </Field>
      {members.filter((m) => m.role !== 'carer').map((m) => (
        <Field key={m.id} label={`Lời mời gửi ${m.name}`}>
          <Seg value={m.lang} onChange={(x) => set((s) => void (s.members.find((y) => y.id === m.id)!.lang = x))} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English, en-US' }]} />
        </Field>
      ))}
      <Field label="Nhận và đọc giọng nói">
        <Seg value={prefs.voiceLang} onChange={(x) => set((s) => void (s.prefs.voiceLang = x))} options={[{ value: 'vi-VN', label: 'vi-VN' }, { value: 'en-US', label: 'en-US' }]} />
      </Field>
      <div className="card flat">
        <p>Đọc to: {v.tts === null ? 'đang kiểm tra' : v.tts ? 'có' : 'không hỗ trợ'}, Nhận dạng giọng nói: {v.stt === null ? 'đang kiểm tra' : v.stt ? 'có' : 'chưa có trên máy'}, Giọng {prefs.voiceLang}: {v.voice === null ? 'đang kiểm tra' : v.voice ? 'đã cài' : 'chưa cài, vào cài đặt giọng đọc của máy để thêm'}.</p>
      </div>
      <button className="btn soft" onClick={() => speak(prefs.voiceLang === 'vi-VN' ? 'Mời cả nhà ăn cơm lúc bảy giờ tối nay.' : 'Dinner with the family at seven tonight.', prefs.voiceLang)}>
        <Volume2 size={18} /> Nghe thử
      </button>
      <Row icon={<Sparkles size={18} />} tileTone="sand" title="Trợ lý AI" meta="Trợ lý thông minh của HeartOS" to="/f/ai-settings" />
      <button className="btn" onClick={() => toast('Đã lưu tùy chọn ngôn ngữ.')}>Lưu tùy chọn</button>
    </Phone>
  );
}

export function FVoice() {
  const prefs = useApp((s) => s.prefs);
  const sp = useSpeechInput(prefs.voiceLang);
  const nav = useNavigate();
  return (
    <Phone tabs>
      <TopBar back backTo="/f/ai" />
      <Header title="Nhập bằng giọng nói" sub="Xem lại phần nhận dạng trước khi gửi cho trợ lý." />
      <div className="card tint center" style={{ padding: 22 }}>
        <button className={'btn' + (sp.listening ? ' danger' : '')} style={{ width: 'auto', margin: '0 auto' }} onClick={sp.listening ? sp.stop : sp.start}>
          {sp.listening ? <MicOff size={20} /> : <Mic size={20} />} {sp.listening ? 'Dừng nghe' : 'Bắt đầu nói'}
        </button>
        <p className="small" style={{ marginTop: 10 }}>{sp.listening ? 'Đang nghe' : prefs.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'English'}</p>
      </div>
      {sp.error && <div className="card rose"><p className="danger-text">{sp.error}</p></div>}
      <Field label="Lời đã nhận dạng">
        <textarea className="input" value={sp.text} onChange={(e) => sp.setText(e.target.value)} placeholder="“Mời cả nhà ăn cơm lúc bảy giờ tối nay.”" />
      </Field>
      <Row tone="tint" icon={<Mic size={18} />} tileTone="white" title="Quyền mic và xử lý" meta="Nhận dạng dùng dịch vụ giọng nói của trình duyệt hoặc hệ điều hành. Bạn sửa được phần chữ trước khi gửi." />
      <button className="btn" disabled={!sp.text.trim()} onClick={() => nav(`/f/ai?text=${encodeURIComponent(sp.text)}`)}>Dùng đoạn chữ này</button>
    </Phone>
  );
}

export function SAi() {
  return (
    <Phone tabs simple>
      <TopBar back backTo="/s" />
      <div className="chat-title">
        <h1 className="h1" style={{ fontSize: 28 }}>Hỏi trợ lý</h1>
      </div>
      <ChatView simple />
    </Phone>
  );
}
