import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApprovalSheet, Logo, Toasts } from './components/ui';
import { systemNotify } from './lib/media';
import { toast } from './lib/ui-store';
import { bootstrap, endCamera, tickSync } from './state/actions';
import { getHome, servicesReady } from './state/services';
import { initHa } from './state/ha';
import { getApp, hydrateApp, useApp } from './state/store';
import * as A from './screens/auth/Auth';
import * as S from './screens/simple/Simple';
import * as SM from './screens/simple/SimpleMore';
import * as FH from './screens/family/Home';
import * as FR from './screens/family/Rhythm';
import * as FT from './screens/family/Tasks';
import * as FM from './screens/family/Memories';
import * as FA from './screens/family/Assistant';
import { FAiSettings, FAiTech } from './screens/family/AiSettings';
import { FNewsletter, FSoften } from './screens/family/Caring';
import { FHabits, FMedNew, FMeds } from './screens/family/Meds';
import { startHabits } from './state/habits';
import { startButler } from './state/butler';
import { CareLayer } from './components/CareVoice';
import * as SF from './screens/safety/Safety';
import * as SG from './screens/safety/Guardian';
import * as SD from './screens/safety/Devices';
import { FHa } from './screens/safety/HomeAssistant';
import * as AC from './screens/access/Access';
import { FHub } from './screens/access/HubLink';
import { isDesktop } from './lib/hubApi';
import { initHubLink } from './state/hublink';

const ops = () => import('./screens/ops/Ops');
const lab = () => import('./screens/ops/Lab');
const O = {
  OpsLayout: lazy(() => ops().then((m) => ({ default: m.OpsLayout }))),
  OpsLive: lazy(() => ops().then((m) => ({ default: m.OpsLive }))),
  OpsReplay: lazy(() => ops().then((m) => ({ default: m.OpsReplay }))),
  OpsTrace: lazy(() => ops().then((m) => ({ default: m.OpsTrace }))),
  OpsAudit: lazy(() => ops().then((m) => ({ default: m.OpsAudit }))),
  OpsVault: lazy(() => ops().then((m) => ({ default: m.OpsVault }))),
  OpsRecovery: lazy(() => ops().then((m) => ({ default: m.OpsRecovery }))),
};
const admin = () => import('./screens/admin/Admin');
const AD = {
  AdminLayout: lazy(() => admin().then((m) => ({ default: m.AdminLayout }))),
  AdminOverview: lazy(() => admin().then((m) => ({ default: m.AdminOverview }))),
  AdminDevices: lazy(() => admin().then((m) => ({ default: m.AdminDevices }))),
  AdminDevice: lazy(() => admin().then((m) => ({ default: m.AdminDevice }))),
  AdminPair: lazy(() => admin().then((m) => ({ default: m.AdminPair }))),
  AdminAudit: lazy(() => admin().then((m) => ({ default: m.AdminAudit }))),
};
const OL = {
  OpsLab: lazy(() => lab().then((m) => ({ default: m.OpsLab }))),
  OpsGate: lazy(() => lab().then((m) => ({ default: m.OpsGate }))),
  OpsMath: lazy(() => lab().then((m) => ({ default: m.OpsMath }))),
  OpsIncident: lazy(() => lab().then((m) => ({ default: m.OpsIncident }))),
};

function Splash({ error }: { error?: string }) {
  return (
    <div className="splash">
      <div>
        <Logo size={96} />
        <div style={{ fontSize: 24, fontWeight: 800 }}>HeartOS</div>
        <div className="muted small" style={{ marginTop: 6 }}>{error ?? 'Đang khởi động Sentinel và hub tại nhà'}</div>
      </div>
    </div>
  );
}

