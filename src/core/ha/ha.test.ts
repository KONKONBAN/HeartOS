import { describe, expect, it } from 'vitest';
import { memoryJsonStore } from '../storage';
import { HomeEngine } from '../smarthome/engine';
import { HaClient, HaError, normalizeHaUrl, type HaState, type HaTransport } from './client';
import { mapStates, satisfies, servicesFor } from './map';

const iso = (t: number) => new Date(t).toISOString();

function st(entity_id: string, state: string, attributes: Record<string, unknown> = {}, t = Date.parse('2026-11-15T08:00:00Z')): HaState {
  return { entity_id, state, attributes, last_changed: iso(t), last_updated: iso(t) };
}

function house(o: { smoke?: boolean; light?: boolean; brightness?: number; radar?: { x: number; y: number; speed: number } | null } = {}): HaState[] {
  const r = o.radar === undefined ? { x: 400, y: 1800, speed: 0 } : o.radar;
  return [
    st('light.phong_khach', o.light ? 'on' : 'off', { friendly_name: 'Đèn phòng khách', brightness: o.brightness ?? 255, supported_color_modes: ['color_temp'], color_temp_kelvin: 2700 }),
    st('switch.o_cam_bep', 'on', { friendly_name: 'Ổ cắm bếp', current_power_w: 812.4 }),
    st('switch.coi_bao_dong', 'off', { friendly_name: 'Còi báo động' }),
    st('binary_sensor.khoi_bep', o.smoke ? 'on' : 'off', { friendly_name: 'Báo khói bếp', device_class: 'smoke', battery_level: 88 }),
    st('binary_sensor.ro_nuoc', 'off', { friendly_name: 'Cảm biến nước', device_class: 'moisture' }),
    st('binary_sensor.cua_chinh', 'off', { friendly_name: 'Cửa chính', device_class: 'door' }),
    st('binary_sensor.nut_sos_ba', 'off', { friendly_name: 'Nút SOS của bà' }),
    st('cover.rem', 'open', { friendly_name: 'Rèm', current_position: 60, supported_features: 15 }),
    st('climate.dieu_hoa', 'cool', { friendly_name: 'Điều hòa', temperature: 26, current_temperature: 29 }),
    st('lock.cua_chinh', 'locked', { friendly_name: 'Khóa cửa' }),
    st('camera.phong_khach', 'idle', { friendly_name: 'Camera phòng khách' }),
    st('sensor.mlx90640_max', '31.2', { friendly_name: 'Ảnh nhiệt phòng ngủ', unit_of_measurement: '°C' }),
    st('sensor.ups_battery', '73', { friendly_name: 'UPS pin', device_class: 'battery' }),
    st('sensor.guardian_target_1_x', r ? String(r.x) : '0'),
    st('sensor.guardian_target_1_y', r ? String(r.y) : '0'),
    st('sensor.guardian_target_1_speed', r ? String(r.speed) : '0'),
    st('sensor.nhiet_do_ngoai_troi', '30', { unit_of_measurement: '°C' }),
    st('scene.bua_toi', 'scening', { friendly_name: 'Bữa tối' }),
    st('script.di_ngu', 'off', { friendly_name: 'Đi ngủ' }),
    st('automation.bat_den_hanh_lang', 'on', { friendly_name: 'Bật đèn hành lang', last_triggered: '2026-11-15T07:00:00Z' }),
  ];
}

const AREAS: Record<string, string> = {
  'light.phong_khach': 'Phòng khách',
  'camera.phong_khach': 'Phòng khách',
  'switch.o_cam_bep': 'Bếp',
  'binary_sensor.khoi_bep': 'Bếp',
  'sensor.mlx90640_max': 'Phòng ngủ bà',
  'sensor.guardian_target_1_x': 'Phòng ngủ bà',
};

