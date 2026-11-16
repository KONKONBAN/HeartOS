import * as z from 'zod/v4';
import { generate, type GenConfig } from '../ai/structured';
import type { VisionVerdict } from './verify';

export const VisionSchema = z.object({
  person_visible: z.boolean().describe('Có thấy người trong ảnh không'),
  posture: z.enum(['standing', 'sitting', 'walking', 'lying_on_floor', 'lying_in_bed', 'unknown']).describe('Tư thế của người rõ nhất trong ảnh'),
  fallen_likely: z.number().min(0).max(1).describe('Khả năng người này vừa bị ngã, từ 0 đến 1'),
  notes: z.string().describe('Một câu tiếng Việt ngắn mô tả điều thấy được, không nhận diện danh tính'),
});

const SYSTEM = [
  'Bạn hỗ trợ hệ thống an toàn tại nhà kiểm tra một tín hiệu nghi người cao tuổi bị ngã.',
  'Chỉ đánh giá tư thế và tình trạng có thể nhìn thấy: người đứng, ngồi, đi lại, nằm trên giường hay nằm dưới sàn, có dấu hiệu vừa ngã không.',
  'Không nhận diện danh tính, không đoán tuổi, giới tính hay đặc điểm cá nhân.',
  'Nếu ảnh tối, mờ, bị che hoặc không thấy người, đặt person_visible=false hoặc posture=unknown và fallen_likely thấp vừa phải, đừng đoán.',
  'Viết notes bằng tiếng Việt có dấu, một câu ngắn, không dùng ký hiệu đặc biệt.',
].join(' ');

export async function judgeFallImage(cfg: GenConfig, image: { base64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' }, roomName: string): Promise<VisionVerdict> {
  const { data } = await generate(cfg, {
    name: 'fall_check',
    system: SYSTEM,
    user: `Ảnh chụp từ camera ${roomName} ngay sau khi cảm biến nghi có người ngã. Hãy đánh giá.`,
    schema: VisionSchema,
    images: [image],
    maxTokens: 600,
    timeoutMs: 25_000,
  });
  return data as VisionVerdict;
}
