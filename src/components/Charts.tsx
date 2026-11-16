import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export const SERIES = ['#2a78d6', '#eb6834'];

const INK = '#211F1B';
const MUTED = '#7d756c';
const GRID = '#ECE6DC';
const AXIS = '#CFC6B8';
const SURFACE = '#FFFDFA';

export interface Series {
  name: string;
  color: string;
  dash?: boolean;
  points: { x: number; y: number }[];
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(240, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, width, top = 28, children }: { x: number; width: number; top?: number; children: ReactNode }) {
  const left = x > width / 2 ? Math.max(0, x - 160) : Math.min(x + 12, width - 150);
  return (
    <div className="chart-tip" style={{ left, top }} role="status">
      {children}
    </div>
  );
}

function nearest(xs: number[], v: number) {
  let best = 0;
  xs.forEach((x, i) => Math.abs(x - v) < Math.abs(xs[best] - v) && (best = i));
  return best;
}

export function LineChart({ series, xLabel, yLabel, height = 240, yMax, fmtX = (x) => String(x), fmtY = (y) => y.toFixed(2), refLine }: { series: Series[]; xLabel: string; yLabel: string; height?: number; yMax?: number; fmtX?: (x: number) => string; fmtY?: (y: number) => string; refLine?: { y: number; label: string } }) {
  const [box, W] = useWidth(640);
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const wide = W >= 520;
  const m = { l: 48, r: wide ? 92 : 14, t: 28, b: 40 };
  const xs = series[0]?.points.map((p) => p.x) ?? [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const rawMax = yMax ?? Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), refLine?.y ?? 0) * 1.05;
  const step = niceStep(rawMax / 4);
  const ymax = Math.ceil(rawMax / step) * step;
  const pw = W - m.l - m.r;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * pw;
  const sy = (y: number) => H - m.b - (y / (ymax || 1)) * (H - m.t - m.b);
  const ticksY = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const every = Math.max(1, Math.ceil(xs.length / (wide ? 7 : 4)));
  const ticksX = xs.filter((_, i) => i % every === 0);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(nearest(xs, x0 + ((e.clientX - r.left) / r.width) * (x1 - x0)));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(xs.length - 1, (h ?? -1) + 1));
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? 1) - 1));
  };
  return (
    <div ref={box} className="chart">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} theo ${xLabel}`}>
        <text x={m.l} y={14} className="chart-axis-title">{yLabel}</text>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={m.l - 8} y={sy(t) + 4} className="chart-tick" textAnchor="end">{fmtY(t)}</text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={t} x={sx(t)} y={H - m.b + 17} className="chart-tick" textAnchor="middle">{fmtX(t)}</text>
        ))}
        <text x={m.l + pw / 2} y={H - 4} className="chart-axis-title" textAnchor="middle">{xLabel}</text>
        {refLine && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={sy(refLine.y)} y2={sy(refLine.y)} stroke={MUTED} strokeDasharray="3 4" />
            <text x={m.l + 6} y={sy(refLine.y) - 6} className="chart-tick" textAnchor="start">{refLine.label}</text>
          </g>
        )}
        {series.map((s) => (
          <polyline key={s.name} points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash ? '7 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {wide &&
          series.map((s, i) => {
            const last = s.points[s.points.length - 1];
            const other = series[1 - i]?.points[series[1 - i].points.length - 1];
            const clash = other && Math.abs(sy(other.y) - sy(last.y)) < 16;
            const above = clash && (sy(last.y) < sy(other.y) || (sy(last.y) === sy(other.y) && i === 0));
            return (
              <text key={s.name} x={W - m.r + 8} y={sy(last.y) + 4 + (clash ? (above ? -8 : 8) : 0)} className="chart-label">
                {s.name}
              </text>
            );
          })}
        {hover !== null && (
          <g>
            <line x1={sx(xs[hover])} x2={sx(xs[hover])} y1={m.t} y2={H - m.b} stroke={INK} strokeOpacity={0.3} />
            {series.map((s) => (
              <circle key={s.name} cx={sx(s.points[hover].x)} cy={sy(s.points[hover].y)} r={4.5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={m.l} y={m.t} width={pw} height={H - m.t - m.b} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} tabIndex={0} aria-label="Di chuyển để xem số liệu" onKeyDown={onKey} onBlur={() => setHover(null)} />
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="1" x2="21" y1="4" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '5 3' : undefined} />
            </svg>
            {s.name}
          </span>
        ))}
      </div>
      {hover !== null && (
        <Tooltip x={sx(xs[hover])} width={W}>
          <div className="chart-tip-head">{xLabel}: {fmtX(xs[hover])}</div>
          {series.map((s) => (
            <div key={s.name} className="chart-tip-row">
              <svg width="14" height="6" aria-hidden="true">
                <line x1="0" x2="14" y1="3" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '4 2' : undefined} />
              </svg>
              <b>{fmtY(s.points[hover].y)}</b>
              <span>{s.name}</span>
            </div>
          ))}
        </Tooltip>
      )}
      <table className="sr">
        <caption>{`${yLabel} theo ${xLabel}`}</caption>
        <thead>
          <tr>
            <th>{xLabel}</th>
            {series.map((s) => <th key={s.name}>{s.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {xs.map((x, i) => (
            <tr key={x}>
              <td>{fmtX(x)}</td>
              {series.map((s) => <td key={s.name}>{fmtY(s.points[i].y)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export function AreaChart({ points, title, unit, height = 168, color = '#2F6B55', empty = 'Đang thu dữ liệu', minMax = 100 }: { points: { x: number; y: number }[]; title: string; unit: string; height?: number; color?: string; empty?: string; minMax?: number }) {
  const [box, W] = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div ref={box} className="chart-empty">{empty}</div>;
  const H = height;
  const fmt = (v: number) => `${Math.round(v).toLocaleString('vi-VN')} ${unit}`;
  const m = { l: 46, r: 16, t: 14, b: 26 };
  const xs = points.map((p) => p.x);
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const rawMax = Math.max(minMax, ...points.map((p) => p.y)) * 1.1;
  const step = niceStep(rawMax / 3);
  const ymax = Math.ceil(rawMax / step) * step;
  const pw = W - m.l - m.r;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * pw;
  const sy = (y: number) => H - m.b - (y / (ymax || 1)) * (H - m.t - m.b);
  const ticksY = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const line = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${sx(x0)},${sy(0)} ${line} ${sx(x1)},${sy(0)}`;
  const span = Math.round((x1 - x0) / 60000);
  const last = points[points.length - 1];
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(nearest(xs, x0 + ((e.clientX - r.left) / r.width) * (x1 - x0)));
  };
  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={box} className="chart">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, hiện ${fmt(last.y)}`}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={m.l - 8} y={sy(t) + 4} className="chart-tick" textAnchor="end">{t.toLocaleString('vi-VN')}</text>
          </g>
        ))}
        <text x={m.l} y={H - 7} className="chart-tick" textAnchor="start">{span >= 1 ? `${span} phút trước` : `${Math.round((x1 - x0) / 1000)} giây trước`}</text>
        <text x={W - m.r} y={H - 7} className="chart-tick" textAnchor="end">Bây giờ</text>
        <polygon points={area} fill="url(#area-fill)" />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {!h && <circle cx={sx(last.x)} cy={sy(last.y)} r={4.5} fill={color} stroke={SURFACE} strokeWidth={2} />}
        {h && (
          <g>
            <line x1={sx(h.x)} x2={sx(h.x)} y1={m.t} y2={H - m.b} stroke={INK} strokeOpacity={0.3} />
            <circle cx={sx(h.x)} cy={sy(h.y)} r={4.5} fill={color} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
        <rect x={m.l} y={0} width={pw} height={H - m.b} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} tabIndex={0} aria-label="Di chuyển để xem số liệu" onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((v) => Math.min(points.length - 1, (v ?? points.length - 2) + 1));
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? points.length) - 1));
        }} onBlur={() => setHover(null)} />
      </svg>
      {h && (
        <Tooltip x={sx(h.x)} width={W} top={8}>
          <div className="chart-tip-head">{clock(h.x)}</div>
          <div className="chart-tip-row"><b>{fmt(h.y)}</b></div>
        </Tooltip>
      )}
      <table className="sr">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.x}>
              <td>{clock(p.x)}</td>
              <td>{fmt(p.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
