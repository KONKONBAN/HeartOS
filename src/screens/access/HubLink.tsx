import { Check, Link2, Monitor, RefreshCw, ShieldCheck, Unplug, X } from 'lucide-react';
import { useState } from 'react';
import { Phone } from '../../components/Layouts';
import { Badge, Field, Header, KV, Row, Sheet, TopBar } from '../../components/ui';
import { ago, hhmm, useNow } from '../../lib/format';
import { toast } from '../../lib/ui-store';
import { useHubLink } from '../../state/hublink';
import { useMe } from '../../state/store';

export function FHub() {
  const client = useHubLink();
  const me = useMe();
  const now = useNow(2000);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(`Điện thoại của ${me.name}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const link = client?.link;
  if (!client)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/more" />
        <Header title="Máy quản trị Sentinel" sub="Đang khởi động kết nối…" />
      </Phone>
    );
  const pair = async () => {
    setBusy(true);
    setError('');
    const r = await client.pair(url, code, name);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setCode('');
      toast(`Đã ghép với ${r.hubName}. Hãy so mã đối chiếu ${r.sas} với màn hình máy tính.`, 'info', 8000);
      void client.sync();
    }
  };
  const syncNow = async () => {
    setBusy(true);
    const r = await client.sync();
    setBusy(false);
    toast(r.ok ? (r.applied ? `Đã đồng bộ và áp dụng ${r.applied} lệnh.` : 'Đã đồng bộ.') : `Lỗi: ${r.error}`, r.ok ? 'info' : 'warning');
  };
  if (!link)
    return (
      <Phone tabs>
        <TopBar back backTo="/f/more" />
        <Header title="Máy quản trị Sentinel" sub="Ghép điện thoại với phần mềm HeartOS Sentinel Admin trên máy tính cùng mạng Wi-Fi." />
        <Row tone="tint" icon={<Monitor size={18} />} tileTone="white" title="Trên máy tính" meta="Mở HeartOS Sentinel Admin → Ghép thiết bị mới → Tạo mã ghép nối. Máy tính hiển thị địa chỉ và mã 6 số." />
        <Field label="Địa chỉ máy quản trị">
          <input className="input mono" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="192.168.1.10:7420" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Mã ghép nối">
          <input className="input mono" inputMode="numeric" maxLength={6} placeholder="6 chữ số" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ fontSize: 22, letterSpacing: '.2em' }} />
        </Field>
        <Field label="Tên thiết bị hiển thị trên máy quản trị">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <Row tone="rose" icon={<X size={18} />} tileTone="white" title="Chưa ghép được" meta={error} />}
        <button className="btn" disabled={busy || !url.trim() || code.length !== 6} onClick={() => void pair()}>
          <Link2 size={18} /> {busy ? 'Đang ghép…' : 'Ghép nối'}
        </button>
        <div className="card flat">
          <p>Sau khi ghép, điện thoại gửi trạng thái Sentinel, nhật ký bằng chứng và ca Guardian tới máy quản trị mỗi 5 giây. Gói tin được ký và mã hóa riêng; bản rõ dữ liệu và khóa giải mã không rời điện thoại. Máy quản trị gửi lại lệnh đã ký, điện thoại kiểm chữ ký trước khi áp dụng.</p>
        </div>
      </Phone>
    );
  const fresh = link.lastSync && now - link.lastSync < 20_000;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/more" />
      <Header title="Máy quản trị Sentinel" sub={`${link.hubName} · ${link.hubUrl}`} />
      <Row
        tone={link.lastError ? 'rose' : fresh ? 'tint' : undefined}
        icon={link.lastError ? <X size={18} /> : <Check size={18} />}
        tileTone="white"
        title={link.lastError ? 'Mất kết nối với máy quản trị' : fresh ? 'Đang đồng bộ' : 'Chờ đồng bộ'}
        meta={link.lastError ?? (link.lastSync ? `Lần cuối ${hhmm(link.lastSync)} (${ago(link.lastSync, now)})` : 'Chưa đồng bộ lần nào')}
      />
      <div className="card">
        <div className="label">Mã đối chiếu</div>
        <div className="mono" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '.08em', margin: '4px 0' }}>{link.sas}</div>
        <p>Mã này phải trùng với mã trên màn hình máy quản trị. Nếu khác, hãy gỡ ghép nối ngay.</p>
      </div>
      <KV items={[['Tên thiết bị', link.deviceName], ['Mã thiết bị', link.deviceId], ['Ghép lúc', new Date(link.pairedAt).toLocaleString('vi-VN')], ['Gói đã gửi', String(link.upSeq)], ['Nhật ký đã xác nhận', `#${link.ackJournalSeq}`]]} />
      <button className="btn" disabled={busy} onClick={() => void syncNow()}>
        <RefreshCw size={18} /> Đồng bộ ngay
      </button>
      <div className="section-title">Lệnh từ máy quản trị</div>
      {link.history.length === 0 && <div className="empty">Chưa nhận lệnh nào.</div>}
      {link.history.map((h, i) => (
        <Row key={i} icon={h.ok ? <ShieldCheck size={18} /> : <X size={18} />} tileTone={h.ok ? undefined : 'rose'} title={h.label} meta={`${hhmm(h.at)} · ${h.by} · ${h.message}`} badge={<Badge tone={h.ok ? undefined : 'danger'}>{h.ok ? 'Đã áp dụng' : 'Từ chối'}</Badge>} chevron={false} />
      ))}
      <button className="btn ghost" onClick={() => setConfirmUnpair(true)}>
        <Unplug size={16} /> Gỡ ghép nối
      </button>
      <Sheet open={confirmUnpair} onClose={() => setConfirmUnpair(false)} title="Gỡ ghép nối?">
        <p className="small muted" style={{ margin: 0 }}>Điện thoại ngừng gửi dữ liệu và không nhận lệnh từ {link.hubName}. Trên máy tính, hãy gỡ thiết bị này trong danh sách để thu hồi hoàn toàn.</p>
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setConfirmUnpair(false)}>Hủy</button>
          <button className="btn danger" onClick={() => { client.unpair(); setConfirmUnpair(false); }}>Gỡ ghép nối</button>
        </div>
      </Sheet>
    </Phone>
  );
}
