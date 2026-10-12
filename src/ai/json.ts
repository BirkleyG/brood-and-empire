import { AIError, type SampleOptions, type SampleResult } from './types';

export const JSON_INSTRUCTION =
  '\n\nReply with only the JSON value itself: no prose before or after it, and no code fences.';

/** Pull a JSON value out of model text, tolerating code fences or a stray sentence around it. */
export function parseModelJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the outermost {...} or [...] span.
    const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0);
    if (starts.length) {
      const start = Math.min(...starts);
      const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
      if (end > start) {
        try {
          return JSON.parse(t.slice(start, end + 1));
        } catch {
          /* fall through */
        }
      }
    }
    throw new AIError('bad_response', 'The model did not return valid JSON.', text);
  }
}

/** Build `sampler.json` on top of a plain text sampler. */
export function jsonVia(
  sample: (input: string, opts?: SampleOptions) => Promise<SampleResult>,
) {
  return async (input: string, opts?: SampleOptions) => {
    const r = await sample(input + JSON_INSTRUCTION, opts);
    return parseModelJson(r.text);
  };
}
