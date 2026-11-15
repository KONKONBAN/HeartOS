import { describe, expect, it } from 'vitest';
import { compareRoutes, seedEdges } from '../guardian/routes';
import { memoryJsonStore } from '../storage';
import { HomeEngine } from './engine';

function clock(start = new Date('2026-11-14T18:40:00+07:00').getTime()) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function run(e: HomeEngine, c: ReturnType<typeof clock>, ms: number, step = 250) {
  for (let x = 0; x < ms; x += step) {
    c.advance(step);
    e.tick();
  }
}

const AN = { id: 'u-an', name: 'An', role: 'admin' as const };
const MINH = { id: 'u-minh', name: 'Minh', role: 'child' as const };


function demo(now: () => number) {
  const e = new HomeEngine(memoryJsonStore(), now);
  e.reset(false);
  return e;
}

describe('HomeEngine commands', () => {
  it('only changes device state after device ack', () => {
    const c = clock();
    const e = demo(c.now);
    const cmd = e.sendCommand('light-living', 'set', { on: false }, AN);
    expect(cmd.status).toBe('queued');
    expect(e.device('light-living')!.state.on).toBe(true);
    run(e, c, 500);
    expect(e.s.commands[0].status).toBe('awaiting');
    expect(e.device('light-living')!.state.on).toBe(true);
    run(e, c, 1500);
    expect(e.s.commands[0].status).toBe('acked');
    expect(e.device('light-living')!.state.on).toBe(false);
  });

  it('keeps offline device commands pending, then expires', () => {
    const c = clock();
    const e = demo(c.now);
    e.sendCommand('plug-hall', 'toggle', {}, AN);
    run(e, c, 7000);
    expect(e.s.commands[0].status).toBe('awaiting');
    expect(e.s.commands[0].reason).toMatch(/ngoại tuyến/);
    run(e, c, 60_000, 1000);
    expect(e.s.commands[0].status).toBe('expired');
  });

  it('enforces household roles and lock approval', () => {
    const c = clock();
    const e = demo(c.now);
    expect(e.sendCommand('valve-main', 'set', { open: false }, MINH).status).toBe('rejected');
    expect(e.sendCommand('lock-door', 'set', { locked: false }, AN).status).toBe('rejected');
    expect(e.sendCommand('lock-door', 'set', { locked: false }, AN, 'user', 'approval-1').status).toBe('queued');
  });
});

describe('Guardian', () => {
  it('fusion of radar + thermal opens a verifying fall case', () => {
    const c = clock();
    const e = demo(c.now);
    e.simulate('fall_hall');
    run(e, c, 25_000, 500);
    const inc = e.s.incidents.find((i) => i.kind === 'fall');
    expect(inc).toBeTruthy();
    expect(inc!.status).toBe('verifying');
    expect(inc!.priority).toBe('P2');
    e.verifyFall(inc!.id, 'needs_help', AN);
    expect(e.incident(inc!.id)!.priority).toBe('P1');
  });

  it('SOS goes local, remote, then helper', () => {
    const c = clock();
    const e = demo(c.now);
    const inc = e.sos({ id: 'u-lan', name: 'Bà Lan', role: 'member' });
    expect(inc.id).toBe('HS-042');
    expect(inc.steps.local.state).toBe('done');
    run(e, c, 2000);
    expect(e.incident(inc.id)!.steps.remote.state).toBe('done');
    run(e, c, 5000);
    expect(e.incident(inc.id)!.steps.helper.by).toBe('An');
  });

  it('SOS while offline marks remote channel unknown', () => {
    const c = clock();
    const e = demo(c.now);
    e.simulate('internet_lost');
    const inc = e.sos({ id: 'u-lan', name: 'Bà Lan', role: 'member' });
    run(e, c, 3000);
    expect(e.incident(inc.id)!.steps.remote.state).toBe('unknown');
  });

  it('route comparison matches design (A 12 min, B 17 min, 2/3 complete)', () => {
    const edges = seedEdges();
    const r = compareRoutes(edges);
    expect(r.recommended).toBe('fa');
    expect(r.completeCount).toBe(2);
    expect(r.results.find((x) => x.facility.id === 'fa')!.minutes).toBe(12);
    expect(r.results.find((x) => x.facility.id === 'fb')!.minutes).toBe(17);
    edges.find((x) => x.id === 'e3')!.flood = 'flooded';
    expect(compareRoutes(edges).results.find((x) => x.facility.id === 'fa')!.minutes).toBe(17);
  });
});

describe('Power', () => {
  it('ATS: battery, generator, then mains', () => {
    const c = clock();
    const e = demo(c.now);
    e.simulate('mains_lost');
    expect(e.s.power.ats).toBe('battery');
    run(e, c, 9000, 1000);
    expect(e.s.power.ats).toBe('generator');
    e.simulate('mains_restored');
    run(e, c, 7000, 1000);
    expect(e.s.power.ats).toBe('mains');
    run(e, c, 9000, 1000);
    expect(e.s.power.generator).toBe('standby');
  });
});
