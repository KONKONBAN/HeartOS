import { ChevronRight, Fingerprint, Home, KeyRound, Lock, LogIn, Plus, Sun, Ticket, Users, Wifi } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Field, Header, Row, Steps, TopBar } from '../../components/ui';
import { toast } from '../../lib/ui-store';
import { createHousehold, startExpo } from '../../state/actions';
import { roleName } from '../../core/smarthome/engine';
import { joinHousehold } from '../../state/hublink';
import { createPasskey, getSentinel, verifyPasskey } from '../../state/services';
import { useApp } from '../../state/store';

export function Welcome() {
  const nav = useNavigate();
  const realHome = useApp((s) => !!s.household && !s.household.demo);
  const hasAccount = useApp((s) => !!s.session.passkey);
  const [busy, setBusy] = useState(false);
  const expo = async () => {
    setBusy(true);
    try {
      await startExpo();
      nav('/mode');
    } finally {
      setBusy(false);
    }
  };
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
      {hasAccount ? (
        <button className="btn" onClick={() => nav('/signin')}><LogIn size={18} /> Đăng nhập</button>
      ) : (
        <button className="btn" onClick={() => nav('/register')}>Bắt đầu sử dụng</button>
      )}
      {hasAccount ? <button className="btn secondary" onClick={() => nav('/register')}>Tạo tài khoản mới</button> : <button className="btn secondary" onClick={() => nav('/signin')}>Tôi đã có tài khoản</button>}
      {!realHome && (
        <button className="btn ghost" disabled={busy} onClick={() => void expo()}>
          <Ticket size={18} /> {busy ? 'Đang chuẩn bị nhà mẫu' : 'Trải nghiệm tài khoản Expo'}
        </button>
      )}
      <div className="card flat" style={{ marginTop: 6 }}>
        <p>Nhịp Nhà nối lịch, nghi thức và ký ức để gợi dịp gặp nhau. GenAI hỗ trợ soạn lời mời. Guardian hỗ trợ an toàn. ARGOLET Sentinel bảo vệ quyền và dữ liệu.</p>
      </div>
    </Phone>
  );
}

export function SignIn() {
  const nav = useNavigate();
  const session = useApp((s) => s.session);
  const household = useApp((s) => s.household);
  const set = useApp((s) => s.set);
  const [busy, setBusy] = useState(false);
  if (!session.passkey)
    return (
      <Phone>
        <TopBar back backTo="/welcome" />
        <Header title="Đăng nhập" sub="Tài khoản HeartOS được lưu và bảo vệ bằng khóa truy cập trên chính điện thoại này." />
        <Row tone="tint" icon={<KeyRound size={18} />} tileTone="white" title="Máy này chưa có tài khoản" meta="Tạo tài khoản mới, hoặc tạo tài khoản rồi tham gia hộ của gia đình bằng mã từ hub tại nhà." chevron={false} />
        <button className="btn" onClick={() => nav('/register')}>Tạo tài khoản</button>
      </Phone>
    );
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
      s.session.startedAt = Date.now();
    });
    void getSentinel().log({ kind: 'session', actor: 'Client', summary: `Đăng nhập bằng khóa truy cập (${session.passkey?.kind === 'webauthn' ? 'passkey' : 'khóa thiết bị'})`, subject: session.actingAs || undefined });
    nav(household ? (session.mode ? '/' : '/mode') : '/choose-home');
  };
  return (
    <Phone>
      <TopBar back backTo="/welcome" />
      <Header title="Đăng nhập" sub="Mở HeartOS bằng khóa truy cập đã tạo trên thiết bị." />
      <Row icon={<Users size={18} />} title={session.displayName || 'Tài khoản trên máy này'} meta={session.email || 'Không dùng email'} chevron={false} />
      <button className="btn" onClick={() => void signIn()} disabled={busy}>
        <Fingerprint size={18} /> {busy ? 'Đang xác thực' : 'Dùng khóa truy cập'}
      </button>
      <Row icon={<KeyRound size={18} />} title="Xác thực trên thiết bị" meta="Hệ thống mở hộp thoại passkey hoặc dùng khóa thiết bị không xuất được của HeartOS." tone="tint" chevron={false} />
      <button className="btn ghost" onClick={() => nav('/recover')}>Mất khóa truy cập?</button>
    </Phone>
  );
}

