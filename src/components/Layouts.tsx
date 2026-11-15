import { CalendarDays, Ellipsis, House, Image, Settings, ShieldCheck, Siren } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../state/store';

const FAMILY_TABS = [
  { to: '/f', label: 'Nhà', icon: House, match: ['/f', '/f/ai', '/f/tasks', '/f/task', '/f/task-new', '/f/task-call', '/f/fund', '/f/fund-add', '/f/language', '/f/voice', '/f/notices'] },
  { to: '/f/rhythm', label: 'Nhịp Nhà', icon: CalendarDays, match: ['/f/rhythm', '/f/calendar', '/f/draft', '/f/compose', '/f/queued', '/f/rituals', '/f/ritual', '/f/ritual-new'] },
  { to: '/f/memories', label: 'Ký ức', icon: Image, match: ['/f/memories', '/f/memory', '/f/memory-new', '/f/memory-review'] },
  { to: '/f/safe', label: 'An toàn', icon: ShieldCheck, match: ['/f/safe', '/f/incidents', '/f/incident', '/f/assign', '/f/routes', '/f/route', '/f/map', '/f/camera', '/f/devices', '/f/pair', '/f/power', '/f/smart', '/f/scenes', '/f/automations', '/f/sos', '/f/offline', '/f/guardian', '/f/simulate'] },
  { to: '/f/more', label: 'Thêm', icon: Ellipsis, match: ['/f/more', '/f/members', '/f/member', '/f/permissions', '/f/revoke', '/f/sync', '/f/sentinel', '/f/security-log', '/f/settings', '/f/hub'] },
];

const SIMPLE_TABS = [
  { to: '/s', label: 'Nhà', icon: House, match: ['/s', '/s/today', '/s/call', '/s/task', '/s/invite'] },
  { to: '/s/memory', label: 'Ký ức', icon: Image, match: ['/s/memory', '/s/story', '/s/record', '/s/share'] },
  { to: '/s/help', label: 'SOS', icon: Siren, match: ['/s/help', '/s/sos', '/s/route'], sos: true },
  { to: '/s/more', label: 'Cài đặt', icon: Settings, match: ['/s/more', '/s/language', '/s/permissions'] },
];

function active(path: string, match: string[]) {
  return match.some((m) => (m === '/f' || m === '/s' ? path === m : path === m || path.startsWith(m + '/')));
}

export function TabBar({ simple }: { simple?: boolean }) {
  const loc = useLocation();
  const tabs = simple ? SIMPLE_TABS : FAMILY_TABS;
  return (
    <nav className="tabbar" aria-label="Điều hướng chính">
      {tabs.map((t) => {
        const on = active(loc.pathname, t.match);
        const Icon = t.icon;
        return (
          <Link key={t.to} to={t.to} className={'tab' + ('sos' in t && t.sos ? ' sos' : '')} aria-current={on ? 'page' : undefined} style={{ textDecoration: 'none' }}>
            <span className="pill">
              <Icon size={simple ? 24 : 21} strokeWidth={on ? 2.2 : 1.8} />
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Phone({ children, tabs, simple }: { children: ReactNode; tabs?: boolean; simple?: boolean }) {
  const large = useApp((s) => s.prefs.largeText);
  return (
    <div className={'phone' + (simple ? ' simple' : '')} style={large ? { fontSize: '112%' } : undefined}>
      <main className={'screen' + (tabs ? ' with-tabs' : '')}>{children}</main>
      {tabs && <TabBar simple={simple} />}
    </div>
  );
}
