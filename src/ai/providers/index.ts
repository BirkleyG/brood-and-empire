import type { ProviderId } from '../types';
import { ANTHROPIC_DEFAULT_MODELS } from './anthropic';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Short name for the header badge and the Oracle label. */
  short: string;
  /** One line shown under the picker. */
  blurb: string;
  needsKey: boolean;
  keyUrl?: string;
  baseUrl?: string;
  defaultModels?: { quick?: string; default?: string };
  modelHint?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'claude-artifact',
    short: 'Claude',
    name: 'Claude on claude.ai',
    blurb: 'Uses your own Claude plan. Only available while the game runs as a claude.ai artifact.',
    needsKey: false,
  },
  {
    id: 'anthropic',
    short: 'Claude',
    name: 'Claude (Anthropic API key)',
    blurb: 'Quick jobs (the Oracle) use the quick model; chronicles, chapters and voices use the writing model.',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: ANTHROPIC_DEFAULT_MODELS,
  },
  {
    id: 'openrouter',
    short: 'OpenRouter',
    name: 'OpenRouter',
    blurb: 'One key for hundreds of models, including some free ones (model ids ending in ":free").',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelHint: 'Model id from openrouter.ai/models',
  },
  {
    id: 'groq',
    short: 'Groq',
    name: 'Groq',
    blurb: 'Very fast open models with a free tier that has daily limits.',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelHint: 'Model id from console.groq.com/docs/models',
  },
  {
    id: 'gemini',
    short: 'Gemini',
    name: 'Google Gemini',
    blurb: 'Free tier covers Flash models, with tight rate limits.',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelHint: 'Model id from ai.google.dev/gemini-api/docs/models',
  },
  {
    id: 'moonshot',
    short: 'Kimi',
    name: 'Kimi (Moonshot)',
    blurb: 'Moonshot AI\'s Kimi models.',
    needsKey: true,
    keyUrl: 'https://platform.moonshot.ai',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelHint: 'Model id from platform.moonshot.ai docs',
  },
  {
    id: 'ollama',
    short: 'Ollama',
    name: 'Ollama (on this computer)',
    blurb: 'Free and private. Start Ollama with OLLAMA_ORIGINS set to this page\'s address so the browser may call it.',
    needsKey: false,
    baseUrl: 'http://localhost:11434/v1',
    modelHint: 'A model you have pulled, e.g. from `ollama list`',
  },
  {
    id: 'custom',
    short: 'Custom',
    name: 'Other OpenAI-compatible server',
    blurb: 'Any server that speaks the /chat/completions API, such as LM Studio or vLLM.',
    needsKey: false,
    modelHint: 'Model id the server expects',
  },
  {
    id: 'off',
    short: 'off',
    name: 'No AI',
    blurb: 'The world still runs. The Oracle reads your words by keyword and the book uses the plain annals.',
    needsKey: false,
  },
];

export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