export function Register() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && (!email.trim() || /.+@.+\..+/.test(email.trim()));
  const create = async () => {
    setBusy(true);
    const k = await createPasskey(email.trim() || name.trim());
    setBusy(false);
    set((s) => {
      s.session.signedIn = true;
      s.session.displayName = name.trim();
      s.session.phone = phone.trim();
      s.session.email = email.trim();
      s.session.passkey = { id: k.id, createdAt: Date.now(), kind: k.kind };
      s.session.startedAt = Date.now();
    });
    toast(k.kind === 'webauthn' ? 'Đã tạo passkey trên thiết bị.' : 'Đã tạo khóa thiết bị để bảo vệ tài khoản.', 'info');
    nav('/choose-home');
  };
  return (
    <Phone>
      <TopBar back backTo="/welcome" />
      <Header title="Tạo tài khoản" sub="Tài khoản được bảo vệ bằng khóa truy cập trên điện thoại này." />
      <Field label="Họ và tên">
        <input className="input" autoComplete="name" placeholder="Ví dụ: Nguyễn Văn An" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Số điện thoại">
        <input className="input" type="tel" autoComplete="tel" placeholder="Dùng cho SOS và gọi người thân" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Email (tùy chọn)">
        <input className="input" type="email" autoComplete="email" placeholder="ban@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="card">
        <Steps
          items={[
            { title: 'Thông tin của bạn', meta: valid ? 'Đã đủ thông tin' : 'Nhập họ tên', state: valid ? 'done' : 'active' },
            { title: 'Tạo khóa truy cập', meta: 'Passkey của hệ thống hoặc khóa thiết bị không xuất được', state: valid ? 'active' : 'todo' },
            { title: 'Tạo hoặc tham gia hộ gia đình', meta: 'Bước tiếp theo', state: 'todo' },
          ]}
        />
      </div>
      <button className="btn" disabled={!valid || busy} onClick={() => void create()}>
        <Fingerprint size={18} /> {busy ? 'Đang tạo khóa' : 'Tạo khóa truy cập và tiếp tục'}
      </button>
    </Phone>
  );
}

export function Recover() {
  const nav = useNavigate();
  return (
    <Phone>
      <TopBar back backTo="/signin" />
      <Header title="Mất khóa truy cập" sub="Khóa truy cập chỉ nằm trên điện thoại của bạn, HeartOS không giữ bản sao." />
      <Row icon={<KeyRound size={18} />} title="Tạo lại tài khoản trên máy này" meta="Tạo khóa truy cập mới. Dữ liệu cũ trên máy vẫn được mã hóa và không mở được bằng khóa mới." chevron={false} />
      <Row icon={<Wifi size={18} />} title="Tham gia lại hộ gia đình" meta="Nhờ quản trị hộ tạo mã tham gia trên hub tại nhà. Quyền của khóa cũ được thu hồi khi bạn tham gia lại." tone="tint" chevron={false} />
      <button className="btn" onClick={() => nav('/register')}>Tạo lại tài khoản</button>
    </Phone>
  );
}

export function ChooseHome() {
  const nav = useNavigate();
  const set = useApp((s) => s.set);
  const household = useApp((s) => s.household);
  const me = useApp((s) => s.members.find((m) => m.id === s.session.actingAs));
  const [confirm, setConfirm] = useState(false);
  return (
    <Phone>
      <TopBar back backTo="/welcome" />
      <Header title="Chọn nhà của bạn" sub={household ? 'Hộ gia đình trên điện thoại này.' : 'Tạo hộ cho gia đình bạn, hoặc tham gia hộ đã có bằng mã từ hub tại nhà.'} />
      {household && (
        <Row icon={<Home size={18} />} title={household.name} meta={me ? `Vai trò của bạn: ${me.relation || roleName(me.role)}` : 'Thành viên'} badge={<Badge>Đang tham gia</Badge>} onClick={() => { set((s) => { s.session.householdId = household.id; }); nav('/mode'); }} tileTone="deep" />
      )}
      {household && confirm && (
        <div className="card sand stack">
          <p style={{ margin: 0 }}>Mỗi điện thoại chỉ thuộc một hộ. Tạo hộ mới sẽ rời {household.name} trên máy này.</p>
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setConfirm(false)}>Ở lại</button>
            <button className="btn" onClick={() => nav('/create-home')}>Tạo hộ mới</button>
          </div>
        </div>
      )}
      <Row icon={<Plus size={18} />} title="Tạo hộ mới" meta="Thiết lập nhà, thêm người thân và thiết bị" {...(household ? { onClick: () => setConfirm(true) } : { to: '/create-home' })} />
      <Row icon={<Ticket size={18} />} title="Tham gia bằng mã" meta="Mã do quản trị hộ tạo trên hub tại nhà" to="/join-home" />
    </Phone>
  );
}

