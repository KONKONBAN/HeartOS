import { create } from 'zustand';
import { addressOf, checkInText, COOLDOWN, detect, quietHours, URGENT, type Detection, type NavEvent, type Struggle, type TapEvent } from '../core/family/carewatch';
import { dosesOn, type Dose } from '../core/family/meds';
import { speechTrouble } from '../lib/media';
import { getHome } from './services';
import { getApp, useApp } from './store';
import type { Member } from './types';

export interface CheckIn {
  id: string;
  kind: Struggle;
  key: string;
  memberId: string;
  title: string;
  sub: string;
  say: string;
  at: number;
  dose?: Dose;
  incidentId?: string;
}

export interface VoiceOpen {
  intro?: string;
  first?: string;
  from: 'checkin' | 'chat';
}

interface CareState {
  checkin: CheckIn | null;
  voice: VoiceOpen | null;
}

export const useCare = create<CareState>(() => ({ checkin: null, voice: null }));

const navs: NavEvent[] = [];
const taps: TapEvent[] = [];
let helpSince: number | null = null;
let lastNonUrgent = 0;

const INTERACTIVE = 'button,a,input,select,textarea,label,summary,[role=button],[role=link],[role=switch],[role=tab],[role=slider],[role=checkbox],[contenteditable],canvas,video,.maplibregl-map,[data-tap-ok],.sheet,.toast';

export function noteNav(path: string) {
  const now = Date.now();
  if (!/^\/(s|f)(\/|$)/.test(path)) return;
  if (navs[navs.length - 1]?.path === path) return;
  navs.push({ path, at: now });
  while (navs.length && now - navs[0].at > 120_000) navs.shift();
  helpSince = path === '/s/help' ? now : null;
}

function onTap(e: PointerEvent) {
  const t = e.target as Element | null;
  if (!t || !(t instanceof Element) || t.closest(INTERACTIVE)) return;
  const now = Date.now();
  taps.push({ x: e.clientX, y: e.clientY, at: now });
  while (taps.length && now - taps[0].at > 10_000) taps.shift();
}

export function openVoice(v: VoiceOpen) {
  useCare.setState({ voice: v, checkin: null });
}

export function closeVoice() {
  useCare.setState({ voice: null });
}

export function closeCheckIn() {
  useCare.setState({ checkin: null });
}

const askedKey = (k: string) => `care:${k}`;

function lastAsked(key: string) {
  const v = getApp().butlerSeen[askedKey(key)];
  return v ? Number(v) || 0 : 0;
}

function okCount(kind: Struggle) {
  const v = getApp().butlerSeen[`care-ok:${kind}:${new Date().toDateString()}`];
  return v ? Number(v) || 0 : 0;
}

export function noteOk(kind: Struggle) {
  const k = `care-ok:${kind}:${new Date().toDateString()}`;
  useApp.getState().set((s) => void (s.butlerSeen[k] = String(okCount(kind) + 1)));
}

function recentlyAsked(key: string, kind: Struggle) {
  const at = lastAsked(key);
  if (!at) return false;
  if (kind === 'fall' || kind === 'med-missed') return true;
  const factor = 1 + okCount(kind);
  return Date.now() - at < COOLDOWN[kind] * factor;
}

function eligibleKinds(me: Member): Struggle[] {
  if (me.role === 'carer') return [];
  if (me.mode === 'simple') return ['fall', 'sos-idle', 'med-missed', 'speech-fail', 'nav-loop', 'dead-tap'];
  return ['med-missed', 'speech-fail', 'nav-loop', 'dead-tap'];
}

export function currentSignals(me: Member, now = Date.now()) {
  const app = getApp();
  const home = getHome();
  const open = home.openIncidents();
  const fall = open.find((i) => i.kind === 'fall' && now - i.createdAt < 15 * 60_000 && i.status === 'verifying');
  const mine = app.medications.filter((m) => m.memberId === me.id);
  const missed = dosesOn(mine, app.medLogs, new Date(now), now).filter((d) => d.state === 'missed' && now - d.due < 3 * 3600_000);
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  return {
    signals: {
      now,
      navs: path.startsWith('/s/maps') || path.startsWith('/f/maps') ? [] : navs.slice(),
      strictNav: me.mode !== 'simple',
      deadTaps: taps.slice(),
      speechFails: speechTrouble.fails.slice(),
      helpOpenSince: helpSince,
      sosOpen: open.some((i) => i.kind === 'sos'),
      missed: missed.map((d) => ({ key: `${d.med.id}-${d.due}`, name: d.med.name, dose: d.med.dose, time: d.time })),
      fall: fall ? { id: fall.id, room: fall.room, at: fall.createdAt } : null,
    },
    missed,
    fall,
  };
}

export function raise(me: Member, d: Detection, extra: Partial<CheckIn> = {}) {
  const a = addressOf(me);
  const text = checkInText(d, a);
  const c: CheckIn = { id: `${d.key}-${Date.now()}`, kind: d.kind, key: d.key, memberId: me.id, at: Date.now(), ...text, ...extra };
  useApp.getState().set((s) => {
    const old = Date.now() - 3 * 86400_000;
    const today = new Date().toDateString();
    for (const [k, v] of Object.entries(s.butlerSeen)) {
      if ((k.startsWith('care:') && Number(v) < old) || (k.startsWith('care-ok:') && !k.endsWith(today))) delete s.butlerSeen[k];
    }
    s.butlerSeen[askedKey(d.key)] = String(Date.now());
  });
  if (!URGENT.includes(d.kind)) lastNonUrgent = Date.now();
  useCare.setState({ checkin: c });
  return c;
}

function check() {
  const app = getApp();
  if (!app.session.signedIn || !app.session.mode || document.visibilityState === 'hidden') return;
  if (app.prefs.ai.checkins === false || (window as unknown as { __HEARTOS_NO_CHECKIN__?: boolean }).__HEARTOS_NO_CHECKIN__) return;
  const care = useCare.getState();
  if (care.checkin || care.voice) return;
  const me = app.members.find((m) => m.id === app.session.actingAs);
  if (!me) return;
  const kinds = eligibleKinds(me);
  if (!kinds.length) return;
  const { signals, missed, fall } = currentSignals(me);
  const d = detect(signals, (key, kind) => !kinds.includes(kind) || recentlyAsked(key, kind) || (!URGENT.includes(kind) && Date.now() - lastNonUrgent < 10 * 60_000));
  if (!d) return;
  const extra: Partial<CheckIn> = {};
  if (d.kind === 'med-missed') extra.dose = missed.find((x) => `med:${x.med.id}-${x.due}` === d.key);
  if (d.kind === 'fall' && fall) extra.incidentId = fall.id;
  if (d.kind === 'nav-loop') navs.length = 0;
  if (d.kind === 'dead-tap') taps.length = 0;
  if (d.kind === 'speech-fail') speechTrouble.fails = [];
  raise(me, d, extra);
}

export function voiceAllowed(kind: Struggle) {
  const ai = getApp().prefs.ai;
  if (ai.checkinVoice === false) return false;
  return URGENT.includes(kind) || !quietHours(new Date());
}

let started = false;
export function startCareWatch() {
  if (started) return;
  started = true;
  document.addEventListener('pointerdown', onTap, { capture: true, passive: true });
  setInterval(check, 2000);
}
