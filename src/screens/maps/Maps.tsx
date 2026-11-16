import { ArrowLeft, ArrowUpDown, Bike, Bookmark, BookmarkCheck, Box, Building2, Car, Clock, CloudDownload, CloudOff, Compass, Crosshair, Footprints, Home as HomeIcon, Layers, ListOrdered, LocateFixed, MapPin, Mic, Moon, Navigation, Navigation2, Phone as PhoneIcon, Search, Share2, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { endpoints, tilesVersion } from '../../core/maps/config';
import { clearOffline, downloadArea, findSavedRoutes, homeBox, homeCached, listAreas, markHomeCached, offlineSupported, removeArea, saveRoutes, storageUsed, tilesFor, type OfflineArea } from '../../core/maps/offline';
import { useOnline } from '../../lib/net';
import { bearing as geoBearing, compassWord, headingAlong, fmtClock, fmtDistance, fmtDuration, haversine, latLngText, parseLatLng, type LngLat } from '../../core/maps/geo';
import { progress, voiceCue, type NavProgress } from '../../core/maps/navigate';
import { getRoutes, MODES, spoken, type Route, type TravelMode } from '../../core/maps/route';
import { CHIPS, nearbyCategory, reverseGeocode, searchPlaces, type CategoryChip, type Place } from '../../core/maps/search';
import type { MapLook, MapTheme } from '../../core/maps/style';
import { speak, useSpeechInput } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { randomId } from '../../core/sentinel/encoding';
import { getApp, useApp, useMe } from '../../state/store';
import { groupOf, MapController, prepareImages } from './MapController';
import { Maneuver } from './Maneuver';
import { useGeo } from './useGeo';

type View = 'explore' | 'dir' | 'nav';
type SheetPos = 'peek' | 'half' | 'full';

const MODE_ICON: Record<TravelMode, ReactNode> = { motorbike: <MotorbikeIcon />, car: <Car size={18} />, walk: <Footprints size={18} />, bike: <Bike size={18} /> };

function MotorbikeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M8 17h6l3-6h-4l-2-3H8M14 11l-3 6M17 11l2 6M15 6h3" />
    </svg>
  );
}

const DEFAULT_CENTER: LngLat = [106.7009, 10.7769];

function placeFrom(at: LngLat, name: string, address = ''): Place {
  return { id: `pt-${at[1].toFixed(5)},${at[0].toFixed(5)}`, name, address, lat: at[1], lng: at[0], category: 'other' };
}

function catLabel(p: Place) {
  if (p.kind) return p.kind;
  return CHIPS.find((c) => c.id === p.category)?.label ?? (p.category === 'home' ? 'Nhà' : p.category === 'saved' ? 'Đã lưu' : 'Địa điểm');
}

type Base = 'map' | 'dark' | 'satellite';
const LOOK_KEY = 'heartos-map-look';

function loadLook(): { base: Base; b3d: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as { base: Base; b3d: boolean } | null;
    if (v && ['map', 'dark', 'satellite'].includes(v.base)) return { base: v.base, b3d: !!v.b3d };
  } catch {
    return { base: 'map', b3d: false };
  }
  return { base: 'map', b3d: false };
}

function useNightTheme(active: boolean): MapTheme {
  const h = new Date().getHours();
  return active && (h >= 18 || h < 6) ? 'dark' : 'light';
}