function Runtime() {
  const nav = useNavigate();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const home = getHome();
    seen.current = home.s.notices[0]?.id ?? null;
    const id = window.setInterval(() => {
      home.tick();
      tickSync();
      const app = getApp();
      for (const c of app.cameraSessions) if (c.status === 'active' && Date.now() > c.expiresAt) void endCamera(c.id, 'Hết hạn phiên');
      const n = home.s.notices[0];
      if (n && n.id !== seen.current) {
        seen.current = n.id;
        toast(`${n.title}, ${n.body}`, n.severity === 'critical' ? 'critical' : n.severity === 'warning' ? 'warning' : 'info', 5200);
        if (app.prefs.notifications) void systemNotify(n.title, n.body);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [nav]);
  return null;
}

function Guard({ children, need }: { children: ReactNode; need: 'auth' | 'home' | 'mode' }) {
  const session = useApp((s) => s.session);
  const loc = useLocation();
  if (!session.signedIn) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  if ((need === 'home' || need === 'mode') && !session.householdId) return <Navigate to="/choose-home" replace />;
  if (need === 'mode' && !session.mode) return <Navigate to="/mode" replace />;
  return <>{children}</>;
}

function Root() {
  const session = useApp((s) => s.session);
  if (!session.signedIn) return <Navigate to="/welcome" replace />;
  if (!session.householdId) return <Navigate to="/choose-home" replace />;
  if (!session.mode) return <Navigate to="/mode" replace />;
  return <Navigate to={session.mode === 'simple' ? '/s' : '/f'} replace />;
}

const g = (el: ReactNode, need: 'auth' | 'home' | 'mode' = 'mode') => <Guard need={need}>{el}</Guard>;

const MapScreen = lazy(() => import('./screens/maps/Maps'));
const maps = (simple?: boolean) => g(<Suspense fallback={<Splash error="Đang mở bản đồ" />}><MapScreen simple={simple} /></Suspense>);

export default function App() {
  const [ready, setReady] = useState(servicesReady());
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (ready) return;
    hydrateApp()
      .then(bootstrap)
      .then(async () => {
        initHa();
        startHabits();
        startButler();
        if (!isDesktop()) {
          await initHubLink(() => {
            const app = getApp();
            const me = app.members.find((m) => m.id === app.session.actingAs);
            return `Điện thoại của ${me?.name ?? 'gia đình'}`;
          });
        }
        setReady(true);
      })
      .catch((e) => setError('Không khởi động được: ' + (e as Error).message));
  }, [ready]);
  if (!ready) return <Splash error={error} />;
  return (
    <HashRouter>
      <Runtime />
      <CareLayer />
      <Toasts />
      <ApprovalSheet />
      <Suspense fallback={<Splash error="Đang tải bàn vận hành" />}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/welcome" element={<A.Welcome />} />
        <Route path="/signin" element={<A.SignIn />} />
        <Route path="/register" element={<A.Register />} />
        <Route path="/recover" element={<A.Recover />} />
        <Route path="/choose-home" element={g(<A.ChooseHome />, 'auth')} />
        <Route path="/create-home" element={g(<A.CreateHome />, 'auth')} />
        <Route path="/join-home" element={g(<A.JoinHome />, 'auth')} />
        <Route path="/mode" element={g(<A.ModeSelect />, 'home')} />

        <Route path="/s" element={g(<S.SHome />)} />
        <Route path="/s/call" element={g(<S.SCall />)} />
        <Route path="/s/call/:id" element={g(<S.SCallPerson />)} />
        <Route path="/s/today" element={g(<S.SToday />)} />
        <Route path="/s/task/:id" element={g(<S.STask />)} />
        <Route path="/s/invite/:id" element={g(<S.SInvite />)} />
        <Route path="/s/memory" element={g(<S.SMemory />)} />
        <Route path="/s/story/:id" element={g(<S.SStory />)} />
        <Route path="/s/record" element={g(<S.SRecord />)} />
        <Route path="/s/help" element={g(<SM.SHelp />)} />
        <Route path="/s/sos/:id" element={g(<SM.SSos />)} />
        <Route path="/s/route/:id" element={g(<SM.SRoute />)} />
        <Route path="/s/more" element={g(<SM.SMore />)} />
        <Route path="/s/language" element={g(<SM.SLanguage />)} />
        <Route path="/s/permissions" element={g(<SM.SPermissions />)} />

        <Route path="/f" element={g(<FH.FHome />)} />
        <Route path="/f/notices" element={g(<FH.FNotices />)} />
        <Route path="/f/fund" element={g(<FH.FFund />)} />
        <Route path="/f/fund-add" element={g(<FH.FFundAdd />)} />
        <Route path="/f/rhythm" element={g(<FR.FRhythm />)} />
        <Route path="/f/calendar" element={g(<FR.FCalendar />)} />
        <Route path="/f/draft/:id" element={g(<FR.FDraft />)} />
        <Route path="/f/compose/:id" element={g(<FR.FCompose />)} />
        <Route path="/f/queued/:id" element={g(<FR.FQueued />)} />
        <Route path="/f/rituals" element={g(<FT.FRituals />)} />
        <Route path="/f/ritual/:id" element={g(<FT.FRitual />)} />
        <Route path="/f/ritual-new" element={g(<FT.FRitualNew />)} />
        <Route path="/f/tasks" element={g(<FT.FTasks />)} />
        <Route path="/f/task/:id" element={g(<FT.FTask />)} />
        <Route path="/f/task-new" element={g(<FT.FTaskNew />)} />
        <Route path="/f/memories" element={g(<FM.FMemories />)} />
        <Route path="/f/memory/:id" element={g(<FM.FMemory />)} />
        <Route path="/f/memory-new" element={g(<FM.FMemoryNew />)} />
        <Route path="/f/ai" element={g(<FA.FAi />)} />
        <Route path="/f/ai-settings" element={g(<FAiSettings />)} />
        <Route path="/f/ai-tech" element={g(<FAiTech />)} />
        <Route path="/f/soften" element={g(<FSoften />)} />
        <Route path="/f/meds" element={g(<FMeds />)} />
        <Route path="/f/med-new" element={g(<FMedNew />)} />
        <Route path="/f/habits" element={g(<FHabits />)} />
        <Route path="/f/newsletter" element={g(<FNewsletter />)} />
        <Route path="/f/maps/*" element={maps()} />
        <Route path="/s/maps/*" element={maps(true)} />
        <Route path="/s/ai" element={g(<FA.SAi />)} />
        <Route path="/f/language" element={g(<FA.FLanguage />)} />
        <Route path="/f/voice" element={g(<FA.FVoice />)} />

        <Route path="/f/safe" element={g(<SF.FSafe />)} />
        <Route path="/f/incidents" element={g(<SF.FIncidents />)} />
        <Route path="/f/incident/:id" element={g(<SF.FIncident />)} />
        <Route path="/f/routes/:id" element={g(<SF.FRoutes />)} />
        <Route path="/f/route/:id/:fac" element={g(<SF.FRoute />)} />
        <Route path="/f/sos" element={g(<SF.FSos />)} />
        <Route path="/f/simulate" element={g(<SF.FSimulate />)} />
        <Route path="/f/hospitals" element={g(<SF.FHospitals />)} />
        <Route path="/f/map" element={g(<SG.FMap />)} />
        <Route path="/f/guardian" element={g(<SG.FGuardian />)} />
        <Route path="/f/camera/:id" element={g(<SG.FCamera />)} />
        <Route path="/f/devices" element={g(<SD.FDevices />)} />
        <Route path="/f/ha" element={g(<FHa />)} />
        <Route path="/f/pair" element={g(<SD.FPair />)} />
        <Route path="/f/power" element={g(<SD.FPower />)} />
        <Route path="/f/offline" element={g(<SD.FOffline />)} />
        <Route path="/f/smart" element={g(<SD.FSmart />)} />
        <Route path="/f/smart/:id" element={g(<SD.FSmartDevice />)} />
        <Route path="/f/scenes" element={g(<SD.FScenes />)} />
        <Route path="/f/automations" element={g(<SD.FAutomations />)} />

        <Route path="/f/more" element={g(<AC.FMore />)} />
        <Route path="/f/members" element={g(<AC.FMembers />)} />
        <Route path="/f/member-new" element={g(<AC.FMemberNew />)} />
        <Route path="/f/member/:id" element={g(<AC.FMember />)} />
        <Route path="/f/permissions" element={g(<AC.FPermissions />)} />
        <Route path="/f/revoke/:id" element={g(<AC.FRevoke />)} />
        <Route path="/f/sync" element={g(<AC.FSync />)} />
        <Route path="/f/sentinel" element={g(<AC.FSentinel />)} />
        <Route path="/f/security-log" element={g(<AC.FSecurityLog />)} />
        <Route path="/f/settings" element={g(<AC.FSettings />)} />
        <Route path="/f/hub" element={g(<FHub />)} />

        <Route path="/ops" element={g(<O.OpsLayout />, 'home')}>
          <Route index element={<Navigate to="live" replace />} />
          <Route path="live" element={<O.OpsLive />} />
          <Route path="replay" element={<O.OpsReplay />} />
          <Route path="trace" element={<O.OpsTrace />} />
          <Route path="audit" element={<O.OpsAudit />} />
          <Route path="vault" element={<O.OpsVault />} />
          <Route path="recovery" element={<O.OpsRecovery />} />
          <Route path="lab" element={<OL.OpsLab />} />
          <Route path="gate" element={<OL.OpsGate />} />
          <Route path="math" element={<OL.OpsMath />} />
          <Route path="incident" element={<OL.OpsIncident />} />
        </Route>
        <Route path="/admin" element={<AD.AdminLayout />}>
          <Route index element={<AD.AdminOverview />} />
          <Route path="devices" element={<AD.AdminDevices />} />
          <Route path="device/:id" element={<AD.AdminDevice />} />
          <Route path="pair" element={<AD.AdminPair />} />
          <Route path="audit" element={<AD.AdminAudit />} />
          <Route path="lab" element={<OL.OpsLab />} />
          <Route path="gate" element={<OL.OpsGate />} />
          <Route path="vault" element={<O.OpsVault />} />
          <Route path="recovery" element={<O.OpsRecovery />} />
          <Route path="math" element={<OL.OpsMath />} />
          <Route path="incident" element={<OL.OpsIncident />} />
          <Route path="replay" element={<O.OpsReplay />} />
          <Route path="trace" element={<O.OpsTrace />} />
          <Route path="audit-local" element={<O.OpsAudit />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </HashRouter>
  );
}
