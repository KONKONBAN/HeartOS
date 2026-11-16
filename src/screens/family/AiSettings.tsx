import { Check, ExternalLink, KeyRound, Server, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Field, Header, Row, Seg, Sheet, Switch, TopBar } from '../../components/ui';
import { CLAUDE_MODELS, OPENAI_DEFAULT, OPENAI_PREFERRED, PROVIDER_NAME, rankOpenAiModels, type AiProvider } from '../../core/ai/types';
import { toast } from '../../lib/ui-store';
import { BUILD_GATEWAY, isManaged, providerOrder, refreshGateway, testGateway } from '../../state/aiConfig';
import { hasEmbedded } from '../../state/embedded';
import { testProvider } from '../../state/assistant';
import { useApp, useMe } from '../../state/store';
import type { AiPrefs } from '../../state/types';

type Test = { ok: true; models: string[] } | { ok: false; error: string } | null;

function KeyCard({ p }: { p: AiProvider }) {
  const ai = useApp((s) => s.prefs.ai);
  const set = useApp((s) => s.set);
  const field = p === 'claude' ? 'claudeKey' : 'openaiKey';
  const modelField = p === 'claude' ? 'claudeModel' : 'openaiModel';
  const saved = ai[field];
  const [key, setKey] = useState(saved);
  const [test, setTest] = useState<Test>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => setKey(saved), [saved]);
  const patch = (fn: (a: AiPrefs) => void) => set((s) => fn(s.prefs.ai));
  const available = test?.ok ? test.models : null;
  const openaiList = available ? rankOpenAiModels(available) : OPENAI_PREFERRED.slice(0, 8);
  const models = p === 'claude' ? CLAUDE_MODELS.map((m) => ({ id: m.id, label: `${m.label}, ${m.note.toLowerCase()}`, off: !!available && !available.includes(m.id) })) : openaiList.map((id) => ({ id, label: id === OPENAI_DEFAULT ? `${id}, mặc định` : id, off: false }));
  const current = ai[modelField];
  const run = async () => {
    const k = key.trim();
    if (!k) return;
    patch((a) => {
      a[field] = k;
    });
    setTesting(true);
    setTest(null);
    const r = await testProvider(p, k);
    setTesting(false);
    setTest(r);
    if (r.ok) {
      if (p === 'openai') {
        const ranked = rankOpenAiModels(r.models);
        if (ranked.length && !ranked.includes(current)) patch((a) => void (a.openaiModel = ranked[0]));
      } else if (!r.models.includes(current)) {
        const first = CLAUDE_MODELS.find((m) => r.models.includes(m.id));
        if (first) patch((a) => void (a.claudeModel = first.id));
      }
      patch((a) => {
        a.enabled = true;
      });
      toast(`Khóa ${PROVIDER_NAME[p]} dùng được.`);
    }
  };
  return (
    <div className="card stack" data-provider={p}>
      <div className="hstack">
        <span className="tile sand">
          <KeyRound size={18} />
        </span>
        <h3 style={{ margin: 0, flex: 1 }}>{p === 'claude' ? 'Claude của Anthropic' : 'ChatGPT của OpenAI'}</h3>
        {saved && <span className="badge">Đã lưu khóa</span>}
      </div>
      <Field label={p === 'claude' ? 'Khóa API Anthropic' : 'Khóa API OpenAI'}>
        <input
          className="input mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={p === 'claude' ? 'sk-ant-' : 'sk-'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => key.trim() !== saved && patch((a) => void (a[field] = key.trim()))}
        />
      </Field>
      <Field label="Mô hình">
        <select className="input" value={current} onChange={(e) => patch((a) => void (a[modelField] = e.target.value))}>
          {!models.some((m) => m.id === current) && <option value={current}>{current}</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={m.off}>
              {m.label}
              {m.off ? ' (tài khoản chưa có)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="hstack wrap">
        <button className="btn sm secondary" style={{ width: 'auto' }} disabled={!key.trim() || testing} onClick={() => void run()}>
          {testing ? 'Đang kiểm tra' : 'Kiểm tra khóa'}
        </button>
        {saved && (
          <button
            className="btn sm ghost"
            style={{ width: 'auto' }}
            onClick={() => {
              patch((a) => void (a[field] = ''));
              setKey('');
              setTest(null);
            }}
          >
            <Trash2 size={14} /> Xóa khóa
          </button>
        )}
        <a className="btn sm ghost" style={{ width: 'auto' }} href={p === 'claude' ? 'https://console.anthropic.com/settings/keys' : 'https://platform.openai.com/api-keys'} target="_blank" rel="noreferrer">
          Lấy khóa <ExternalLink size={14} />
        </a>
      </div>
      {test && (
        <p className="small" style={{ margin: 0, color: test.ok ? 'var(--leaf)' : 'var(--rose-ink)' }}>
          {test.ok ? `Khóa hợp lệ. Tài khoản dùng được ${p === 'openai' ? rankOpenAiModels(test.models).length : test.models.filter((m) => m.startsWith('claude')).length} mô hình trò chuyện.` : `Chưa dùng được: ${test.error}`}
        </p>
      )}
    </div>
  );
}

function SharingRows() {
  const ai = useApp((s) => s.prefs.ai);
  const set = useApp((s) => s.set);
  const patch = (fn: (a: AiPrefs) => void) => set((s) => fn(s.prefs.ai));
  return (
    <>
      <div className="section-title">Dữ liệu trợ lý được dùng</div>
      <Row title="Việc chung và lịch" meta="Chỉ những việc, nếp nhà và giờ rảnh mà bạn được xem" chevron={false} right={<Switch label="Việc chung và lịch" checked={ai.shareSchedule} onChange={(v) => patch((a) => void (a.shareSchedule = v))} />} />
      <Row title="Thiết bị và an toàn" meta="Trạng thái đèn, điều hòa, cảm biến, sự cố đang mở" chevron={false} right={<Switch label="Thiết bị và an toàn" checked={ai.shareHome} onChange={(v) => patch((a) => void (a.shareHome = v))} />} />
      <Row title="Vị trí hiện tại" meta="Dùng khi tìm đường hoặc tìm địa điểm gần bạn" chevron={false} right={<Switch label="Vị trí hiện tại" checked={ai.shareLocation} onChange={(v) => patch((a) => void (a.shareLocation = v))} />} />
      <Row title="Đọc to câu trả lời" meta="Giao diện Thân Quen luôn đọc to" chevron={false} right={<Switch label="Đọc to câu trả lời" checked={ai.speak} onChange={(v) => patch((a) => void (a.speak = v))} />} />
    </>
  );
}

function ClearHistory() {
  const set = useApp((s) => s.set);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}>
        <Trash2 size={16} /> Xóa lịch sử trò chuyện
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Xóa lịch sử trò chuyện?">
        <p className="small muted" style={{ margin: 0 }}>Xóa mọi tin nhắn với trợ lý trên điện thoại này. Việc và lệnh đã duyệt vẫn giữ nguyên.</p>
        <button
          className="btn danger"
          onClick={() => {
            set((s) => {
              s.chat = [];
              s.aiConvs = {};
            });
            setOpen(false);
            toast('Đã xóa lịch sử trò chuyện.');
          }}
        >
          Xóa lịch sử
        </button>
        <button className="btn secondary" onClick={() => setOpen(false)}>
          Giữ lại
        </button>
      </Sheet>
    </>
  );
}

