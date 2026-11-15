import { ChevronRight, Fingerprint, Home, KeyRound, Lock, Mail, Plus, Sun, Ticket, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Field, Header, Row, Steps, TopBar } from '../../components/ui';
import { toast } from '../../lib/ui-store';
import { startExpo } from '../../state/actions';
import { createPasskey, getSentinel, verifyPasskey } from '../../state/services';
import { useApp } from '../../state/store';

export function Welcome() {
  const nav = useNavigate();
  return (
    <Phone>
      <TopBar />
      <h1 className="h1" style={{ fontSize: 38, marginTop: 4 }}>
        Mỗi ngày, gần
        <br />
        nhau hơn.
      </h1>
      <p className="sub">Không gian chung của gia đình, từ một bữa cơm đến lúc cần nhau.</p>
      <div className="hero" style={{ background: 'none' }}>
        <div className="img" style={{ height: 190, backgroundImage: 'url(./media/home-evening.jpg)', borderRadius: 20 }}>
          <span className="badge" style={{ background: '#18382Dcc', color: '#E4EDE1' }}>QUẢN GIA SỐ GIA ĐÌNH</span>
        </div>
      </div>
      <button className="btn" onClick={() => nav('/signin')}>Đăng nhập</button>
      <button className="btn secondary" onClick={() => nav('/register')}>Tạo tài khoản</button>
      <button className="btn ghost" onClick={() => { startExpo(); nav('/mode'); }}>
        <Ticket size={18} /> Trải nghiệm tài khoản Expo
      </button>
      <div className="card flat" style={{ marginTop: 6 }}>
        <p>Nhịp Nhà nối lịch, nghi thức và ký ức để gợi dịp gặp nhau. GenAI hỗ trợ soạn lời mời. Guardian hỗ trợ an toàn. ARGOLET Sentinel bảo vệ quyền và dữ liệu.</p>
      </div>
    </Phone>
  );
}

export function SignIn() {
  const nav = useNavigate();
  const session = useApp((s) => s.session);
  const set = useApp((s) => s.set);
  const [email, setEmail] = useState(session.email);
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const ok = await verifyPasskey(session.passkey?.kind);
    setBusy(false);
    if (!ok) {
      toast('Xác thực khóa truy cập chưa thành công. Thử lại hoặc lấy lại quyền truy cập.', 'warning');
      return;
    }
    set((s) => {
      s.session.signedIn = true;
      s.session.email = email;
      s.session.startedAt = Date.now();
    });
    void getSentinel().log({ kind: 'session', actor: 'Client', summary: `Đăng nhập bằng khóa truy cập (${session.passkey?.kind ?? 'khóa thiết bị'})`, subject: 'u-lan' });
    nav('/choose-home');
  };
  return (
    <Phone>
      <TopBar back backTo="/welcome" />
      <Header title="Đăng nhập" sub="Mở HeartOS bằng khóa truy cập đã tạo trên thiết bị." />
      <Field label="Tài khoản">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username webauthn" />
      </Field>
      <button className="btn" onClick={signIn} disabled={busy || !email.includes('@')}>
        <Fingerprint size={18} /> {busy ? 'Đang xác thực…' : 'Dùng khóa truy cập'}
      </button>
      <Row icon={<KeyRound size={18} />} title="Xác thực trên thiết bị" meta="Trình quản lý thông tin xác thực của hệ thống (passkey) sẽ mở hộp thoại xác thực." tone="tint" />
      <button className="btn ghost" onClick={() => nav('/recover')}>Lấy lại quyền truy cập</button>
      <button className="btn secondary" onClick={() => nav('/register')}>Tạo tài khoản</button>
    </Phone>
  );
}

