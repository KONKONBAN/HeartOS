import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'virtual:maplibre-worker';
import { endpoints } from '../../core/maps/config';
import { bboxOf, bearing as bearingOf, haversine, sliceAlong, type LngLat } from '../../core/maps/geo';
import { GLYPHS, onewayImage, poiImage, svgOf } from '../../core/maps/icons';
import type { Route } from '../../core/maps/route';
import type { Place, PlaceCategory } from '../../core/maps/search';
import { buildStyle, NAME, POI_GROUPS, type MapLook, type MapTheme } from '../../core/maps/style';
import { installProtocol } from '../../core/maps/offline';
import type { GeoFix } from './useGeo';

maplibregl.setWorkerUrl(workerUrl);
installProtocol((scheme, fn) => maplibregl.addProtocol(scheme, fn as unknown as maplibregl.AddProtocolAction));

const ROUTE_BLUE = '#1A73E8';
const ROUTE_CASE = '#1558B8';
const DONE = '#A9B0B8';
const DONE_CASE = '#858C94';
const ARROW_CASE = '#0B3E8C';

function arrowHead(): ImageData {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(s / 2, 6);
  g.lineTo(s - 8, s - 14);
  g.lineTo(8, s - 14);
  g.closePath();
  g.fillStyle = '#FFFFFF';
  g.strokeStyle = ARROW_CASE;
  g.lineWidth = 6;
  g.stroke();
  g.fill();
  return g.getImageData(0, 0, s, s);
}

const PUCK_SVG = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#1A73E8" fill-opacity=".18"/><circle cx="32" cy="32" r="22" fill="#fff"/><path d="M32 12 45.5 46 32 38.5 18.5 46Z" fill="#1A73E8" stroke="#0B57D0" stroke-width="2" stroke-linejoin="round"/></svg>';

export function groupOf(cat: PlaceCategory): string {
  switch (cat) {
    case 'hospital':
    case 'pharmacy':
      return 'health';
    case 'food':
      return 'food';
    case 'cafe':
      return 'cafe';
    case 'shop':
      return 'shop';
    case 'fuel':
      return 'fuel';
    case 'atm':
      return 'money';
    case 'school':
      return 'school';
    case 'park':
      return 'park';
    case 'worship':
      return 'worship';
    case 'hotel':
      return 'hotel';
    case 'transit':
      return 'transit';
    case 'office':
      return 'office';
    default:
      return 'other';
  }
}

let imageCache: Map<string, ImageData> | null = null;

export async function prepareImages() {
  if (imageCache) return imageCache;
  const cache = new Map<string, ImageData>();
  const groups = [...POI_GROUPS.map((g) => g.id), 'other', 'cafe'];
  await Promise.all(groups.map(async (g) => cache.set(`poi-${g}`, await poiImage(g))));
  cache.set('oneway', onewayImage());
  cache.set('turn-head', arrowHead());
  imageCache = cache;
  return cache;
}

