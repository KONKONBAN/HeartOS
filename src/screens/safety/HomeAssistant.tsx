import { Check, ExternalLink, KeyRound, Link2, Lock, RefreshCw, Server, Unplug, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Phone } from '../../components/Layouts';
import { Badge, Field, Header, KV, Row, Steps, TopBar } from '../../components/ui';
import { ago, hhmm, useNow } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { connectHa, disconnectHa, syncHaNow, testHa, useHa } from '../../state/ha';
import { useApp, useMe } from '../../state/store';

const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

export function haStateLabel(state: string) {
  return { off: 'Chưa kết nối', connecting: 'Đang kết nối', ok: 'Đã kết nối', error: 'Lỗi kết nối' }[state] ?? state;
}

export function FHa() {
  const me = useMe();
  const ha = useHa();
  const now = useNow(5000);
  const prefs = useApp((s) => s.prefs);
  const [url, setUrl] = useState(prefs.haUrl || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'sync'>('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const admin = me.role === 'admin';
  const linked = !!prefs.haUrl && !!prefs.haToken;
  const editing = !linked;

  const test = async () => {
    setBusy('test');
    setResult(null);
    try {
      const r = await testHa(url, token);
      setResult({ ok: true, text: `Home Assistant ${r.info.version ?? ''}${r.info.location ? `, ${r.info.location}` : ''}: đọc được ${r.entities} thực thể, ${r.devices} thiết bị HeartOS dùng được.` });
    } catch (e) {
      setResult({ ok: false, text: hint((e as Error).message) });
    } finally {
      setBusy('');
    }
  };
  const save = async () => {
    setBusy('save');
    setResult(null);
    try {
      await connectHa(url, token);
      setToken('');
      toast('Đã kết nối Home Assistant.');
    } catch (e) {
      setResult({ ok: false, text: hint((e as Error).message) });
    } finally {
      setBusy('');
    }
  };
  const sync = async () => {
    setBusy('sync');
    await syncHaNow();
    setBusy('');
  };

  return (
    <Phone tabs>
      <TopBar back backTo="/f/devices" />
      <Header title="Home Assistant" sub="Cầu nối tới cảm biến, đèn, khóa, camera và radar trong nhà." />
      {linked ? (
        <>
          <Row
            icon={ha.state === 'error' ? <WifiOff size={18} /> : <Server size={18} />}
            tileTone={ha.state === 'error' ? 'rose' : ha.state === 'ok' ? undefined : 'sand'}
            title={haStateLabel(ha.state)}
            meta={ha.state === 'error' ? ha.error : ha.lastSync ? `Đồng bộ lúc ${hhmm(ha.lastSync)} (${ago(ha.lastSync, now)})` : 'Đang đọc trạng thái thiết bị'}
            badge={<Badge tone={ha.state === 'ok' ? undefined : ha.state === 'error' ? 'danger' : 'warm'}>{ha.state === 'ok' ? 'Trực tuyến' : haStateLabel(ha.state)}</Badge>}
            chevron={false}
          />
          <div className="card flat">
            <KV items={[['Địa chỉ', prefs.haUrl ?? ''], ['Phiên bản', ha.version ?? 'Chưa rõ'], ['Nơi đặt', ha.location ?? 'Chưa rõ'], ['Thiết bị dùng được', String(ha.devices)], ['Tổng thực thể', String(ha.entities)]]} />
          </div>
          <div className="grid2">
            <button className="btn secondary" disabled={busy === 'sync'} onClick={() => void sync()}><RefreshCw size={18} /> Đồng bộ ngay</button>
            <a className="btn secondary" href={prefs.haUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Mở HA</a>
          </div>
          <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Mã truy cập được mã hóa" meta="Mã chỉ lưu trên điện thoại này, khóa bằng AES-256 của thiết bị. Điện thoại khác trong nhà cần kết nối riêng." />
          {admin &&
            (confirmOff ? (
              <div className="card rose stack">
                <b>Ngắt kết nối Home Assistant?</b>
                <p className="small" style={{ margin: 0 }}>Điện thoại này sẽ xóa địa chỉ, mã truy cập và danh sách thiết bị đã đọc. Thiết bị trong nhà vẫn chạy bình thường trên Home Assistant.</p>
                <div className="grid2">
                  <button className="btn secondary" onClick={() => setConfirmOff(false)}>Giữ kết nối</button>
                  <button className="btn danger" onClick={() => { disconnectHa(); setConfirmOff(false); toast('Đã ngắt kết nối Home Assistant.'); }}>Ngắt kết nối</button>
                </div>
              </div>
            ) : (
              <button className="btn ghost" onClick={() => setConfirmOff(true)}><Unplug size={16} /> Ngắt kết nối</button>
            ))}
        </>
      ) : null}
      {editing && !admin && <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Cần quản trị hộ" meta="Nhờ người quản trị kết nối Home Assistant trên điện thoại của họ, hoặc cấp quyền quản trị cho bạn." />}
      {editing && admin && (
        <>
          <div className="card">
            <Steps
              items={[
                { title: 'Cài Home Assistant tại nhà', meta: 'Trên Raspberry Pi, mini PC hoặc Home Assistant Green, cùng mạng Wi-Fi với điện thoại', state: 'done' },
                { title: 'Tạo mã truy cập dài hạn', meta: 'Trong HA: Hồ sơ, tab Bảo mật, mục Mã truy cập dài hạn, bấm Tạo mã', state: 'active' },
                { title: 'Dán địa chỉ và mã vào đây', meta: 'Bấm Kiểm tra rồi Lưu và kết nối', state: 'todo' },
              ]}
            />
          </div>
          <Field label="Địa chỉ Home Assistant" icon={<Link2 size={18} />}>
            <input className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="http://192.168.1.10:8123" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Mã truy cập dài hạn" icon={<KeyRound size={18} />}>
            <input className="input" type="password" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="Dán mã bắt đầu bằng eyJ" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          {result && <Row tone={result.ok ? 'tint' : 'rose'} icon={result.ok ? <Check size={18} /> : <WifiOff size={18} />} tileTone="white" title={result.ok ? 'Kết nối được' : 'Chưa kết nối được'} meta={result.text} />}
          <div className="grid2">
            <button className="btn secondary" disabled={!url.trim() || !token.trim() || !!busy} onClick={() => void test()}>{busy === 'test' ? 'Đang kiểm tra' : 'Kiểm tra'}</button>
            <button className="btn" disabled={!url.trim() || !token.trim() || !!busy} onClick={() => void save()}>{busy === 'save' ? 'Đang kết nối' : 'Lưu và kết nối'}</button>
          </div>
          <div className="card flat">
            <div className="label">HeartOS đọc được</div>
            <p className="small" style={{ margin: 0 }}>Đèn, ổ cắm, rèm, điều hòa, khóa, van nước, còi; cảm biến cửa, khói, khí, rò nước, chuyển động, nút SOS; camera; UPS; radar LD2450 qua ESPHome (thực thể dạng sensor.ten_target_1_x) và cảm biến nhiệt MLX90640. Gán Khu vực trong HA để HeartOS chia thiết bị theo phòng.</p>
          </div>
        </>
      )}
    </Phone>
  );
}

function hint(msg: string) {
  if (!isNative() && /Không kết nối được|Failed to fetch|NetworkError|Load failed/i.test(msg))
    return `${msg}. Khi dùng trên trình duyệt, thêm địa chỉ trang này vào cors_allowed_origins trong configuration.yaml của Home Assistant, hoặc dùng ứng dụng Android.`;
  return msg;
}