export function Register() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [key, setKey] = useState<{ id: string; kind: 'webauthn' | 'device-key' } | null>(null);
  const sendCode = () => {
    const c = String(Math.floor(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)));
    setSent(c);
    toast(`Mã xác minh mô phỏng: ${c} (trong bản triển khai thật mã được gửi qua email).`, 'info', 8000);
  };
  const makeKey = async () => {
    const k = await createPasskey(email);
    setKey(k);
    toast(k.kind === 'webauthn' ? 'Đã tạo passkey trên thiết bị.' : 'Thiết bị không hỗ trợ passkey, đã tạo khóa thiết bị thay thế.', 'info');
  };
  const finish = () => {
    set((s) => {
      s.session.signedIn = true;
      s.session.email = email;
      s.session.passkey = { id: key!.id, createdAt: Date.now(), kind: key!.kind };
    });
    nav('/choose-home');
  };
  return (
    <Phone>
      <TopBar back backTo="/welcome" />
      <Header title="Tạo tài khoản" sub="Xác minh liên hệ và thiết lập khóa truy cập để bảo vệ tài khoản." />
      <Field label="Email">
        <input className="input" type="email" placeholder="ban@vidu.example" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {!verified && (
        <div className="hstack">
          <input className="input" style={{ flex: 1, minWidth: 0 }} inputMode="numeric" placeholder="Mã 6 số" value={code} onChange={(e) => setCode(e.target.value)} disabled={!sent} />
          <button className="btn sm secondary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={sendCode} disabled={!email.includes('@')}>{sent ? 'Gửi lại' : 'Gửi mã'}</button>
          <button className="btn sm" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} disabled={!sent || code !== sent} onClick={() => setVerified(true)}>Xác minh</button>
        </div>
      )}
      <div className="card">
        <Steps
          items={[
            { title: 'Xác minh liên hệ', meta: verified ? `Đã xác minh ${email}` : 'Nhập mã gửi tới email', state: verified ? 'done' : 'active' },
            { title: 'Tạo khóa truy cập', meta: key ? (key.kind === 'webauthn' ? 'Passkey trên thiết bị' : 'Khóa thiết bị (trình duyệt không hỗ trợ passkey)') : 'Xác thực với trình quản lý thông tin xác thực', state: key ? 'done' : verified ? 'active' : 'todo' },
            { title: 'Liên kết thiết bị', meta: key ? 'Thiết bị này là thiết bị tin cậy' : 'Chờ tạo khóa riêng', state: key ? 'done' : 'todo' },
          ]}
        />
      </div>
      {!key ? (
        <button className="btn" disabled={!verified} onClick={makeKey}>
          <Fingerprint size={18} /> Tạo khóa truy cập
        </button>
      ) : (
        <button className="btn" onClick={finish}>Tiếp tục</button>
      )}
    </Phone>
  );
}

export function Recover() {
  const nav = useNavigate();
  const email = useApp((s) => s.session.email);
  const [step, setStep] = useState(0);
  const masked = email.replace(/^(.).*(@.*)$/, '$1•••$2');
  return (
    <Phone>
      <TopBar back backTo="/signin" />
      <Header title="Khôi phục truy cập" sub="Yêu cầu sẽ đi qua xác minh danh tính trên kênh khôi phục đã thiết lập." />
      <Row icon={<Mail size={18} />} title="Email khôi phục" meta={masked} />
      <Row icon={<Users size={18} />} title="Xác minh quyền vào hộ" meta="HeartOS kiểm lại tư cách thành viên khi mở phiên mới. Thiết bị cá nhân không giữ bản duy nhất của khả năng phục hồi." tone="tint" />
      {step === 1 && <div className="card sand"><p>Đã gửi liên kết khôi phục mô phỏng. Khi mở liên kết, khóa truy cập cũ bị thu hồi và bạn tạo khóa mới trên thiết bị này.</p></div>}
      <button className="btn" onClick={() => (step === 0 ? setStep(1) : nav('/signin'))}>{step === 0 ? 'Tiếp tục xác minh' : 'Về đăng nhập'}</button>
    </Phone>
  );
}

export function ChooseHome() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const joined = useApp((s) => s.session.householdId);
  const enter = () => {
    set((s) => {
      s.session.householdId = 'nha-an';
    });
    nav('/mode');
  };
  return (
    <Phone>
      <TopBar back backTo="/signin" />
      <Header title="Chọn nhà của bạn" sub="Phiên của bạn đã được xác thực." />
      <Row icon={<Home size={18} />} title="Nhà An" meta="Vai trò của bạn · Thành viên" badge={<Badge>{joined ? 'Đang tham gia' : 'Đang tham gia'}</Badge>} onClick={enter} tileTone="deep" />
      <Row icon={<Plus size={18} />} title="Tạo hộ mới" meta="Thiết lập nhà và mời người thân" to="/create-home" />
      <Row icon={<Ticket size={18} />} title="Tham gia bằng lời mời" meta="Dùng mã mời một lần còn hiệu lực" to="/join-home" />
    </Phone>
  );
}