export function FAiSettings() {
  const ai = useApp((s) => s.prefs.ai);
  const set = useApp((s) => s.set);
  const me = useMe();
  const managed = isManaged(ai);
  const [status, setStatus] = useState<'checking' | 'ok' | 'off' | string>(managed ? 'checking' : 'off');
  useEffect(() => {
    if (!managed) return;
    refreshGateway(true)
      .then((g) => setStatus(g && (g.engines.claude || g.engines.openai) ? 'ok' : 'off'))
      .catch((e: Error) => setStatus(e.message));
  }, [managed]);
  const ready = providerOrder(ai).length > 0;
  const meta = !ai.enabled ? 'Đang tắt, trợ lý dùng mẫu trên thiết bị' : managed ? (status === 'checking' ? 'Đang kiểm tra kết nối' : status === 'ok' ? 'Đã sẵn sàng' : status === 'off' ? 'Máy chủ trợ lý chưa sẵn sàng' : status) : ready ? 'Đã sẵn sàng' : 'Chưa kích hoạt trên thiết bị này';
  return (
    <Phone tabs>
      <TopBar back backTo="/f/ai" />
      <Header title="Trợ lý AI" sub="Trợ lý thông minh của HeartOS hiểu câu hỏi tự do, xem lịch, tìm đường và đề xuất việc cho cả nhà." />
      <Row icon={<Sparkles size={18} />} title="Bật trợ lý AI" meta={meta} chevron={false} right={<Switch label="Bật trợ lý AI" checked={ai.enabled} onChange={(v) => set((s) => void (s.prefs.ai.enabled = v))} />} />
      {!managed && !ready && <div className="card sand"><p>Trợ lý AI nâng cao chưa được kích hoạt trên thiết bị này. Trong lúc đó trợ lý vẫn hiểu các câu đơn giản như soạn lời mời, nhắc việc, mở SOS. Liên hệ nơi bán HeartOS để được kích hoạt.</p></div>}
      <SharingRows />
      <div className="card flat">
        <div className="hstack" style={{ marginBottom: 6 }}>
          <ShieldCheck size={18} color="var(--leaf)" />
          <h3 style={{ margin: 0 }}>Quyền riêng tư</h3>
        </div>
        <p>Câu hỏi và phần dữ liệu bạn cho phép được mã hóa khi truyền tới máy chủ trợ lý HeartOS và đối tác xử lý trí tuệ nhân tạo đám mây (có thể đặt ở nước ngoài) chỉ để tạo câu trả lời. Trợ lý chỉ thấy dữ liệu mà {me.name} được xem, không thấy ký ức, quỹ chung hay camera. Mọi việc, lệnh thiết bị, chỉ đường và cuộc gọi đều cần bạn bấm duyệt.</p>
      </div>
      <ClearHistory />
    </Phone>
  );
}

