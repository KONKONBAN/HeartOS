import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { encryptedStateStorage } from '../core/atrest';
import { atRest } from './services';
import { immer } from 'zustand/middleware/immer';
import type {
  CalendarShare,
  CameraSession,
  ChatMsg,
  Contribution,
  FundGoal,
  Hospital,
  Household,
  Invitation,
  Member,
  Memory,
  Permission,
  Prefs,
  Ritual,
  Session,
  SyncDevice,
  SyncJob,
  Task,
  UiMode,
} from './types';

export interface AppState {
  session: Session;
  household: Household | null;
  hospitals: Hospital[];
  members: Member[];
  calendars: CalendarShare[];
  invitations: Invitation[];
  tasks: Task[];
  rituals: Ritual[];
  memories: Memory[];
  goals: FundGoal[];
  contributions: Contribution[];
  permissions: Permission[];
  syncDevices: SyncDevice[];
  syncJobs: SyncJob[];
  cameraSessions: CameraSession[];
  prefs: Prefs;
  chat: ChatMsg[];
  seededAt: number;
  set: (fn: (s: AppState) => void) => void;
  setMode: (m: UiMode) => void;
  actAs: (id: string) => void;
  signOut: () => void;
  resetAll: () => void;
}

const today = (h: number, m = 0, addDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export type AppData = Omit<AppState, 'set' | 'setMode' | 'actAs' | 'signOut' | 'resetAll'>;

export const DEFAULT_PREFS: Prefs = { assistantLang: 'vi-VN', voiceLang: 'vi-VN', readAloud: false, largeText: false, claudeEnabled: false, claudeKey: '', claudeModel: 'claude-opus-5-5', notifications: false, quietFrom: '20:00' };

export function emptyState(session?: Partial<Session>): AppData {
  const now = Date.now();
  return {
    session: { signedIn: false, email: '', householdId: null, mode: null, actingAs: '', startedAt: now, ...session },
    household: null,
    hospitals: [],
    members: [],
    calendars: [],
    invitations: [],
    tasks: [],
    rituals: [],
    memories: [],
    goals: [],
    contributions: [],
    permissions: [],
    syncDevices: [],
    syncJobs: [],
    cameraSessions: [],
    prefs: { ...DEFAULT_PREFS },
    chat: [],
    seededAt: now,
  };
}

export function seed(): AppData {
  const now = Date.now();
  const members: Member[] = [
    { id: 'u-an', name: 'An', short: 'A', relation: 'Con trai, Quản trị hộ', role: 'admin', mode: 'family', lang: 'vi', phone: '+84900000001', color: '#244C3E', address: 'anh', selfRef: 'con' },
    { id: 'u-lan', name: 'Bà Lan', short: 'L', relation: 'Bà nội', role: 'member', mode: 'simple', lang: 'vi', phone: '+84900000002', color: '#753F30', address: 'mẹ', selfRef: 'mẹ' },
    { id: 'u-linh', name: 'Linh', short: 'L', relation: 'Con gái', role: 'member', mode: 'family', lang: 'en', phone: '+84900000003', color: '#6E4E20', address: 'em', selfRef: 'em' },
    { id: 'u-minh', name: 'Minh', short: 'M', relation: 'Cháu, Hồ sơ trẻ', role: 'child', mode: 'family', lang: 'vi', phone: '', color: '#3B6A8A', address: 'con', selfRef: 'con', guardian: 'u-an' },
    { id: 'u-carer', name: 'Khách hỗ trợ', short: 'K', relation: 'Người hỗ trợ theo ca', role: 'carer', mode: 'family', lang: 'vi', phone: '+84900000009', color: '#574F47', address: 'bạn', selfRef: 'tôi', expiresAt: now + 8 * 3600_000 },
  ];
  return {
    session: { signedIn: false, email: 'expo@heartos.local', householdId: null, mode: null, actingAs: 'u-an', startedAt: now },
    household: { id: 'nha-an', name: 'Nhà An', demo: true, createdAt: now - 90 * 86400_000, tz: 'Asia/Ho_Chi_Minh' },
    hospitals: [
      { id: 'h-a', name: 'Cơ sở A', address: 'Bệnh viện gần nhà, cổng cấp cứu số 2', phone: '115', note: 'Cổng 2' },
      { id: 'h-b', name: 'Cơ sở B', address: 'Bệnh viện khu vực, cổng số 1', phone: '115', note: 'Cổng 1' },
    ],
    members,
    calendars: [
      { memberId: 'u-an', windows: [{ start: '18:30', end: '20:00' }], viewers: ['u-lan', 'u-linh', 'svc-rhythm'], shared: true, quietFrom: '20:00', version: 1 },
      { memberId: 'u-linh', windows: [{ start: '19:00', end: '20:30' }], viewers: ['u-an', 'u-lan', 'svc-rhythm'], shared: true, quietFrom: '20:00', version: 1 },
      { memberId: 'u-lan', windows: [{ start: '17:00', end: '20:00' }], viewers: ['u-an', 'u-linh', 'svc-rhythm'], shared: true, quietFrom: '20:00', version: 1 },
    ],
    invitations: [],
    tasks: [
      { id: 't-water', title: 'Tưới cây ngoài ban công', place: 'Ban công', note: 'An nhờ tưới cây trước bữa cơm.', kind: 'chore', assignee: 'u-lan', visibleTo: ['u-an', 'u-lan'], remindAt: today(18, 30), status: 'accepted', createdBy: 'u-an', createdAt: now - 3600_000 },
      { id: 't-call', title: 'Gọi hỏi thăm bà', place: '', note: 'Hỏi bà về lịch khám tuần sau.', kind: 'call', assignee: 'u-an', target: 'u-lan', visibleTo: ['u-an', 'u-lan'], remindAt: nextSunday(10), status: 'scheduled', createdBy: 'u-an', createdAt: now - 7200_000 },
      { id: 't-call-linh', title: 'Gọi hỏi thăm', place: '', note: 'Nhắc gọi cho Linh', kind: 'call', assignee: 'u-lan', target: 'u-linh', visibleTo: ['u-lan', 'u-linh'], remindAt: today(10), status: 'scheduled', createdBy: 'u-lan', createdAt: now - 86400_000 },
    ],
    rituals: [
      { id: 'r-sunday', name: 'Bữa cơm Chủ nhật', recurrence: { freq: 'weekly', weekday: 0, time: '19:00' }, participants: ['u-an', 'u-lan', 'u-linh', 'u-minh'], skip: [], note: 'Mỗi người góp một món.', createdAt: now - 30 * 86400_000, memoryIds: [] },
      { id: 'r-story', name: 'Kể chuyện cùng ông bà', recurrence: { freq: 'monthly-last', weekday: 0, time: '19:00' }, participants: ['u-lan', 'u-minh', 'u-an'], skip: [], note: 'Mỗi tháng một kỷ niệm.', createdAt: now - 60 * 86400_000, memoryIds: ['m-kitchen'] },
    ],
    memories: [
      { id: 'm-kitchen', title: 'Bếp của ngoại', kind: 'story', narrator: 'u-lan', createdAt: now - 5 * 86400_000, lang: 'vi', image: './media/grandma-album.jpg', objectId: 'mem-m-kitchen', viewers: ['u-an', 'u-linh'], retention: 'Theo lựa chọn của người kể', derivedAllowed: true, ritualId: 'r-story', shared: true },
      { id: 'm-sunday', title: 'Bữa cơm Chủ nhật', kind: 'photo', narrator: 'u-an', createdAt: now - 7 * 86400_000, lang: 'vi', image: './media/family-dinner.jpg', objectId: 'mem-m-sunday', viewers: ['u-lan', 'u-linh', 'u-minh'], retention: '5 năm', derivedAllowed: false, ritualId: 'r-sunday', shared: true },
    ],
    goals: [{ id: 'g-trip', name: 'Chuyến đi cùng ông bà', target: 2_000_000, managerId: 'u-an' }],
    contributions: [
      { id: 'c-1', goalId: 'g-trip', amount: 500_000, by: 'u-an', at: now - 4 * 86400_000, objectId: 'fund-c-1', visibleTo: ['u-an'] },
      { id: 'c-2', goalId: 'g-trip', amount: 450_000, by: 'u-linh', at: now - 3 * 86400_000, objectId: 'fund-c-2', visibleTo: ['u-linh', 'u-an'] },
      { id: 'c-3', goalId: 'g-trip', amount: 300_000, by: 'u-lan', at: now - 86400_000, objectId: 'fund-c-3', visibleTo: ['u-lan', 'u-an'] },
    ],
    permissions: [
      { id: 'p-cal', scope: 'calendar', title: 'Lịch rảnh/bận', subtitle: 'Nhịp Nhà, Thành viên đã chọn', ownerId: 'u-linh', viewers: ['u-an', 'u-lan', 'svc-rhythm'], purpose: 'rhythm.intersect', status: 'granted', objectId: 'cal-u-linh' },
      { id: 'p-mem', scope: 'memory', title: 'Ảnh và lời kể', subtitle: 'Người xem theo từng ký ức', ownerId: 'u-lan', viewers: ['u-an', 'u-linh'], purpose: 'memory.view', status: 'granted', objectId: 'mem-m-kitchen' },
      { id: 'p-cam', scope: 'camera', title: 'Vùng camera', subtitle: 'Theo thiết bị, vùng và hạn phiên', ownerId: 'u-an', viewers: ['u-an', 'u-carer'], purpose: 'camera.view', status: 'granted', objectId: 'cam-living', expiresAt: now + 8 * 3600_000 },
      { id: 'p-loc', scope: 'location', title: 'Vị trí khi hỗ trợ', subtitle: 'Người hỗ trợ được chỉ định', ownerId: 'u-lan', viewers: ['u-an', 'u-carer'], purpose: 'support.location', status: 'granted', objectId: 'loc-u-lan' },
    ],
    syncDevices: [
      { id: 'dev-hub', name: 'Hub tại nhà', ownerId: 'u-an', online: true },
      { id: 'dev-an', name: 'Điện thoại của An', ownerId: 'u-an', online: true },
      { id: 'dev-linh', name: 'Máy của Linh', ownerId: 'u-linh', online: false },
      { id: 'dev-carer', name: 'Máy của khách hỗ trợ', ownerId: 'u-carer', online: false },
    ],
    syncJobs: [],
    cameraSessions: [],
    prefs: { ...DEFAULT_PREFS },
    chat: [],
    seededAt: now,
  };
}

function nextSunday(h: number) {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(h, 0, 0, 0);
  return d.getTime();
}

export const useApp = create<AppState>()(
  persist(
    immer((set) => ({
      ...emptyState(),
      set: (fn) => set((s) => void fn(s)),
      setMode: (m) =>
        set((s) => {
          s.session.mode = m;
          if (s.household?.demo) s.session.actingAs = m === 'simple' ? 'u-lan' : s.session.actingAs === 'u-lan' ? 'u-an' : s.session.actingAs;
          else {
            const me = s.members.find((x) => x.id === s.session.actingAs);
            if (me) me.mode = m;
          }
        }),
      actAs: (id) =>
        set((s) => {
          s.session.actingAs = id;
        }),
      signOut: () =>
        set((s) => {
          s.session.signedIn = false;
          s.session.householdId = null;
          s.session.mode = null;
        }),
      resetAll: () => set((s) => ({ ...seed(), session: { ...s.session } })),
    })),
    {
      name: 'heartos-app',
      version: 2,
      migrate: (persisted, version) => {
        const old = persisted as Partial<AppData>;
        if (version < 2 && old && Array.isArray(old.members) && old.members.length) {
          return { ...old, household: { id: 'nha-an', name: 'Nhà An', demo: true, createdAt: Date.now(), tz: 'Asia/Ho_Chi_Minh' }, hospitals: seed().hospitals } as AppData;
        }
        return old as AppData;
      },
      storage: createJSONStorage(() => encryptedStateStorage(atRest)),
      skipHydration: true,
      partialize: (s) => {
        const { set: _a, setMode: _b, actAs: _c, signOut: _d, resetAll: _e, ...rest } = s;
        void _a; void _b; void _c; void _d; void _e;
        return rest;
      },
    },
  ),
);

export const getApp = () => useApp.getState();

export async function hydrateApp() {
  if (!useApp.persist.hasHydrated()) await useApp.persist.rehydrate();
}

const NOBODY: Member = { id: '', name: 'Bạn', short: 'B', relation: '', role: 'member', mode: 'family', lang: 'vi', phone: '', color: '#244C3E', address: 'bạn', selfRef: 'tôi' };

export function useMe(): Member {
  const id = useApp((s) => s.session.actingAs);
  const members = useApp((s) => s.members);
  return members.find((m) => m.id === id) ?? members[0] ?? NOBODY;
}

export function useHouseholdName() {
  return useApp((s) => s.household?.name ?? 'Nhà của bạn');
}

export const isDemo = () => !!getApp().household?.demo;

export function useDemo() {
  return useApp((s) => !!s.household?.demo);
}

export function adultIds(members: Member[], except?: string) {
  return members.filter((m) => (m.role === 'admin' || m.role === 'member') && m.id !== except).map((m) => m.id);
}

export function otherIds(members: Member[], except?: string) {
  return members.filter((m) => m.id !== except).map((m) => m.id);
}

export function memberName(id: string, members: Member[] = getApp().members) {
  if (id === 'svc-rhythm') return 'Nhịp Nhà';
  return members.find((m) => m.id === id)?.name ?? id;
}

export function namesOf(ids: string[], members?: Member[]) {
  const names = ids.filter((i) => i !== 'svc-rhythm').map((i) => memberName(i, members));
  if (names.length <= 1) return names[0] ?? 'Chưa có ai';
  return names.slice(0, -1).join(', ') + ' và ' + names[names.length - 1];
}
