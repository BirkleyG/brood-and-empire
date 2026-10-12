// The game talks to every AI provider through one interface, shaped like the claude.ai
// artifact `sample` capability so the game code doesn't care which provider is behind it.

export type ModelTier = 'quick' | 'default' | 'complex';

export interface SampleOptions {
  modelTier?: ModelTier;
  /** Accepted for compatibility with the artifact runtime; API-key providers never cache. */
  cache?: boolean;
  signal?: AbortSignal;
  /** Called as text streams in. `text` is the whole answer so far. */
  onText?: (p: { text: string; delta: string }) => void;
}

export interface SampleResult {
  text: string;
  truncated: boolean;
}

export interface Sampler {
  (input: string, opts?: SampleOptions): Promise<SampleResult>;
  json(input: string, opts?: SampleOptions): Promise<unknown>;
  /** Short name the UI shows, e.g. "Claude". */
  label: string;
}

/**
 * Error codes the game already understands from the artifact runtime:
 * `not_granted` turns AI off for the session, `rate_limited` backs off, `cancelled`
 * carries partial text. The rest are shown in the AI settings panel.
 */
export type AIErrorCode =
  | 'not_granted'
  | 'rate_limited'
  | 'cancelled'
  | 'auth_failed'
  | 'refused'
  | 'bad_response'
  | 'network'
  | 'provider_error';

export class AIError extends Error {
  code: AIErrorCode;
  text?: string;
  constructor(code: AIErrorCode, message: string, text?: string) {
    super(message);
    this.code = code;
    this.text = text;
  }
}

export type ProviderId =
  | 'claude-artifact'
  | 'anthropic'
  | 'openrouter'
  | 'groq'
  | 'gemini'
  | 'moonshot'
  | 'ollama'
  | 'custom'
  | 'off';

export interface AISettings {
  provider: ProviderId;
  /** API keys per provider, so switching back and forth doesn't lose them. */
  keys: Partial<Record<ProviderId, string>>;
  /** Model per provider and tier. `quick` is used for short JSON jobs, `default` for writing. */
  models: Partial<Record<ProviderId, { quick?: string; default?: string }>>;
  /** Base URL for the custom OpenAI-compatible provider. */
  customBaseUrl?: string;
}
