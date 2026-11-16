import * as bedIcon from 'lucide-react/icons/bed';
import * as busIcon from 'lucide-react/icons/bus';
import * as churchIcon from 'lucide-react/icons/church';
import * as coffeeIcon from 'lucide-react/icons/coffee';
import * as fuelIcon from 'lucide-react/icons/fuel';
import * as capIcon from 'lucide-react/icons/graduation-cap';
import * as landmarkIcon from 'lucide-react/icons/landmark';
import * as pinIcon from 'lucide-react/icons/map-pin';
import * as crossIcon from 'lucide-react/icons/plus';
import * as bagIcon from 'lucide-react/icons/shopping-bag';
import * as treesIcon from 'lucide-react/icons/trees';
import * as utensilsIcon from 'lucide-react/icons/utensils';
import * as banknoteIcon from 'lucide-react/icons/banknote';
import { POI_DEFAULT_COLOR, POI_GROUPS } from './style';

type IconData = { name: string; size: number; node: [string, Record<string, string>][] };
const data = (m: unknown) => (m as { __iconData: IconData }).__iconData;
const bed = data(bedIcon);
const bus = data(busIcon);
const church = data(churchIcon);
const coffee = data(coffeeIcon);
const fuel = data(fuelIcon);
const cap = data(capIcon);
const landmark = data(landmarkIcon);
const pin = data(pinIcon);
const cross = data(crossIcon);
const bag = data(bagIcon);
const trees = data(treesIcon);
const utensils = data(utensilsIcon);
const banknote = data(banknoteIcon);

const GLYPH: Record<string, IconData> = {
  health: cross,
  food: utensils,
  shop: bag,
  fuel,
  money: banknote,
  school: cap,
  park: trees,
  worship: church,
  hotel: bed,
  transit: bus,
  office: landmark,
  other: pin,
  cafe: coffee,
};

export function svgOf(icon: IconData, color = '#fff', stroke = 2.4) {
  const body = icon.node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export async function poiImage(group: string, ratio = 2) {
  const size = 36 * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const color = POI_GROUPS.find((g) => g.id === group)?.color ?? POI_DEFAULT_COLOR;
  const r = size / 2 - 3 * ratio;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r + 2.5 * ratio, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  const img = await loadSvg(svgOf(GLYPH[group] ?? pin));
  const g = r * 1.15;
  ctx.drawImage(img, size / 2 - g / 2, size / 2 - g / 2, g, g);
  return ctx.getImageData(0, 0, size, size);
}

export function onewayImage(ratio = 2) {
  const w = 24 * ratio;
  const h = 12 * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(110,104,96,0.75)';
  ctx.lineWidth = 2 * ratio;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(3 * ratio, h / 2);
  ctx.lineTo(w - 4 * ratio, h / 2);
  ctx.moveTo(w - 9 * ratio, 2 * ratio);
  ctx.lineTo(w - 4 * ratio, h / 2);
  ctx.lineTo(w - 9 * ratio, h - 2 * ratio);
  ctx.stroke();
  return ctx.getImageData(0, 0, w, h);
}

export const GLYPHS = GLYPH;