describe('Home Assistant mapping', () => {
  it('maps entities to HeartOS devices, rooms, scenes and automations', () => {
    const snap = mapStates(house({ light: true, brightness: 128 }), AREAS);
    const kind = (id: string) => snap.devices.find((d) => d.id === id)?.kind;
    expect(kind('light.phong_khach')).toBe('light');
    expect(kind('switch.o_cam_bep')).toBe('plug');
    expect(kind('switch.coi_bao_dong')).toBe('siren');
    expect(kind('binary_sensor.khoi_bep')).toBe('smoke');
    expect(kind('binary_sensor.ro_nuoc')).toBe('leak');
    expect(kind('binary_sensor.cua_chinh')).toBe('door');
    expect(kind('binary_sensor.nut_sos_ba')).toBe('sos');
    expect(kind('cover.rem')).toBe('curtain');
    expect(kind('climate.dieu_hoa')).toBe('ac');
    expect(kind('lock.cua_chinh')).toBe('lock');
    expect(kind('camera.phong_khach')).toBe('camera');
    expect(kind('sensor.mlx90640_max')).toBe('thermal');
    expect(kind('sensor.ups_battery')).toBe('ups');
    expect(kind('sensor.nhiet_do_ngoai_troi')).toBeUndefined();
    const light = snap.devices.find((d) => d.id === 'light.phong_khach')!;
    expect(light.state).toMatchObject({ on: true, brightness: 50, temp: 'warm' });
    expect(light.room).toBe('phong-khach');
    expect(light.ha?.ct).toBe(true);
    expect(snap.devices.find((d) => d.id === 'climate.dieu_hoa')!.state).toMatchObject({ on: true, target: 26, current: 29 });
    expect(snap.devices.find((d) => d.id === 'switch.o_cam_bep')!.state.powerW).toBeCloseTo(812.4);
    expect(snap.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(['Phòng khách', 'Bếp', 'Phòng ngủ bà', 'Chưa gán phòng']));
    expect(snap.scenes.map((s) => s.entity)).toEqual(['scene.bua_toi', 'script.di_ngu']);
    expect(snap.automations[0]).toMatchObject({ entity: 'automation.bat_den_hanh_lang', enabled: true });
    expect(snap.radar['phong-ngu-ba']).toEqual([{ x: 400, y: 1800, speed: 0 }]);
    expect(snap.devices.find((d) => d.kind === 'radar')?.room).toBe('phong-ngu-ba');
  });

  it('builds Home Assistant service calls for each command', () => {
    const snap = mapStates(house(), AREAS);
    const dev = (id: string) => snap.devices.find((d) => d.id === id)!;
    expect(servicesFor(dev('light.phong_khach'), { on: true, brightness: 40, temp: 'cool' })).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: 'light.phong_khach', brightness_pct: 40, color_temp_kelvin: 6000 } }]);
    expect(servicesFor(dev('light.phong_khach'), { on: false })[0].service).toBe('turn_off');
    expect(servicesFor(dev('switch.coi_bao_dong'), { on: true })).toEqual([{ domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.coi_bao_dong' } }]);
    expect(servicesFor(dev('cover.rem'), { position: 30 })).toEqual([{ domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.rem', position: 30 } }]);
    expect(servicesFor({ ...dev('cover.rem'), ha: { entity: 'cover.rem', domain: 'cover', features: 3 } }, { position: 0 })[0].service).toBe('close_cover');
    expect(servicesFor(dev('climate.dieu_hoa'), { target: 24 })).toEqual([{ domain: 'climate', service: 'set_temperature', data: { entity_id: 'climate.dieu_hoa', temperature: 24 } }]);
    expect(servicesFor(dev('lock.cua_chinh'), { locked: false })[0]).toMatchObject({ domain: 'lock', service: 'unlock' });
    expect(servicesFor(dev('binary_sensor.khoi_bep'), { smoke: false })).toEqual([]);
  });

  it('confirms commands only when the reported state matches', () => {
    const snap = mapStates(house({ light: true, brightness: 102 }), AREAS);
    const light = snap.devices.find((d) => d.id === 'light.phong_khach')!;
    expect(satisfies(light, { on: true, brightness: 40 })).toBe(true);
    expect(satisfies(light, { on: true, brightness: 80 })).toBe(false);
    expect(satisfies(light, { on: false })).toBe(false);
  });
});

function fakeTransport(routes: Record<string, (body?: unknown) => { status: number; data: unknown }>, calls: { method: string; url: string; body?: unknown; auth?: string }[] = []): HaTransport {
  return {
    async request(method, url, headers, body) {
      calls.push({ method, url, body, auth: headers.Authorization });
      const path = new URL(url).pathname;
      const h = routes[`${method} ${path}`];
      if (!h) return { status: 404, data: 'not found' };
      return h(body);
    },
  };
}

describe('HaClient', () => {
  it('normalizes addresses', () => {
    expect(normalizeHaUrl('192.168.1.10')).toBe('http://192.168.1.10:8123');
    expect(normalizeHaUrl('https://nha.ui.nabu.casa/')).toBe('https://nha.ui.nabu.casa');
    expect(normalizeHaUrl('http://homeassistant.local:8123/lovelace')).toBe('http://homeassistant.local:8123');
  });

  it('checks the API, reads areas and sends bearer token', async () => {
    const calls: { method: string; url: string; body?: unknown; auth?: string }[] = [];
    const c = new HaClient('192.168.1.10', 'tok', fakeTransport({
      'GET /api/': () => ({ status: 200, data: { message: 'API running.' } }),
      'GET /api/config': () => ({ status: 200, data: { version: '2026.11.1', location_name: 'Nhà' } }),
      'POST /api/template': () => ({ status: 200, data: 'light.a\tPhòng khách\nswitch.b\t\n' }),
      'POST /api/services/light/turn_on': () => ({ status: 200, data: [] }),
    }, calls));
    expect(await c.check()).toEqual({ message: 'API running.', version: '2026.11.1', location: 'Nhà' });
    expect(await c.areas()).toEqual({ 'light.a': 'Phòng khách' });
    await c.call('light', 'turn_on', { entity_id: 'light.a' });
    expect(calls.every((x) => x.auth === 'Bearer tok')).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: 'http://192.168.1.10:8123/api/services/light/turn_on', body: { entity_id: 'light.a' } });
  });

  it('reports a bad token clearly', async () => {
    const c = new HaClient('http://ha.local:8123', 'bad', fakeTransport({ 'GET /api/': () => ({ status: 401, data: '' }) }));
    await expect(c.check()).rejects.toBeInstanceOf(HaError);
    await expect(c.check()).rejects.toThrow(/Mã truy cập không hợp lệ/);
  });
});

