import fs from 'node:fs';
import path from 'node:path';
import type { JsonStore } from '../../src/core/storage';

export function fileJsonStore(file: string): JsonStore & { flush(): void } {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 300);
  };
  return {
    get: <T>(k: string) => (k in data ? (JSON.parse(JSON.stringify(data[k])) as T) : undefined),
    set: (k, v) => {
      data[k] = JSON.parse(JSON.stringify(v));
      schedule();
    },
    del: (k) => {
      delete data[k];
      schedule();
    },
    flush,
  };
}
