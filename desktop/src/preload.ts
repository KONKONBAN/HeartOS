import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('heartosHub', {
  info: () => ipcRenderer.invoke('hub:info'),
  view: () => ipcRenderer.invoke('hub:view'),
  journal: (id: string) => ipcRenderer.invoke('hub:journal', id),
  audit: () => ipcRenderer.invoke('hub:audit'),
  verifyAudit: () => ipcRenderer.invoke('hub:verify-audit'),
  openPairing: (memberId?: string) => ipcRenderer.invoke('hub:open-pairing', memberId),
  resetHousehold: () => ipcRenderer.invoke('hub:reset-household'),
  closePairing: () => ipcRenderer.invoke('hub:close-pairing'),
  command: (deviceId: string, kind: string, params: Record<string, unknown>) => ipcRenderer.invoke('hub:command', deviceId, kind, params),
  unpair: (id: string) => ipcRenderer.invoke('hub:unpair', id),
  remove: (id: string) => ipcRenderer.invoke('hub:remove', id),
  setPort: (port: number) => ipcRenderer.invoke('hub:set-port', port),
  openDataDir: () => ipcRenderer.invoke('hub:open-data-dir'),
  onChange: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on('hub:changed', h);
    return () => ipcRenderer.removeListener('hub:changed', h);
  },
});
