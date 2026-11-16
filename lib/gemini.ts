import { getEnv, type Env } from './env';
import { AppError } from './errors';
import { geminiPlanSchema } from './gemini-schema';
import { logger } from './logger';
import { buildPrompt } from './prompt';
import { validatePlan, type Plan, type PlanRequest } from './schema';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_TIMEOUT_MS = 30_000;
// The fallback model is slower (~35s for a full plan), so it gets a longer budget.
const FALLBACK_TIMEOUT_MS = 45_000;

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

/** An upstream failure that is worth retrying on the fallback model (429 or 5xx). */
class RetryableUpstreamError extends AppError {}

async function callModel(
  model: string,
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  thinkingLevel: Env['GEMINI_THINKING_LEVEL']
): Promise<string> {
  let response: Response;
  logger.info(`Calling model ${model}`);
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.warn(`Request to ${model} failed:`, error);
    throw new AppError(
      'UPSTREAM_FAILED',
      'O serviço de IA não respondeu a tempo. Tente novamente.',
      502,
      { cause: error }
    );
  }

  if (!response.ok) {
    const data: GenerateContentResponse = await response.json().catch(() => ({}));
    logger.warn(`Model ${model} returned ${response.status}:`, data.error?.message);

    if (response.status === 429) {
      throw new RetryableUpstreamError(
        'RATE_LIMITED',
        'Muitas requisições ao serviço de IA. Aguarde um pouco e tente de novo.',
        429
      );
    }
    const message = 'O serviço de IA falhou. Tente novamente.';
    if (response.status >= 500) {
      throw new RetryableUpstreamError('UPSTREAM_FAILED', message, 502);
    }
    throw new AppError('UPSTREAM_FAILED', message, 502);
  }

  const data: GenerateContentResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AppError('INVALID_RESPONSE', 'A IA devolveu uma resposta vazia. Tente gerar de novo.', 502);
  }
  return text;
}

/** One logical generation: primary model, with a single fallback only on 429 or 5xx. */
async function generateText(prompt: string, env: Env): Promise<string> {
  try {
    return await callModel(
      env.GEMINI_MODEL,
      env.GEMINI_API_KEY,
      prompt,
      PRIMARY_TIMEOUT_MS,
      env.GEMINI_THINKING_LEVEL
    );
  } catch (error) {
    if (!(error instanceof RetryableUpstreamError) || env.GEMINI_FALLBACK_MODEL === env.GEMINI_MODEL) {
      throw error;
    }
    logger.warn(`Falling back to ${env.GEMINI_FALLBACK_MODEL}`);
    return callModel(
      env.GEMINI_FALLBACK_MODEL,
      env.GEMINI_API_KEY,
      prompt,
      FALLBACK_TIMEOUT_MS,
      env.GEMINI_THINKING_LEVEL
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

export async function generateStudyPlan(input: PlanRequest): Promise<Plan> {
  const env = getEnv();
  const prompt = buildPrompt(input);

  let result = parseAndValidate(await generateText(prompt, env), input.days);
  if (!result.ok) {
    logger.warn('Invalid plan from model, retrying once:', result.error);
    const retryPrompt = `${prompt}\n\nYour previous answer was rejected for these reasons:\n${result.error}\nReturn a corrected JSON object.`;
    result = parseAndValidate(await generateText(retryPrompt, env), input.days);
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
