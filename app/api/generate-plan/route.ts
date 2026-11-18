import type { NextRequest } from 'next/server';
import { jsonError as respondWithError } from '@/lib/api-response';
import { generateStudyPlan } from '@/lib/ai/generate';
import { clientIp } from '@/lib/client-ip';
import { pickDemoPlan } from '@/lib/demo';
import { getEnv, rateLimitConfigured, type Env } from '@/lib/env';
import { AppError, toErrorBody, type FailureReason } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertSameOriginJson } from '@/lib/request-guard';
import { readJsonBody } from '@/lib/request-body';
import { cleanText } from '@/lib/sanitize';
import { PlanRequest } from '@/lib/schema';
import { NDJSON_CONTENT_TYPE, encodeEvent, type DemoReason, type StreamEvent } from '@/lib/stream';
import { recordUsage, type UsageEvent } from '@/lib/usage';
import type { ProviderName } from '@/lib/env';

// Generation takes 5-30s; give the platform room (Vercel reads this).
export const maxDuration = 60;

/** Errors found before streaming starts (bad input, missing config) are plain JSON with a status. */
const jsonError = (error: unknown) => respondWithError(error, 'Failed to start plan generation:');

const STREAM_HEADERS = {
  'Content-Type': `${NDJSON_CONTENT_TYPE}; charset=utf-8`,
  'Cache-Control': 'no-cache, no-transform',
};

/** A ready-made sample plan, in the same stream format as a generated one. */
function demoResponse(input: PlanRequest, reason: DemoReason): Response {
  const events: StreamEvent[] = [
    { type: 'demo', reason },
    { type: 'plan', plan: pickDemoPlan(input.subject, input.days, input.language) },
  ];
  return new Response(events.map(encodeEvent).join(''), { headers: STREAM_HEADERS });
}

/** The limiter only runs when Upstash is configured (production refuses to start without it, see getEnv). */
const limiterActive = (env: Env) => rateLimitConfigured(env) && env.RATE_LIMIT_DISABLED !== 'true';

export async function POST(request: NextRequest) {
  let input: PlanRequest;
  let env: Env;
  const ip = clientIp(request.headers);
  try {
    assertSameOriginJson(request);
    const payload = await readJsonBody(request);

    const parsed = PlanRequest.safeParse(payload);
    if (!parsed.success) {
      // Field errors carry our own pt-BR messages; a top-level type error (e.g. a string body) would
      // only have the library's raw English text, so it gets a generic message instead.
      const issue = parsed.error.issues[0];
      const message = issue && issue.path.length > 0 ? issue.message : 'Requisição inválida.';
      throw new AppError('INVALID_REQUEST', message, 400);
    }
    // The subject goes into a prompt, into the plan and into export file names: clean it once, here.
    const subject = cleanText(parsed.data.subject);
    if (!subject) throw new AppError('INVALID_REQUEST', 'Informe o assunto.', 400);
    input = { ...parsed.data, subject };
    // Fail fast (HTTP 500) on missing configuration instead of inside an already-open 200 stream.
    env = getEnv();
  } catch (error) {
    return jsonError(error);
  }

  if (env.DEMO_MODE === 'true') return demoResponse(input, 'demo-mode');

  if (limiterActive(env)) {
    try {
      const verdict = await checkRateLimit(env, request.headers);
      if (!verdict.ok) {
        // The visitor's own quota is an error; the app-wide budget being spent just means a sample plan.
        if (verdict.scope === 'daily') {
          await recordUsage(env, { ip, outcome: 'sample' });
          return demoResponse(input, 'daily-limit');
        }
        await recordUsage(env, { ip, outcome: 'rate_limited' });
        throw new AppError('RATE_LIMITED', 'Muitas tentativas em pouco tempo.', 429, { retryAfter: verdict.retryAfter });
      }
    } catch (error) {
      if (!(error instanceof AppError && error.code === 'RATE_LIMITED')) {
        logger.alert('Rate limiter failed; refusing the request', error instanceof AppError ? error.cause : error);
      }
      return jsonError(error);
    }
  }

  logger.info(`Generating plan: ${input.hoursPerDay}h/day - ${input.days} days - ${input.level}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The client already left; nothing to deliver.
        }
      };

      // What this request used and how the providers behaved, written to the usage log at the end.
      const usage: UsageEvent = { ip, outcome: 'error', tokens: {}, failures: [], failovers: 0 };
      const addTokens = (provider: ProviderName, tokens: { inputTokens: number; outputTokens: number }) => {
        const soFar = usage.tokens![provider] ?? { input: 0, output: 0 };
        usage.tokens![provider] = { input: soFar.input + tokens.inputTokens, output: soFar.output + tokens.outputTokens };
      };

      try {
        const plan = await generateStudyPlan(input, {
          // request.signal aborts when the visitor cancels or disconnects, which also stops the AI call.
          signal: request.signal,
          onProgress: (day, total) => send({ type: 'progress', day, total }),
          onRetry: () => send({ type: 'retry' }),
          onSwitch: ({ from, to }) => send({ type: 'switch', from, to }),
          onUsage: addTokens,
          onProviderFailure: (provider: ProviderName, reason: FailureReason) => {
            usage.failures!.push({ provider, reason });
          },
          onSuccess: (provider) => (usage.provider = provider),
        });
        usage.outcome = 'plan';
        send({ type: 'plan', plan });
      } catch (error) {
        if (request.signal.aborted) {
          usage.outcome = 'cancelled';
          logger.info('Generation cancelled by the client');
        } else {
          logger.error('Failed to generate plan:', error);
          send({ type: 'error', ...toErrorBody(error).body });
        }
      } finally {
        // A failure is a failover when another provider took over; the last one has nobody after it.
        const failed = usage.failures!.length;
        usage.failovers = usage.outcome === 'plan' ? failed : Math.max(0, failed - 1);
        // Before closing: the platform may stop the function once the response has ended.
        await recordUsage(env, usage);
        try {
          controller.close();
        } catch {
          // Already closed by a client cancel.
        }
      }
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
