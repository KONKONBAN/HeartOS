import type { AutomationRule, Device, Room, Scene } from './types';

export function seedRooms(now: number): Room[] {
  return [
    { id: 'living', name: 'Phòng khách', short: 'Khách', rect: { x: 4, y: 4, w: 44, h: 40 }, sensing: ['radar', 'thermal', 'camera', 'smoke'], lastSignal: now - 20_000 },
    { id: 'kitchen', name: 'Bếp', short: 'Bếp', rect: { x: 52, y: 4, w: 44, h: 26 }, sensing: ['smoke', 'leak', 'radar'], lastSignal: now - 45_000 },
    { id: 'door', name: 'Cửa chính', short: 'Cửa', rect: { x: 4, y: 48, w: 18, h: 22 }, sensing: ['door'], lastSignal: now - 90_000 },
    { id: 'hall', name: 'Hành lang', short: 'Hành lang', rect: { x: 26, y: 48, w: 70, h: 14 }, sensing: ['radar', 'thermal'], lastSignal: now - 30_000 },
    { id: 'bedroom', name: 'Phòng ngủ bà', short: 'Phòng ngủ', rect: { x: 26, y: 66, w: 40, h: 30 }, sensing: ['radar', 'thermal'], lastSignal: now - 60_000 },
    { id: 'laundry', name: 'Phòng giặt', short: 'Phòng giặt', rect: { x: 70, y: 66, w: 26, h: 30 }, sensing: ['leak'], lastSignal: now - 6 * 60_000, stale: true },
  ];
}

const base = (now: number) => ({ online: true, paired: true, lastSeen: now, zoneLocked: true, latencyMs: 700 });