export function CreateHome() {
  const nav = useNavigate();
  const session = useApp((s) => s.session);
  const [home, setHome] = useState('');
  const [name, setName] = useState(session.displayName ?? '');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState(session.phone ?? '');
  const [busy, setBusy] = useState(false);
  const valid = home.trim().length >= 2 && name.trim().length >= 2;
  const create = async () => {
    setBusy(true);
    try {
      await createHousehold({ name: home, tz: 'Asia/Ho_Chi_Minh', me: { name, relation, role: 'admin', phone, lang: 'vi', address: 'bạn', selfRef: 'tôi' } });
      toast(`Đã tạo ${home.trim()}. Bạn là quản trị hộ.`, 'info');
      nav('/mode');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <TopBar back backTo="/choose-home" />
      <Header title="Tạo hộ gia đình" sub="Người tạo hộ có vai trò quản trị ban đầu." />
      <Field label="Tên hiển thị của nhà">
        <input className="input" placeholder="Ví dụ: Nhà Nguyễn" value={home} onChange={(e) => setHome(e.target.value)} />
      </Field>
      <Field label="Tên của bạn">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Bạn là ai trong nhà">
        <input className="input" placeholder="Ví dụ: Con trai, Mẹ, Cháu" value={relation} onChange={(e) => setRelation(e.target.value)} />
      </Field>
      <Field label="Số điện thoại">
        <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Múi giờ">
        <select className="input" defaultValue="Asia/Ho_Chi_Minh">
          <option value="Asia/Ho_Chi_Minh">Việt Nam, GMT+7</option>
        </select>
      </Field>
      <Row icon={<Lock size={18} />} title="Quyền riêng của từng người" meta="Thành viên tự chọn chia sẻ lịch, ký ức, vị trí và vùng quan sát." tone="tint" chevron={false} />
      <button className="btn" disabled={!valid || busy} onClick={() => void create()}>
        {busy ? 'Đang tạo hộ' : 'Tạo hộ và chọn cách dùng'}
      </button>
    </Phone>
  );
}

export function JoinHome() {
  const nav = useNavigate();
  const session = useApp((s) => s.session);
  const [hub, setHub] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const join = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await joinHousehold(hub, code, session.displayName ?? '');
      toast(`Đã tham gia ${r.household}. Mã đối chiếu ${r.sas}.`, 'info', 6000);
      nav('/mode');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Phone>
      <TopBar back backTo="/choose-home" />
      <Header title="Tham gia hộ gia đình" sub="Quản trị hộ tạo mã tham gia trên HeartOS Sentinel Admin, chọn đúng thành viên là bạn." />
      <Field label="Địa chỉ hub tại nhà">
        <input className="input mono" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="192.168.1.10:7420" value={hub} onChange={(e) => setHub(e.target.value)} />
      </Field>
      <Field label="Mã tham gia">
        <input className="input mono" inputMode="numeric" maxLength={6} placeholder="6 chữ số" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Row icon={<Wifi size={18} />} title="Cùng mạng Wi-Fi với hub" meta="Điện thoại và hub phải ở cùng mạng trong nhà khi tham gia." tone="tint" chevron={false} />
      {err && <div className="card rose"><p className="danger-text" style={{ margin: 0 }}>{err}</p></div>}
      <button className="btn" disabled={busy || !hub.trim() || code.length !== 6} onClick={() => void join()}>
        {busy ? 'Đang tham gia' : 'Tham gia'}
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
