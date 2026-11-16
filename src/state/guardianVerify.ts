import { judgeFallImage } from '../core/guardian/vision';
import type { VisionVerdict } from '../core/guardian/verify';
import { genConfig } from './genai';
import { haCameraImage } from './ha';
import { getHome } from './services';
import { getApp } from './store';

export type CameraCheck = { status: 'done'; verdict: VisionVerdict; camera: string } | { status: 'skipped'; reason: string } | { status: 'failed'; reason: string };

export function cameraForRoom(room: string) {
  return getHome().s.devices.find((d) => d.kind === 'camera' && d.room === room && d.online) ?? null;
}

async function downscale(dataUrl: string, max = 768): Promise<{ base64: string; mime: 'image/jpeg' }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { base64: c.toDataURL('image/jpeg', 0.72).split(',')[1], mime: 'image/jpeg' };
}

export async function cameraCheck(room: string): Promise<CameraCheck> {
  const app = getApp();
  if (app.prefs.ai.fallCamera === false) return { status: 'skipped', reason: 'Gia đình đã tắt xem camera khi nghi ngã' };
  const cam = cameraForRoom(room);
  if (!cam) return { status: 'skipped', reason: 'Phòng này không có camera' };
  if (!getHome().s.real) return { status: 'skipped', reason: 'Camera nhà mẫu không có ảnh thật' };
  const cfg = await genConfig();
  if (!cfg) return { status: 'skipped', reason: 'Trợ lý AI chưa sẵn sàng để xem ảnh' };
  try {
    const image = await downscale(await haCameraImage(cam.id));
    const verdict = await judgeFallImage(cfg, image, getHome().room(room as never).name);
    return { status: 'done', verdict, camera: cam.name };
  } catch (e) {
    return { status: 'failed', reason: (e as Error).message || 'Không lấy được ảnh camera' };
  }
}
