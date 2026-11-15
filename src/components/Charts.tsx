/**
 * Biểu đồ SVG nội tuyến cho bàn vận hành.
 * Bảng màu đã kiểm bằng validator (xanh #2F8A60, cam #D8612A trên nền #FFFDFA); vì CVD ở ngưỡng sàn,
 * chuỗi thứ hai luôn có nét đứt + nhãn trực tiếp + chú giải (không phân biệt bằng màu đơn thuần).
 */
import { useState } from 'react';

export const SERIES = ['#2F8A60', '#D8612A'];

export interface Series {
  name: string;
  color: string;
  dash?: boolean;
  points: { x: number; y: number }[];
}

export function LineChart({ series, xLabel, yLabel, height = 240, yMax, fmtX = (x) => String(x), fmtY = (y) => y.toFixed(2), refLine }: { series: Series[]; xLabel: string; yLabel: string; height?: number; yMax?: number; fmtX?: (x: number) => string; fmtY?: (y: number) => string; refLine?: { y: number; label: string } }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const m = { l: 52, r: 96, t: 30, b: 38 };
  const xs = series[0]?.points.map((p) => p.x) ?? [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const rawMax = yMax ?? Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), refLine?.y ?? 0) * 1.05;
  const step = niceStep(rawMax / 4);
  const ymax = Math.ceil(rawMax / step) * step;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - (y / (ymax || 1)) * (H - m.t - m.b);
  const ticksY = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const ticksX = xs.filter((_, i) => i % Math.max(1, Math.ceil(xs.length / 7)) === 0);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (W - m.l - m.r);
    const xv = x0 + (px / (W - m.l - m.r)) * (x1 - x0);
    let best = 0;
    xs.forEach((x, i) => Math.abs(x - xv) < Math.abs(xs[best] - xv) && (best = i));
    setHover(best);
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${yLabel} theo ${xLabel}`}>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke="#EFEAE2" strokeWidth={1} />
            <text x={m.l - 8} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="#574F47">{fmtY(t)}</text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={t} x={sx(t)} y={H - m.b + 16} fontSize="11" textAnchor="middle" fill="#574F47">{fmtX(t)}</text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} fontSize="11" textAnchor="middle" fill="#574F47">{xLabel}</text>
        <text x={m.l - 8} y={14} fontSize="11" textAnchor="start" fontWeight="700" fill="#574F47">{yLabel}</text>
        <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} stroke="#DDD2C3" />
        {refLine && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={sy(refLine.y)} y2={sy(refLine.y)} stroke="#8a8076" strokeDasharray="2 4" />
            <text x={W - m.r - 4} y={sy(refLine.y) + 14} fontSize="10.5" textAnchor="end" fill="#574F47">{refLine.label}</text>
          </g>
        )}
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash ? '7 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            <text x={W - m.r + 8} y={sy(s.points[s.points.length - 1].y) + (s.dash ? -6 : 12)} fontSize="11.5" fontWeight="700" fill="#211F1B">{s.name}</text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(xs[hover])} x2={sx(xs[hover])} y1={m.t} y2={H - m.b} stroke="#211F1B" strokeOpacity={0.35} />
            {series.map((s) => (
              <circle key={s.name} cx={sx(s.points[hover].x)} cy={sy(s.points[hover].y)} r={4.5} fill={s.color} stroke="#FFFDFA" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} tabIndex={0} onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(xs.length - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? 1) - 1));
        }} onBlur={() => setHover(null)} />
      </svg>
      <div className="hstack wrap small" style={{ gap: 14, marginTop: 6 }}>
        {series.map((s) => (
          <span key={s.name} className="hstack" style={{ gap: 6 }}>
            <svg width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '5 3' : undefined} /></svg>
            {s.name}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div style={{ position: 'absolute', top: 8, left: `${Math.min(70, (sx(xs[hover]) / W) * 100)}%`, background: '#211F1B', color: '#fff', borderRadius: 10, padding: '8px 10px', fontSize: 12, pointerEvents: 'none', minWidth: 140 }}>
          <div style={{ color: '#d8d2c8', marginBottom: 4 }}>{xLabel}: {fmtX(xs[hover])}</div>
          {series.map((s) => (
            <div key={s.name} className="hstack" style={{ gap: 6 }}>
              <svg width="14" height="6" aria-hidden="true"><line x1="0" x2="14" y1="3" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '4 2' : undefined} /></svg>
              <b>{fmtY(s.points[hover].y)}</b>
              <span style={{ color: '#d8d2c8' }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Histogram một chuỗi (một sắc độ), đầu cột bo 4px, khe 2px, tooltip trên từng cột. */
export function Histogram({ values, labels, height = 120, color = SERIES[0], title }: { values: number[]; labels: string[]; height?: number; color?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = height;
  const max = Math.max(...values, 1);
  const bw = W / values.length;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={title}>
        <line x1={0} x2={W} y1={H} y2={H} stroke="#DDD2C3" />
        {values.map((v, i) => {
          const h = (v / max) * (H - 6);
          const x = i * bw + 1;
          const w = bw - 2;
          const r = Math.min(4, w / 2, h);
          const y = H - h;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <path d={`M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H} Z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
            </g>
          );
        })}
        {labels.map((l, i) => (i % 4 === 0 ? <text key={i} x={i * bw + bw / 2} y={H + 13} fontSize="9.5" textAnchor="middle" fill="#574F47">{l}</text> : null))}
      </svg>
      {hover !== null && (
        <div style={{ position: 'absolute', top: 0, left: `${(hover / values.length) * 100}%`, background: '#211F1B', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 11.5, pointerEvents: 'none' }}>
          <b>{values[hover]}</b> mẫu · {labels[hover]}
        </div>
      )}
    </div>
  );
}
