import { describe, expect, it } from 'vitest';
import { commonSlots, fmtSlot } from './calendar';
import { checkDraft, localDraft, parseIntent, type InviteFacts } from './genai';
import { nextOccurrence } from './recurrence';

describe('Nhịp Nhà calendar intersection', () => {
  it('reproduces replay F.8 (A 18:30-20:00, B 19:00-20:30, quiet 20:00, kết quả 19:00-20:00)', () => {
    const r = commonSlots([
      { memberId: 'A', windows: [{ start: '18:30', end: '20:00' }] },
      { memberId: 'B', windows: [{ start: '19:00', end: '20:30' }] },
    ]);
    expect(r.best && fmtSlot(r.best)).toBe('19:00-20:00');
  });
  it('reports when quiet hours cut the window', () => {
    const r = commonSlots([
      { memberId: 'A', windows: [{ start: '19:30', end: '21:00' }] },
      { memberId: 'B', windows: [{ start: '19:30', end: '22:00' }] },
    ]);
    expect(r.best).toBeNull();
    expect(r.reason).toMatch(/yên tĩnh/);
  });
});

describe('GenAI local draft', () => {
  const facts: InviteFacts = {
    occasion: 'Bữa cơm cùng nhà',
    slot: { start: 19 * 60, end: 20 * 60 },
    tz: 'GMT+7',
    host: 'An',
    hostSelf: 'con',
    place: 'nhà An',
    tone: 'warm',
    recipients: [
      { id: 'u-lan', name: 'Bà Lan', address: 'mẹ', lang: 'vi' },
      { id: 'u-linh', name: 'Linh', address: 'em', lang: 'en' },
    ],
  };
  it('passes schema and fact checks', () => {
    const d = localDraft(facts);
    const c = checkDraft(d, facts);
    expect(c.checks.filter((x) => !x.ok)).toEqual([]);
    expect(d.messages[1].text).toContain('7 PM');
  });
  it('rejects a hallucinated time and unaccented Vietnamese', () => {
    const d = localDraft(facts);
    d.messages[0].text = 'Me oi, toi nay an com luc 8 gio nhe?';
    const c = checkDraft(d, facts);
    expect(c.ok).toBe(false);
  });
  it('parses intents', () => {
    expect(parseIntent('Soạn lời mời ăn cơm cho mẹ').kind).toBe('invite');
    expect(parseIntent('bật đèn phòng khách').kind).toBe('device');
  });
});

describe('recurrence', () => {
  it('finds next Sunday 19:00 and last Sunday of month', () => {
    const from = new Date(2026, 10, 14, 18, 42);
    const w = nextOccurrence({ freq: 'weekly', weekday: 0, time: '19:00' }, from);
    expect([w.getDate(), w.getHours()]).toEqual([15, 19]);
    const m = nextOccurrence({ freq: 'monthly-last', weekday: 0, time: '19:00' }, from);
    expect(m.getDate()).toBe(29);
  });
});
