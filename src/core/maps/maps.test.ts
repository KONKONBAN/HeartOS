import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/valhalla-hcm.json';
import { bearing, compassWord, cumulative, decodePolyline, fmtDistance, fmtDuration, haversine, parseLatLng, snapToLine, type LngLat } from './geo';
import { progress, voiceCue } from './navigate';
import { cacheKey, tilesFor } from './offline';
import { cleanStreets, describe as describeTurn, getRoutes, spoken, type Route, type RouteStep, type Turn } from './route';

afterEach(() => vi.unstubAllGlobals());

function encode(points: LngLat[], precision = 6) {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1;
    let r = '';
    while (s >= 0x20) {
      r += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    return r + String.fromCharCode(s + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * f);
    const ln = Math.round(lng * f);
    out += enc(la - pLat) + enc(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

describe('hình học bản đồ', () => {
  it('giải mã polyline đúng chuẩn Google (độ chính xác 5) và Valhalla (6)', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    const pts: LngLat[] = [
      [106.7030, 10.7731],
      [106.70312, 10.77355],
      [106.6965, 10.77514],
    ];
    expect(decodePolyline(encode(pts), 6)).toEqual(pts);
  });

  it('tính khoảng cách và hướng', () => {
    const d = haversine([106.7, 10.77], [106.7, 10.78]);
    expect(d).toBeGreaterThan(1105);
    expect(d).toBeLessThan(1115);
    expect(Math.round(bearing([106.7, 10.77], [106.7, 10.78]))).toBe(0);
    expect(Math.round(bearing([106.7, 10.77], [106.71, 10.77]))).toBe(90);
    expect(compassWord(44)).toBe('đông bắc');
    expect(compassWord(181)).toBe('nam');
    expect(compassWord(350)).toBe('bắc');
  });

  it('định dạng khoảng cách và thời gian kiểu Việt Nam', () => {
    expect(fmtDistance(3)).toBe('5 m');
    expect(fmtDistance(47)).toBe('45 m');
    expect(fmtDistance(184)).toBe('180 m');
    expect(fmtDistance(1234)).toBe('1,2 km');
    expect(fmtDistance(15400)).toBe('15 km');
    expect(fmtDuration(20)).toBe('Dưới 1 phút');
    expect(fmtDuration(14 * 60)).toBe('14 phút');
    expect(fmtDuration(3600)).toBe('1 giờ');
    expect(fmtDuration(3900)).toBe('1 giờ 5 phút');
  });

  it('đọc tọa độ dạng "vĩ độ,kinh độ" và bỏ giá trị sai', () => {
    expect(parseLatLng('10.775143,106.696575')).toEqual([106.696575, 10.775143]);
    expect(parseLatLng('91,10')).toBeNull();
    expect(parseLatLng('abc')).toBeNull();
  });

  it('bám điểm vào tuyến', () => {
    const line: LngLat[] = [
      [106.7, 10.77],
      [106.71, 10.77],
    ];
    const s = snapToLine(line, cumulative(line), [106.705, 10.7701]);
    expect(s.dist).toBeGreaterThan(5);
    expect(s.dist).toBeLessThan(20);
    expect(s.along).toBeCloseTo(cumulative(line)[1] / 2, -1);
  });
});

describe('câu hướng dẫn tiếng Việt', () => {
  it('rút gọn tên đường trùng', () => {
    expect(cleanStreets(['Lê Thánh Tôn', 'Đường Lê Thánh Tôn'])).toBe('Lê Thánh Tôn');
    expect(cleanStreets(['Đường Lê Thánh Tôn', 'Lê Thánh Tôn'])).toBe('Lê Thánh Tôn');
    expect(cleanStreets(['Quốc lộ 1A'])).toBe('Quốc lộ 1A');
    expect(cleanStreets([])).toBe('');
    expect(cleanStreets(undefined)).toBe('');
  });

  it('mỗi loại rẽ có câu đúng nghĩa', () => {
    const cases: [Turn, string, Record<string, unknown>, string][] = [
      ['depart', 'Huỳnh Thúc Kháng', { bearing: 40 }, 'Đi về hướng đông bắc trên Huỳnh Thúc Kháng'],
      ['depart', '', { bearing: 270, mode: 'walk' }, 'Đi bộ về hướng tây'],
      ['right', 'Pasteur', {}, 'Rẽ phải vào Pasteur'],
      ['left', 'Nguyễn Du', {}, 'Rẽ trái vào Nguyễn Du'],
      ['slight-right', 'Hai Bà Trưng', {}, 'Rẽ nhẹ sang phải vào Hai Bà Trưng'],
      ['sharp-left', '', {}, 'Rẽ gắt sang trái'],
      ['uturn', 'Lê Lợi', {}, 'Quay đầu để vào Lê Lợi'],
      ['uturn', '', {}, 'Quay đầu'],
      ['roundabout', 'Ngô Gia Tự', { exit: 4 }, 'Vào vòng xoay, đi lối ra thứ 4 vào Ngô Gia Tự'],
      ['roundabout-exit', 'Ngô Gia Tự', {}, 'Ra khỏi vòng xoay vào Ngô Gia Tự'],
      ['keep-left', 'cầu Sài Gòn', {}, 'Giữ bên trái để vào cầu Sài Gòn'],
      ['merge', 'Xa lộ Hà Nội', {}, 'Nhập làn vào Xa lộ Hà Nội'],
      ['straight', 'Võ Văn Kiệt', {}, 'Đi thẳng trên Võ Văn Kiệt'],
      ['straight', 'Võ Văn Kiệt', { becomes: true }, 'Tiếp tục vào Võ Văn Kiệt'],
      ['straight', '', {}, 'Tiếp tục đi thẳng'],
      ['arrive', '', { side: 'left' }, 'Nơi đến ở bên trái'],
      ['arrive', '', { side: 'right' }, 'Nơi đến ở bên phải'],
      ['arrive', '', {}, 'Đã đến nơi'],
      ['ferry', 'Đò Bình Quới', {}, 'Lên phà Đò Bình Quới'],
      ['ferry', 'Bình Quới', { becomes: true }, 'Rời phà, đi tiếp vào Bình Quới'],
    ];
    for (const [t, street, opts, want] of cases) expect(describeTurn(t, street, opts)).toBe(want);
  });

  it('câu đọc to có khoảng cách và không có ký hiệu lạ', () => {
    const step = { turn: 'left', text: 'Rẽ trái vào Nguyễn Du', street: 'Nguyễn Du', distance: 300, duration: 60, start: 0, end: 1 } as RouteStep;
    expect(spoken(step, 200)).toBe('Sau 200 mét, rẽ trái vào Nguyễn Du');
    expect(spoken(step, 1500)).toBe('Sau 1,5 ki lô mét, rẽ trái vào Nguyễn Du');
    expect(spoken(step, 20)).toBe('Rẽ trái vào Nguyễn Du');
    expect(spoken(step, 200)).not.toMatch(/[·→…–—]/);
  });
});

describe('đọc kết quả Valhalla thật', () => {
  it('chuyển đúng từng bước, khoảng cách và chỉ số tọa độ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200, headers: { 'content-type': 'application/json' } })));
    const routes = await getRoutes([106.703, 10.7731], [106.696575, 10.775143], 'motorbike');
    expect(routes.length).toBe(1 + fixture.alternates.length);
    const r = routes[0];
    const man = fixture.trip.legs[0].maneuvers;
    expect(r.steps.map((s) => s.turn)).toEqual(['depart', 'left', 'left', 'right', 'left', 'arrive']);
    expect(r.steps.map((s) => s.text)).toEqual(['Đi về hướng đông bắc trên Huỳnh Thúc Kháng', 'Rẽ trái vào Hồ Tùng Mậu', 'Rẽ trái vào Tôn Thất Thiệp', 'Rẽ phải vào Pasteur', 'Rẽ trái vào Nguyễn Du', 'Nơi đến ở bên trái']);
    expect(Math.abs(r.distance - fixture.trip.summary.length * 1000)).toBeLessThan(1);
    expect(Math.abs(r.steps.reduce((a, s) => a + s.distance, 0) - r.distance)).toBeLessThan(15);
    for (let i = 0; i < man.length; i++) {
      expect(r.steps[i].start).toBe(man[i].begin_shape_index);
      expect(r.steps[i].end).toBeLessThan(r.coords.length);
      if (i) expect(r.steps[i].start).toBeGreaterThanOrEqual(r.steps[i - 1].start);
    }
    expect(haversine(r.coords[0], [106.703, 10.7731])).toBeLessThan(60);
    expect(haversine(r.coords[r.coords.length - 1], [106.696575, 10.775143])).toBeLessThan(60);
    expect(Math.abs(r.cum[r.cum.length - 1] - r.distance)).toBeLessThan(r.distance * 0.03);
    const url = String((fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(decodeURIComponent(url)).toContain('"costing":"motor_scooter"');
    expect(decodeURIComponent(url)).toContain('"language":"vi-VN"');
  });

  it('chuyển sang OSRM khi Valhalla lỗi', async () => {
    const line: LngLat[] = [
      [106.7, 10.77],
      [106.705, 10.77],
      [106.705, 10.775],
    ];
    const g = (pts: LngLat[]) => encode(pts, 6);
    const osrm = { code: 'Ok', routes: [{ distance: 1100, duration: 200, geometry: g(line), legs: [{ steps: [
      { distance: 550, duration: 100, name: 'Lê Lợi', geometry: g(line.slice(0, 2)), maneuver: { type: 'depart', bearing_after: 90 } },
      { distance: 550, duration: 100, name: 'Pasteur', geometry: g(line.slice(1)), maneuver: { type: 'turn', modifier: 'left' } },
      { distance: 0, duration: 0, name: 'Pasteur', geometry: g([line[2], line[2]]), maneuver: { type: 'arrive' } },
    ] }] }] };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('valhalla') ? new Response('err', { status: 500 }) : new Response(JSON.stringify(osrm), { status: 200 }))));
    const routes = await getRoutes(line[0], line[2], 'car');
    expect(routes[0].provider).toBe('osrm');
    expect(routes[0].steps.map((s) => s.text)).toEqual(['Đi về hướng đông trên Lê Lợi', 'Rẽ trái vào Pasteur', 'Đã đến nơi']);
    expect(routes[0].steps[1].start).toBe(1);
  });

  it('từ chối khi điểm đi và đến trùng nhau', async () => {
    await expect(getRoutes([106.7, 10.77], [106.70001, 10.77001], 'walk')).rejects.toThrow('quá gần');
  });
});