describe('HomeEngine with Home Assistant', () => {
  const ADMIN = { id: 'm-1', name: 'Hạnh', role: 'admin' as const };

  function setup() {
    let t = Date.parse('2026-11-15T08:00:00Z');
    const clock = { now: () => t, advance: (ms: number) => (t += ms) };
    const e = new HomeEngine(memoryJsonStore(), clock.now);
    e.reset(true);
    const executed: { id: string; desired: Record<string, unknown> }[] = [];
    e.attachBridge({
      async execute(d, desired) {
        executed.push({ id: d.id, desired });
      },
      async runScene() {},
      async setAutomation() {},
      async triggerAutomation() {},
    });
    return { e, clock, executed };
  }

  it('sends commands through the bridge and confirms them from reported state', async () => {
    const { e, clock, executed } = setup();
    e.applyExternal(mapStates(house(), AREAS));
    const cmd = e.sendCommand('light.phong_khach', 'set', { on: true }, ADMIN, 'user');
    expect(cmd.status).toBe('sent');
    await Promise.resolve();
    await Promise.resolve();
    expect(executed).toEqual([{ id: 'light.phong_khach', desired: { on: true } }]);
    expect(e.device('light.phong_khach')!.state.on).toBe(false);
    clock.advance(1500);
    e.applyExternal(mapStates(house({ light: true }), AREAS));
    expect(e.s.commands[0].status).toBe('acked');
    expect(e.device('light.phong_khach')!.state.on).toBe(true);
  });

  it('expires commands the device never confirms', () => {
    const { e, clock } = setup();
    e.applyExternal(mapStates(house(), AREAS));
    e.sendCommand('light.phong_khach', 'set', { on: true }, ADMIN, 'user');
    clock.advance(21_000);
    e.applyExternal(mapStates(house(), AREAS));
    expect(e.s.commands[0].status).toBe('expired');
  });

  it('refuses commands when Home Assistant is not connected', () => {
    const { e } = setup();
    e.applyExternal(mapStates(house(), AREAS));
    e.attachBridge(null);
    expect(e.sendCommand('light.phong_khach', 'set', { on: true }, ADMIN, 'user').status).toBe('failed');
  });

  it('opens an incident on a rising smoke edge only once', () => {
    const { e, clock } = setup();
    e.applyExternal(mapStates(house(), AREAS));
    clock.advance(3000);
    e.applyExternal(mapStates(house({ smoke: true }), AREAS));
    clock.advance(3000);
    e.applyExternal(mapStates(house({ smoke: true }), AREAS));
    const smoke = e.openIncidents().filter((i) => i.kind === 'smoke');
    expect(smoke).toHaveLength(1);
    expect(smoke[0].priority).toBe('P1');
  });

  it('flags a suspected fall after a radar speed spike and 30 s of stillness', () => {
    const { e, clock } = setup();
    e.applyExternal(mapStates(house({ radar: { x: 300, y: 2000, speed: 40 } }), AREAS));
    clock.advance(3000);
    e.applyExternal(mapStates(house({ radar: { x: 500, y: 2300, speed: 180 } }), AREAS));
    for (let i = 0; i < 9; i++) {
      clock.advance(3000);
      e.applyExternal(mapStates(house({ radar: { x: 520, y: 2320, speed: 0 } }), AREAS));
    }
    expect(e.openIncidents().some((i) => i.kind === 'fall')).toBe(false);
    for (let i = 0; i < 3; i++) {
      clock.advance(3000);
      e.applyExternal(mapStates(house({ radar: { x: 520, y: 2320, speed: 0 } }), AREAS));
    }
    const fall = e.openIncidents().find((i) => i.kind === 'fall');
    expect(fall).toBeDefined();
    expect(fall!.status).toBe('verifying');
    expect(fall!.evidence.some((x) => x.kind === 'thermal')).toBe(true);
  });

  it('does not flag a fall when the person keeps walking', () => {
    const { e, clock } = setup();
    for (let i = 0; i < 20; i++) {
      clock.advance(3000);
      e.applyExternal(mapStates(house({ radar: { x: 300 + i * 200, y: 2000, speed: i === 5 ? 160 : 60 } }), AREAS));
    }
    expect(e.openIncidents().some((i) => i.kind === 'fall')).toBe(false);
  });
});
