import type { ProviderName } from './env';

/** US dollars per million tokens. */
interface Price {
  input: number;
  output: number;
}

// Claude list prices (per million tokens), checked against Anthropic's pricing page in November 2026.
const CLAUDE_PRICES: Record<string, Price> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};
const FALLBACK_CLAUDE_PRICE = CLAUDE_PRICES['claude-haiku-5-5'];

export interface Cost {
  usd: number;
  /** False when the model is not in the table: the number then uses the Haiku price and is a guess. */
  known: boolean;
}

/**
 * Estimated spend for a number of tokens. Gemini is counted as free: the app uses its free tier, whose
 * only limit is the daily quota. If a paid Gemini plan is ever used this must be revisited.
 */
export function estimateCost(provider: ProviderName, model: string, inputTokens: number, outputTokens: number): Cost {
  if (provider === 'gemini') return { usd: 0, known: true };
  const price = CLAUDE_PRICES[model];
  const used = price ?? FALLBACK_CLAUDE_PRICE;
  return {
    usd: (inputTokens * used.input + outputTokens * used.output) / 1_000_000,
    known: Boolean(price),
  };
}
