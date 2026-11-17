import { NextRequest, NextResponse } from 'next/server';
import { generateStudyPlan } from '@/lib/ai/generate';
import { getEnv } from '@/lib/env';
import { AppError, toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { PlanRequest } from '@/lib/schema';
import { NDJSON_CONTENT_TYPE, encodeEvent, type StreamEvent } from '@/lib/stream';

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

export async function POST(request: NextRequest) {
  let input: PlanRequest;
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new AppError('INVALID_REQUEST', 'Requisição inválida.', 400);
    }

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
    getEnv();
  } catch (error) {
    return jsonError(error);
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

  return new Response(stream, {
    headers: {
      'Content-Type': `${NDJSON_CONTENT_TYPE}; charset=utf-8`,
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
