import { ChevronDown, ChevronLeft, ChevronRight, Check, CircleAlert, Info, ShieldCheck, Volume2, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.svg';
import type { TraceStep } from '../core/sentinel/types';
import { ACTOR_LABEL } from '../core/sentinel/types';
import { speak } from '../lib/media';
import { cancelApproval, confirmApproval, useUi } from '../lib/ui-store';
import { useApp } from '../state/store';

export function Logo({ size = 36 }: { size?: number }) {
  return <img src={logo} width={size} height={size} alt="" aria-hidden="true" />;
}

export function Brand({ to }: { to?: string }) {
  const nav = useNavigate();
  return (
    <button className="brand" type="button" onClick={() => to && nav(to)} aria-label="HeartOS — về trang nhà">
      <Logo />
      HeartOS
    </button>
  );
}

export function Back({ to, label = 'Quay lại' }: { to?: string; label?: string }) {
  const nav = useNavigate();
  return (
    <button type="button" className="back" onClick={() => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav('/'))}>
      <ChevronLeft size={18} aria-hidden="true" />
      {label}
    </button>
  );
}

export function Sim({ sos, label }: { sos?: boolean; label?: string }) {
  return <span className={'sim' + (sos ? ' sos' : '')} title="Thiết bị và kênh từ xa được mô phỏng trên hub HeartOS">{label ?? (sos ? 'MÔ PHỎNG SOS' : 'MÔ PHỎNG')}</span>;
}

export function TopBar({ back, backTo, right, brandTo }: { back?: boolean; backTo?: string; right?: ReactNode; brandTo?: string }) {
  return (
    <div className="topbar">
      {back ? <Back to={backTo} /> : <Brand to={brandTo} />}
      {right ?? <Sim />}
    </div>
  );
}

export function Header({ title, sub, date, read }: { title: string; sub?: string; date?: string; read?: string }) {
  const readAloud = useApp((s) => s.prefs.readAloud);
  return (
    <div>
      {date && <div className="date">{date}</div>}
      <div className="hstack" style={{ alignItems: 'flex-start' }}>
        <h1 className="h1" style={{ flex: 1 }}>{title}</h1>
        {readAloud && (
          <button type="button" className="btn ghost xs" aria-label="Đọc to" onClick={() => speak(read ?? `${title}. ${sub ?? ''}`)} style={{ marginTop: 6 }}>
            <Volume2 size={20} />
          </button>
        )}
      </div>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

type Tone = 'tint' | 'peach' | 'rose' | 'sand' | undefined;

export function Row({ icon, title, meta, to, onClick, tone, tileTone, right, badge, chevron = true, disabled }: { icon?: ReactNode; title: ReactNode; meta?: ReactNode; to?: string; onClick?: () => void; tone?: Tone; tileTone?: 'peach' | 'rose' | 'sand' | 'white' | 'deep'; right?: ReactNode; badge?: ReactNode; chevron?: boolean; disabled?: boolean }) {
  const inner = (
    <>
      {icon ? <span className={'tile' + (tileTone ? ' ' + tileTone : '')}>{icon}</span> : <span />}
      <span>
        <div className="t">{title}</div>
        {meta && <div className="m">{meta}</div>}
        {badge && <div style={{ marginTop: 6 }}>{badge}</div>}
      </span>
      <span className="hstack">
        {right}
        {chevron && (to || onClick) && <ChevronRight size={18} className="chev" aria-hidden="true" />}
      </span>
    </>
  );
  const cls = 'row' + (tone ? ' ' + tone : '');
  if (to) return <Link to={to} className={cls} aria-disabled={disabled}>{inner}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'warm' | 'danger' | 'peach' | 'white' | 'dark' | 'line' }) {
  return <span className={'badge' + (tone ? ' ' + tone : '')}>{children}</span>;
}

export interface StepItem {
  title: string;
  meta?: string;
  state: 'done' | 'active' | 'unknown' | 'todo' | 'failed';
  right?: ReactNode;
}

export function Steps({ items }: { items: StepItem[] }) {
  return (
    <div className="steps">
      {items.map((s, i) => (
        <div key={i} className={'step ' + s.state}>
          <span className="dot" aria-hidden="true">{s.state === 'done' ? <Check size={15} strokeWidth={3} /> : s.state === 'failed' ? <X size={14} /> : s.state === 'unknown' ? '?' : i + 1}</span>
          <div>
            <div className="t">{s.title}</div>
            {s.meta && <div className="m">{s.meta}</div>}
          </div>
          {s.right}
        </div>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
            {on && <Check size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.tone}>
          {t.tone === 'info' ? <Info size={18} /> : <CircleAlert size={18} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Hộp xác nhận kiểu Protected Confirmation: chỉ nội dung hiển thị được ký. */
export function ApprovalSheet() {
  const a = useUi((s) => s.approval);
  if (!a) return null;
  return (
    <Sheet open onClose={cancelApproval} title="Xác nhận trên thiết bị này">
      <div className="card tint">
        <div className="hstack" style={{ marginBottom: 6 }}>
          <ShieldCheck size={18} color="#244C3E" />
          <b style={{ fontSize: 15 }}>{a.title}</b>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          {a.lines.map((l, i) => (
            <div key={i} className="small" style={{ lineHeight: 1.5 }}>
              {l}
            </div>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Khóa phê duyệt trên thiết bị sẽ ký đúng nội dung trên cùng đích nhận, mã một lần, thời hạn 5 phút và thế hệ quyền hiện hành. Nội dung không hiển thị không được xem là đã xác nhận.
      </p>
      <div className="btnrow">
        <button type="button" className="btn secondary" onClick={cancelApproval}>
          Hủy
        </button>
        <button type="button" className={'btn' + (a.danger ? ' danger' : '')} onClick={() => void confirmApproval()}>
          Xác nhận và ký
        </button>
      </div>
    </Sheet>
  );
}

export function TraceView({ trace, compact }: { trace: TraceStep[]; compact?: boolean }) {
  return (
    <div className="trace">
      {trace.map((t, i) => (
        <div key={i} className="ti">
          <span style={{ color: t.ok ? '#244C3E' : '#9E3830' }}>{t.ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</span>
          <div>
            <div className="who">{ACTOR_LABEL[t.actor]}</div>
            <b>{t.label}</b>
            {!compact && t.detail && <div className="muted" style={{ wordBreak: 'break-word' }}>{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModePicker({ mode }: { mode: 'simple' | 'family' }) {
  const nav = useNavigate();
  return (
    <button type="button" className="modepick" onClick={() => nav('/mode')} aria-label="Đổi cách hiển thị">
      {mode === 'simple' ? 'Thân Quen' : 'Gia Đình'}
      <ChevronDown size={16} />
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Avatar({ name, color, size }: { name: string; color: string; size?: 'lg' }) {
  return (
    <span className={'avatar' + (size ? ' ' + size : '')} style={{ background: color }} aria-hidden="true">
      {name.replace(/^Bà /, '').charAt(0)}
    </span>
  );
}

export function useIsActive(prefix: string) {
  const loc = useLocation();
  return loc.pathname === prefix || loc.pathname.startsWith(prefix + '/');
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
