import type { Env } from '../env';
import { AppError, type FailureReason } from '../errors';
import { geminiPlanSchema } from '../gemini-schema';
import { logger } from '../logger';
import type { AiProvider, StreamRequest } from './types';

const PRIMARY_MODEL_TIMEOUT_MS = 30_000;
// The fallback model is slower (~35s for a full plan), so it gets a longer budget.
const FALLBACK_MODEL_TIMEOUT_MS = 45_000;

interface GenerateContentChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; message?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/** An upstream failure that is worth retrying on the fallback model (429 or 5xx). */
class RetryableUpstreamError extends AppError {}

/** Yields the JSON chunk of every `data:` line in a Server-Sent Events body. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<GenerateContentChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (line: string): GenerateContentChunk | null => {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    if (!data) return null;
    try {
      return JSON.parse(data) as GenerateContentChunk;
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const chunk = parse(line);
        if (chunk) yield chunk;
      }
    }
    const tail = parse(buffer + decoder.decode());
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Maps an upstream HTTP-like status to a public error; 429 and 5xx are worth a fallback attempt. */
function upstreamStatusError(status: number): AppError {
  if (status === 429) {
    return new RetryableUpstreamError(
      'RATE_LIMITED',
      'Muitas requisições ao serviço de IA. Aguarde um pouco e tente de novo.',
      429,
      { reason: 'rate_limit' }
    );
  }
  const message = 'O serviço de IA falhou. Tente novamente.';
  if (status >= 500) return new RetryableUpstreamError('UPSTREAM_FAILED', message, 502, { reason: 'overloaded' });
  const reason: FailureReason = status === 401 || status === 403 ? 'auth' : 'unknown';
  return new AppError('UPSTREAM_FAILED', message, 502, { reason });
}

/** Aborts caused by the caller pass through untouched; anything else is an upstream failure. */
function toUpstreamError(error: unknown, model: string, signal?: AbortSignal): unknown {
  if (signal?.aborted) {
    logger.info(`Request to ${model} cancelled by the caller`);
    return error;
  }
  logger.warn(`Request to ${model} failed:`, error);
  return new AppError('UPSTREAM_FAILED', 'O serviço de IA não respondeu a tempo. Tente novamente.', 502, {
    cause: error,
    reason: 'timeout',
  });
}

async function streamModel(
  env: Env,
  model: string,
  { prompt, signal, onText, onUsage }: Pick<StreamRequest, 'prompt' | 'signal' | 'onText' | 'onUsage'>,
  timeoutMs: number
): Promise<string> {
  logger.info(`Calling Gemini model ${model}`);
  const timeout = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `${env.GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY ?? '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: geminiPlanSchema,
            ...(env.GEMINI_THINKING_LEVEL !== 'off' && {
              thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL },
            }),
          },
        }),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      }
    );
  } catch (error) {
    throw toUpstreamError(error, model, signal);
  }

  if (!response.ok) {
    const data: GenerateContentChunk = await response.json().catch(() => ({}));
    logger.warn(`Gemini model ${model} returned ${response.status}:`, data.error?.message);
    throw upstreamStatusError(response.status);
  }

  if (!response.body) {
    throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
  }

  let text = '';
  // The last chunk that carries usageMetadata holds the totals for the whole call.
  let usage: GenerateContentChunk['usageMetadata'];
  try {
    for await (const chunk of readSse(response.body)) {
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (chunk.error) {
        // The model can fail mid-stream (e.g. 503 under load); never accept the truncated text.
        logger.warn(`Gemini model ${model} failed mid-stream:`, chunk.error.message);
        throw upstreamStatusError(chunk.error.code ?? 500);
      }
      const piece = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (piece) {
        text += piece;
        onText(text);
      }
    }
  } catch (error) {
    // Our own mapped errors (mid-stream failures) keep their type; transport errors are mapped.
    throw error instanceof AppError ? error : toUpstreamError(error, model, signal);
  }

  if (usage) {
    // Thinking tokens are billed as output.
    onUsage?.({
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    });
  }
  if (!text) {
    throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
  }
  return text;
}

export function createGeminiProvider(env: Env): AiProvider {
  return {
    name: 'gemini',
    /** Primary model, with a single fallback model only on 429 or 5xx, all inside one time budget. */
    async stream(request) {
      const deadline = Date.now() + request.timeoutMs;
      try {
        return await streamModel(env, env.GEMINI_MODEL, request, Math.min(PRIMARY_MODEL_TIMEOUT_MS, request.timeoutMs));
      } catch (error) {
        if (!(error instanceof RetryableUpstreamError) || env.GEMINI_FALLBACK_MODEL === env.GEMINI_MODEL) {
          throw error;
        }
        const remaining = deadline - Date.now();
        if (remaining < 2000) throw error;
        logger.warn(`Falling back to Gemini model ${env.GEMINI_FALLBACK_MODEL}`);
        return streamModel(env, env.GEMINI_FALLBACK_MODEL, request, Math.min(FALLBACK_MODEL_TIMEOUT_MS, remaining));
      }
    },
  };
}
