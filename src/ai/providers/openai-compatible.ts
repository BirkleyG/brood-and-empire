import { jsonVia } from '../json';
import { AIError, type SampleOptions, type Sampler } from '../types';

// Many providers (OpenRouter, Groq, Gemini, Moonshot/Kimi, Ollama, LM Studio...) accept the
// same chat-completions request, so one small streaming client covers all of them.

export interface CompatConfig {
  label: string;
  baseUrl: string;
  apiKey?: string;
  models: { quick?: string; default?: string };
}

export function compatSampler(cfg: CompatConfig): Sampler {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const sample = async (input: string, opts: SampleOptions = {}) => {
    const model = (opts.modelTier === 'quick' ? cfg.models.quick : cfg.models.default) || cfg.models.default || cfg.models.quick;
    if (!model) throw new AIError('provider_error', `Choose a model for ${cfg.label} in AI settings.`);
    let text = '';
    let finish: string | null = null;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: input }] }),
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw new AIError('cancelled', 'Cancelled.', text);
      throw new AIError('network', `Could not reach ${cfg.label}. Check the address and your connection.`);
    }
    if (!res.ok || !res.body) throw await httpError(res, cfg.label);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          if (chunk.error) throw new AIError('provider_error', `${cfg.label}: ${chunk.error.message || 'error'}`, text);
          const choice = chunk.choices?.[0];
          const delta: string = choice?.delta?.content ?? '';
          if (choice?.finish_reason) finish = choice.finish_reason;
          if (delta) {
            text += delta;
            opts.onText?.({ text, delta });
          }
        }
      }
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (opts.signal?.aborted) throw new AIError('cancelled', 'Cancelled.', text);
      throw new AIError('network', `The connection to ${cfg.label} dropped.`, text);
    }
    return { text, truncated: finish === 'length' };
  };

  const fn = sample as Sampler;
  fn.json = jsonVia(sample);
  fn.label = cfg.label;
  return fn;
}

async function httpError(res: Response, label: string): Promise<AIError> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || '';
  } catch {
    /* no body */
  }
  if (res.status === 401 || res.status === 403) {
    return new AIError('auth_failed', `${label} rejected the API key.${detail ? ' ' + detail : ''}`);
  }
  if (res.status === 429) return new AIError('rate_limited', `${label} rate limit reached. Try again in a moment.`);
  return new AIError('provider_error', `${label} error ${res.status}${detail ? ': ' + detail : ''}`);
}
