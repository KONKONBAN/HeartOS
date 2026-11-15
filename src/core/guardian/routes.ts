/**
 * So tuyến tới cơ sở y tế — đồ thị đường minh họa (không phải bản đồ thật).
 * Mỗi đoạn có thời gian cơ sở và trạng thái ngập: clear / flooded / unknown.
 * Tuyến chỉ "đủ dữ kiện" khi mọi đoạn có dữ liệu ngập; đoạn ngập bị loại khỏi tìm đường.
 */

export type FloodState = 'clear' | 'flooded' | 'unknown';

export interface RoadNode {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  minutes: number;
  name: string;
  flood: FloodState;
}

export interface Facility {
  id: string;
  name: string;
  gate: string;
  node: string;
  address: string;
  note: string;
}

export interface RouteResult {
  facility: Facility;
  path: string[];
  edges: RoadEdge[];
  minutes: number;
  complete: boolean;
  blocked: boolean;
  pendingEdges: RoadEdge[];
}

export const NODES: RoadNode[] = [
  { id: 'home', x: 12, y: 78, label: 'Nhà An' },
  { id: 'n1', x: 26, y: 64 },
  { id: 'n2', x: 40, y: 70 },
  { id: 'n3', x: 46, y: 48 },
  { id: 'n4', x: 62, y: 58 },
  { id: 'n5', x: 58, y: 30 },
  { id: 'n6', x: 76, y: 40 },
  { id: 'n7', x: 30, y: 30 },
  { id: 'fa', x: 86, y: 22, label: 'Cơ sở A' },
  { id: 'fb', x: 84, y: 72, label: 'Cơ sở B' },
  { id: 'fc', x: 22, y: 12, label: 'Cơ sở C' },
];

export function seedEdges(): RoadEdge[] {
  return [
    { id: 'e1', a: 'home', b: 'n1', minutes: 2, name: 'Hẻm nhà', flood: 'clear' },
    { id: 'e2', a: 'n1', b: 'n3', minutes: 3, name: 'Đường số 7', flood: 'clear' },
    { id: 'e3', a: 'n3', b: 'n5', minutes: 3, name: 'Cầu kênh', flood: 'clear' },
    { id: 'e4', a: 'n5', b: 'fa', minutes: 4, name: 'Đại lộ phía bắc', flood: 'clear' },
    { id: 'e5', a: 'n1', b: 'n2', minutes: 3, name: 'Đường ven chợ', flood: 'clear' },
    { id: 'e6', a: 'n2', b: 'n4', minutes: 4, name: 'Đường Lê', flood: 'clear' },
    { id: 'e7', a: 'n4', b: 'fb', minutes: 8, name: 'Đường vành đai', flood: 'clear' },
    { id: 'e8', a: 'n4', b: 'n6', minutes: 4, name: 'Đường trũng', flood: 'clear' },
    { id: 'e9', a: 'n6', b: 'fa', minutes: 4, name: 'Đường bệnh viện', flood: 'clear' },
    { id: 'e10', a: 'n3', b: 'n7', minutes: 4, name: 'Đường kênh tây', flood: 'unknown' },
    { id: 'e11', a: 'n7', b: 'fc', minutes: 5, name: 'Đường ven sông', flood: 'unknown' },
  ];
}

export const FACILITIES: Facility[] = [
  { id: 'fa', name: 'Cơ sở A', gate: 'Cổng 2', node: 'fa', address: 'Bệnh viện gần nhà — cổng cấp cứu số 2', note: 'Cổng và đường đã đối chiếu' },
  { id: 'fb', name: 'Cơ sở B', gate: 'Cổng 1', node: 'fb', address: 'Bệnh viện khu vực — cổng số 1', note: 'Cổng và đường đã đối chiếu' },
  { id: 'fc', name: 'Cơ sở C', gate: 'Cổng chính', node: 'fc', address: 'Trung tâm y tế ven sông', note: 'Đang chờ kiểm tra dữ liệu ngập' },
];

/** Dijkstra, bỏ qua đoạn đang ngập; đoạn "unknown" vẫn đi được nhưng đánh dấu tuyến chưa đủ dữ kiện. */
export function route(edges: RoadEdge[], from: string, facility: Facility): RouteResult {
  const usable = edges.filter((e) => e.flood !== 'flooded');
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: RoadEdge }>();
  const q = new Set(NODES.map((n) => n.id));
  while (q.size) {
    let u: string | null = null;
    for (const n of q) if (dist.has(n) && (u === null || dist.get(n)! < dist.get(u)!)) u = n;
    if (u === null) break;
    q.delete(u);
    if (u === facility.node) break;
    for (const e of usable) {
      const v = e.a === u ? e.b : e.b === u ? e.a : null;
      if (!v || !q.has(v)) continue;
      const alt = dist.get(u)! + e.minutes;
      if (!dist.has(v) || alt < dist.get(v)!) {
        dist.set(v, alt);
        prev.set(v, { node: u, edge: e });
      }
    }
  }
  if (!dist.has(facility.node)) return { facility, path: [], edges: [], minutes: Infinity, complete: false, blocked: true, pendingEdges: [] };
  const path = [facility.node];
  const es: RoadEdge[] = [];
  let cur = facility.node;
  while (prev.has(cur)) {
    const p = prev.get(cur)!;
    es.unshift(p.edge);
    path.unshift(p.node);
    cur = p.node;
  }
  const pending = es.filter((e) => e.flood === 'unknown');
  return { facility, path, edges: es, minutes: dist.get(facility.node)!, complete: pending.length === 0, blocked: false, pendingEdges: pending };
}

export function compareRoutes(edges: RoadEdge[]) {
  const results = FACILITIES.map((f) => route(edges, 'home', f));
  const ranked = [...results].sort((a, b) => Number(b.complete) - Number(a.complete) || a.minutes - b.minutes);
  return { results, recommended: ranked.find((r) => r.complete && !r.blocked)?.facility.id, completeCount: results.filter((r) => r.complete && !r.blocked).length };
}

export function mapsLink(f: Facility) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`;
}
