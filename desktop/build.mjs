import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = path.join(here, 'app');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(app, { recursive: true, force: true });
fs.mkdirSync(app, { recursive: true });

const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: false, legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: [path.join(here, 'src/main.ts')], outfile: path.join(app, 'main.cjs'), external: ['electron'] });
await build({ ...common, entryPoints: [path.join(here, 'src/preload.ts')], outfile: path.join(app, 'preload.cjs'), external: ['electron'] });
fs.mkdirSync(path.join(here, 'release'), { recursive: true });
await build({ ...common, entryPoints: [path.join(here, 'src/standalone.ts')], outfile: path.join(here, 'release', 'heartos-hub.cjs'), banner: { js: '#!/usr/bin/env node' } });

const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Chưa có dist/. Chạy "npm run build" trước.');
fs.cpSync(dist, path.join(app, 'web'), { recursive: true });
fs.rmSync(path.join(app, 'web', 'sw.js'), { force: true });
fs.copyFileSync(path.join(root, 'public', 'icon-512.png'), path.join(app, 'icon.png'));

fs.writeFileSync(
  path.join(app, 'package.json'),
  JSON.stringify({ name: 'heartos-sentinel-admin', productName: 'HeartOS Sentinel Admin', version: pkg.version, description: 'Phần mềm quản trị ARGOLET Sentinel cho HeartOS', main: 'main.cjs', homepage: 'https://github.com/KONKONBAN/HeartOS', repository: 'github:KONKONBAN/HeartOS', author: { name: 'HeartOS', email: 'admin@heartos.local' }, license: 'UNLICENSED' }, null, 2),
);

const buildDir = path.join(here, 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(path.join(root, 'public', 'icon-512.png'), path.join(buildDir, 'icon.png'));
const icoSources = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-64.png', 'icon-128.png', 'icon-256.png'].map((f) => path.join(buildDir, f)).filter((f) => fs.existsSync(f));
if (icoSources.length) {
  const imgs = icoSources.map((f) => fs.readFileSync(f));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(imgs.length, 4);
  let offset = 6 + 16 * imgs.length;
  const dir = imgs.map((png) => {
    const e = Buffer.alloc(16);
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    e.writeUInt8(w >= 256 ? 0 : w, 0);
    e.writeUInt8(h >= 256 ? 0 : h, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, ...dir, ...imgs]));
}
console.log('Đã chuẩn bị desktop/app và desktop/release/heartos-hub.cjs');
