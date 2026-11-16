import { describe, expect, it } from 'vitest';
import { haversine, pointAlong, type LngLat } from './geo';
import { progress, voiceCue } from './navigate';
import { getRoutes, type TravelMode } from './route';

const TRIPS: { name: string; from: LngLat; to: LngLat }[] = [
  { name: 'Quận 1 tới Chợ Rẫy', from: [106.7009, 10.7769], to: [106.6597, 10.7567] },
  { name: 'Bến Thành tới Thảo Cầm Viên', from: [106.6981, 10.7725], to: [106.7053, 10.7877] },
  { name: 'Thủ Đức tới Quận 1', from: [106.7578, 10.8492], to: [106.7031, 10.7756] },
  { name: 'Hồ Gươm tới Bệnh viện Bạch Mai', from: [105.8522, 21.0287], to: [105.8418, 21.0018] },
  { name: 'Cầu Rồng tới Bệnh viện Đà Nẵng', from: [108.2275, 16.0613], to: [108.2149, 16.0712] },
];
const MODES: TravelMode[] = ['motorbike', 'car', 'walk', 'bike'];

describe.skipIf(!process.env.NET)('kiểm tra chỉ đường trên tuyến thật', () => {
  for (const t of TRIPS) {
    for (const mode of MODES) {
      it(`${t.name}, ${mode}`, async () => {
        const routes = await getRoutes(t.from, t.to, mode);
        expect(routes.length).toBeGreaterThan(0);
        for (const r of routes) {
          expect(r.steps[0].turn).toBe('depart');
          expect(r.steps[r.steps.length - 1].turn).toBe('arrive');
          expect(haversine(r.coords[0], t.from)).toBeLessThan(250);
          expect(haversine(r.coords[r.coords.length - 1], t.to)).toBeLessThan(250);
          const sum = r.steps.reduce((a, s) => a + s.distance, 0);
          expect(Math.abs(sum - r.distance)).toBeLessThan(Math.max(25, r.distance * 0.02));
          for (let i = 0; i < r.steps.length; i++) {
            const s = r.steps[i];
            expect(s.text.trim().length).toBeGreaterThan(3);
            expect(s.text).not.toMatch(/[·→…–—]|undefined|null/);
            expect(s.start).toBeGreaterThanOrEqual(0);
            expect(s.end).toBeLessThan(r.coords.length);
            if (i) expect(s.start).toBe(r.steps[i - 1].end);
          }
        }
        const r = routes[0];
        const total = r.cum[r.cum.length - 1];
        const keys = new Set<string>();
        let seg = 0;
        let lastStep = 0;
        const seen: number[] = [];
        let arrived = false;
        for (let m = 0; m <= total + 5; m += mode === 'walk' ? 6 : 12) {
          const pos = pointAlong(r.coords, r.cum, Math.min(m, total));
          const p = progress(r, pos, 6, seg);
          expect(p.offRoute).toBe(false);
          expect(p.stepIndex).toBeGreaterThanOrEqual(lastStep);
          seg = p.segment;
          lastStep = p.stepIndex;
          const c = voiceCue(p, mode, keys);
          if (c) {
            keys.add(c.key);
            if (!c.far) seen.push(Number(c.key.split(':')[0]));
          }
          if (p.arrived) {
            arrived = true;
            break;
          }
        }
        expect(arrived).toBe(true);
        const turns = r.steps.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && s.turn !== 'arrive' && r.cum[s.start] - r.cum[r.steps[i - 1].start] > 30);
        for (const { i } of turns) expect(seen).toContain(i);
        expect(new Set(seen).size).toBe(seen.length);
      }, 30_000);
    }
  }
});
