import { getEnv, type Env } from './env';
import { AppError } from './errors';
import { geminiPlanSchema } from './gemini-schema';
import { logger } from './logger';
import { buildPrompt } from './prompt';
import { validatePlan, type Plan, type PlanRequest } from './schema';
import { countDaysStarted } from './stream';

const PRIMARY_TIMEOUT_MS = 30_000;
// The fallback model is slower (~35s for a full plan), so it gets a longer budget.
const FALLBACK_TIMEOUT_MS = 45_000;

interface GenerateContentChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; message?: string };
}

export interface GenerateOptions {
  /** Aborts the upstream request too (e.g. the visitor pressed Cancel). */
  signal?: AbortSignal;
  /** Called each time the model starts writing a new day. */
  onProgress?: (day: number, total: number) => void;
  /** Called when the first answer was invalid and a second attempt starts. */
  onRetry?: () => void;
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
      429
    );
  }
  const message = 'O serviço de IA falhou. Tente novamente.';
  if (status >= 500) return new RetryableUpstreamError('UPSTREAM_FAILED', message, 502);
  return new AppError('UPSTREAM_FAILED', message, 502);
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
  });
}

async function streamModel(
  apiBase: string,
  model: string,
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  thinkingLevel: Env['GEMINI_THINKING_LEVEL'],
  signal: AbortSignal | undefined,
  onText: (textSoFar: string) => void
): Promise<string> {
  logger.info(`Calling model ${model}`);
  const timeout = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${apiBase}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: geminiPlanSchema,
          ...(thinkingLevel !== 'off' && { thinkingConfig: { thinkingLevel } }),
        },
      }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (error) {
    throw toUpstreamError(error, model, signal);
  }

  if (!response.ok) {
    const data: GenerateContentChunk = await response.json().catch(() => ({}));
    logger.warn(`Model ${model} returned ${response.status}:`, data.error?.message);
    throw upstreamStatusError(response.status);
  }

  if (!response.body) {
    throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
  }

  let text = '';
  try {
    for await (const chunk of readSse(response.body)) {
      if (chunk.error) {
        // The model can fail mid-stream (e.g. 503 under load); never accept the truncated text.
        logger.warn(`Model ${model} failed mid-stream:`, chunk.error.message);
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

  if (!text) {
    throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
  }
  return text;
}

/** One logical generation: primary model, with a single fallback only on 429 or 5xx. */
async function generateText(
  prompt: string,
  env: Env,
  signal: AbortSignal | undefined,
  onText: (textSoFar: string) => void
): Promise<string> {
  try {
    return await streamModel(
      env.GEMINI_API_BASE_URL,
      env.GEMINI_MODEL,
      env.GEMINI_API_KEY,
      prompt,
      PRIMARY_TIMEOUT_MS,
      env.GEMINI_THINKING_LEVEL,
      signal,
      onText
    );
  } catch (error) {
    if (!(error instanceof RetryableUpstreamError) || env.GEMINI_FALLBACK_MODEL === env.GEMINI_MODEL) {
      throw error;
    }
    logger.warn(`Falling back to ${env.GEMINI_FALLBACK_MODEL}`);
    return streamModel(
      env.GEMINI_API_BASE_URL,
      env.GEMINI_FALLBACK_MODEL,
      env.GEMINI_API_KEY,
      prompt,
      FALLBACK_TIMEOUT_MS,
      env.GEMINI_THINKING_LEVEL,
      signal,
      onText
    );
  }
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

export async function generateStudyPlan(input: PlanRequest, options: GenerateOptions = {}): Promise<Plan> {
  const env = getEnv();
  const prompt = buildPrompt(input);

  let lastDay = 0;
  const onText = (textSoFar: string) => {
    const day = Math.min(countDaysStarted(textSoFar), input.days);
    // Also fires when a fallback or retry starts the text over, so the UI never shows stale progress.
    if (day !== lastDay) {
      lastDay = day;
      if (day > 0) options.onProgress?.(day, input.days);
    }
  };

  let result = parseAndValidate(await generateText(prompt, env, options.signal, onText), input.days);
  if (!result.ok) {
    logger.warn('Invalid plan from model, retrying once:', result.error);
    options.onRetry?.();
    lastDay = 0;
    const retryPrompt = `${prompt}\n\nYour previous answer was rejected for these reasons:\n${result.error}\nReturn a corrected JSON object.`;
    result = parseAndValidate(await generateText(retryPrompt, env, options.signal, onText), input.days);
  }

  if (!result.ok) {
    logger.error('Invalid plan after retry:', result.error);
    throw new AppError(
      'INVALID_RESPONSE',
      'A IA devolveu um plano em formato inválido. Tente gerar de novo.',
      502
    );
  }

  // Do not trust the model to echo the learner's inputs.
  return { ...result.plan, subject: input.subject, level: input.level };
}