export function CreateHome() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const [name, setName] = useState('Nhà An');
  return (
    <Phone>
      <TopBar back backTo="/choose-home" />
      <Header title="Tạo hộ gia đình" sub="Người tạo hộ có vai trò quản trị ban đầu." />
      <Field label="Tên hiển thị">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Múi giờ">
        <select className="input" defaultValue="Asia/Ho_Chi_Minh">
          <option value="Asia/Ho_Chi_Minh">Việt Nam · GMT+7</option>
        </select>
      </Field>
      <Row icon={<Lock size={18} />} title="Quyền riêng của từng người" meta="Thành viên tự chọn chia sẻ lịch, ký ức, vị trí và vùng quan sát." tone="tint" />
      <button
        className="btn"
        disabled={!name.trim()}
        onClick={() => {
          set((s) => {
            s.session.householdId = 'nha-an';
            s.session.actingAs = 'u-an';
          });
          nav('/mode');
        }}
      >
        Tạo hộ và chọn chế độ
      </button>
    </Phone>
  );
}

export function JoinHome() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const [code, setCode] = useState('NHA-AN-2026');
  const valid = /^NHA-AN-[A-Z0-9]{4}$/.test(code.trim().toUpperCase());
  return (
    <Phone>
      <TopBar back backTo="/choose-home" />
      <Header title="Lời mời vào nhà" sub="Lời mời từ An tới đúng tài khoản của bạn." />
      <Field label="Mã mời">
        <input className="input mono" style={{ fontSize: 16 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </Field>
      <Row icon={<Home size={18} />} title="Nhà An" meta="Thành viên · Mã dùng một lần" badge={<Badge tone={valid ? undefined : 'danger'}>{valid ? 'Còn hiệu lực' : 'Mã không hợp lệ'}</Badge>} />
      <Row icon={<Sun size={18} />} title="Chọn cách dùng sau khi tham gia" meta="Bạn có thể đổi cách hiển thị trong cài đặt." tone="tint" />
      <button
        className="btn"
        disabled={!valid}
        onClick={() => {
          set((s) => {
            s.session.householdId = 'nha-an';
          });
          nav('/mode');
        }}
      >
        Chấp nhận và tiếp tục
      </button>
    </Phone>
  );
}

export function ModeSelect() {
  const nav = useNavigate();
  const setMode = useApp((s) => s.setMode);
  const pick = (m: 'simple' | 'family') => {
    setMode(m);
    nav(m === 'simple' ? '/s' : '/f');
  };
  return (
    <Phone>
      <TopBar back backTo="/choose-home" />
      <Header title="Chọn cách dùng" sub="Ai đang dùng HeartOS trên điện thoại này?" />
      <button className="row peach" onClick={() => pick('simple')} style={{ padding: 18 }}>
        <span className="tile lg"><Sun size={22} color="#753F30" /></span>
        <span>
          <div className="t" style={{ fontSize: 20 }}>Thân Quen</div>
          <div className="m" style={{ fontSize: 16 }}>Chữ lớn, gọi người thân và xem lịch nhanh.</div>
          <div style={{ marginTop: 6 }}><Badge tone="white">Cho ông bà</Badge></div>
        </span>
        <ChevronRight size={18} className="chev" />
      </button>
      <button className="row tint" onClick={() => pick('family')} style={{ padding: 18 }}>
        <span className="tile lg"><Users size={22} color="#244C3E" /></span>
        <span>
          <div className="t" style={{ fontSize: 20 }}>Gia Đình</div>
          <div className="m" style={{ fontSize: 16 }}>Lịch chung, ký ức, an toàn và cài đặt theo quyền.</div>
          <div style={{ marginTop: 6 }}><Badge tone="white">Cho ba mẹ và con em</Badge></div>
        </span>
        <ChevronRight size={18} className="chev" />
      </button>
      <Row icon={<Lock size={18} />} title="Quyền theo tài khoản" meta="Bạn có thể đổi cách hiển thị trong Cài đặt. Quyền xem và chia sẻ đi theo tài khoản." tone="tint" />
    </Phone>
  );
}