export function FAiTech() {
  const ai = useApp((s) => s.prefs.ai);
  const set = useApp((s) => s.set);
  const nav = useNavigate();
  const patch = (fn: (a: AiPrefs) => void) => set((s) => fn(s.prefs.ai));
  const [url, setUrl] = useState(ai.gateway || BUILD_GATEWAY);
  const [code, setCode] = useState(ai.gatewayCode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const order = providerOrder(ai);
  const managed = isManaged(ai);
  const check = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await testGateway(url, code.trim());
      patch((a) => {
        a.gateway = url.trim() === BUILD_GATEWAY ? '' : url.trim().replace(/\/+$/, '');
        a.gatewayCode = code.trim();
        a.gatewayToken = r.token;
        a.enabled = true;
      });
      await refreshGateway(true);
      setResult({ ok: true, text: `Máy chủ hoạt động, ${r.engines} dịch vụ AI, thiết bị đã được cấp mã.` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone tabs>
      <TopBar back backTo="/f/settings" />
      <Header title="Cài đặt kỹ thuật" sub="Dành cho nơi bán và kỹ thuật viên. Khách hàng không cần vào mục này." />
      <div className="card stack">
        <div className="hstack">
          <span className="tile sand">
            <Server size={18} />
          </span>
          <h3 style={{ margin: 0, flex: 1 }}>Máy chủ HeartOS AI</h3>
          {managed && <span className="badge">Đang dùng</span>}
        </div>
        <Field label="Địa chỉ máy chủ">
          <input className="input mono" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://ai.ten-mien-cua-ban.vn" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Mã kích hoạt (nếu máy chủ yêu cầu)">
          <input className="input mono" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <div className="hstack wrap">
          <button className="btn sm secondary" style={{ width: 'auto' }} disabled={!url.trim() || busy} onClick={() => void check()}>
            {busy ? 'Đang kiểm tra' : 'Kiểm tra và lưu'}
          </button>
          {ai.gateway && (
            <button className="btn sm ghost" style={{ width: 'auto' }} onClick={() => { patch((a) => { a.gateway = ''; a.gatewayToken = ''; }); setUrl(BUILD_GATEWAY); setResult(null); }}>
              <Trash2 size={14} /> Bỏ máy chủ riêng
            </button>
          )}
        </div>
        {result && <p className="small" style={{ margin: 0, color: result.ok ? 'var(--leaf)' : 'var(--rose-ink)' }}>{result.text}</p>}
        <p className="small muted" style={{ margin: 0 }}>{BUILD_GATEWAY ? `Bản cài này đã gắn sẵn máy chủ ${BUILD_GATEWAY}.` : 'Bản cài này chưa gắn sẵn máy chủ. Đặt VITE_AI_GATEWAY khi build để khách dùng ngay.'} Khóa API nằm trên máy chủ, không nằm trong ứng dụng.</p>
        {hasEmbedded() && <p className="small" style={{ margin: 0, color: 'var(--sand-ink)' }}>Bản cài này có khóa API gắn sẵn đã mã hóa, dùng khi chưa có máy chủ. Khóa không hiển thị ở đâu trong ứng dụng.</p>}
      </div>
      {!managed && (
        <>
          <div className="section-title">Kết nối trực tiếp bằng khóa API (chỉ để thử)</div>
          <Field label="Dịch vụ chính">
            <Seg value={ai.provider} onChange={(v) => patch((a) => void (a.provider = v))} options={[{ value: 'claude', label: 'Claude' }, { value: 'openai', label: 'ChatGPT' }]} />
          </Field>
          <KeyCard p={ai.provider} />
          <KeyCard p={ai.provider === 'claude' ? 'openai' : 'claude'} />
          <Row icon={<Check size={18} />} title="Tự chuyển khi lỗi" meta="Dùng dịch vụ còn lại nếu đã có khóa" chevron={false} right={<Switch label="Tự chuyển khi lỗi" checked={ai.fallback} onChange={(v) => patch((a) => void (a.fallback = v))} />} />
          <p className="small muted" style={{ margin: 0 }}>Khóa nhập ở đây chỉ lưu, đã mã hóa, trên điện thoại này. Không dùng cách này cho máy bán cho khách.</p>
        </>
      )}
      <Row title="Trạng thái" meta={order.length ? `${managed ? 'Qua máy chủ' : 'Trực tiếp'}: ${order.map((p) => PROVIDER_NAME[p]).join(', dự phòng ')}` : 'Chưa có dịch vụ AI'} chevron={false} />
      <button className="btn secondary" onClick={() => nav('/f/ai-settings')}>Về cài đặt trợ lý</button>
    </Phone>
  );
}
