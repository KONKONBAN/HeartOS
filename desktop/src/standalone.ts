import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { HubCore } from '../../src/core/hublink/hubcore';
import { COMMAND_LABEL, DEFAULT_HUB_PORT, type CommandKind } from '../../src/core/hublink/protocol';
import { fileJsonStore } from './filestore';
import { loadOrCreateHubKeys } from './keystore';
import { lanAddresses, startHubServer } from './server';

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dataDir = path.resolve(arg('--data') ?? path.join(os.homedir(), '.heartos-hub'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const { keys, protection } = await loadOrCreateHubKeys(path.join(dataDir, 'hub-keys.json'));
  const store = fileJsonStore(path.join(dataDir, 'hub-store.json'));
  const hub = await new HubCore(store, keys, os.hostname()).init();
  const srv = await startHubServer(hub, Number(arg('--port') ?? DEFAULT_HUB_PORT));
  const log = (s: string) => process.stdout.write(s + '\n');
  log(`HeartOS Sentinel Hub · cổng ${srv.port} · dữ liệu ${dataDir}`);
  log(`Địa chỉ LAN: ${lanAddresses().map((a) => `http://${a}:${srv.port}`).join(', ') || 'không có'}`);
  if (protection === 'file') log('Lưu ý: khóa hub được lưu trong tệp có quyền 600, không qua kho khóa hệ điều hành.');
  const pair = () => {
    const p = hub.openPairing('console');
    log(`Mã ghép nối: ${p.code} (hết hạn ${new Date(p.expiresAt).toLocaleTimeString('vi-VN')})`);
  };
  if (args.includes('--pair')) pair();
  hub.subscribe(() => undefined);
  if (process.stdin.isTTY) {
    log('Lệnh: pair | devices | cmd <deviceId> <kind> | quit');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      const [c, a, b] = line.trim().split(/\s+/);
      if (c === 'pair') pair();
      else if (c === 'devices') for (const d of hub.view().devices) log(`${d.id}  ${d.name}  ${d.sas}  ${d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString('vi-VN') : '-'}${d.revoked ? '  (đã gỡ)' : ''}`);
      else if (c === 'cmd' && a && b && b in COMMAND_LABEL) log(hub.queueCommand(a, b as CommandKind, {}, 'console') ? 'Đã xếp lệnh' : 'Không có thiết bị');
      else if (c === 'quit') {
        store.flush();
        process.exit(0);
      }
    });
  }
  const stop = () => {
    store.flush();
    void srv.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
