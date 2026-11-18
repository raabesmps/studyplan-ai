import { getEnv, providerOrder, type Env, type ProviderName } from '../env';
import { AppError, failureReason, type FailureReason } from '../errors';
import { logger } from '../logger';
import { buildPrompt } from '../prompt';
import { validatePlan, type Plan, type PlanRequest } from '../schema';
import { countDaysStarted } from '../stream';
import { createClaudeProvider } from './claude';
import { createGeminiProvider } from './gemini';
import type { AiProvider, TokenUsage } from './types';

/** The route may run for 60s (maxDuration), so everything, failover included, fits in less. */
const TOTAL_BUDGET_MS = 55_000;
/** Below this there is no point in starting another upstream call. */
const MIN_CALL_BUDGET_MS = 3_000;
const PROVIDER_LIMIT_MS: Record<ProviderName, number> = { claude: 40_000, gemini: 75_000 };

export interface GenerateOptions {
  /** Aborts the upstream call too (e.g. the visitor pressed Cancel). */
  signal?: AbortSignal;
  /** Called each time the model starts writing a new day. */
  onProgress?: (day: number, total: number) => void;
  /** Called when the first answer was invalid and a second attempt starts. */
  onRetry?: () => void;
  /** Called when the first provider failed and the other one takes over. */
  onSwitch?: (change: { from: ProviderName; to: ProviderName }) => void;
  /** Tokens used by each upstream call that finished (a format retry is a second call). */
  onUsage?: (provider: ProviderName, usage: TokenUsage) => void;
  /** A provider gave up (not a cancel by the caller), with the operator-facing reason. */
  onProviderFailure?: (provider: ProviderName, reason: FailureReason) => void;
  /** The provider that finally delivered the plan. */
  onSuccess?: (provider: ProviderName) => void;
}

function createProvider(name: ProviderName, env: Env): AiProvider {
  return name === 'claude' ? createClaudeProvider(env) : createGeminiProvider(env);
}

function parseAndValidate(text: string, expectedDays: number) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The response was not valid JSON.' } as const;
  }
  return validatePlan(raw, expectedDays);
}

/** One provider's attempt: a call, plus a single format retry with the validation error appended. */
async function runProvider(
  provider: AiProvider,
  prompt: string,
  input: PlanRequest,
  options: GenerateOptions,
  timeLeft: () => number
): Promise<Plan> {
  let lastDay = 0;
  const onText = (textSoFar: string) => {
    const day = Math.min(countDaysStarted(textSoFar), input.days);
    // Also fires when a retry starts the text over, so the UI never shows stale progress.
    if (day !== lastDay) {
      lastDay = day;
      if (day > 0) options.onProgress?.(day, input.days);
    }
  };

  const attempt = async (text: string) => {
    const budget = Math.min(PROVIDER_LIMIT_MS[provider.name], timeLeft());
    if (budget < MIN_CALL_BUDGET_MS) {
      throw new AppError('UPSTREAM_FAILED', 'O serviço de IA não respondeu a tempo. Tente novamente.', 502);
    }
    return parseAndValidate(
      await provider.stream({
        prompt: text,
        signal: options.signal,
        timeoutMs: budget,
        onText,
        onUsage: (usage) => options.onUsage?.(provider.name, usage),
      }),
      input.days
    );
  };

  let result = await attempt(prompt);
  if (!result.ok) {
    logger.warn(`Invalid plan from ${provider.name}, retrying once:`, result.error);
    options.onRetry?.();
    lastDay = 0;
    result = await attempt(
      `${prompt}\n\nYour previous answer was rejected for these reasons:\n${result.error}\nReturn a corrected JSON object.`
    );
  }

  if (!result.ok) {
    logger.error(`Invalid plan from ${provider.name} after retry:`, result.error);
    throw new AppError(
      'INVALID_RESPONSE',
      'A IA devolveu um plano em formato inválido. Tente gerar de novo.',
      502
    );
  }

  // Do not trust the model to echo the learner's inputs.
  return { ...result.plan, subject: input.subject, level: input.level };
}

/**
 * Generates a plan with the configured provider and, if that one fails (quota, outage, billing,
 * timeout, unusable answer), with the other one. A cancel by the caller is never treated as a failure.
 * When every provider fails, the error of the last one is thrown.
 */
export async function generateStudyPlan(input: PlanRequest, options: GenerateOptions = {}): Promise<Plan> {
  const env = getEnv();
  const prompt = buildPrompt(input);
  const order = providerOrder(env);

  const startedAt = Date.now();
  const timeLeft = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  let lastError: unknown;
  for (const [index, name] of order.entries()) {
    if (index > 0) {
      logger.warn(`Switching AI provider from ${order[index - 1]} to ${name}`);
      options.onSwitch?.({ from: order[index - 1], to: name });
    }
    try {
      const plan = await runProvider(createProvider(name, env), prompt, input, options, timeLeft);
      logger.info(`Plan generated by ${name}`);
      options.onSuccess?.(name);
      return plan;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      options.onProviderFailure?.(name, failureReason(error));
      lastError = error;
    }
  }
  throw lastError;
}
