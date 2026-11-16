import type { AiProvider } from '../core/ai/types';

interface Embedded {
  claude: string;
  openai: string;
  primary: AiProvider;
}

let cache: Embedded | null | undefined;

function decode(): Embedded | null {
  try {
    const a = typeof __HOS_A__ === 'string' ? __HOS_A__ : '';
    const b = typeof __HOS_B__ === 'string' ? __HOS_B__ : '';
    if (!a || !b) return null;
    const pad = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).reverse();
    const raw = Uint8Array.from(atob(a), (c) => c.charCodeAt(0));
    const out = raw.map((v, i) => v ^ pad[(i * 7 + 3) % pad.length]);
    const j = JSON.parse(new TextDecoder().decode(out)) as { c: string; o: string; p: string };
    if (!j.c && !j.o) return null;
    return { claude: j.c, openai: j.o, primary: j.p === 'openai' ? 'openai' : 'claude' };
  } catch {
    return null;
  }
}

export function embedded(): Embedded | null {
  if (cache === undefined) cache = decode();
  return cache;
}

export const hasEmbedded = () => !!embedded();
