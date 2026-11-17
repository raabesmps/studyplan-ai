import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Env } from '../env';
import { AppError } from '../errors';
import { logger } from '../logger';
import { Plan } from '../schema';
import type { AiProvider } from './types';

// A 30-day plan is ~15-20k tokens; streaming makes a large ceiling safe.
const MAX_TOKENS = 32_000;

// The schema sent to Claude comes straight from the Zod schema, so the two cannot drift apart.
// Constraints Claude's structured outputs do not support are dropped here and enforced by
// Plan.safeParse on our side. Only the schema is sent (not the helper's parser): the SDK would
// otherwise throw on an invalid answer, and we want it as text so one format retry can happen
// with the same provider before failing over.
const planFormat = { type: 'json_schema' as const, schema: zodOutputFormat(Plan).schema };

/** Seconds from a Retry-After header, if the SDK error carries one. */
function retryAfterSeconds(error: unknown): number | undefined {
  const headers = (error as { headers?: { get?: (name: string) => string | null | undefined } }).headers;
  const value = Number(headers?.get?.('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/**
 * Maps any Claude failure to a safe AppError. The SDK's own messages (for example "credit balance
 * is too low") are only logged in development and never reach the visitor. A cancel by the caller
 * passes through untouched.
 */
function toAppError(error: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) {
    logger.info('Claude request cancelled by the caller');
    return error;
  }
  if (error instanceof AppError) return error;

  if (error instanceof Anthropic.APIError) {
    logger.warn(`Claude request failed (${error.status ?? 'no status'}):`, error.message);
  } else {
    logger.warn('Claude request failed:', error);
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(
      'RATE_LIMITED',
      'Muitas requisições ao serviço de IA. Aguarde um pouco e tente de novo.',
      429,
      { cause: error, retryAfter: retryAfterSeconds(error) }
    );
  }
  return new AppError('UPSTREAM_FAILED', 'O serviço de IA não respondeu. Tente novamente.', 502, { cause: error });
}

export function createClaudeProvider(env: Env): AiProvider {
  return {
    name: 'claude',
    async stream({ prompt, signal, timeoutMs, onText }) {
      logger.info(`Calling Claude model ${env.ANTHROPIC_MODEL}`);

      // Retries are ours to decide (failover), so the SDK's built-in ones are off: one logical call, one request.
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL, maxRetries: 0 });
      const timeout = AbortSignal.timeout(timeoutMs);

      const stream = client.messages.stream(
        {
          model: env.ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: env.ANTHROPIC_EFFORT, format: planFormat },
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: signal ? AbortSignal.any([timeout, signal]) : timeout }
      );

      let text = '';
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text;
            onText(text);
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          logger.warn('Claude declined the request:', final.stop_details);
          throw new AppError('INVALID_RESPONSE', 'A IA não pôde gerar este plano. Tente outro assunto.', 502);
        }
      } catch (error) {
        throw toAppError(error, signal);
      }

      if (!text) {
        throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
      }
      return text;
    },
  };
}
