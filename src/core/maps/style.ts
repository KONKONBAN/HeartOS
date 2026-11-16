import type { StyleSpecification, ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { MapEndpoints } from './config';
import { wrap } from './offline';

export type MapTheme = 'light' | 'dark';

export interface MapLook {
  theme: MapTheme;
  satellite: boolean;
  buildings3d: boolean;
}

interface Palette {
  bg: string;
  residential: string;
  park: string;
  wood: string;
  hospital: string;
  school: string;
  commercial: string;
  sand: string;
  water: string;
  waterLabel: string;
  building: string;
  buildingLine: string;
  motorway: string;
  motorwayCase: string;
  trunk: string;
  trunkCase: string;
  road: string;
  roadCase: string;
  minorCase: string;
  path: string;
  rail: string;
  roadLabel: string;
  placeLabel: string;
  subLabel: string;
  halo: string;
  boundary: string;
  aeroway: string;
}

const LIGHT: Palette = {
  bg: '#F4F2ED',
  residential: '#EEEBE5',
  park: '#CFE8C4',
  wood: '#BFDDB0',
  hospital: '#F7E1DE',
  school: '#F3EADB',
  commercial: '#F1ECE6',
  sand: '#F2E9CD',
  water: '#A3CDF5',
  waterLabel: '#3D6C9C',
  building: '#E7E2DB',
  buildingLine: '#D8D1C7',
  motorway: '#F8C76B',
  motorwayCase: '#DBA041',
  trunk: '#FCDD93',
  trunkCase: '#E2B661',
  road: '#FFFFFF',
  roadCase: '#D6CFC3',
  minorCase: '#E1DCD3',
  path: '#C7BFB2',
  rail: '#B9B2A8',
  roadLabel: '#5E5851',
  placeLabel: '#2A2622',
  subLabel: '#716A63',
  halo: '#FFFFFF',
  boundary: '#9D95A8',
  aeroway: '#E6E2EB',
};

const SAT: Palette = {
  bg: '#0B0F0C',
  residential: 'rgba(0,0,0,0)',
  park: 'rgba(0,0,0,0)',
  wood: 'rgba(0,0,0,0)',
  hospital: 'rgba(0,0,0,0)',
  school: 'rgba(0,0,0,0)',
  commercial: 'rgba(0,0,0,0)',
  sand: 'rgba(0,0,0,0)',
  water: 'rgba(0,0,0,0)',
  waterLabel: '#BFE0FF',
  building: 'rgba(0,0,0,0)',
  buildingLine: 'rgba(0,0,0,0)',
  motorway: 'rgba(250,206,120,0.85)',
  motorwayCase: 'rgba(0,0,0,0.25)',
  trunk: 'rgba(250,224,160,0.75)',
  trunkCase: 'rgba(0,0,0,0.2)',
  road: 'rgba(255,255,255,0.42)',
  roadCase: 'rgba(0,0,0,0.18)',
  minorCase: 'rgba(0,0,0,0)',
  path: 'rgba(255,255,255,0.35)',
  rail: 'rgba(255,255,255,0.4)',
  roadLabel: '#FFFFFF',
  placeLabel: '#FFFFFF',
  subLabel: '#E8EAED',
  halo: 'rgba(0,0,0,0.75)',
  boundary: '#E0D7F5',
  aeroway: 'rgba(0,0,0,0)',
};

const DARK: Palette = {
  bg: '#1D2125',
  residential: '#22272B',
  park: '#1F3326',
  wood: '#1C3022',
  hospital: '#33262A',
  school: '#2D2A24',
  commercial: '#25292E',
  sand: '#2E2B22',
  water: '#163049',
  waterLabel: '#7FA6CC',
  building: '#2A3036',
  buildingLine: '#343B42',
  motorway: '#8C6A2E',
  motorwayCase: '#5E4720',
  trunk: '#6E5A35',
  trunkCase: '#4C3F27',
  road: '#3A4149',
  roadCase: '#2A3036',
  minorCase: '#2A3036',
  path: '#4A525B',
  rail: '#4F565E',
  roadLabel: '#B8BEC4',
  placeLabel: '#E8EAED',
  subLabel: '#9AA2AA',
  halo: '#1D2125',
  boundary: '#6F6A80',
  aeroway: '#2A2D35',
};

export const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:vi'], ['get', 'name'], ['get', 'name:latin']];

const ROAD_NAME: ExpressionSpecification = ['let', 'n', NAME, ['case', ['==', ['index-of', 'Đường ', ['var', 'n']], 0], ['slice', ['var', 'n'], 6], ['==', ['index-of', 'Phố ', ['var', 'n']], 0], ['slice', ['var', 'n'], 4], ['var', 'n']]];

export const POI_GROUPS: { id: string; color: string; classes: string[] }[] = [
  { id: 'health', color: '#D3483F', classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'clinic', 'veterinary'] },
  { id: 'food', color: '#E2700F', classes: ['restaurant', 'fast_food', 'food_court', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery', 'pub'] },
  { id: 'shop', color: '#3F74C9', classes: ['shop', 'grocery', 'clothing_store', 'convenience', 'supermarket', 'marketplace', 'mall', 'department_store', 'jewelry', 'mobile_phone', 'electronics', 'hardware', 'books', 'alcohol_shop', 'shoe', 'gift', 'furniture', 'florist', 'hairdresser', 'laundry'] },
  { id: 'fuel', color: '#4E6E92', classes: ['fuel', 'car', 'car_repair', 'parking', 'bicycle'] },
  { id: 'money', color: '#4F6A73', classes: ['bank', 'atm', 'money'] },
  { id: 'school', color: '#86664F', classes: ['school', 'college', 'kindergarten', 'university', 'library'] },
  { id: 'park', color: '#36884A', classes: ['park', 'garden', 'playground', 'sports', 'stadium', 'zoo', 'pitch', 'swimming', 'golf', 'campsite'] },
  { id: 'worship', color: '#77706A', classes: ['place_of_worship', 'religion', 'cemetery'] },
  { id: 'hotel', color: '#B9467F', classes: ['lodging', 'hotel', 'motel', 'hostel'] },
  { id: 'transit', color: '#3E6FA8', classes: ['bus', 'railway', 'airport', 'ferry_terminal', 'harbor', 'aerialway'] },
  { id: 'office', color: '#5F638A', classes: ['town_hall', 'police', 'post', 'embassy', 'fire_station', 'prison', 'office', 'information'] },
];

export const POI_DEFAULT_COLOR = '#8A8178';

function poiMatch<T extends string>(pick: (g: (typeof POI_GROUPS)[number]) => T, fallback: T): ExpressionSpecification {
  const args: unknown[] = [];
  for (const g of POI_GROUPS) args.push(g.classes, pick(g));
  return ['match', ['get', 'class'], ...args, fallback] as unknown as ExpressionSpecification;
}

const zoomWidth = (stops: [number, number][]): ExpressionSpecification => ['interpolate', ['exponential', 1.35], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;

const lineFilter = (classes: string[], brunnel?: 'bridge' | 'tunnel'): FilterSpecification => [
  'all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['match', ['get', 'class'], classes, true, false],
  brunnel ? ['==', ['get', 'brunnel'], brunnel] : ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true],
];

export function buildStyle(look: MapLook | MapTheme, ep: MapEndpoints): StyleSpecification {
  const lk: MapLook = typeof look === 'string' ? { theme: look, satellite: false, buildings3d: false } : look;
  const theme = lk.satellite ? 'dark' : lk.theme;
  const sat = lk.satellite;
  const c = sat ? SAT : theme === 'dark' ? DARK : LIGHT;
  const src = { source: 'omt' };
  const roads = (brunnel?: 'bridge' | 'tunnel'): LayerSpecification[] => {
    const tag = brunnel ?? 'road';
    const dash = brunnel === 'tunnel' ? { 'line-dasharray': [0.6, 0.4] } : {};
    const caseColor = brunnel === 'bridge' ? (theme === 'dark' ? '#15181B' : '#C3BBAE') : c.roadCase;
    return [
      { id: `${tag}-minor-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 13, filter: lineFilter(['minor', 'service'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': brunnel ? caseColor : c.minorCase, 'line-width': zoomWidth([[13, 1], [16, 7], [20, 26]]), ...dash } },
      { id: `${tag}-sec-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 10, filter: lineFilter(['secondary', 'tertiary'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': caseColor, 'line-width': zoomWidth([[10, 1.2], [14, 6], [17, 15], [20, 36]]), ...dash } },
      { id: `${tag}-pri-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 7, filter: lineFilter(['primary'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': caseColor, 'line-width': zoomWidth([[7, 1], [12, 4], [15, 11], [17, 18], [20, 42]]), ...dash } },
      { id: `${tag}-trunk-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 6, filter: lineFilter(['trunk'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.trunkCase, 'line-width': zoomWidth([[6, 1], [12, 5], [15, 12], [17, 20], [20, 44]]), ...dash } },
      { id: `${tag}-motorway-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 5, filter: lineFilter(['motorway'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.motorwayCase, 'line-width': zoomWidth([[5, 1], [12, 5], [15, 13], [17, 22], [20, 46]]), ...dash } },
      { id: `${tag}-path`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 15, filter: lineFilter(['path', 'pedestrian', 'track'], brunnel), layout: { 'line-join': 'round' }, paint: { 'line-color': c.path, 'line-dasharray': [1.2, 0.8], 'line-width': zoomWidth([[15, 1], [20, 3]]) } },
      { id: `${tag}-minor`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 13, filter: lineFilter(['minor', 'service'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.road, 'line-width': zoomWidth([[13, 0.5], [16, 5], [20, 22]]) } },
      { id: `${tag}-sec`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 10, filter: lineFilter(['secondary', 'tertiary'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.road, 'line-width': zoomWidth([[10, 0.6], [14, 4.5], [17, 12], [20, 32]]) } },
      { id: `${tag}-pri`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 7, filter: lineFilter(['primary'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.road, 'line-width': zoomWidth([[7, 0.6], [12, 3], [15, 9], [17, 15], [20, 38]]) } },
      { id: `${tag}-trunk`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 6, filter: lineFilter(['trunk'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.trunk, 'line-width': zoomWidth([[6, 0.6], [12, 3.6], [15, 10], [17, 17], [20, 40]]) } },
      { id: `${tag}-motorway`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: 5, filter: lineFilter(['motorway'], brunnel), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.motorway, 'line-width': zoomWidth([[5, 0.6], [12, 3.6], [15, 11], [17, 19], [20, 42]]) } },
    ];
  };

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': c.bg } },
    ...(sat ? [{ id: 'satellite', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 150 } } as LayerSpecification] : []),
    { id: 'landuse-residential', type: 'fill', ...src, 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], true, false], paint: { 'fill-color': c.residential, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 0.5] } },
    { id: 'landuse-commercial', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 12, filter: ['match', ['get', 'class'], ['commercial', 'retail', 'industrial'], true, false], paint: { 'fill-color': c.commercial } },
    { id: 'landcover-wood', type: 'fill', ...src, 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'forest'], true, false], paint: { 'fill-color': c.wood, 'fill-opacity': 0.8 } },
    { id: 'landcover-grass', type: 'fill', ...src, 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'farmland', 'wetland'], true, false], paint: { 'fill-color': c.park, 'fill-opacity': 0.6 } },
    { id: 'landcover-sand', type: 'fill', ...src, 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': c.sand } },
    { id: 'park', type: 'fill', ...src, 'source-layer': 'park', paint: { 'fill-color': c.park } },
    { id: 'landuse-hospital', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 12, filter: ['==', ['get', 'class'], 'hospital'], paint: { 'fill-color': c.hospital } },
    { id: 'landuse-school', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 12, filter: ['match', ['get', 'class'], ['school', 'university', 'college', 'kindergarten'], true, false], paint: { 'fill-color': c.school } },
    { id: 'landuse-green', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 11, filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground'], true, false], paint: { 'fill-color': c.park, 'fill-opacity': 0.7 } },
    { id: 'aeroway', type: 'fill', ...src, 'source-layer': 'aeroway', minzoom: 11, filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': c.aeroway } },
    { id: 'waterway', type: 'line', ...src, 'source-layer': 'waterway', filter: ['!=', ['get', 'brunnel'], 'tunnel'], layout: { 'line-cap': 'round' }, paint: { 'line-color': c.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2, 18, 6] } },
    { id: 'water', type: 'fill', ...src, 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': c.water } },
    ...(sat
      ? []
      : lk.buildings3d
        ? [{ id: 'building-3d', type: 'fill-extrusion', ...src, 'source-layer': 'building', minzoom: 14, paint: { 'fill-extrusion-color': theme === 'dark' ? '#2F363D' : '#E3DED6', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.9] } } as LayerSpecification]
        : [{ id: 'building', type: 'fill', ...src, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1], 'fill-outline-color': c.buildingLine } } as LayerSpecification]),
    ...roads('tunnel'),
    { id: 'rail', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 11, filter: ['all', ['match', ['get', 'class'], ['rail', 'transit'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']], paint: { 'line-color': c.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 18, 3] } },
    { id: 'rail-hatch', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 14, filter: ['all', ['match', ['get', 'class'], ['rail', 'transit'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']], paint: { 'line-color': c.bg, 'line-dasharray': [0.3, 3], 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 6] } },
    ...roads(),
    ...roads('bridge'),
    { id: 'oneway', type: 'symbol', ...src, 'source-layer': 'transportation', minzoom: 16, filter: ['all', ['==', ['get', 'oneway'], 1], ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'minor', 'service', 'trunk'], true, false]], layout: { 'symbol-placement': 'line', 'symbol-spacing': 120, 'icon-image': 'oneway', 'icon-size': 0.5, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': false } },
    { id: 'boundary-country', type: 'line', ...src, 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 10, 2], 'line-dasharray': [3, 1.5] } },
    { id: 'boundary-state', type: 'line', ...src, 'source-layer': 'boundary', minzoom: 6, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.boundary, 'line-opacity': 0.6, 'line-width': 1, 'line-dasharray': [2, 2] } },
    { id: 'water-name', type: 'symbol', ...src, 'source-layer': 'water_name', filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-letter-spacing': 0.05, 'text-max-width': 8 }, paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'water-name-line', type: 'symbol', ...src, 'source-layer': 'water_name', filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'symbol-placement': 'line', 'text-letter-spacing': 0.05 }, paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'waterway-name', type: 'symbol', ...src, 'source-layer': 'waterway', minzoom: 13, filter: ['has', 'name'], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'line', 'symbol-spacing': 400 }, paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'road-name-minor', type: 'symbol', ...src, 'source-layer': 'transportation_name', minzoom: 15, filter: ['match', ['get', 'class'], ['minor', 'service'], true, false], layout: { 'text-field': ROAD_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10.5, 18, 13], 'symbol-placement': 'line', 'text-rotation-alignment': 'map', 'symbol-spacing': 300 }, paint: { 'text-color': c.roadLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } },
    { id: 'road-name-major', type: 'symbol', ...src, 'source-layer': 'transportation_name', minzoom: 12, filter: ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk', 'motorway'], true, false], layout: { 'text-field': ROAD_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10.5, 15, 12.5, 18, 15], 'symbol-placement': 'line', 'text-rotation-alignment': 'map', 'symbol-spacing': 350 }, paint: { 'text-color': c.roadLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.8 } },
    { id: 'housenumber', type: 'symbol', ...src, 'source-layer': 'housenumber', minzoom: 17.5, layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 }, paint: { 'text-color': theme === 'dark' ? '#7D858D' : '#9B948B', 'text-halo-color': c.halo, 'text-halo-width': 1 } },
    {
      id: 'poi',
      type: 'symbol',
      ...src,
      'source-layer': 'poi',
      minzoom: 14,
      filter: ['all', ['has', 'name'], ['<=', ['get', 'rank'], ['step', ['zoom'], 6, 15, 14, 16, 22, 17, 40]]],
      layout: {
        'icon-image': ['concat', 'poi-', poiMatch((g) => g.id, 'other')] as unknown as ExpressionSpecification,
        'icon-size': 0.5,
        'text-field': NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': 11.5,
        'text-anchor': 'left',
        'text-offset': [0.95, 0],
        'text-max-width': 9,
        'text-optional': true,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': poiMatch((g) => g.color, POI_DEFAULT_COLOR), 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    { id: 'place-small', type: 'symbol', ...src, 'source-layer': 'place', minzoom: 11, filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood', 'hamlet', 'isolated_dwelling'], true, false], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 8 }, paint: { 'text-color': c.subLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'place-village', type: 'symbol', ...src, 'source-layer': 'place', minzoom: 9, filter: ['match', ['get', 'class'], ['village', 'town'], true, false], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 15], 'text-max-width': 8 }, paint: { 'text-color': c.placeLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'place-city', type: 'symbol', ...src, 'source-layer': 'place', minzoom: 4, maxzoom: 15, filter: ['==', ['get', 'class'], 'city'], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 15, 12, 20], 'text-max-width': 8 }, paint: { 'text-color': c.placeLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } },
    { id: 'place-state', type: 'symbol', ...src, 'source-layer': 'place', minzoom: 5, maxzoom: 9, filter: ['==', ['get', 'class'], 'state'], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, paint: { 'text-color': c.subLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'place-country', type: 'symbol', ...src, 'source-layer': 'place', maxzoom: 7, filter: ['==', ['get', 'class'], 'country'], layout: { 'text-field': NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 16] }, paint: { 'text-color': c.placeLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } },
  ];

  return {
    version: 8,
    name: sat ? 'HeartOS vệ tinh' : theme === 'dark' ? 'HeartOS tối' : 'HeartOS',
    glyphs: wrap(ep.glyphs),
    sources: {
      omt: { type: 'vector', url: wrap(ep.tiles), attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>, <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>' },
      ...(sat ? { sat: { type: 'raster' as const, tiles: [wrap(ep.satellite)], tileSize: 256, maxzoom: 19, attribution: ep.satelliteAttribution } } : {}),
    },
    layers,
  };
}
