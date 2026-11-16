import type { GenConfig } from '../core/ai/structured';
import { aiReady, draftConfig, ensureGatewayToken, isManaged, refreshGateway } from './aiConfig';
import { getApp } from './store';

export async function genConfig(): Promise<GenConfig | null> {
  const ai = getApp().prefs.ai;
  if (!ai.enabled) return null;
  if (isManaged(ai)) {
    try {
      await refreshGateway();
      await ensureGatewayToken();
    } catch {
      return null;
    }
  }
  const fresh = getApp().prefs.ai;
  return aiReady(fresh) ? draftConfig(fresh) : null;
}