export function seedDevices(now: number): Device[] {
  const b = base(now);
  return [
    { ...b, id: 'hub', name: 'HeartOS Hub', kind: 'hub', room: 'living', model: 'Hub N100 · LAN', firmware: '1.4.0', essential: true, state: { cpu: 18, storage: 41 }, controlRoles: [], latencyMs: 80 },
    { ...b, id: 'light-living', name: 'Đèn phòng khách', kind: 'light', room: 'living', model: 'Zigbee bulb E27', firmware: '2.1', state: { on: true, brightness: 80, temp: 'warm' }, controlRoles: ['admin', 'member', 'child'], confirmedAt: now - 120_000, latencyMs: 900 },
    { ...b, id: 'light-kitchen', name: 'Đèn bếp', kind: 'light', room: 'kitchen', model: 'Zigbee panel', firmware: '2.1', state: { on: false, brightness: 100, temp: 'neutral' }, controlRoles: ['admin', 'member', 'child'], latencyMs: 600 },
    { ...b, id: 'light-hall', name: 'Đèn hành lang', kind: 'light', room: 'hall', model: 'Zigbee strip', firmware: '2.0', state: { on: false, brightness: 30, temp: 'warm' }, controlRoles: ['admin', 'member', 'child'], latencyMs: 500 },
    { ...b, id: 'light-bedroom', name: 'Đèn ngủ của bà', kind: 'light', room: 'bedroom', model: 'Zigbee bulb', firmware: '2.1', state: { on: false, brightness: 20, temp: 'warm' }, controlRoles: ['admin', 'member'], latencyMs: 650 },
    { ...b, id: 'plug-hall', name: 'Ổ cắm hành lang', kind: 'plug', room: 'hall', model: 'Smart plug 16A', firmware: '1.8', online: false, lastSeen: now - 4 * 60_000, state: { on: false, powerW: 0 }, controlRoles: ['admin', 'member'], latencyMs: 800 },
    { ...b, id: 'plug-kettle', name: 'Ấm siêu tốc', kind: 'plug', room: 'kitchen', model: 'Smart plug 16A', firmware: '1.8', state: { on: false, powerW: 0 }, controlRoles: ['admin', 'member'], latencyMs: 700 },
    { ...b, id: 'plug-washer', name: 'Máy giặt', kind: 'plug', room: 'laundry', model: 'Smart plug 16A', firmware: '1.8', state: { on: false, powerW: 0 }, controlRoles: ['admin', 'member'], latencyMs: 750 },
    { ...b, id: 'ac-bedroom', name: 'Điều hòa phòng bà', kind: 'ac', room: 'bedroom', model: 'IR bridge', firmware: '3.0', state: { on: false, target: 27, mode: 'cool' }, controlRoles: ['admin', 'member'], latencyMs: 1200 },
    { ...b, id: 'curtain-living', name: 'Rèm phòng khách', kind: 'curtain', room: 'living', model: 'Motor rèm', firmware: '1.2', state: { position: 100 }, controlRoles: ['admin', 'member', 'child'], latencyMs: 1500 },
    { ...b, id: 'lock-door', name: 'Khóa cửa chính', kind: 'lock', room: 'door', model: 'Khóa Zigbee', firmware: '4.2', battery: 64, state: { locked: true }, controlRoles: ['admin'], latencyMs: 1100 },
    { ...b, id: 'valve-main', name: 'Van nước tổng', kind: 'valve', room: 'laundry', model: 'Van điện 24V', firmware: '1.0', essential: true, state: { open: true }, controlRoles: ['admin', 'member'], latencyMs: 1600 },
    { ...b, id: 'siren', name: 'Còi báo tại nhà', kind: 'siren', room: 'hall', model: 'Còi 105 dB', firmware: '1.1', essential: true, state: { on: false }, controlRoles: ['admin', 'member'], latencyMs: 300 },
    { ...b, id: 'door-main', name: 'Cảm biến cửa · DR-01', kind: 'door', room: 'door', model: 'Contact sensor', firmware: '1.3', battery: 88, state: { open: false }, controlRoles: [] },
    { ...b, id: 'smoke-kitchen', name: 'Còi khói/CO bếp', kind: 'smoke', room: 'kitchen', model: 'Smoke+CO', firmware: '2.2', battery: 92, essential: true, state: { smoke: false, co: 3 }, controlRoles: [] },
    { ...b, id: 'smoke-living', name: 'Còi khói phòng khách', kind: 'smoke', room: 'living', model: 'Smoke', firmware: '2.2', battery: 90, essential: true, state: { smoke: false, co: 2 }, controlRoles: [] },
    { ...b, id: 'leak-kitchen', name: 'Cảm biến nước bếp', kind: 'leak', room: 'kitchen', model: 'Leak sensor', firmware: '1.0', battery: 76, state: { wet: false }, controlRoles: [] },
    { ...b, id: 'leak-laundry', name: 'Cảm biến nước phòng giặt', kind: 'leak', room: 'laundry', model: 'Leak sensor', firmware: '1.0', battery: 12, online: false, lastSeen: now - 6 * 60_000, state: { wet: false }, controlRoles: [] },
    { ...b, id: 'radar-hall', name: 'Radar hành lang', kind: 'radar', room: 'hall', model: 'LD2450 2D', firmware: 'V2.04', essential: true, state: { targets: 0 }, controlRoles: [] },
    { ...b, id: 'radar-living', name: 'Radar phòng khách', kind: 'radar', room: 'living', model: 'LD2450 2D', firmware: 'V2.04', essential: true, state: { targets: 1 }, controlRoles: [] },
    { ...b, id: 'radar-bedroom', name: 'Radar phòng ngủ', kind: 'radar', room: 'bedroom', model: 'LD2450 2D', firmware: 'V2.04', essential: true, state: { targets: 0 }, controlRoles: [] },
    { ...b, id: 'thermal-hall', name: 'Ảnh nhiệt hành lang', kind: 'thermal', room: 'hall', model: 'MLX90640 32×24', firmware: '1.0', essential: true, state: { maxC: 24 }, controlRoles: [] },
    { ...b, id: 'thermal-living', name: 'Ảnh nhiệt phòng khách', kind: 'thermal', room: 'living', model: 'MLX90640 32×24', firmware: '1.0', essential: true, state: { maxC: 33 }, controlRoles: [] },
    { ...b, id: 'cam-living', name: 'Camera phòng khách', kind: 'camera', room: 'living', model: 'Camera 2K · che vùng', firmware: '5.1', state: { privacy: false, masks: 2 }, controlRoles: ['admin'] },
    { ...b, id: 'sos-living', name: 'Nút SOS phòng khách', kind: 'sos', room: 'living', model: 'Nút SOS Zigbee', firmware: '1.0', battery: 81, essential: true, state: { pressed: false }, controlRoles: [] },
    { ...b, id: 'sos-bedroom', name: 'Nút SOS đầu giường', kind: 'sos', room: 'bedroom', model: 'Nút SOS Zigbee', firmware: '1.0', battery: 95, essential: true, state: { pressed: false }, controlRoles: [] },
    { ...b, id: 'ups', name: 'UPS / BMS', kind: 'ups', room: 'hall', model: 'UPS 1kVA LiFePO4', firmware: 'BMS 2.3', essential: true, state: { battery: 78 }, controlRoles: [] },
    { ...b, id: 'generator', name: 'Máy phát + ATS', kind: 'generator', room: 'laundry', model: 'Máy phát 5kW + ATS', firmware: 'ATS 1.6', state: { state: 'standby' }, controlRoles: [] },
    { ...b, id: 'router', name: 'Router & mạng', kind: 'router', room: 'living', model: 'Router dual-WAN', firmware: '7.2', essential: true, state: { wan: 'fiber' }, controlRoles: [] },
  ];
}

