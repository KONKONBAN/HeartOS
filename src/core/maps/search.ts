import { endpoints, getJson } from './config';
import { haversine, type LngLat } from './geo';

export type PlaceCategory = 'hospital' | 'pharmacy' | 'food' | 'cafe' | 'shop' | 'fuel' | 'atm' | 'school' | 'park' | 'worship' | 'hotel' | 'transit' | 'office' | 'home' | 'saved' | 'street' | 'area' | 'other';

export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  kind?: string;
  phone?: string;
  distance?: number;
}

export interface CategoryChip {
  id: PlaceCategory;
  label: string;
  tags: string[];
  query: string;
}

export const CHIPS: CategoryChip[] = [
  { id: 'hospital', label: 'Bệnh viện', tags: ['amenity:hospital', 'amenity:clinic'], query: 'bệnh viện' },
  { id: 'pharmacy', label: 'Nhà thuốc', tags: ['amenity:pharmacy'], query: 'nhà thuốc' },
  { id: 'food', label: 'Quán ăn', tags: ['amenity:restaurant', 'amenity:fast_food'], query: 'quán ăn' },
  { id: 'cafe', label: 'Cà phê', tags: ['amenity:cafe'], query: 'cà phê' },
  { id: 'shop', label: 'Siêu thị', tags: ['shop:supermarket', 'shop:convenience', 'amenity:marketplace'], query: 'siêu thị' },
  { id: 'fuel', label: 'Cây xăng', tags: ['amenity:fuel'], query: 'cây xăng' },
  { id: 'atm', label: 'ATM', tags: ['amenity:atm', 'amenity:bank'], query: 'atm' },
  { id: 'school', label: 'Trường học', tags: ['amenity:school', 'amenity:kindergarten'], query: 'trường' },
];

const KIND_LABEL: Record<string, string> = {
  hospital: 'Bệnh viện',
  clinic: 'Phòng khám',
  doctors: 'Phòng khám',
  dentist: 'Nha khoa',
  pharmacy: 'Nhà thuốc',
  restaurant: 'Nhà hàng',
  fast_food: 'Quán ăn nhanh',
  food_court: 'Khu ẩm thực',
  cafe: 'Quán cà phê',
  bar: 'Quán bar',
  supermarket: 'Siêu thị',
  convenience: 'Cửa hàng tiện lợi',
  marketplace: 'Chợ',
  mall: 'Trung tâm thương mại',
  fuel: 'Cây xăng',
  atm: 'Cây ATM',
  bank: 'Ngân hàng',
  school: 'Trường học',
  kindergarten: 'Trường mầm non',
  university: 'Trường đại học',
  college: 'Trường cao đẳng',
  park: 'Công viên',
  place_of_worship: 'Nơi thờ tự',
  hotel: 'Khách sạn',
  guest_house: 'Nhà nghỉ',
  bus_stop: 'Trạm xe buýt',
  bus_station: 'Bến xe',
  station: 'Nhà ga',
  aerodrome: 'Sân bay',
  townhall: 'Cơ quan nhà nước',
  police: 'Công an',
  post_office: 'Bưu điện',
  residential: 'Khu dân cư',
  house: 'Địa chỉ',
  primary: 'Đường',
  secondary: 'Đường',
  tertiary: 'Đường',
  residential_road: 'Đường',
};

function categoryOf(key: string, value: string): PlaceCategory {
  if (key === 'highway') return value === 'bus_stop' ? 'transit' : 'street';
  if (key === 'place' || key === 'boundary') return 'area';
  if (['hospital', 'clinic', 'doctors', 'dentist'].includes(value)) return 'hospital';
  if (value === 'pharmacy') return 'pharmacy';
  if (['restaurant', 'fast_food', 'food_court', 'bar'].includes(value)) return 'food';
  if (value === 'cafe') return 'cafe';
  if (key === 'shop' || value === 'marketplace' || value === 'mall') return 'shop';
  if (value === 'fuel') return 'fuel';
  if (value === 'atm' || value === 'bank') return 'atm';
  if (['school', 'kindergarten', 'university', 'college'].includes(value)) return 'school';
  if (key === 'leisure' || value === 'park') return 'park';
  if (value === 'place_of_worship') return 'worship';
  if (key === 'tourism' && ['hotel', 'guest_house', 'hostel', 'motel'].includes(value)) return 'hotel';
  if (key === 'railway' || key === 'public_transport' || ['bus_station', 'aerodrome'].includes(value)) return 'transit';
  if (key === 'office' || ['townhall', 'police', 'post_office'].includes(value)) return 'office';
  return 'other';
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    type?: string;
  };
}

