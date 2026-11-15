import { NODES, type RoadEdge, type RouteResult } from '../core/guardian/routes';

export function RouteMap({ edges, highlight, height = 210 }: { edges: RoadEdge[]; highlight?: RouteResult; height?: number }) {
  const pos = (id: string) => NODES.find((n) => n.id === id)!;
  const on = new Set(highlight?.edges.map((e) => e.id));
  return (
    <svg viewBox="0 0 100 90" style={{ width: '100%', height, background: '#EAF0E6', borderRadius: 16 }} role="img" aria-label="Bản đồ tuyến minh họa">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="#dbe5d6" strokeWidth=".4" />
        </pattern>
      </defs>
      <rect width="100" height="90" fill="url(#grid)" />
      <path d="M0 52 C 20 44, 35 58, 52 40 S 80 30, 100 34" stroke="#b9d6e0" strokeWidth="5" fill="none" opacity=".8" />
      {edges.map((e) => {
        const a = pos(e.a);
        const b = pos(e.b);
        const color = on.has(e.id) ? '#18382D' : e.flood === 'flooded' ? '#9E3830' : e.flood === 'unknown' ? '#C99A3B' : '#a9b8a6';
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={on.has(e.id) ? 2.6 : 1.6} strokeDasharray={e.flood === 'unknown' && !on.has(e.id) ? '2 1.5' : undefined} strokeLinecap="round" />;
      })}
      {NODES.filter((n) => n.label).map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.id === 'home' ? 3.2 : 2.8} fill={n.id === 'home' ? '#D8612A' : highlight?.facility.node === n.id ? '#18382D' : '#fff'} stroke="#18382D" strokeWidth=".8" />
          <text x={n.x} y={n.y - 4.5} fontSize="3.6" fontWeight="700" textAnchor="middle" fill="#211F1B">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
