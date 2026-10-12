import Anthropic from '@anthropic-ai/sdk';
import { jsonVia } from '../json';
import { AIError, type ModelTier, type SampleOptions, type Sampler } from '../types';

export const ANTHROPIC_DEFAULT_MODELS = {
  quick: 'claude-haiku-5-5',
  default: 'claude-opus-5-5',
};

// Models that accept server-side refusal fallbacks ("default" routing).
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

const EFFORT: Record<ModelTier, 'low' | 'medium' | 'high'> = {
  quick: 'low',
  default: 'medium',
  complex: 'high',
};

export function anthropicSampler(apiKey: string, models: { quick?: string; default?: string }): Sampler {
  // The player's own key is used straight from their browser and never sent anywhere else.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const sample = async (input: string, opts: SampleOptions = {}) => {
    const tier = opts.modelTier ?? 'default';
    const model =
      tier === 'quick'
        ? models.quick || ANTHROPIC_DEFAULT_MODELS.quick
        : models.default || ANTHROPIC_DEFAULT_MODELS.default;
    const useFallbacks = FALLBACK_MODELS.has(model);
    let text = '';
    try {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: tier === 'quick' ? 16000 : 32000,
          output_config: { effort: EFFORT[tier] },
          messages: [{ role: 'user', content: input }],
          ...(useFallbacks
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal: opts.signal },
      );
      stream.on('text', (delta) => {
        text += delta;
        opts.onText?.({ text, delta });
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        throw new AIError('refused', msg.stop_details?.explanation || 'The model declined this request.', text);
      }
      return { text, truncated: msg.stop_reason === 'max_tokens' };
    } catch (err) {
      throw toAIError(err, text);
    }
  };

  const fn = sample as Sampler;
  fn.json = jsonVia(sample);
  fn.label = 'Claude';
  return fn;
}

function toAIError(err: unknown, text: string): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AIError('cancelled', 'Cancelled.', text);
  if (err instanceof Anthropic.AuthenticationError) {
    return new AIError('auth_failed', 'Anthropic rejected the API key. Check it in AI settings.', text);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AIError('auth_failed', 'This API key is not allowed to use that model.', text);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIError('rate_limited', 'Anthropic rate limit reached. Try again in a moment.', text);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AIError('network', 'Could not reach Anthropic. Check your connection.', text);
  }
  if (err instanceof Anthropic.APIError) {
    return new AIError('provider_error', `Anthropic error ${err.status ?? ''}: ${err.message}`, text);
  }
  return new AIError('provider_error', err instanceof Error ? err.message : String(err), text);
}
