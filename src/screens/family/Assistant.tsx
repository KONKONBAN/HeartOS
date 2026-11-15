import { KeyRound, Languages, Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Field, Header, Row, Seg, TopBar } from '../../components/ui';
import { speak, useSpeechInput, useVoiceSupport } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { assistantSend } from '../../state/actions';
import { useApp, useMe } from '../../state/store';

export function FAi() {
  const me = useMe();
  const chat = useApp((s) => s.chat);
  const prefs = useApp((s) => s.prefs);
  const [text, setText] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('text') ?? '');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);
  const send = async (t = text) => {
    if (!t.trim()) return;
    setText('');
    setBusy(true);
    await assistantSend(t.trim(), me.id);
    setBusy(false);
  };
  const shown = chat.length ? chat : [];
  return (
    <Phone tabs>
      <TopBar back backTo="/f" />
      <Header title="Trợ lý HeartOS" sub="Soạn lời mời, lựa lời và giữ lại lời kể." />
      <div className="hstack wrap">
        <Badge tone={prefs.claudeEnabled && prefs.claudeKey ? 'dark' : undefined}>{prefs.claudeEnabled && prefs.claudeKey ? `GenAI: Claude (${prefs.claudeModel})` : 'GenAI: mẫu trên thiết bị'}</Badge>
        <Badge tone="line">{prefs.assistantLang === 'vi-VN' ? 'Tiếng Việt' : 'English'}</Badge>
      </div>
      {shown.length === 0 && (
        <div className="stack">
          {['Soạn lời mời ăn cơm cho mẹ và Linh.', 'Nhắc tưới cây trước bữa cơm', 'Giữ lại lời kể của bà'].map((s) => (
            <button key={s} className="row" onClick={() => void send(s)}>
              <span className="tile"><Sparkles size={16} /></span>
              <span className="t" style={{ fontSize: 14 }}>{s}</span>
              <span />
            </button>
          ))}
        </div>
      )}
      {shown.map((m) => (
        <div key={m.id} className={'card' + (m.from === 'user' ? ' peach' : '')} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
          <div className="label" style={{ marginBottom: 4 }}>{m.from === 'user' ? 'Bạn' : 'Trợ lý, Bản nháp'}</div>
          <p style={{ color: 'var(--ink)', fontSize: 14 }}>{m.text}</p>
          {m.action && <Link to={m.action.to} className="btn sm" style={{ marginTop: 10 }}>{m.action.label}</Link>}
        </div>
      ))}
      {busy && <div className="small muted pulse">Trợ lý đang soạn...</div>}
      <div ref={end} />
      <div className="hstack" style={{ marginTop: 'auto' }}>
        <Link to="/f/voice" className="btn secondary sm" aria-label="Nhập giọng nói"><Mic size={18} /></Link>
        <input className="input" placeholder="Nhắn cho trợ lý..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
        <button className="btn sm" onClick={() => void send()} disabled={busy || !text.trim()} aria-label="Gửi"><Send size={18} /></button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Trợ lý chỉ đề xuất; mọi lời mời, việc và lệnh thiết bị cần bạn duyệt. Trợ lý không giữ khóa và không cấp quyền.</p>
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
      <Link to="/f/settings" className="row">
        <span className="tile sand"><KeyRound size={18} /></span>
        <span><div className="t">GenAI nâng cao</div><div className="m">Dùng Claude bằng khóa API của bạn (tùy chọn)</div></span>
        <span />
      </Link>
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
        <p className="small" style={{ marginTop: 10 }}>{sp.listening ? 'Đang nghe...' : prefs.voiceLang === 'vi-VN' ? 'Tiếng Việt' : 'English'}</p>
      </div>
      {sp.error && <div className="card rose"><p className="danger-text">{sp.error}</p></div>}
      <Field label="Lời đã nhận dạng">
        <textarea className="input" value={sp.text} onChange={(e) => sp.setText(e.target.value)} placeholder="“Mời cả nhà ăn cơm lúc bảy giờ tối nay.”" />
      </Field>
      <Row tone="tint" icon={<Mic size={18} />} tileTone="white" title="Quyền mic và xử lý" meta="Nhận dạng dùng dịch vụ giọng nói của trình duyệt/hệ điều hành. Bạn sửa được phần chữ trước khi gửi." />
      <button className="btn" disabled={!sp.text.trim()} onClick={() => nav(`/f/ai?text=${encodeURIComponent(sp.text)}`)}>Dùng đoạn chữ này</button>
    </Phone>
  );
}
