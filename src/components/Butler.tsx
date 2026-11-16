import { AlertTriangle, BellRing, Brain, CalendarHeart, ChevronRight, Lightbulb, ListChecks, Phone as PhoneIcon, Pill, Repeat, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../lib/ui-store';
import { useButler, type ButlerItem, type ButlerKind } from '../state/butler';
import type { Member } from '../state/types';

const ICON: Record<ButlerKind, ReactNode> = {
  incident: <AlertTriangle size={18} />,
  med: <Pill size={18} />,
  'med-missed': <BellRing size={18} />,
  'med-stock': <Pill size={18} />,
  habit: <Repeat size={18} />,
  task: <ListChecks size={18} />,
  ritual: <CalendarHeart size={18} />,
  call: <PhoneIcon size={18} />,
  device: <Lightbulb size={18} />,
};

const TONE: Partial<Record<ButlerKind, string>> = { incident: 'rose', med: 'peach', 'med-missed': 'rose', 'med-stock': 'sand' };

function Row({ i, simple, onDone, onDismiss }: { i: ButlerItem; simple?: boolean; onDone: () => void; onDismiss: () => void }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className={'butler-row' + (TONE[i.kind] ? ` ${TONE[i.kind]}` : '')} data-kind={i.kind}>
      <span className="tile">{ICON[i.kind]}</span>
      <button className="butler-text" onClick={() => i.to && nav(i.to)} disabled={!i.to}>
        <span className="t">{i.title}</span>
        <span className="m">{i.meta}</span>
      </button>
      <span className="butler-acts">
        {i.primary && (
          <button
            className={'btn ' + (simple ? 'sm' : 'xs')}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              const msg = i.primary!.run();
              if (typeof msg === 'string' && msg) toast(msg);
              setBusy(false);
              onDone();
            }}
          >
            {i.primary.label}
          </button>
        )}
        {!i.primary && i.to && <ChevronRight size={18} className="chev" />}
        {i.dismissible && (
          <button className="iconbtn butler-x" aria-label={`Bỏ qua: ${i.title}`} onClick={onDismiss}>
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  );
}

export function ButlerCard({ me, simple, limit = 4, title = 'Quản gia HeartOS nhắc bạn' }: { me: Member; simple?: boolean; limit?: number; title?: string }) {
  const { items, dismiss } = useButler(me);
  const [, force] = useState(0);
  if (!items.length) return null;
  return (
    <section className={'butler' + (simple ? ' big' : '')} aria-label={title}>
      <div className="butler-head">
        <Brain size={17} />
        <span>{title}</span>
        {items.length > limit && <span className="badge line">+{items.length - limit}</span>}
      </div>
      {items.slice(0, limit).map((i) => (
        <Row key={i.id} i={i} simple={simple} onDone={() => force((n) => n + 1)} onDismiss={() => dismiss(i)} />
      ))}
    </section>
  );
}