export function seedScenes(): Scene[] {
  return [
    {
      id: 'dinner',
      name: 'Bữa cơm cùng nhà',
      description: 'Đèn ấm phòng khách và bếp, mở rèm, tắt ấm siêu tốc.',
      icon: 'utensils',
      actions: [
        { deviceId: 'light-living', action: 'set', params: { on: true, brightness: 85, temp: 'warm' } },
        { deviceId: 'light-kitchen', action: 'set', params: { on: true, brightness: 90, temp: 'neutral' } },
        { deviceId: 'curtain-living', action: 'set', params: { position: 60 } },
        { deviceId: 'plug-kettle', action: 'set', params: { on: false } },
      ],
    },
    {
      id: 'night',
      name: 'Đi ngủ',
      description: 'Tắt đèn chung, đèn hành lang 10% dẫn lối, khóa cửa, điều hòa phòng bà 27°C.',
      icon: 'moon',
      actions: [
        { deviceId: 'light-living', action: 'set', params: { on: false } },
        { deviceId: 'light-kitchen', action: 'set', params: { on: false } },
        { deviceId: 'light-hall', action: 'set', params: { on: true, brightness: 10 } },
        { deviceId: 'lock-door', action: 'set', params: { locked: true } },
        { deviceId: 'ac-bedroom', action: 'set', params: { on: true, target: 27 } },
      ],
    },
    {
      id: 'away',
      name: 'Vắng nhà',
      description: 'Tắt đèn và ổ cắm không thiết yếu, khóa cửa. Cảm biến an toàn vẫn chạy.',
      icon: 'lock',
      actions: [
        { deviceId: 'light-living', action: 'set', params: { on: false } },
        { deviceId: 'light-kitchen', action: 'set', params: { on: false } },
        { deviceId: 'light-hall', action: 'set', params: { on: false } },
        { deviceId: 'plug-kettle', action: 'set', params: { on: false } },
        { deviceId: 'lock-door', action: 'set', params: { locked: true } },
      ],
    },
    {
      id: 'welcome-grandma',
      name: 'Đón ông bà',
      description: 'Mở khóa cửa, bật đèn hành lang 60%, mở rèm phòng khách.',
      icon: 'heart',
      actions: [
        { deviceId: 'lock-door', action: 'set', params: { locked: false } },
        { deviceId: 'light-hall', action: 'set', params: { on: true, brightness: 60 } },
        { deviceId: 'curtain-living', action: 'set', params: { position: 100 } },
      ],
    },
  ];
}

