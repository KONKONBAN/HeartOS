export type VoiceClass = 'ok' | 'help' | 'unclear' | 'silent';

export interface VisionVerdict {
  person_visible: boolean;
  posture: 'standing' | 'sitting' | 'walking' | 'lying_on_floor' | 'lying_in_bed' | 'unknown';
  fallen_likely: number;
  notes: string;
}

export interface VerifyInput {
  voice: VoiceClass;
  text: string;
  latencyMs: number;
  moved: boolean | null;
  stillLying: boolean | null;
  vision: VisionVerdict | null;
}

export interface VerifyResult {
  verdict: 'safe' | 'unsure' | 'danger';
  reasons: string[];
  voiceTrust: 'high' | 'low';
}

export const tokens = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:"'()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const padded = (text: string) => ` ${tokens(text).join(' ')} `;

const PAIN_NEG = ['không dậy được', 'không đứng được', 'không đứng dậy được', 'không cử động được', 'không đi được', 'không thở được'];
const PAIN = ['đau', 'chóng mặt', 'khó thở', 'tức ngực', 'gãy', 'chảy máu', 'ngất', 'cứu', 'choáng', 'tê', 'run quá', 'ngã rồi', 'té rồi', 'bị ngã', 'bị té', 'giúp với', 'cấp cứu'];
const HEDGE = ['chắc', 'chắc là', 'hình như', 'ờ', 'ừm', 'à', 'hmm', 'không biết', 'cũng được', 'hơi', 'tạm'];

export function hasPain(text: string) {
  const p = padded(text);
  if (PAIN_NEG.some((w) => p.includes(` ${w} `))) return true;
  return PAIN.some((w) => {
    let i = p.indexOf(` ${w} `);
    while (i >= 0) {
      const before = p.slice(0, i).trimEnd();
      if (!/(^| )(không|chẳng|chả|đâu có|không có|không bị)$/.test(before)) return true;
      i = p.indexOf(` ${w} `, i + 1);
    }
    return false;
  });
}

export function hasHedge(text: string) {
  const p = padded(text);
  return HEDGE.some((w) => p.includes(` ${w} `));
}

export function voiceCues(text: string, latencyMs: number) {
  const pain = hasPain(text);
  const hedge = hasHedge(text);
  const slow = latencyMs > 12_000;
  const cues: string[] = [];
  if (pain) cues.push('trong câu trả lời có từ chỉ đau hoặc cần giúp');
  if (hedge) cues.push('câu trả lời ngập ngừng');
  if (slow) cues.push(`trả lời chậm (${Math.round(latencyMs / 1000)} giây)`);
  return { pain, hedge, slow, cues };
}

export function assess(i: VerifyInput): VerifyResult {
  const reasons: string[] = [];
  const cue = voiceCues(i.text, i.latencyMs);
  const voiceTrust: VerifyResult['voiceTrust'] = i.voice === 'ok' && !cue.pain && !cue.hedge && !cue.slow ? 'high' : 'low';
  if (i.voice === 'help' || cue.pain) {
    reasons.push(cue.pain ? 'Lời nói có dấu hiệu đau hoặc cần giúp' : 'Người nhà xin giúp');
    return { verdict: 'danger', reasons, voiceTrust };
  }
  if (i.vision && i.vision.person_visible && (i.vision.posture === 'lying_on_floor' || i.vision.fallen_likely >= 0.6)) {
    reasons.push(`Camera thấy người có thể đang nằm dưới sàn (độ tin ${Math.round(i.vision.fallen_likely * 100)}%)`);
    return { verdict: 'danger', reasons, voiceTrust };
  }
  if (i.voice === 'ok' && i.stillLying && i.moved === false) {
    reasons.push('Nói là ổn nhưng radar vẫn thấy nằm yên, chưa có cử động');
    return { verdict: 'danger', reasons, voiceTrust: 'low' };
  }
  const visionOk = !!i.vision && i.vision.person_visible && ['standing', 'sitting', 'walking', 'lying_in_bed'].includes(i.vision.posture) && i.vision.fallen_likely < 0.3;
  if (i.voice === 'ok') reasons.push(voiceTrust === 'high' ? 'Trả lời rõ ràng là ổn' : `Trả lời ổn nhưng ${cue.cues.join(', ') || 'chưa rõ ràng'}`);
  if (i.moved) reasons.push('Radar thấy cử động sau khi trả lời');
  if (visionOk) reasons.push(`Camera thấy người đang ${POSTURE_TEXT[i.vision!.posture]}`);
  if (i.voice === 'ok' && (i.moved || visionOk) && (voiceTrust === 'high' || (i.moved && visionOk))) return { verdict: 'safe', reasons, voiceTrust };
  if (i.moved === null && !i.vision && i.voice === 'ok' && voiceTrust === 'high') {
    reasons.push('Không có radar hoặc camera để đối chiếu');
    return { verdict: 'unsure', reasons, voiceTrust };
  }
  if (i.voice === 'silent') reasons.push('Không nghe thấy trả lời');
  if (i.moved === false) reasons.push('Chưa thấy cử động');
  return { verdict: 'unsure', reasons, voiceTrust };
}

export const POSTURE_TEXT: Record<VisionVerdict['posture'], string> = {
  standing: 'đứng',
  sitting: 'ngồi',
  walking: 'đi lại',
  lying_on_floor: 'nằm dưới sàn',
  lying_in_bed: 'nằm trên giường',
  unknown: 'không rõ tư thế',
};
