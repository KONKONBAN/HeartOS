import { app, BrowserWindow, ipcMain, Menu, net, protocol, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HubCore } from '../../src/core/hublink/hubcore';
import { DEFAULT_HUB_PORT, type CommandKind } from '../../src/core/hublink/protocol';
import { fileJsonStore } from './filestore';
import { loadOrCreateHubKeys, type KeyProtection } from './keystore';
import { lanAddresses, startHubServer, type RunningServer } from './server';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const WEB_DIR = path.join(__dirname, 'web');
const OPERATOR = os.userInfo().username || 'Quản trị';

let hub: HubCore;
let server: RunningServer | null = null;
let serverError = '';
let protection: KeyProtection = 'file';
let win: BrowserWindow | null = null;
let store: ReturnType<typeof fileJsonStore>;

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function serveApp() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file)) return net.fetch(pathToFileURL(path.join(WEB_DIR, 'index.html')).toString());
    return net.fetch(pathToFileURL(file).toString());
  });
}

async function startHub() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  const loaded = await loadOrCreateHubKeys(path.join(dataDir, 'hub-keys.json'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (t) => safeStorage.encryptString(t),
    decrypt: (b) => safeStorage.decryptString(b),
  });
  protection = loaded.protection;
  store = fileJsonStore(path.join(dataDir, 'hub-store.json'));
  hub = await new HubCore(store, loaded.keys, os.hostname()).init();
  const port = Number(store.get<number>('hub.port') ?? DEFAULT_HUB_PORT);
  try {
    server = await startHubServer(hub, port);
    serverError = '';
  } catch (e) {
    serverError = `Không mở được cổng ${port}: ${(e as Error).message}`;
  }
  hub.subscribe(() => win?.webContents.send('hub:changed'));
}

function info() {
  return {
    version: app.getVersion(),
    port: server?.port ?? null,
    serverError,
    addresses: lanAddresses(),
    keyProtection: protection,
    dataDir: app.getPath('userData'),
    operator: OPERATOR,
    hostname: os.hostname(),
  };
}

function registerIpc() {
  ipcMain.handle('hub:info', () => info());
  ipcMain.handle('hub:view', () => hub.view());
  ipcMain.handle('hub:journal', (_e, id: string) => hub.journal(id));
  ipcMain.handle('hub:audit', () => hub.audit.all());
  ipcMain.handle('hub:verify-audit', () => hub.audit.verify());
  ipcMain.handle('hub:open-pairing', (_e, memberId?: string) => hub.openPairing(OPERATOR, typeof memberId === 'string' ? memberId : undefined));
  ipcMain.handle('hub:reset-household', () => hub.resetHousehold(OPERATOR));
  ipcMain.handle('hub:close-pairing', () => hub.closePairing());
  ipcMain.handle('hub:command', (_e, deviceId: string, kind: CommandKind, params: Record<string, string | number | boolean>) => hub.queueCommand(deviceId, kind, params ?? {}, OPERATOR));
  ipcMain.handle('hub:unpair', (_e, id: string) => hub.unpair(id, OPERATOR));
  ipcMain.handle('hub:remove', (_e, id: string) => hub.removeDevice(id));
  ipcMain.handle('hub:set-port', async (_e, port: number) => {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: 'Cổng phải từ 1024 đến 65535' };
    await server?.close();
    try {
      server = await startHubServer(hub, port);
      serverError = '';
      store.set('hub.port', port);
      return { ok: true };
    } catch (e) {
      serverError = (e as Error).message;
      return { ok: false, error: serverError };
    }
  });
  ipcMain.handle('hub:open-data-dir', () => shell.openPath(app.getPath('userData')));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'HeartOS Sentinel Admin',
    backgroundColor: '#FAF6EF',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  void win.loadURL('app://heartos/index.html#/admin');
  win.on('closed', () => (win = null));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  serveApp();
  await startHub();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => store?.flush());
app.on('window-all-closed', () => {
  store?.flush();
  if (process.platform !== 'darwin') app.quit();
});