export function seedRules(): AutomationRule[] {
  return [
    {
      id: 'r-smoke',
      name: 'Khói/CO → báo tại chỗ',
      description: 'Bật còi tại nhà, bật đèn dẫn lối và mở ca P1. Đường báo tối thiểu chạy cả khi mất Internet.',
      enabled: true,
      builtin: true,
      trigger: { type: 'sensor', deviceId: 'smoke-kitchen', event: 'smoke' },
      actions: [
        { type: 'device', deviceId: 'siren', action: 'set', params: { on: true } },
        { type: 'device', deviceId: 'light-hall', action: 'set', params: { on: true, brightness: 100 } },
        { type: 'incident', kind: 'smoke', priority: 'P1' },
      ],
      fireCount: 0,
    },
    {
      id: 'r-leak',
      name: 'Rò nước → khóa van tổng',
      description: 'Khi cảm biến nước báo ướt: khóa van tổng và thông báo người quản thiết bị.',
      enabled: true,
      builtin: true,
      trigger: { type: 'sensor', deviceId: 'leak-kitchen', event: 'leak' },
      actions: [
        { type: 'device', deviceId: 'valve-main', action: 'set', params: { open: false } },
        { type: 'notify', text: 'Phát hiện nước ở bếp — đã gửi lệnh khóa van tổng.', severity: 'warning' },
        { type: 'incident', kind: 'leak', priority: 'P2' },
      ],
      fireCount: 0,
    },
    {
      id: 'r-night-path',
      name: 'Đêm có chuyển động hành lang → đèn dẫn lối',
      description: '22:00–06:00, radar hành lang thấy người: bật đèn hành lang 30%.',
      enabled: true,
      builtin: true,
      trigger: { type: 'sensor', deviceId: 'radar-hall', event: 'motion' },
      condition: { timeBetween: ['22:00', '06:00'] },
      actions: [{ type: 'device', deviceId: 'light-hall', action: 'set', params: { on: true, brightness: 30 } }],
      fireCount: 0,
    },
    {
      id: 'r-fall',
      name: 'Nghi ngã → mở ca xác minh',
      description: 'Guardian ghép radar–nhiệt vượt ngưỡng: mở ca P2 "đang xác minh", không tự kết luận.',
      enabled: true,
      builtin: true,
      trigger: { type: 'guardian', event: 'fall_suspected' },
      actions: [
        { type: 'incident', kind: 'fall', priority: 'P2' },
        { type: 'device', deviceId: 'light-hall', action: 'set', params: { on: true, brightness: 70 } },
      ],
      fireCount: 0,
    },
    {
      id: 'r-shed',
      name: 'Mất điện lưới → cắt tải không thiết yếu',
      description: 'Khi chạy UPS: tắt ổ cắm không thiết yếu, giữ hub, cảm biến và đường SOS.',
      enabled: true,
      builtin: true,
      trigger: { type: 'power', event: 'mains_lost' },
      actions: [{ type: 'shed' }, { type: 'notify', text: 'Mất điện lưới — UPS đang cấp cho tải ưu tiên.', severity: 'warning' }],
      fireCount: 0,
    },
    {
      id: 'r-away-door',
      name: 'Vắng nhà + cửa mở → cảnh báo',
      description: 'Chế độ Vắng nhà, cảm biến cửa mở: thông báo cho quản trị hộ.',
      enabled: true,
      builtin: true,
      trigger: { type: 'sensor', deviceId: 'door-main', event: 'open' },
      condition: { mode: 'away' },
      actions: [{ type: 'notify', text: 'Cửa chính mở trong lúc chế độ Vắng nhà.', severity: 'critical' }],
      fireCount: 0,
    },
    {
      id: 'r-sos',
      name: 'Nút SOS → báo tại nhà và người thân',
      description: 'Bật còi, mở ca P1, gửi tới danh sách hỗ trợ của nhà.',
      enabled: true,
      builtin: true,
      trigger: { type: 'sensor', deviceId: 'sos-living', event: 'sos' },
      actions: [{ type: 'incident', kind: 'sos', priority: 'P1' }],
      fireCount: 0,
    },
  ];
}
