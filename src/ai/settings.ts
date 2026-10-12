import type { AISettings } from './types';

// Settings (including API keys) live only in this browser's localStorage.
const KEY = 'brood-and-empire.ai.v1';

const DEFAULTS: AISettings = { provider: 'off', keys: {}, models: {} };

export function loadSettings(): AISettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { ...DEFAULTS, ...s, keys: { ...s.keys }, models: { ...s.models } };
  } catch {
    return null;
  }
}

export function saveSettings(s: AISettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const defaultSettings = (): AISettings => ({ ...DEFAULTS, keys: {}, models: {} });
