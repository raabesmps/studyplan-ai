import { NextRequest, NextResponse } from 'next/server';
import { generateStudyPlan } from '@/lib/ai/generate';
import { pickDemoPlan } from '@/lib/demo';
import { getEnv, rateLimitConfigured, type Env } from '@/lib/env';
import { AppError, toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/request-body';
import { PlanRequest } from '@/lib/schema';
import { NDJSON_CONTENT_TYPE, encodeEvent, type DemoReason, type StreamEvent } from '@/lib/stream';

// Generation takes 5-30s; give the platform room (Vercel reads this).
export const maxDuration = 60;

/** Errors found before streaming starts (bad input, missing config) are plain JSON with a status. */
function jsonError(error: unknown): NextResponse {
  logger.error('Failed to start plan generation:', error);
  const { status, body } = toErrorBody(error);
  const headers: HeadersInit = {};
  if (body.error.retryAfter !== undefined) headers['Retry-After'] = String(body.error.retryAfter);
  return NextResponse.json(body, { status, headers });
}

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
  try {
    const payload = await readJsonBody(request);

    const parsed = PlanRequest.safeParse(payload);
    if (!parsed.success) {
      // Field errors carry our own pt-BR messages; a top-level type error (e.g. a string body) would
      // only have the library's raw English text, so it gets a generic message instead.
      const issue = parsed.error.issues[0];
      const message = issue && issue.path.length > 0 ? issue.message : 'Requisição inválida.';
      throw new AppError('INVALID_REQUEST', message, 400);
    }
    input = parsed.data;
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
        if (verdict.scope === 'daily') return demoResponse(input, 'daily-limit');
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

      try {
        const plan = await generateStudyPlan(input, {
          // request.signal aborts when the visitor cancels or disconnects, which also stops the AI call.
          signal: request.signal,
          onProgress: (day, total) => send({ type: 'progress', day, total }),
          onRetry: () => send({ type: 'retry' }),
          onSwitch: ({ from, to }) => send({ type: 'switch', from, to }),
        });
        send({ type: 'plan', plan });
      } catch (error) {
        if (request.signal.aborted) {
          logger.info('Generation cancelled by the client');
        } else {
          logger.error('Failed to generate plan:', error);
          send({ type: 'error', ...toErrorBody(error).body });
        }
      } finally {
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