function photonToPlace(f: PhotonFeature, near?: LngLat): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const road = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [road, p.locality, p.district, p.city ?? p.county, p.city ? undefined : p.state].filter((x): x is string => !!x && x !== p.name);
  const seen = new Set<string>();
  const address = parts.filter((x) => (seen.has(x) ? false : (seen.add(x), true))).join(', ');
  const key = p.osm_key ?? '';
  const value = p.osm_value ?? '';
  const name = p.name || road || p.district || p.city || 'Địa điểm chưa có tên';
  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`}`,
    name,
    address: address || [p.state, p.country].filter(Boolean).join(', '),
    lat,
    lng,
    category: categoryOf(key, value),
    kind: KIND_LABEL[value] ?? (key === 'highway' ? 'Đường' : undefined),
    distance: near ? haversine(near, [lng, lat]) : undefined,
  };
}

function dedupe(list: Place[]) {
  const out: Place[] = [];
  for (const p of list) {
    if (out.some((q) => q.id === p.id || (q.name === p.name && haversine([q.lng, q.lat], [p.lng, p.lat]) < 60))) continue;
    out.push(p);
  }
  return out;
}

export async function searchPlaces(q: string, opts: { near?: LngLat; limit?: number; signal?: AbortSignal } = {}): Promise<Place[]> {
  const text = q.trim();
  if (!text) return [];
  const limit = opts.limit ?? 8;
  const params = new URLSearchParams({ q: text, limit: String(limit + 4) });
  if (opts.near) {
    params.set('lat', opts.near[1].toFixed(5));
    params.set('lon', opts.near[0].toFixed(5));
    params.set('location_bias_scale', '0.4');
  }
  try {
    const j = await getJson<{ features: PhotonFeature[] }>(`${endpoints().geocoder}/api?${params}`, opts.signal);
    const list = dedupe(j.features.map((f) => photonToPlace(f, opts.near)));
    if (list.length) return list.slice(0, limit);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  return nominatimSearch(text, opts);
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
}

async function nominatimSearch(q: string, opts: { near?: LngLat; limit?: number; signal?: AbortSignal }): Promise<Place[]> {
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: String(opts.limit ?? 8), 'accept-language': 'vi' });
  if (opts.near) {
    const [x, y] = opts.near;
    params.set('viewbox', `${x - 0.3},${y + 0.3},${x + 0.3},${y - 0.3}`);
  }
  const j = await getJson<NominatimItem[]>(`${endpoints().nominatim}/search?${params}`, opts.signal);
  return j.map((it) => {
    const lat = Number(it.lat);
    const lng = Number(it.lon);
    const name = it.name || it.display_name.split(',')[0];
    return {
      id: `N${it.place_id}`,
      name,
      address: it.display_name.split(',').slice(1, 4).map((s) => s.trim()).join(', '),
      lat,
      lng,
      category: categoryOf(it.category ?? '', it.type ?? ''),
      kind: KIND_LABEL[it.type ?? ''],
      distance: opts.near ? haversine(opts.near, [lng, lat]) : undefined,
    };
  });
}

export async function nearbyCategory(chip: CategoryChip, center: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const found: Place[] = [];
  for (const span of [0.025, 0.08]) {
    const bbox = [center[0] - span, center[1] - span, center[0] + span, center[1] + span].map((v) => v.toFixed(5)).join(',');
    const batches = await Promise.all(
      chip.tags.map(async (tag) => {
        const params = new URLSearchParams({ q: tag.split(':')[1].replace('_', ' '), osm_tag: tag, limit: '15', lat: center[1].toFixed(5), lon: center[0].toFixed(5), bbox });
        try {
          const j = await getJson<{ features: PhotonFeature[] }>(`${endpoints().geocoder}/api?${params}`, signal);
          return j.features.map((f) => photonToPlace(f, center));
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          return [];
        }
      }),
    );
    found.push(...batches.flat());
    if (dedupe(found).length >= 5) break;
  }
  return dedupe(found)
    .map((p) => ({ ...p, category: chip.id }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, 20);
}

export async function reverseGeocode(p: LngLat, signal?: AbortSignal): Promise<Place | null> {
  try {
    const j = await getJson<{ features: PhotonFeature[] }>(`${endpoints().geocoder}/reverse?lat=${p[1].toFixed(6)}&lon=${p[0].toFixed(6)}&limit=1`, signal);
    const f = j.features[0];
    if (!f) return null;
    const place = photonToPlace(f, p);
    return { ...place, lat: p[1], lng: p[0], distance: undefined };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return null;
  }
}
