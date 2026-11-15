import { LogOut, RotateCcw, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../lib/ui-store';
import { endExpo } from '../state/actions';
import { useApp } from '../state/store';
import { Row } from './ui';

export function SignOutButton({ size = 18 }: { size?: number }) {
  const expo = useApp((s) => !!s.session.expo);
  const signOut = useApp((s) => s.signOut);
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!expo)
    return (
      <button className="btn secondary" onClick={() => { signOut(); nav('/welcome'); }}>
        <LogOut size={size} /> Đăng xuất
      </button>
    );
  const finish = async () => {
    setBusy(true);
    try {
      await endExpo();
      nav('/welcome', { replace: true });
      toast('Đã đặt lại dữ liệu mẫu, sẵn sàng cho khách tiếp theo.', 'info', 5000);
    } finally {
      setBusy(false);
    }
  };
  if (!confirm)
    return (
      <>
        <Row tone="tint" icon={<Ticket size={size} />} title="Phiên trải nghiệm Expo" meta="Khi kết thúc, mọi dữ liệu tạo trong phiên được xóa và nhà mẫu trở về trạng thái ban đầu." chevron={false} />
        <button className="btn secondary" onClick={() => setConfirm(true)}>
          <LogOut size={size} /> Kết thúc trải nghiệm
        </button>
      </>
    );
  return (
    <div className="card sand stack">
      <h3 style={{ margin: 0 }}>Kết thúc phiên Expo?</h3>
      <p style={{ margin: 0 }}>Mọi thay đổi trong phiên này sẽ bị xóa: lời mời, việc, ký ức, bản ghi âm, ảnh, thiết bị nhà và nhật ký. Dữ liệu mẫu được đặt lại cho khách tiếp theo.</p>
      <div className="btnrow">
        <button className="btn secondary" disabled={busy} onClick={() => setConfirm(false)}>Ở lại</button>
        <button className="btn" disabled={busy} onClick={() => void finish()}>
          <RotateCcw size={size} /> {busy ? 'Đang đặt lại' : 'Đặt lại và đăng xuất'}
        </button>
      </div>
    </div>
  );
}