function lRoute(): Route {
  const coords: LngLat[] = [
    [106.7, 10.77],
    [106.702, 10.77],
    [106.704, 10.77],
    [106.704, 10.772],
    [106.704, 10.774],
  ];
  const cum = cumulative(coords);
  const steps: RouteStep[] = [
    { turn: 'depart', text: 'Đi về hướng đông trên A', street: 'A', distance: cum[2], duration: 60, start: 0, end: 2 },
    { turn: 'left', text: 'Rẽ trái vào B', street: 'B', distance: cum[4] - cum[2], duration: 60, start: 2, end: 4 },
    { turn: 'arrive', text: 'Đã đến nơi', street: '', distance: 0, duration: 0, start: 4, end: 4 },
  ];
  return { id: 't', mode: 'motorbike', distance: cum[4], duration: 120, coords, cum, steps, via: '', provider: 'valhalla' };
}

describe('dẫn đường theo GPS', () => {
  it('báo đúng bước kế tiếp và khoảng cách tới chỗ rẽ', () => {
    const r = lRoute();
    const p = progress(r, [106.701, 10.77001], 8, 0);
    expect(p.stepIndex).toBe(0);
    expect(p.next?.text).toBe('Rẽ trái vào B');
    expect(Math.abs(p.toNext - (r.cum[2] - r.cum[1] / 2))).toBeLessThan(5);
    expect(p.offRoute).toBe(false);
    expect(p.arrived).toBe(false);
    expect(p.remainingTime).toBeLessThan(120);
  });

  it('sang bước mới sau khi rẽ', () => {
    const r = lRoute();
    const p = progress(r, [106.70401, 10.771], 8, 1);
    expect(p.stepIndex).toBe(1);
    expect(p.next?.turn).toBe('arrive');
    expect(Math.abs(p.toNext - (r.cum[4] - (r.cum[2] + 111)))).toBeLessThan(8);
  });

  it('phát hiện đi lệch tuyến và tới nơi', () => {
    const r = lRoute();
    expect(progress(r, [106.702, 10.7712], 10, 1).offRoute).toBe(true);
    expect(progress(r, [106.702, 10.7702], 10, 1).offRoute).toBe(false);
    expect(progress(r, [106.70401, 10.77395], 8, 3).arrived).toBe(true);
  });

  it('không nhảy lùi về đoạn đã đi qua khi tuyến gấp khúc', () => {
    const r = lRoute();
    const p = progress(r, [106.7039, 10.7701], 8, 2);
    expect(p.segment).toBeGreaterThanOrEqual(1);
  });

  it('nhắc giọng nói một lần ở xa và một lần ở gần', () => {
    const r = lRoute();
    const keys = new Set<string>();
    const cues: string[] = [];
    for (let lng = 106.7; lng <= 106.704; lng += 0.0001) {
      const p = progress(r, [lng, 10.77], 5, 0);
      const c = voiceCue(p, 'motorbike', keys);
      if (c) {
        keys.add(c.key);
        cues.push(c.key);
      }
    }
    expect(cues).toEqual(['1:far', '1:near']);
  });
});

describe('bản đồ ngoại tuyến', () => {
  it('tính đúng số mảnh bản đồ cần tải', () => {
    const t = tilesFor([[106.65, 10.74], [106.75, 10.82]], 14, 14);
    expect(t.length).toBeGreaterThan(10);
    expect(t.length).toBeLessThan(40);
    expect(tilesFor([[106.65, 10.74], [106.75, 10.82]], 10, 14).length).toBeGreaterThan(t.length);
  });

  it('khóa lưu không phụ thuộc phiên bản dữ liệu để dùng được khi mất mạng', () => {
    expect(cacheKey('https://tiles.openfreemap.org/planet/20261101_080013_pt/14/13048/7698.pbf')).toBe(cacheKey('hos://tiles.openfreemap.org/planet/20261201_090000_pt/14/13048/7698.pbf'));
    expect(cacheKey('https://tiles.openfreemap.org/planet/20261101_080013_pt/14/1/2.pbf')).not.toBe(cacheKey('https://tiles.openfreemap.org/planet/20261101_080013_pt/14/1/3.pbf'));
  });
});
