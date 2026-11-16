import { describe, expect, it } from 'vitest';
import { addressOf, checkInText, deadTapBurst, detect, forSpeech, interpretReply, isStop, navLoop, quietHours, type Signals } from './carewatch';
import { feedbackAfter, learn, suggestions, type HabitEvent } from './habits';
import { daysLeft, dosesOn, lowStock, normalizeTimes, type Medication } from './meds';

const at = (base: Date, daysAgo: number, h: number, m: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

describe('tự học thói quen', () => {
  const now = new Date(2026, 10, 16, 18, 0, 0);
  const events: HabitEvent[] = [];
  for (let i = 1; i <= 10; i++) events.push({ who: 'u-lan', kind: 'task', key: 'task:tưới cây', label: 'tưới cây', at: at(now, i, 18, 20 + ((i * 7) % 11) - 5) });

  it('nhận ra việc lặp lại hằng ngày quanh cùng một giờ', () => {
    const h = learn(events, now.getTime());
    expect(h).toHaveLength(1);
    expect(h[0].weekday).toBeNull();
    expect(Math.abs(h[0].minute - (18 * 60 + 20))).toBeLessThanOrEqual(10);
    expect(h[0].confidence).toBeGreaterThan(0.6);
  });

  it('không học khi mới thấy dưới 3 lần', () => {
    expect(learn(events.slice(0, 2), now.getTime())).toHaveLength(0);
  });

  it('nhận ra thói quen theo thứ trong tuần', () => {
    const sundays: HabitEvent[] = [];
    const sun = new Date(2026, 10, 15, 12, 0, 0);
    for (let w = 0; w < 4; w++) sundays.push({ who: 'u-an', kind: 'call', key: 'call:u-lan', label: 'gọi bà', at: at(sun, w * 7, 10, 5 + w) });
    const h = learn(sundays, new Date(2026, 10, 16, 9).getTime());
    expect(h[0]?.weekday).toBe(0);
  });

  it('nhắc đúng lúc sắp đến giờ và bỏ qua khi đã làm hôm nay', () => {
    const habits = learn(events, now.getTime());
    const s = suggestions({ habits, events, feedback: {}, me: 'u-lan', now: now.getTime() });
    expect(s[0]?.type).toBe('upcoming');
    const done = [...events, { ...events[0], at: at(now, 0, 17, 50) }];
    expect(suggestions({ habits, events: done, feedback: {}, me: 'u-lan', now: now.getTime() })).toHaveLength(0);
  });

  it('bỏ qua hai lần thì tạm im 14 ngày', () => {
    const once = feedbackAfter(undefined, false, now.getTime());
    const twice = feedbackAfter(once, false, now.getTime());
    expect(twice.dismissed).toBe(2);
    expect((twice.snoozeUntil ?? 0) - now.getTime()).toBe(14 * 86400_000);
  });
});

describe('nhắc uống thuốc', () => {
  const med: Medication = { id: 'm1', memberId: 'u-lan', name: 'Amlodipine 5 mg', dose: '1 viên', times: ['07:00', '19:00'], weekdays: null, meal: 'after', note: '', stock: 9, perDose: 1, caregivers: ['u-an'], active: true, createdBy: 'u-an', createdAt: 0 };
  const day = new Date(2026, 10, 16);
  const t = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();

  it('xếp trạng thái từng liều theo giờ hiện tại', () => {
    expect(dosesOn([med], [], day, t(6, 0)).map((d) => d.state)).toEqual(['later', 'later']);
    expect(dosesOn([med], [], day, t(6, 45))[0].state).toBe('due');
    expect(dosesOn([med], [], day, t(7, 31))[0].state).toBe('missed');
    const logs = [{ medId: 'm1', due: t(7), status: 'taken' as const, at: t(7, 5), by: 'u-lan' }];
    expect(dosesOn([med], logs, day, t(9))[0].state).toBe('taken');
  });

  it('bỏ qua thuốc đang tạm dừng và ngày không uống', () => {
    expect(dosesOn([{ ...med, active: false }], [], day, t(8))).toHaveLength(0);
    expect(dosesOn([{ ...med, weekdays: [day.getDay() === 0 ? 1 : 0] }], [], day, t(8))).toHaveLength(0);
  });

  it('báo sắp hết thuốc khi còn dưới 5 ngày', () => {
    expect(daysLeft(med)).toBe(4);
    expect(lowStock(med)).toBe(true);
    expect(lowStock({ ...med, stock: 30 })).toBe(false);
    expect(lowStock({ ...med, stock: null })).toBe(false);
  });

  it('chuẩn hóa giờ uống', () => {
    expect(normalizeTimes(['7:00', '19:30', '07:00', 'abc', ' 6:15 '])).toEqual(['06:15', '07:00', '19:30']);
  });
});

describe('chủ động hỏi thăm khi gặp khó khăn', () => {
  const base: Signals = { now: 1_000_000, navs: [], deadTaps: [], speechFails: [], helpOpenSince: null, sosOpen: false, missed: [], fall: null };
  const never = () => false;

  it('xưng hô đúng: bà, ông xưng con; anh chị xưng em', () => {
    expect(addressOf({ name: 'Bà Lan' })).toMatchObject({ you: 'bà', me: 'con' });
    expect(addressOf({ name: 'Ông Tư' })).toMatchObject({ you: 'ông', me: 'con' });
    expect(addressOf({ name: 'An', address: 'anh' })).toMatchObject({ you: 'anh An', me: 'em' });
    expect(addressOf({ name: 'Minh', role: 'child', address: 'con' })).toMatchObject({ you: 'Minh', me: 'mình' });
    expect(addressOf({ name: 'Hoa', address: 'mẹ' })).toMatchObject({ you: 'Hoa', me: 'mình' });
  });

  it('câu hỏi thăm có đúng lời "Dạ, con có thể giúp được gì không ạ?"', () => {
    const a = addressOf({ name: 'Bà Lan' });
    for (const kind of ['nav-loop', 'dead-tap', 'speech-fail', 'fall', 'sos-idle', 'med-missed'] as const) {
      expect(checkInText({ kind, key: kind, detail: kind === 'fall' ? 'living' : 'Amlodipine' }, a).say).toContain('Dạ, con có thể giúp được gì không ạ?');
    }
    expect(checkInText({ kind: 'fall', key: 'f', detail: 'bedroom' }, a).say).toContain('phòng ngủ');
  });

  it('nhận ra chuyển màn hình qua lại liên tục', () => {
    const navs = ['/s', '/s/today', '/s', '/s/today', '/s', '/s/call'].map((path, i) => ({ path, at: base.now - 50_000 + i * 8000 }));
    expect(navLoop(navs, base.now)).toBe(true);
    expect(navLoop(navs.slice(0, 4), base.now)).toBe(false);
    const spread = ['/s', '/s/today', '/s/call', '/s/memory', '/s/help', '/s/more'].map((path, i) => ({ path, at: base.now - 50_000 + i * 8000 }));
    expect(navLoop(spread, base.now)).toBe(false);
    expect(navLoop(navs, base.now + 120_000)).toBe(false);
  });

  it('nhận ra chạm nhiều lần vào chỗ không bấm được', () => {
    const taps = [0, 400, 800, 1200].map((d) => ({ x: 100 + d / 100, y: 200, at: base.now - 2000 + d }));
    expect(deadTapBurst(taps, base.now)).toBe(true);
    expect(deadTapBurst(taps.map((t, i) => ({ ...t, x: i * 200 })), base.now)).toBe(false);
  });

  it('ưu tiên nghi ngã trước mọi tín hiệu khác', () => {
    const s: Signals = { ...base, speechFails: [base.now - 1000, base.now - 500], fall: { id: 'HS-1', room: 'living', at: base.now } };
    expect(detect(s, never)?.kind).toBe('fall');
    expect(detect(s, (k) => k.startsWith('fall'))?.kind).toBe('speech-fail');
  });

  it('mở màn hình Cần giúp quá 25 giây mà chưa gửi SOS thì hỏi', () => {
    expect(detect({ ...base, helpOpenSince: base.now - 26_000 }, never)?.kind).toBe('sos-idle');
    expect(detect({ ...base, helpOpenSince: base.now - 10_000 }, never)).toBeNull();
    expect(detect({ ...base, helpOpenSince: base.now - 26_000, sosOpen: true }, never)).toBeNull();
  });

  it('không hỏi lại khi vừa hỏi xong', () => {
    const s: Signals = { ...base, speechFails: [base.now - 1000, base.now - 500] };
    expect(detect(s, never)?.kind).toBe('speech-fail');
    expect(detect(s, () => true)).toBeNull();
  });

  it('hiểu câu trả lời ngắn bằng tiếng Việt', () => {
    expect(interpretReply('Không sao đâu con')).toBe('no');
    expect(interpretReply('dạ không')).toBe('no');
    expect(interpretReply('Tôi ổn')).toBe('no');
    expect(interpretReply('có')).toBe('yes');
    expect(interpretReply('Dạ có')).toBe('yes');
    expect(interpretReply('giúp tôi với')).toBe('yes');
    expect(interpretReply('không biết gọi cho thằng An thế nào')).toBe('request');
    expect(interpretReply('gọi cho An giúp bà')).toBe('request');
    expect(interpretReply('')).toBe('silent');
    expect(interpretReply('uống rồi con', 'med-missed')).toBe('taken');
    expect(interpretReply('bà đã uống rồi', 'med-missed')).toBe('taken');
    expect(interpretReply('chưa', 'med-missed')).toBe('notyet');
  });

  it('nhận ra lời muốn kết thúc trò chuyện', () => {
    expect(isStop('thôi')).toBe(true);
    expect(isStop('Thôi con nhé')).toBe(true);
    expect(isStop('tạm biệt')).toBe(true);
    expect(isStop('cảm ơn con')).toBe(true);
    expect(isStop('thời tiết hôm nay thế nào')).toBe(false);
    expect(isStop('bật đèn phòng khách')).toBe(false);
  });

  it('đọc to không lẫn ký hiệu định dạng', () => {
    expect(forSpeech('**Dạ**, bà nhớ:\n- uống thuốc\n- tưới cây')).toBe('Dạ, bà nhớ:, uống thuốc, tưới cây');
  });

  it('giờ yên tĩnh từ 22 giờ đến 6 giờ', () => {
    expect(quietHours(new Date(2026, 10, 16, 23))).toBe(true);
    expect(quietHours(new Date(2026, 10, 16, 5, 59))).toBe(true);
    expect(quietHours(new Date(2026, 10, 16, 6))).toBe(false);
    expect(quietHours(new Date(2026, 10, 16, 21, 59))).toBe(false);
  });
});

describe('đọc to tự nhiên', () => {
  it('đọc giờ và đơn vị thuốc như người nói', () => {
    expect(forSpeech('Amlodipine 5 mg lúc 07:00 và 19:30')).toBe('Amlodipine 5 mi li gam lúc 7 giờ và 19 giờ 30');
  });
});

describe('Gia Đình chỉ hỏi khi bấm qua lại giữa hai màn hình', () => {
  it('lướt nhiều màn hình khác nhau thì không hỏi', () => {
    const now = 1_000_000;
    const browse = ['/f', '/f/tasks', '/f', '/f/rhythm', '/f', '/f/memories', '/f'].map((path, i) => ({ path, at: now - 50_000 + i * 7000 }));
    expect(navLoop(browse, now)).toBe(true);
    expect(navLoop(browse, now, true)).toBe(false);
    const ping = ['/f', '/f/tasks', '/f', '/f/tasks', '/f', '/f/tasks'].map((path, i) => ({ path, at: now - 50_000 + i * 8000 }));
    expect(navLoop(ping, now, true)).toBe(true);
    const afterLogin = [{ path: '/welcome', at: now - 58_000 }, { path: '/mode', at: now - 55_000 }, ...ping];
    expect(navLoop(afterLogin, now, true)).toBe(true);
  });
});
