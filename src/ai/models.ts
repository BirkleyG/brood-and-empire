import Anthropic from '@anthropic-ai/sdk';
import type { AISettings, ProviderId } from './types';
import { providerInfo } from './providers/index';

export interface ModelOption {
  id: string;
  label: string;
}

// Claude models offered without a network call. The live list (if reachable) is merged in.
const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best writing)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable, priciest)' },
];

export const staticModels = (p: ProviderId): ModelOption[] => (p === 'anthropic' ? CLAUDE_MODELS : []);

const cache = new Map<string, ModelOption[]>();
const cacheKey = (p: ProviderId, key: string, base: string) => `${p}|${base}|${key}`;

export function cachedModels(s: AISettings): ModelOption[] | undefined {
  const { key, base } = target(s);
  return cache.get(cacheKey(s.provider, key, base));
}

function target(s: AISettings) {
  const info = providerInfo(s.provider);
  return {
    key: s.keys[s.provider]?.trim() ?? '',
    base: (s.provider === 'custom' ? s.customBaseUrl?.trim() : info.baseUrl) ?? '',
  };
}

/** Ask the provider which models this key can use. Throws if the provider can't be reached. */
export async function fetchModels(s: AISettings): Promise<ModelOption[]> {
  const info = providerInfo(s.provider);
  const { key, base } = target(s);
  let list: ModelOption[];
  if (s.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    list = [];
    for await (const m of client.models.list()) list.push({ id: m.id, label: m.display_name || m.id });
  } else {
    const res = await fetch(base.replace(/\/+$/, '') + '/models', {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) throw new Error(`${info.short} answered ${res.status}`);
    const body = await res.json();
    const rows: any[] = Array.isArray(body) ? body : body.data ?? body.models ?? [];
    list = rows
      .map((r) => String(r.id ?? r.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id, label: id }));
  }
  // Keep the curated Claude labels, then add anything else the key can see.
  const merged = [...staticModels(s.provider)];
  for (const m of list) if (!merged.some((x) => x.id === m.id)) merged.push(m);
  cache.set(cacheKey(s.provider, key, base), merged);
  return merged;
}
