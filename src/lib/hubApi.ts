import { useEffect, useState } from 'react';
import type { HubCommandRecord, HubView, StoredJournalEntry } from '../core/hublink/hubcore';
import type { CommandKind } from '../core/hublink/protocol';
import type { JournalEntry } from '../core/sentinel/journal';

export interface HubInfo {
  version: string;
  port: number | null;
  serverError: string;
  addresses: string[];
  keyProtection: 'os' | 'file';
  dataDir: string;
  operator: string;
  hostname: string;
}

export interface HubApi {
  info(): Promise<HubInfo>;
  view(): Promise<HubView>;
  journal(id: string): Promise<StoredJournalEntry[]>;
  audit(): Promise<JournalEntry[]>;
  verifyAudit(): Promise<{ ok: boolean; checked: number; brokenAt?: number }>;
  openPairing(): Promise<{ code: string; expiresAt: number }>;
  closePairing(): Promise<void>;
  command(deviceId: string, kind: CommandKind, params: Record<string, string | number | boolean>): Promise<HubCommandRecord | null>;
  unpair(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  setPort(port: number): Promise<{ ok: boolean; error?: string }>;
  openDataDir(): Promise<void>;
  onChange(cb: () => void): () => void;
}

export function hubApi(): HubApi | null {
  return (window as unknown as { heartosHub?: HubApi }).heartosHub ?? null;
}

export const isDesktop = () => !!hubApi();

export function useHubView() {
  const api = hubApi();
  const [view, setView] = useState<HubView | null>(null);
  const [info, setInfo] = useState<HubInfo | null>(null);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = async () => {
      const [v, i] = await Promise.all([api.view(), api.info()]);
      if (alive) {
        setView(v);
        setInfo(i);
      }
    };
    void load();
    const off = api.onChange(() => void load());
    const t = setInterval(() => void load(), 2000);
    return () => {
      alive = false;
      off();
      clearInterval(t);
    };
  }, [api]);
  return { api, view, info };
}