function circle(center: LngLat, meters: number, steps = 48): Feature<Polygon> {
  const coords: LngLat[] = [];
  const latR = meters / 111_320;
  const lngR = meters / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([center[0] + lngR * Math.cos(a), center[1] + latR * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });


function el(className: string, html = '') {
  const d = document.createElement('div');
  d.className = className;
  d.innerHTML = html;
  return d;
}

export interface ControllerEvents {
  onPlace: (p: Place) => void;
  onPin: (at: LngLat) => void;
  onRoute: (idx: number) => void;
  onMove: (bearing: number, userGesture: boolean) => void;
  onError: (msg: string) => void;
}

export class MapController {
  map: maplibregl.Map;
  theme: MapTheme;
  look: MapLook;
  private meMarker: maplibregl.Marker | null = null;
  private selMarker: maplibregl.Marker | null = null;
  private homeMarker: maplibregl.Marker | null = null;
  private originMarker: maplibregl.Marker | null = null;
  private puckMarker: maplibregl.Marker | null = null;
  private labels: maplibregl.Marker[] = [];
  private state: { me: GeoFix | null; results: Place[]; routes: Route[]; selectedRoute: number; dest: LngLat | null; nav: { done: LngLat[]; rest: LngLat[]; arrow: LngLat[] | null; walk: boolean } | null } = { me: null, results: [], routes: [], selectedRoute: 0, dest: null, nav: null };
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  ready: Promise<void>;

  constructor(container: HTMLElement, look: MapLook, center: LngLat, zoom: number, private ev: ControllerEvents) {
    this.look = look;
    this.theme = look.satellite ? 'dark' : look.theme;
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(look, endpoints()),
      pitch: look.buildings3d ? 50 : 0,
      center,
      zoom,
      attributionControl: false,
      maxPitch: 60,
      fadeDuration: 120,
      dragRotate: true,
      touchPitch: true,
      cooperativeGestures: false,
    });
    this.map.touchZoomRotate.enableRotation();
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    this.map.setMissingStyleImageResolver(async (id) => {
      const img = imageCache?.get(id) ?? (id.startsWith('poi-') ? await poiImage(id.slice(4)) : null);
      if (img && !this.map.hasImage(id)) this.map.addImage(id, img, { pixelRatio: 2 });
    });
    this.map.on('error', (e: { error?: unknown }) => {
      const msg = (e.error as Error | undefined)?.message ?? '';
      if (/Failed to fetch|NetworkError|status 0|AJAXError/i.test(msg)) this.ev.onError('Không tải được bản đồ. Kiểm tra kết nối mạng.');
    });
    this.ready = new Promise((resolve) =>
      this.map.once('load', () => {
        container.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
        resolve();
      }),
    );
    this.map.on('style.load', () => this.installOverlays());
    this.map.on('rotate', (e: { originalEvent?: unknown }) => this.ev.onMove(this.map.getBearing(), !!(e as { originalEvent?: unknown }).originalEvent));
    this.map.on('click', (e: MapMouseEvent) => this.handleClick(e));
    this.map.on('contextmenu', (e: MapMouseEvent) => this.ev.onPin([e.lngLat.lng, e.lngLat.lat]));
    this.map.on('touchstart', (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return this.cancelPress();
      const at: LngLat = [e.lngLat.lng, e.lngLat.lat];
      this.pressTimer = setTimeout(() => this.ev.onPin(at), 600);
    });
    for (const n of ['touchend', 'touchmove', 'touchcancel', 'dragstart', 'zoomstart'] as const) this.map.on(n, () => this.cancelPress());
  }

  private cancelPress() {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  private handleClick(e: MapMouseEvent) {
    const routeHit = this.map.getLayer('route-alt') ? this.map.queryRenderedFeatures(e.point, { layers: ['route-alt'] }) : [];
    if (routeHit.length) return this.ev.onRoute(Number(routeHit[0].properties?.idx ?? 0));
    const resultHit = this.map.getLayer('results') ? this.map.queryRenderedFeatures(e.point, { layers: ['results'] }) : [];
    if (resultHit.length) {
      const p = this.state.results.find((r) => r.id === resultHit[0].properties?.id);
      if (p) return this.ev.onPlace(p);
    }
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - 12, e.point.y - 12],
      [e.point.x + 12, e.point.y + 12],
    ];
    const hits = this.map.getLayer('poi') ? this.map.queryRenderedFeatures(box, { layers: ['poi'] }) : [];
    const f = hits[0];
    if (f && f.geometry.type === 'Point') {
      const props = f.properties ?? {};
      const [lng, lat] = f.geometry.coordinates as LngLat;
      const name = String(props['name:vi'] ?? props.name ?? 'Địa điểm');
      const cls = String(props.class ?? '');
      const group = POI_GROUPS.find((g) => g.classes.includes(cls))?.id ?? 'other';
      const cat: PlaceCategory = cls === 'hospital' || cls === 'doctors' || cls === 'clinic' ? 'hospital' : cls === 'pharmacy' ? 'pharmacy' : cls === 'cafe' ? 'cafe' : group === 'food' ? 'food' : group === 'shop' ? 'shop' : cls === 'fuel' ? 'fuel' : group === 'money' ? 'atm' : group === 'school' ? 'school' : group === 'park' ? 'park' : group === 'worship' ? 'worship' : group === 'hotel' ? 'hotel' : group === 'transit' ? 'transit' : group === 'office' ? 'office' : 'other';
      this.ev.onPlace({ id: `poi-${f.id ?? `${lat},${lng}`}`, name, address: '', lat, lng, category: cat });
    }
  }

  private installOverlays() {
    const m = this.map;
    const add = (id: string) => {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: empty() });
    };
    ['me-acc', 'routes', 'results', 'route-done', 'turn-arrow', 'turn-head', 'route-tail'].forEach(add);
    if (!m.hasImage('turn-head')) m.addImage('turn-head', imageCache?.get('turn-head') ?? arrowHead(), { pixelRatio: 2 });
    if (!m.getLayer('me-acc')) m.addLayer({ id: 'me-acc', type: 'fill', source: 'me-acc', paint: { 'fill-color': ROUTE_BLUE, 'fill-opacity': 0.12 } });
    if (!m.getLayer('me-acc-line')) m.addLayer({ id: 'me-acc-line', type: 'line', source: 'me-acc', paint: { 'line-color': ROUTE_BLUE, 'line-opacity': 0.35, 'line-width': 1 } });
    const width = (base: number): maplibregl.ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 10, base * 0.55, 14, base, 18, base * 1.9];
    const before = m.getLayer('road-name-minor') ? 'road-name-minor' : undefined;
    if (!m.getLayer('route-done-case')) m.addLayer({ id: 'route-done-case', type: 'line', source: 'route-done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': DONE_CASE, 'line-width': width(10) } }, before);
    if (!m.getLayer('route-done')) m.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': DONE, 'line-width': width(7) } }, before);
    if (!m.getLayer('route-alt-case')) m.addLayer({ id: 'route-alt-case', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.theme === 'dark' ? '#3E5A78' : '#8FA9C6', 'line-width': width(9) } }, before);
    if (!m.getLayer('route-alt')) m.addLayer({ id: 'route-alt', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.theme === 'dark' ? '#5F7FA3' : '#BCD0E6', 'line-width': width(6) } }, before);
    if (!m.getLayer('route-case')) m.addLayer({ id: 'route-case', type: 'line', source: 'routes', filter: ['all', ['==', ['get', 'sel'], true], ['!=', ['get', 'walk'], true]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE_CASE, 'line-width': width(10) } }, before);
    if (!m.getLayer('route-line')) m.addLayer({ id: 'route-line', type: 'line', source: 'routes', filter: ['all', ['==', ['get', 'sel'], true], ['!=', ['get', 'walk'], true]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE_BLUE, 'line-width': width(7) } }, before);
    if (!m.getLayer('route-walk')) m.addLayer({ id: 'route-walk', type: 'line', source: 'routes', filter: ['all', ['==', ['get', 'sel'], true], ['==', ['get', 'walk'], true]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE_BLUE, 'line-width': width(7), 'line-dasharray': [0.01, 2] } }, before);
    if (!m.getLayer('route-tail')) m.addLayer({ id: 'route-tail', type: 'line', source: 'route-tail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.theme === 'dark' ? '#9AA0A6' : '#5F6368', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 4], 'line-dasharray': [0.1, 2] } }, before);
    if (!m.getLayer('turn-arrow-case')) m.addLayer({ id: 'turn-arrow-case', type: 'line', source: 'turn-arrow', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ARROW_CASE, 'line-width': width(8.5) } });
    if (!m.getLayer('turn-arrow')) m.addLayer({ id: 'turn-arrow', type: 'line', source: 'turn-arrow', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': width(5.2) } });
    if (!m.getLayer('turn-head')) m.addLayer({ id: 'turn-head', type: 'symbol', source: 'turn-head', layout: { 'icon-image': 'turn-head', 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.55, 16, 1.05, 18, 1.9, 20, 3.2] } });
    if (!m.getLayer('results')) m.addLayer({ id: 'results', type: 'symbol', source: 'results', layout: { 'icon-image': ['concat', 'poi-', ['get', 'group']], 'icon-size': 0.72, 'icon-allow-overlap': true, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': this.theme === 'dark' ? '#E8EAED' : '#2A2622', 'text-halo-color': this.theme === 'dark' ? '#1D2125' : '#FFFFFF', 'text-halo-width': 1.6 } });
    void NAME;
    this.sync();
  }

  private sync() {
    const m = this.map;
    const me = this.state.me;
    (m.getSource('me-acc') as GeoJSONSource | undefined)?.setData(me && me.accuracy > 15 ? { type: 'FeatureCollection', features: [circle(me.at, Math.min(me.accuracy, 1500))] } : empty());
    const routes = this.state.routes;
    const nav = this.state.nav;
    const line = (coords: LngLat[], props: Record<string, unknown> = {}) => ({ type: 'Feature' as const, properties: props, geometry: { type: 'LineString' as const, coordinates: coords } });
    (m.getSource('routes') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: nav
        ? nav.rest.length > 1
          ? [line(nav.rest, { idx: 0, sel: true, walk: nav.walk })]
          : []
        : routes.map((r, idx) => line(r.coords, { idx, sel: idx === this.state.selectedRoute, walk: r.mode === 'walk' })).sort((a, b) => Number(a.properties.sel) - Number(b.properties.sel)),
    });
    const sel = nav ? null : routes[this.state.selectedRoute];
    const end = nav ? nav.rest[nav.rest.length - 1] : sel?.coords[sel.coords.length - 1];
    const dest = this.state.dest;
    (m.getSource('route-tail') as GeoJSONSource | undefined)?.setData(end && dest && (nav || routes.length) && haversine(end, dest) > 12 && haversine(end, dest) < 600 ? { type: 'FeatureCollection', features: [line([end, dest])] } : empty());
    (m.getSource('route-done') as GeoJSONSource | undefined)?.setData(nav && nav.done.length > 1 ? { type: 'FeatureCollection', features: [line(nav.done)] } : empty());
    const arrow = nav?.arrow && nav.arrow.length > 1 ? nav.arrow : null;
    (m.getSource('turn-arrow') as GeoJSONSource | undefined)?.setData(arrow ? { type: 'FeatureCollection', features: [line(arrow)] } : empty());
    (m.getSource('turn-head') as GeoJSONSource | undefined)?.setData(
      arrow ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { b: bearingOf(arrow[arrow.length - 2], arrow[arrow.length - 1]) }, geometry: { type: 'Point', coordinates: arrow[arrow.length - 1] } }] } : empty(),
    );
    (m.getSource('results') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: this.state.results.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name, group: groupOf(p.category) }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    });
  }

  setLook(look: MapLook) {
    const prev = this.look;
    if (prev.theme === look.theme && prev.satellite === look.satellite && prev.buildings3d === look.buildings3d) return;
    this.look = look;
    this.theme = look.satellite ? 'dark' : look.theme;
    for (const id of ['route-tail', 'route-done-case', 'route-done', 'route-alt-case', 'route-alt', 'route-case', 'route-line', 'route-walk', 'turn-arrow-case', 'turn-arrow', 'turn-head', 'results', 'me-acc', 'me-acc-line']) if (this.map.getLayer(id)) this.map.removeLayer(id);
    this.map.setStyle(buildStyle(look, endpoints()), { diff: false });
    if (prev.buildings3d !== look.buildings3d) this.map.easeTo({ pitch: look.buildings3d ? 50 : 0, duration: 600 });
  }

  setMe(fix: GeoFix | null) {
    this.state.me = fix;
    if (!fix) {
      this.meMarker?.remove();
      this.meMarker = null;
    } else {
      if (!this.meMarker) {
        const node = el('me-dot', '<span class="me-cone"></span><span class="me-core"></span>');
        this.meMarker = new maplibregl.Marker({ element: node, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(fix.at).addTo(this.map);
      }
      this.meMarker.setLngLat(fix.at);
      this.meMarker.getElement().style.visibility = this.puckMarker ? 'hidden' : 'visible';
      const cone = this.meMarker.getElement().querySelector('.me-cone') as HTMLElement | null;
      if (cone) {
        cone.style.display = fix.heading === null ? 'none' : 'block';
        cone.style.transform = `rotate(${fix.heading ?? 0}deg)`;
      }
    }
    this.sync();
  }

  setResults(list: Place[]) {
    this.state.results = list;
    this.sync();
  }

  setSelected(p: { lat: number; lng: number } | null) {
    this.state.dest = p ? [p.lng, p.lat] : null;
    this.selMarker?.remove();
    this.selMarker = null;
    if (p) {
      const node = el('map-pin', '<svg viewBox="0 0 32 42" width="32" height="42"><path d="M16 41s14-13.2 14-24.5C30 7.9 23.7 1.5 16 1.5S2 7.9 2 16.5C2 27.8 16 41 16 41z" fill="#D93025" stroke="#A52714" stroke-width="1.5"/><circle cx="16" cy="16" r="5.5" fill="#7A1209"/></svg>');
      this.selMarker = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(this.map);
    }
    this.sync();
  }

  setHome(home: { lat: number; lng: number } | null | undefined) {
    this.homeMarker?.remove();
    this.homeMarker = null;
    if (home) {
      const node = el('home-pin', svgOf(GLYPHS.other, '#fff', 2.4).replace(/<path[^>]*\/>/g, '').replace('</svg>', '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>'));
      node.setAttribute('aria-label', 'Nhà');
      this.homeMarker = new maplibregl.Marker({ element: node }).setLngLat([home.lng, home.lat]).addTo(this.map);
    }
  }

  setRoutes(routes: Route[], selected: number, origin: LngLat | null, labelFor: (r: Route, idx: number) => string) {
    this.state.routes = routes;
    this.state.selectedRoute = selected;
    this.labels.forEach((l) => l.remove());
    this.labels = [];
    this.originMarker?.remove();
    this.originMarker = null;
    if (origin) {
      this.originMarker = new maplibregl.Marker({ element: el('origin-dot') }).setLngLat(origin).addTo(this.map);
    }
    routes.forEach((r, idx) => {
      const at = r.coords[Math.floor(r.coords.length * (idx === selected ? 0.45 : 0.6))];
      const html = labelFor(r, idx);
      if (!at || !html) return;
      const node = el('route-label' + (idx === selected ? ' sel' : ''), html);
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ev.onRoute(idx);
      });
      this.labels.push(new maplibregl.Marker({ element: node, anchor: 'bottom-left' }).setLngLat(at).addTo(this.map));
    });
    this.sync();
  }

  fit(points: LngLat[], padding: { top: number; bottom: number; left: number; right: number }, maxZoom = 16) {
    if (!points.length) return;
    if (points.length === 1) {
      this.map.easeTo({ center: points[0], zoom: Math.max(this.map.getZoom(), 15), padding, duration: 600 });
      return;
    }
    this.map.fitBounds(bboxOf(points) as LngLatBoundsLike, { padding, maxZoom, duration: 700 });
  }

  setNavigation(n: { route: Route; along: number; turnAt: number | null } | null) {
    if (!n) {
      this.state.nav = null;
    } else {
      const { route, along, turnAt } = n;
      const total = route.cum[route.cum.length - 1] ?? route.distance;
      const arrow = turnAt !== null && turnAt - along < 450 && turnAt > along - 5 ? sliceAlong(route.coords, route.cum, Math.max(along, turnAt - 32), Math.min(total, turnAt + 24)) : null;
      this.state.nav = { done: sliceAlong(route.coords, route.cum, 0, along), rest: sliceAlong(route.coords, route.cum, along, total), arrow, walk: route.mode === 'walk' };
    }
    this.sync();
  }

  setPuck(at: LngLat | null, heading: number) {
    if (!at) {
      this.puckMarker?.remove();
      this.puckMarker = null;
      if (this.meMarker) this.meMarker.getElement().style.visibility = 'visible';
      return;
    }
    if (!this.puckMarker) {
      this.puckMarker = new maplibregl.Marker({ element: el('nav-puck', PUCK_SVG), rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat(at).addTo(this.map);
    }
    this.puckMarker.setLngLat(at).setRotation(heading);
    if (this.meMarker) this.meMarker.getElement().style.visibility = 'hidden';
  }

  follow(at: LngLat, bearing: number, padding: { top: number; bottom: number }, zoom = 17.4) {
    this.map.easeTo({ center: at, bearing, pitch: 58, zoom, padding: { top: padding.top, bottom: padding.bottom, left: 0, right: 0 }, duration: 950, easing: (t: number) => t });
  }

  resetNorth() {
    this.map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
  }

  destroy() {
    this.labels.forEach((l) => l.remove());
    this.map.remove();
  }
}