export default function MapScreen({ simple }: { simple?: boolean }) {
  const params = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const base = simple ? '/s/maps' : '/f/maps';
  const sub = (params['*'] ?? '').split('/')[0];
  const view: View = sub === 'nav' ? 'nav' : sub === 'dir' ? 'dir' : 'explore';
  const me = useMe();
  const household = useApp((s) => s.household);
  const hospitals = useApp((s) => s.hospitals);
  const places = useApp((s) => s.places);
  const recent = useApp((s) => s.recentSearches);
  const set = useApp((s) => s.set);
  const home = household?.home ?? null;
  const isAdmin = me.role === 'admin';

  const box = useRef<HTMLDivElement>(null);
  const ctrl = useRef<MapController | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [look, setLookState] = useState(loadLook);
  const nightTheme = useNightTheme(view === 'nav');
  const theme: MapTheme = look.base === 'dark' ? 'dark' : look.base === 'map' ? nightTheme : 'light';
  const mapLook: MapLook = { theme, satellite: look.base === 'satellite', buildings3d: look.b3d };
  const setLook = (v: { base: Base; b3d: boolean }) => {
    setLookState(v);
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(v));
    } catch {
      return;
    }
  };
  const online = useOnline();
  const [panel, setPanel] = useState<'layers' | 'offline' | null>(null);
  const [areas, setAreas] = useState<OfflineArea[]>(listAreas);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [routeNote, setRouteNote] = useState('');
  const [retry, setRetry] = useState(0);
  const geo = useGeo(true);
  const fix = geo.fix;
  const [bearing, setBearing] = useState(0);
  const [follow, setFollow] = useState(true);
  const [sheet, setSheet] = useState<SheetPos>(simple ? 'half' : 'peek');
  const [tilesDate, setTilesDate] = useState<string | null>(null);

  const [query, setQuery] = useState(sp.get('q') ?? '');
  const [searching, setSearching] = useState(false);
  const [suggest, setSuggest] = useState<Place[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [results, setResults] = useState<{ title: string; list: Place[]; busy: boolean } | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);

  const [from, setFrom] = useState<'me' | Place>('me');
  const [dest, setDest] = useState<Place | null>(null);
  const [mode, setMode] = useState<TravelMode>((sp.get('mode') as TravelMode) || (simple ? 'walk' : 'motorbike'));
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selRoute, setSelRoute] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeErr, setRouteErr] = useState('');
  const [durations, setDurations] = useState<Partial<Record<TravelMode, number>>>({});
  const [showSteps, setShowSteps] = useState(false);

  const [navProg, setNavProg] = useState<NavProgress | null>(null);
  const [muted, setMuted] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const spokenKeys = useRef(new Set<string>());
  const lastHeading = useRef(0);
  const startAfter = useRef(false);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const navRoute = routes[selRoute] ?? null;

  const center = useCallback((): LngLat => {
    const c = ctrl.current?.map.getCenter();
    return c ? [c.lng, c.lat] : fix?.at ?? (home ? [home.lng, home.lat] : DEFAULT_CENTER);
  }, [fix, home]);

  useEffect(() => {
    let disposed = false;
    const start = home ? ([home.lng, home.lat] as LngLat) : DEFAULT_CENTER;
    void prepareImages().then(() => {
      if (disposed || !box.current) return;
      const c = new MapController(box.current, mapLook, start, home ? 15 : 13, {
        onPlace: (p) => selectPlace(p, false),
        onPin: (at) => dropPin(at),
        onRoute: (idx) => setSelRoute(idx),
        onMove: (b, user) => {
          setBearing(b);
          if (user) setFollow(false);
        },
        onError: (msg) => setMapError(msg),
      });
      c.map.on('dragstart', () => setFollow(false));
      ctrl.current = c;
      void c.ready.then(() => !disposed && setMapReady(true));
    });
    void tilesVersion().then(setTilesDate);
    return () => {
      disposed = true;
      ctrl.current?.destroy();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.setLook(mapLook);
  }, [theme, look.base, look.b3d, mapReady]);

  useEffect(() => {
    if (!mapReady || !home || !online || !offlineSupported() || homeCached(home)) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      void downloadArea({ name: 'Quanh nhà', bbox: homeBox(home), tileJsonUrl: endpoints().tiles, glyphs: endpoints().glyphs, signal: ac.signal })
        .then(() => {
          markHomeCached(home);
          setAreas(listAreas());
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [mapReady, home?.lat, home?.lng, online]);

  useEffect(() => {
    if (panel === 'offline') void storageUsed().then(setUsed);
  }, [panel, areas.length]);

  const downloadView = async () => {
    const m = ctrl.current?.map;
    if (!m) return;
    const b = m.getBounds();
    const bbox: [LngLat, LngLat] = [
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ];
    const n = tilesFor(bbox, 10, 14).length;
    if (n > 4000) return toast('Vùng đang xem quá rộng, hãy phóng to bản đồ rồi tải lại.', 'warning');
    setDl({ done: 0, total: n });
    try {
      const name = (await reverseGeocode(center()).catch(() => null))?.address?.split(',').slice(-2).join(',').trim() || `Vùng tải lúc ${fmtClock(Date.now())}`;
      await downloadArea({ name, bbox, tileJsonUrl: endpoints().tiles, glyphs: endpoints().glyphs, onProgress: (done, total) => setDl({ done, total }) });
      setAreas(listAreas());
      toast('Đã lưu vùng bản đồ để dùng khi mất mạng.');
    } catch (e) {
      toast((e as Error).message, 'warning');
    } finally {
      setDl(null);
    }
  };

  useEffect(() => {
    if (!mapReady) return;
    ctrl.current?.setHome(home);
  }, [mapReady, home?.lat, home?.lng]);

  useEffect(() => {
    if (!mapReady) return;
    ctrl.current?.setMe(fix);
    if (fix && follow && view === 'explore' && !selected && !results && !sp.get('to') && !sp.get('place')) {
      ctrl.current?.map.easeTo({ center: fix.at, zoom: Math.max(ctrl.current.map.getZoom(), 15.5), duration: 700 });
      setFollow(false);
    }
  }, [fix, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const to = parseLatLng(sp.get('to'));
    const fromLL = parseLatLng(sp.get('from'));
    const placeLL = parseLatLng(sp.get('place'));
    if (to) {
      if (!dest || haversine([dest.lng, dest.lat], to) > 5) {
        setDest(placeFrom(to, sp.get('name') ?? 'Nơi đến', sp.get('addr') ?? ''));
        setRoutes([]);
        setDurations({});
      }
      if (fromLL) setFrom(placeFrom(fromLL, sp.get('fromName') ?? 'Điểm đi'));
      if (view === 'explore') nav(`${base}/dir?${sp.toString()}`, { replace: true });
    } else if (placeLL) {
      selectPlace(placeFrom(placeLL, sp.get('name') ?? 'Địa điểm', sp.get('addr') ?? ''), true);
    } else if (sp.get('q') && view === 'explore') {
      void runQuery(sp.get('q')!);
    }
  }, [mapReady, sp.get('to'), sp.get('place'), sp.get('q'), sp.get('from')]);

  const padding = useCallback(() => {
    const h = box.current?.clientHeight ?? 700;
    const bottom = view === 'nav' ? 150 : sheet === 'peek' ? 190 : sheet === 'half' ? Math.round(h * 0.46) : Math.round(h * 0.5);
    return { top: view === 'dir' ? 190 : view === 'nav' ? 170 : 130, bottom, left: 40, right: 40 };
  }, [sheet, view]);

  function selectPlace(p: Place, fly: boolean) {
    const here = getGeoHere();
    const withDist = here ? { ...p, distance: haversine(here, [p.lng, p.lat]) } : p;
    setSelected(withDist);
    setSearching(false);
    setSheet('half');
    ctrl.current?.setSelected(p);
    if (fly) ctrl.current?.map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(ctrl.current.map.getZoom(), 16), padding: padding(), duration: 650 });
    if (!p.address) {
      void reverseGeocode([p.lng, p.lat]).then((r) => {
        if (!r) return;
        setSelected((cur) => (cur && cur.id === p.id ? { ...cur, address: r.address || r.name, name: cur.name === 'Vị trí đã ghim' && r.name ? r.name : cur.name } : cur));
      });
    }
  }

  const fixRef = useRef(fix);
  fixRef.current = fix;
  function getGeoHere(): LngLat | null {
    return fixRef.current?.at ?? null;
  }

  function dropPin(at: LngLat) {
    selectPlace(placeFrom(at, 'Vị trí đã ghim', ''), false);
  }

  const remember = (q: string) => set((s) => void (s.recentSearches = [q, ...s.recentSearches.filter((x) => x !== q)].slice(0, 8)));

  async function runQuery(q: string) {
    const text = q.trim();
    if (!text) return;
    setSearching(false);
    remember(text);
    setResults({ title: `Kết quả cho "${text}"`, list: [], busy: true });
    setSelected(null);
    ctrl.current?.setSelected(null);
    try {
      const list = await searchPlaces(text, { near: getGeoHere() ?? center(), limit: 10 });
      setResults({ title: `Kết quả cho "${text}"`, list, busy: false });
      ctrl.current?.setResults(list);
      if (list.length === 1) selectPlace(list[0], true);
      else if (list.length) {
        ctrl.current?.fit(list.map((p) => [p.lng, p.lat] as LngLat), padding());
        setSheet('half');
      }
    } catch (e) {
      setResults({ title: 'Chưa tìm được', list: [], busy: false });
      toast((e as Error).message, 'warning');
    }
  }

  async function runChip(chip: CategoryChip) {
    setSelected(null);
    ctrl.current?.setSelected(null);
    setResults({ title: `${chip.label} gần đây`, list: [], busy: true });
    setSheet('half');
    try {
      const list = await nearbyCategory(chip, getGeoHere() ?? center());
      setResults({ title: `${chip.label} gần đây`, list, busy: false });
      ctrl.current?.setResults(list);
      if (list.length) ctrl.current?.fit([...list.slice(0, 8).map((p) => [p.lng, p.lat] as LngLat), ...(getGeoHere() ? [getGeoHere()!] : [])], padding());
    } catch (e) {
      setResults({ title: `${chip.label} gần đây`, list: [], busy: false });
      toast((e as Error).message, 'warning');
    }
  }

  useEffect(() => {
    if (!searching) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggest([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setSuggestBusy(true);
      try {
        setSuggest(await searchPlaces(q, { near: getGeoHere() ?? center(), limit: 7, signal: ac.signal }));
      } catch {
        if (!ac.signal.aborted) setSuggest([]);
      } finally {
        if (!ac.signal.aborted) setSuggestBusy(false);
      }
    }, 320);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, searching]);

  const voice = useSpeechInput(getApp().prefs.voiceLang);
  useEffect(() => {
    if (voice.text) setQuery(voice.text);
  }, [voice.text]);
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !voice.listening && voice.text.trim()) void runQuery(voice.text);
    wasListening.current = voice.listening;
  }, [voice.listening]);

  const origin: LngLat | null = from === 'me' ? fix?.at ?? null : [from.lng, from.lat];
  const originLabel = from === 'me' ? 'Vị trí của bạn' : from.name;
  const waitingFix = from === 'me' && !fix && geo.status !== 'denied' && geo.status !== 'unavailable';

  useEffect(() => {
    if (view !== 'dir' || !dest || !mapReady) return;
    let o = origin;
    if (!o && from === 'me' && !waitingFix && home) {
      setFrom({ ...placeFrom([home.lng, home.lat], home.label || 'Nhà'), category: 'home' });
      return;
    }
    if (!o) return;
    if (from === 'me' && !routeNote && routes.length && routes[0].mode === mode && haversine(routes[0].coords[0], o) < 60 && sameDest(routes, dest)) return;
    o = o as LngLat;
    const ac = new AbortController();
    setRouteBusy(true);
    setRouteErr('');
    setRouteNote('');
    const target: LngLat = [dest.lng, dest.lat];
    const origin0 = o;
    getRoutes(o, target, mode, ac.signal)
      .then((list) => {
        saveRoutes(origin0, target, mode, list);
        setRoutes(list);
        setSelRoute(0);
        setDurations((d) => ({ ...d, [mode]: list[0]?.duration }));
        if (startAfter.current && from === 'me' && list.length) {
          startAfter.current = false;
          nav(`${base}/nav?${new URLSearchParams(location.hash.split('?')[1] ?? '').toString()}`);
        }
        const pts = list.flatMap((r) => [r.coords[0], r.coords[Math.floor(r.coords.length / 2)], r.coords[r.coords.length - 1]]);
        ctrl.current?.fit(pts, padding(), 17);
        for (const m of online ? MODES.map((x) => x.id).filter((x) => x !== mode) : []) {
          void getRoutes(o!, [dest.lng, dest.lat], m, ac.signal)
            .then((l) => setDurations((d) => ({ ...d, [m]: l[0]?.duration })))
            .catch(() => undefined);
        }
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        const saved = findSavedRoutes(origin0, target, mode);
        if (saved) {
          setRoutes(saved.routes);
          setSelRoute(0);
          setRouteNote(`Chưa kết nối được máy chủ chỉ đường, đang dùng tuyến đã lưu lúc ${fmtClock(saved.at)} ${new Date(saved.at).toLocaleDateString('vi-VN')}.`);
          ctrl.current?.fit(saved.routes[0].coords, padding(), 17);
          return;
        }
        setRoutes([]);
        setRouteErr(navigator.onLine ? (e as Error).message : 'offline');
      })
      .finally(() => !ac.signal.aborted && setRouteBusy(false));
    return () => ac.abort();
  }, [view, dest?.id, mode, mapReady, from === 'me' ? (fix ? 'fix' : 'nofix') : from.id, waitingFix, online, retry]);

  function sameDest(list: Route[], d: Place) {
    const end = list[0].coords[list[0].coords.length - 1];
    return haversine(end, [d.lng, d.lat]) < 80;
  }

  useEffect(() => {
    if (!mapReady) return;
    if (view === 'explore') {
      ctrl.current?.setRoutes([], 0, null, () => '');
      ctrl.current?.setSelected(selected);
      return;
    }
    ctrl.current?.setResults([]);
    ctrl.current?.setSelected(dest);
    ctrl.current?.setRoutes(view === 'nav' && navRoute ? [navRoute] : routes, view === 'nav' ? 0 : selRoute, from === 'me' ? null : [from.lng, from.lat], view === 'nav' ? () => '' : (r, idx) => `<b>${fmtDuration(r.duration)}</b>${idx === 0 && routes.length > 1 ? '<span>Nhanh nhất</span>' : ''}`);
  }, [routes, selRoute, view, mapReady, dest?.id]);

  useEffect(() => {
    if (view !== 'nav') {
      setNavProg(null);
      spokenKeys.current.clear();
      ctrl.current?.setNavigation(null);
      ctrl.current?.setPuck(null, 0);
      return;
    }
    if (!navRoute) {
      nav(`${base}/dir?${sp.toString()}`, { replace: true });
      return;
    }
    setFollow(true);
    setSheet('peek');
    if (!muted) speak(`Bắt đầu đi tới ${dest?.name ?? 'nơi đến'}. ${navRoute.steps[0]?.text ?? ''}`, getApp().prefs.voiceLang);
    let lock: { release: () => Promise<void> } | null = null;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => {
      void lock?.release().catch(() => undefined);
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'nav' || !navRoute || !fix) return;
    const p = progress(navRoute, fix.at, fix.accuracy, navProg?.segment ?? 0);
    setNavProg(p);
    const turnAt = p.next ? navRoute.cum[Math.min(p.next.start, navRoute.cum.length - 1)] : null;
    ctrl.current?.setNavigation({ route: navRoute, along: p.along, turnAt });
    const heading = p.offRoute ? fix.heading ?? lastHeading.current : headingAlong(navRoute.coords, navRoute.cum, p.along, 25);
    lastHeading.current = heading;
    ctrl.current?.setPuck(p.offRoute ? fix.at : p.snapped, heading);
    if (follow) {
      const zoom = navRoute.mode === 'walk' ? 18.3 : p.toNext < 150 ? 18.1 : p.toNext < 500 ? 17.6 : 17.1;
      ctrl.current?.follow(p.offRoute ? fix.at : p.snapped, heading, { top: Math.round(window.innerHeight * 0.42), bottom: 110 }, zoom);
    }
    if (p.arrived) {
      if (!spokenKeys.current.has('arrive')) {
        spokenKeys.current.add('arrive');
        if (!muted) speak(`Đã đến ${dest?.name ?? 'nơi'}.`, getApp().prefs.voiceLang);
      }
      return;
    }
    const cue = voiceCue(p, navRoute.mode, spokenKeys.current);
    if (cue && p.next) {
      spokenKeys.current.add(cue.key);
      if (!muted) speak(spoken(p.next, cue.far ? p.toNext : 0), getApp().prefs.voiceLang);
    }
    offCount.current = p.offRoute ? offCount.current + 1 : 0;
    if (offCount.current >= 2 && Date.now() - lastReroute.current > 15_000 && dest && navigator.onLine) {
      lastReroute.current = Date.now();
      setRerouting(true);
      if (!muted) speak('Đang tìm đường mới.', getApp().prefs.voiceLang);
      getRoutes(fix.at, [dest.lng, dest.lat], navRoute.mode)
        .then((list) => {
          if (!list.length) return;
          setRoutes(list);
          setSelRoute(0);
          setNavProg(null);
          spokenKeys.current.clear();
          offCount.current = 0;
        })
        .catch(() => undefined)
        .finally(() => setRerouting(false));
    }
  }, [fix, view, navRoute]);

  const savedList: Place[] = useMemo(() => {
    const list: Place[] = [];
    if (home) list.push({ id: 'home', name: home.label || 'Nhà', address: 'Nhà của gia đình', lat: home.lat, lng: home.lng, category: 'home' });
    for (const h of hospitals) if (h.lat !== undefined && h.lng !== undefined) list.push({ id: `h-${h.id}`, name: h.name, address: h.address, lat: h.lat, lng: h.lng, category: 'hospital', kind: 'Bệnh viện của gia đình', phone: h.phone });
    for (const p of places) list.push({ id: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, category: 'saved', kind: 'Đã lưu' });
    return list;
  }, [home, hospitals, places]);

  const isSaved = (p: Place) => places.some((x) => haversine([x.lng, x.lat], [p.lng, p.lat]) < 25);
  const toggleSave = (p: Place) => {
    if (isSaved(p)) {
      set((s) => void (s.places = s.places.filter((x) => haversine([x.lng, x.lat], [p.lng, p.lat]) >= 25)));
      toast('Đã bỏ lưu địa điểm.');
    } else {
      set((s) => void s.places.unshift({ id: randomId('pl', 5), name: p.name, address: p.address, lat: p.lat, lng: p.lng, savedAt: Date.now() }));
      toast(`Đã lưu ${p.name}.`);
    }
  };
  const setAsHome = (p: Place) => {
    set((s) => {
      if (s.household) s.household.home = { lat: p.lat, lng: p.lng, label: s.household.name };
    });
    toast('Đã đặt vị trí nhà. Cả nhà dùng vị trí này để chỉ đường về nhà.');
  };
  const addHospital = (p: Place) => {
    set((s) => void s.hospitals.push({ id: randomId('h', 5), name: p.name, address: p.address || latLngText([p.lng, p.lat]), phone: p.phone ?? '115', note: '', lat: p.lat, lng: p.lng }));
    toast(`Đã thêm ${p.name} vào bệnh viện gần nhà.`);
  };
  const share = async (p: Place) => {
    const url = `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const text = `${p.name}${p.address ? `, ${p.address}` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Đã chép liên kết địa điểm.');
      }
    } catch {
      return;
    }
  };

  const goDirections = (p: Place, start = false) => {
    setDest(p);
    setRoutes([]);
    setDurations({});
    const q = new URLSearchParams({ to: latLngText([p.lng, p.lat]), name: p.name, mode });
    if (p.address) q.set('addr', p.address);
    startAfter.current = start;
    setSheet('peek');
    setShowSteps(false);
    nav(`${base}/dir?${q}`);
  };

  const backFromExplore = () => {
    if (searching) return setSearching(false);
    if (selected) {
      setSelected(null);
      ctrl.current?.setSelected(null);
      return setSheet(results ? 'half' : simple ? 'half' : 'peek');
    }
    if (results) {
      setResults(null);
      ctrl.current?.setResults([]);
      return setSheet(simple ? 'half' : 'peek');
    }
    if (window.history.length > 1) nav(-1);
    else nav(simple ? '/s' : '/f');
  };

  const locate = () => {
    if (geo.status === 'denied') return toast('HeartOS chưa được phép dùng vị trí. Bật quyền vị trí trong Cài đặt của điện thoại.', 'warning');
    if (!fix) return toast('Đang tìm vị trí của bạn.');
    setFollow(true);
    if (view === 'nav' && navProg) return;
    ctrl.current?.map.easeTo({ center: fix.at, zoom: Math.max(16, ctrl.current.map.getZoom()), bearing: 0, pitch: 0, padding: padding(), duration: 600 });
  };

  const best = routes[0];
  const sel = routes[selRoute];
  const homeDist = home && fix ? haversine(fix.at, [home.lng, home.lat]) : null;

  return (
    <div className={`mapapp ${simple ? 'simple' : ''} theme-${theme} view-${view} sheet-${sheet}`}>
      <div ref={box} className="mapcanvas" aria-label="Bản đồ" />
      {!mapReady && !mapError && <div className="map-loading">Đang tải bản đồ</div>}
      {mapError && (
        <div className="map-banner warn" role="alert">
          {mapError}
          <button className="linkbtn" onClick={() => location.reload()}>Tải lại</button>
        </div>
      )}

      {view === 'explore' && (
        <div className="map-top">
          <div className={'searchbar' + (searching ? ' active' : '')}>
            <button className="sb-icon" aria-label="Quay lại" onClick={backFromExplore}>
              <ArrowLeft size={simple ? 24 : 22} />
            </button>
            <input
              className="sb-input"
              value={query}
              placeholder={voice.listening ? 'Đang nghe' : 'Tìm kiếm ở đây'}
              onFocus={() => setSearching(true)}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runQuery(query)}
              enterKeyHint="search"
              aria-label="Tìm kiếm địa điểm"
            />
            {query ? (
              <button className="sb-icon" aria-label="Xóa" onClick={() => setQuery('')}>
                <X size={20} />
              </button>
            ) : (
              <button className={'sb-icon' + (voice.listening ? ' on' : '')} aria-label="Tìm bằng giọng nói" onClick={voice.listening ? voice.stop : voice.start}>
                <Mic size={20} />
              </button>
            )}
          </div>
          {!searching && (
            <div className="chiprow" role="toolbar" aria-label="Danh mục">
              {home && (
                <button className="mchip" onClick={() => goDirections(savedList[0])}>
                  <HomeIcon size={15} /> Về nhà
                </button>
              )}
              {CHIPS.map((c) => (
                <button key={c.id} className={'mchip' + (results?.title.startsWith(c.label) ? ' on' : '')} onClick={() => void runChip(c)}>
                  <span className="mchip-dot" data-group={groupOf(c.id)} />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'explore' && searching && (
        <div className="suggest-panel">
          {query.trim().length < 2 ? (
            <>
              {savedList.length > 0 && <div className="sp-title">Đã lưu</div>}
              {savedList.map((p) => (
                <PlaceRow key={p.id} p={p} onClick={() => selectPlace(p, true)} />
              ))}
              {recent.length > 0 && <div className="sp-title">Tìm gần đây</div>}
              {recent.map((r) => (
                <button key={r} className="prow" onClick={() => { setQuery(r); void runQuery(r); }}>
                  <span className="prow-ic"><Clock size={18} /></span>
                  <span className="prow-text"><span className="t">{r}</span></span>
                </button>
              ))}
              {!savedList.length && !recent.length && <p className="sp-empty">Gõ tên đường, địa điểm hoặc loại nơi như "nhà thuốc".</p>}
            </>
          ) : (
            <>
              {suggestBusy && !suggest.length && <p className="sp-empty">Đang tìm</p>}
              {!suggestBusy && !suggest.length && <p className="sp-empty">Chưa thấy kết quả. Nhấn tìm để tìm rộng hơn.</p>}
              {suggest.map((p) => (
                <PlaceRow key={p.id} p={p} onClick={() => { remember(query.trim()); selectPlace(p, true); }} />
              ))}
              <button className="prow" onClick={() => void runQuery(query)}>
                <span className="prow-ic"><Search size={18} /></span>
                <span className="prow-text"><span className="t">Tìm "{query.trim()}"</span></span>
              </button>
            </>
          )}
        </div>
      )}

      {view === 'dir' && (
        <div className="dir-top">
          <div className="dir-card">
            <button className="sb-icon" aria-label="Quay lại" onClick={() => nav(-1)}>
              <ArrowLeft size={22} />
            </button>
            <div className="dir-fields">
              <button className="dir-field" onClick={() => setFrom(from === 'me' && home ? { ...placeFrom([home.lng, home.lat], home.label || 'Nhà'), category: 'home' } : 'me')} aria-label="Đổi điểm đi">
                <span className="dot from" />
                <span className="dir-text">{originLabel}</span>
              </button>
              <div className="dir-field static">
                <span className="dot to" />
                <span className="dir-text strong">{dest?.name ?? 'Chọn nơi đến'}</span>
              </div>
            </div>
            <button
              className="sb-icon"
              aria-label="Đảo chiều"
              disabled={!dest || (from === 'me' && !fix)}
              onClick={() => {
                if (!dest) return;
                const newFrom = dest;
                const newTo = from === 'me' ? placeFrom(fix!.at, 'Vị trí của bạn') : from;
                setFrom(newFrom);
                setDest(newTo);
              }}
            >
              <ArrowUpDown size={20} />
            </button>
          </div>
          <div className="mode-tabs" role="tablist">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={m.id === mode} className={'mode-tab' + (m.id === mode ? ' on' : '')} onClick={() => setMode(m.id)}>
                {MODE_ICON[m.id]}
                <span>{durations[m.id] !== undefined ? fmtDuration(durations[m.id]!) : m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'nav' && navRoute && (
        <div className="nav-top">
          <div className={'nav-banner' + (rerouting ? ' warn' : '')}>
            {rerouting ? (
              <div className="nb-main"><span className="nb-text">Đang tìm đường mới</span></div>
            ) : navProg?.arrived ? (
              <div className="nb-main"><Maneuver turn="arrive" size={40} color="#fff" /><span className="nb-text">Đã đến {dest?.name}</span></div>
            ) : !fix ? (
              <div className="nb-main"><span className="nb-text">Đang chờ tín hiệu GPS</span></div>
            ) : (
              <div className="nb-main">
                <span className="nb-ic"><Maneuver turn={navProg?.next?.turn ?? navRoute.steps[0].turn} size={42} color="#fff" /><b>{fmtDistance(navProg?.toNext ?? navRoute.steps[0].distance)}</b></span>
                <span className="nb-text">{navProg?.next?.text ?? navRoute.steps[0].text}</span>
              </div>
            )}
          </div>
          {navProg && !navProg.arrived && navProg.next && navRoute.steps[navProg.stepIndex + 2] && navProg.toNext < 400 && (
            <div className="nav-then">
              Sau đó <Maneuver turn={navRoute.steps[navProg.stepIndex + 2].turn} size={18} color="#fff" />
            </div>
          )}
        </div>
      )}

      {!online && (
        <div className={'map-banner info' + (view === 'nav' ? ' low' : '')} role="status">
          <CloudOff size={16} /> Đang ngoại tuyến. Bản đồ dùng vùng đã lưu{view === 'nav' ? ', vẫn dẫn đường theo tuyến đã có' : ''}.
        </div>
      )}
      {panel && (
        <div className="map-panel" role="dialog" aria-label={panel === 'layers' ? 'Lớp bản đồ' : 'Bản đồ ngoại tuyến'}>
          <div className="mp-head">
            <h3>{panel === 'layers' ? 'Lớp bản đồ' : 'Bản đồ ngoại tuyến'}</h3>
            <button className="sb-icon" aria-label="Đóng" onClick={() => setPanel(null)}>
              <X size={20} />
            </button>
          </div>
          {panel === 'layers' ? (
            <>
              <div className="mp-tiles">
                {([['map', 'Mặc định', <MapPin key="m" size={22} />], ['satellite', 'Vệ tinh', <Layers key="s" size={22} />], ['dark', 'Tối', <Moon key="d" size={22} />]] as [Base, string, ReactNode][]).map(([b, label, icon]) => (
                  <button key={b} className={'mp-tile' + (look.base === b ? ' on' : '')} data-base={b} onClick={() => setLook({ ...look, base: b })}>
                    <span className="mp-thumb">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <button className={'mp-row' + (look.b3d ? ' on' : '')} onClick={() => setLook({ ...look, b3d: !look.b3d })}>
                <Box size={20} />
                <span>
                  <b>3D</b>
                  <small>Nghiêng bản đồ, nhà cửa nổi khối</small>
                </span>
                <span className={'mp-switch' + (look.b3d ? ' on' : '')} />
              </button>
              <button className="mp-row" onClick={() => setPanel('offline')}>
                <CloudDownload size={20} />
                <span>
                  <b>Bản đồ ngoại tuyến</b>
                  <small>{areas.length ? `${areas.length} vùng đã lưu` : 'Tải vùng bản đồ để dùng khi mất mạng'}</small>
                </span>
              </button>
            </>
          ) : (
            <>
              <p className="mp-note">Vùng đã lưu vẫn xem được khi mất Wi-Fi hoặc 4G. Chỉ đường cần mạng; khi mất mạng HeartOS dùng tuyến đã tìm trước đó và vẫn dẫn đường theo GPS.</p>
              {!offlineSupported() && <p className="map-hint">Thiết bị này không hỗ trợ lưu bản đồ.</p>}
              {areas.map((a) => (
                <div key={a.id} className="mp-area">
                  <CloudDownload size={18} />
                  <span>
                    <b>{a.name}</b>
                    <small>{a.tiles} mảnh, {a.bytes > 0 ? `${(a.bytes / 1048576).toFixed(1).replace('.', ',')} MB, ` : ''}lưu lúc {fmtClock(a.at)} {new Date(a.at).toLocaleDateString('vi-VN')}</small>
                  </span>
                  <button className="sb-icon" aria-label={`Bỏ vùng ${a.name}`} onClick={() => { removeArea(a.id); setAreas(listAreas()); }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {dl ? (
                <div className="mp-progress">
                  <div className="mp-bar"><span style={{ width: `${Math.round((dl.done / Math.max(1, dl.total)) * 100)}%` }} /></div>
                  <small>Đang tải {dl.done}/{dl.total}</small>
                </div>
              ) : (
                <button className="pill primary big" disabled={!online || !offlineSupported()} onClick={() => void downloadView()}>
                  <CloudDownload size={18} /> Tải vùng đang xem
                </button>
              )}
              {used !== null && <p className="mp-note">Đang dùng khoảng {(used / 1048576).toFixed(0)} MB bộ nhớ của ứng dụng.</p>}
              {areas.length > 0 && (
                <button className="linkbtn danger" onClick={() => void clearOffline().then(() => { setAreas([]); toast('Đã xóa bản đồ ngoại tuyến.'); })}>
                  <Trash2 size={15} /> Xóa toàn bộ bản đồ ngoại tuyến
                </button>
              )}
            </>
          )}
        </div>
      )}
      <div className="fabs">
        {Math.abs(bearing) > 2 && (
          <button className="fab" aria-label="Quay về hướng bắc" onClick={() => ctrl.current?.resetNorth()}>
            <Compass size={20} style={{ transform: `rotate(${-bearing - 45}deg)` }} />
          </button>
        )}
        {view !== 'nav' && (
          <button className="fab" aria-label="Lớp bản đồ" onClick={() => setPanel(panel ? null : 'layers')}>
            <Layers size={20} />
          </button>
        )}
        <button className={'fab primary' + (follow && fix ? ' on' : '')} aria-label="Vị trí của tôi" onClick={locate}>
          {follow && fix ? <LocateFixed size={22} /> : <Crosshair size={22} />}
        </button>
      </div>

      {view === 'nav' && navRoute && navProg && !navProg.arrived && follow && navRoute.steps[navProg.stepIndex]?.street && (
        <div className="nav-street">{navRoute.steps[navProg.stepIndex].street}</div>
      )}
      {view === 'nav' && navRoute && (
        <div className="nav-bottom">
          {navProg?.arrived ? (
            <>
              <div className="nbt-main">
                <b className="eta">Đã đến nơi</b>
                <span>{dest?.name}</span>
              </div>
              <button className="btn" onClick={() => nav(-1)}>Kết thúc</button>
            </>
          ) : (
            <>
              <button className="nbt-exit" aria-label="Thoát dẫn đường" onClick={() => nav(-1)}>
                <X size={22} />
              </button>
              <div className="nbt-main">
                <b className="eta">{fmtDuration(navProg?.remainingTime ?? navRoute.duration)}</b>
                <span>
                  {fmtDistance(navProg?.remaining ?? navRoute.distance)}, đến lúc {fmtClock(Date.now() + (navProg?.remainingTime ?? navRoute.duration) * 1000)}
                </span>
              </div>
              <button className="nbt-btn" aria-label={muted ? 'Bật giọng nói' : 'Tắt giọng nói'} onClick={() => setMuted(!muted)}>
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <button
                className="nbt-btn"
                aria-label="Xem toàn tuyến"
                onClick={() => {
                  setFollow(false);
                  ctrl.current?.fit(navRoute.coords, { top: 170, bottom: 140, left: 40, right: 40 }, 17);
                }}
              >
                <ListOrdered size={20} />
              </button>
            </>
          )}
        </div>
      )}

      {view !== 'nav' && !(view === 'explore' && searching) && (
        <Sheet pos={sheet} onPos={setSheet}>
          {view === 'explore' && selected && (
            <div className="place-sheet">
              <div className="ps-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="ps-meta">
                    {catLabel(selected)}
                    {selected.distance !== undefined ? `, cách ${fmtDistance(selected.distance)}` : ''}
                  </p>
                  {selected.address && <p className="ps-addr">{selected.address}</p>}
                </div>
                <button className="sb-icon" aria-label="Đóng" onClick={backFromExplore}>
                  <X size={20} />
                </button>
              </div>
              <div className="ps-actions">
                <button className="pill primary" onClick={() => goDirections(selected)}>
                  <Navigation size={17} /> Chỉ đường
                </button>
                <button className="pill" onClick={() => goDirections(selected, true)}>
                  <Navigation2 size={17} fill="currentColor" strokeWidth={1.5} /> Bắt đầu
                </button>
                <button className="pill" onClick={() => toggleSave(selected)}>
                  {isSaved(selected) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />} {isSaved(selected) ? 'Đã lưu' : 'Lưu'}
                </button>
                <button className="pill" onClick={() => void share(selected)}>
                  <Share2 size={17} /> Chia sẻ
                </button>
                {selected.phone && (
                  <a className="pill" href={`tel:${selected.phone}`}>
                    <PhoneIcon size={17} /> Gọi
                  </a>
                )}
              </div>
              {isAdmin && !simple && (
                <div className="ps-more">
                  {selected.category !== 'home' && (
                    <button className="linkbtn" onClick={() => setAsHome(selected)}>
                      <HomeIcon size={15} /> Đặt làm vị trí nhà
                    </button>
                  )}
                  {selected.category === 'hospital' && !hospitals.some((h) => h.lat !== undefined && haversine([h.lng!, h.lat!], [selected.lng, selected.lat]) < 50) && (
                    <button className="linkbtn" onClick={() => addHospital(selected)}>
                      <Building2 size={15} /> Thêm vào bệnh viện gần nhà
                    </button>
                  )}
                </div>
              )}
              <p className="ps-coords">{latLngText([selected.lng, selected.lat])}</p>
            </div>
          )}

          {view === 'explore' && !selected && results && (
            <div className="results-sheet">
              <div className="rs-head">
                <h2>{results.title}</h2>
                <button className="sb-icon" aria-label="Đóng kết quả" onClick={backFromExplore}>
                  <X size={20} />
                </button>
              </div>
              {results.busy && <p className="sp-empty">Đang tìm</p>}
              {!results.busy && !results.list.length && <p className="sp-empty">Không thấy địa điểm phù hợp quanh đây.</p>}
              {results.list.map((p) => (
                <PlaceRow key={p.id} p={p} onClick={() => selectPlace(p, true)} />
              ))}
            </div>
          )}

          {view === 'explore' && !selected && !results && (
            <div className="explore-sheet">
              <h2>{simple ? 'Bạn muốn đi đâu?' : 'Đi đâu hôm nay?'}</h2>
              <div className="quick">
                {home ? (
                  <button className="quick-item" onClick={() => goDirections(savedList[0])}>
                    <span className="qi-ic home"><HomeIcon size={simple ? 24 : 20} /></span>
                    <span className="t">Về nhà</span>
                    <span className="m">{homeDist !== null ? fmtDistance(homeDist) : 'Chỉ đường'}</span>
                  </button>
                ) : (
                  isAdmin && (
                    <button
                      className="quick-item"
                      onClick={() => {
                        if (fix) setAsHome(placeFrom(fix.at, household?.name ?? 'Nhà'));
                        else toast('Chạm và giữ trên bản đồ để chọn vị trí nhà, rồi bấm Đặt làm vị trí nhà.');
                      }}
                    >
                      <span className="qi-ic home"><HomeIcon size={20} /></span>
                      <span className="t">Đặt vị trí nhà</span>
                      <span className="m">{fix ? 'Dùng vị trí hiện tại' : 'Chạm giữ bản đồ'}</span>
                    </button>
                  )
                )}
                <button className="quick-item" onClick={() => void runChip(CHIPS[0])}>
                  <span className="qi-ic health"><Building2 size={simple ? 24 : 20} /></span>
                  <span className="t">Bệnh viện</span>
                  <span className="m">Gần đây</span>
                </button>
                <button className="quick-item" onClick={() => void runChip(CHIPS[1])}>
                  <span className="qi-ic pharm"><MapPin size={simple ? 24 : 20} /></span>
                  <span className="t">Nhà thuốc</span>
                  <span className="m">Gần đây</span>
                </button>
              </div>
              {savedList.length > 0 && <div className="sp-title">Địa điểm của gia đình</div>}
              {savedList.map((p) => (
                <PlaceRow key={p.id} p={p} here={fix?.at} onClick={() => selectPlace(p, true)} />
              ))}
              {geo.status === 'denied' && <p className="map-hint">HeartOS chưa được phép dùng vị trí nên chưa chỉ đường từ chỗ bạn đứng được. Bật quyền vị trí trong Cài đặt của điện thoại.</p>}
              <p className="map-attrib">Bản đồ OpenStreetMap{tilesDate ? `, cập nhật ${tilesDate}` : ''}. Chạm giữ để ghim một điểm.</p>
            </div>
          )}

          {view === 'dir' && (
            <div className="dir-sheet">
              {waitingFix && <p className="sp-empty">Đang tìm vị trí của bạn</p>}
              {!waitingFix && !origin && <p className="sp-empty">Chưa có điểm đi. Bật quyền vị trí hoặc đặt vị trí nhà.</p>}
              {routeBusy && <p className="sp-empty">Đang tìm đường</p>}
              {routeErr && !routeBusy && routeErr !== 'offline' && (
                <div className="route-err">
                  <p>Chưa tìm được đường đi. {routeErr}</p>
                  <button className="btn sm secondary" onClick={() => { setRouteErr(''); setRoutes([]); setRetry((n) => n + 1); }}>Thử lại</button>
                </div>
              )}
              {routeErr === 'offline' && !routeBusy && dest && origin && (
                <div className="route-err">
                  <p>Không có mạng nên chưa tìm được đường. {dest.name} cách {fmtDistance(haversine(origin, [dest.lng, dest.lat]))} theo đường chim bay, về hướng {compassWord(geoBearing(origin, [dest.lng, dest.lat]))}. Khi có mạng lại, HeartOS sẽ tìm đường ngay.</p>
                </div>
              )}
              {routeNote && <p className="map-hint">{routeNote}</p>}
              {sel && !routeBusy && (
                <>
                  <div className="route-sum">
                    <div>
                      <div className="rsum-time">
                        <b className={selRoute === 0 ? 'fast' : ''}>{fmtDuration(sel.duration)}</b> <span>({fmtDistance(sel.distance)})</span>
                      </div>
                      <div className="rsum-via">{selRoute === 0 ? 'Tuyến nhanh nhất' : `Chậm hơn ${fmtDuration(sel.duration - best.duration).toLowerCase()}`}{sel.via ? `, ${sel.via}` : ''}</div>
                      <div className="rsum-via">Đến lúc {fmtClock(Date.now() + sel.duration * 1000)}</div>
                    </div>
                  </div>
                  <div className="route-actions">
                    <button className="pill primary big" disabled={from !== 'me'} onClick={() => nav(`${base}/nav?${sp.toString()}`)}>
                      <Navigation2 size={19} fill="currentColor" strokeWidth={1.5} /> Bắt đầu
                    </button>
                    <button className="pill big" onClick={() => setShowSteps(!showSteps)}>
                      <ListOrdered size={18} /> {showSteps ? 'Ẩn các bước' : 'Các bước'}
                    </button>
                  </div>
                  {from !== 'me' && <p className="map-hint">Dẫn đường từng bước chỉ chạy khi điểm đi là vị trí của bạn.</p>}
                  {showSteps && (
                    <ol className="steps-list">
                      {sel.steps.map((s, i) => (
                        <li key={i}>
                          <span className="st-ic"><Maneuver turn={s.turn} size={22} /></span>
                          <span className="st-text">
                            <span className="t">{s.text}</span>
                            {s.distance > 0 && s.turn !== 'arrive' && <span className="m">{fmtDistance(s.distance)}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {routes.length > 1 && (
                    <>
                      <div className="sp-title">Các tuyến khác</div>
                      {routes.map((r, i) =>
                        i === selRoute ? null : (
                          <button key={r.id} className="prow" onClick={() => setSelRoute(i)}>
                            <span className="prow-ic">{MODE_ICON[r.mode]}</span>
                            <span className="prow-text">
                              <span className="t">{fmtDuration(r.duration)} ({fmtDistance(r.distance)})</span>
                              <span className="m">{r.via || 'Tuyến thay thế'}</span>
                            </span>
                          </button>
                        ),
                      )}
                    </>
                  )}
                  <a className="linkbtn" href={`https://www.google.com/maps/dir/?api=1&destination=${dest ? `${dest.lat},${dest.lng}` : ''}&travelmode=${mode === 'walk' ? 'walking' : mode === 'bike' ? 'bicycling' : 'driving'}`} target="_blank" rel="noreferrer">
                    Mở bằng ứng dụng bản đồ khác
                  </a>
                </>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function PlaceRow({ p, onClick, here }: { p: Place; onClick: () => void; here?: LngLat }) {
  const dist = p.distance ?? (here ? haversine(here, [p.lng, p.lat]) : undefined);
  return (
    <button className="prow" onClick={onClick}>
      <span className="prow-ic" data-group={p.category === 'home' ? 'home' : groupOf(p.category)}>
        {p.category === 'home' ? <HomeIcon size={18} /> : p.category === 'saved' ? <Bookmark size={18} /> : <MapPin size={18} />}
      </span>
      <span className="prow-text">
        <span className="t">{p.name}</span>
        <span className="m">{[catLabel(p), p.address].filter(Boolean).join(', ')}</span>
      </span>
      {dist !== undefined && <span className="prow-dist">{fmtDistance(dist)}</span>}
    </button>
  );
}

function Sheet({ pos, onPos, children }: { pos: SheetPos; onPos: (p: SheetPos) => void; children: ReactNode }) {
  const start = useRef<{ y: number; pos: SheetPos } | null>(null);
  const [drag, setDrag] = useState(0);
  const order: SheetPos[] = ['peek', 'half', 'full'];
  return (
    <div className={`msheet ${pos}`} style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
      <div
        className="msheet-handle"
        role="button"
        tabIndex={0}
        aria-label="Kéo để mở rộng"
        onPointerDown={(e) => {
          start.current = { y: e.clientY, pos };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => start.current && setDrag(Math.max(-400, Math.min(400, e.clientY - start.current.y)))}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          setDrag(0);
          if (!s) return;
          const dy = e.clientY - s.y;
          const i = order.indexOf(s.pos);
          if (Math.abs(dy) < 8) onPos(order[(i + 1) % order.length]);
          else if (dy < -40) onPos(order[Math.min(order.length - 1, i + (dy < -260 ? 2 : 1))]);
          else if (dy > 40) onPos(order[Math.max(0, i - (dy > 260 ? 2 : 1))]);
        }}
        onKeyDown={(e) => e.key === 'Enter' && onPos(order[(order.indexOf(pos) + 1) % order.length])}
      >
        <span />
      </div>
      <div className="msheet-body">{children}</div>
    </div>
  );
}
