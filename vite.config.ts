import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

function embeddedKeys() {
  const claude = (process.env.HEARTOS_EMBED_CLAUDE_KEY ?? '').trim();
  const openai = (process.env.HEARTOS_EMBED_OPENAI_KEY ?? '').trim();
  if (!claude && !openai) return { blob: '', pad: '' };
  const primary = process.env.HEARTOS_EMBED_PRIMARY === 'openai' ? 'openai' : 'claude';
  const data = Buffer.from(JSON.stringify({ c: claude, o: openai, p: primary }), 'utf8');
  const pad = randomBytes(48);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ pad[(i * 7 + 3) % pad.length];
  return { blob: out.toString('base64'), pad: Buffer.from(pad).reverse().toString('base64') };
}

const EMBED = embeddedKeys();

const WORKER_POLYFILLS = `(function(){function d(o,n,v){if(!(n in o))Object.defineProperty(o,n,{value:v,configurable:true,writable:true})}function at(i){var l=this.length,k=Math.trunc(i)||0;k=k<0?l+k:k;return k<0||k>=l?undefined:this[k]}d(Array.prototype,'at',at);d(String.prototype,'at',at);d(Object,'hasOwn',function(o,k){return Object.prototype.hasOwnProperty.call(o,k)});d(String.prototype,'replaceAll',function(s,r){return s instanceof RegExp?this.replace(s,r):this.split(s).join(r)});['Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array'].forEach(function(n){if(self[n])d(self[n].prototype,'at',at)})})();`;

function maplibreWorker(): Plugin {
  let code: string | null = null;
  let isBuild = false;
  const source = () => {
    if (code) return code;
    const file = createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
    code = WORKER_POLYFILLS + transformSync(readFileSync(file, 'utf8'), { target: 'chrome80', format: 'iife', minify: true, legalComments: 'inline' }).code;
    return code;
  };
  return {
    name: 'heartos-maplibre-worker',
    configResolved(c) {
      isBuild = c.command === 'build';
    },
    resolveId(id) {
      return id === 'virtual:maplibre-worker' ? '\0maplibre-worker' : undefined;
    },
    load(id) {
      if (id !== '\0maplibre-worker') return undefined;
      if (isBuild) {
        const ref = this.emitFile({ type: 'asset', name: 'maplibre-gl-worker.js', source: source() });
        return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
      }
      return `export default new URL('/@maplibre-worker.js', location.href).href;`;
    },
    configureServer(server) {
      server.middlewares.use('/@maplibre-worker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(source());
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), maplibreWorker()],
  define: { __HOS_A__: JSON.stringify(EMBED.blob), __HOS_B__: JSON.stringify(EMBED.pad) },
  server: { host: true, port: 5173 },
  build: { target: ['es2020', 'chrome80', 'safari14', 'firefox80'], cssTarget: ['chrome80', 'safari14', 'firefox80'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
} as any);
