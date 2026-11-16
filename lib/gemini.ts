import { getEnv } from './env';
import { AppError } from './errors';
import { logger } from './logger';

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
  timeoutMs: number
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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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

export async function generateStudyPlan(
  subject: string,
  hoursPerDay: number,
  days: number = 7
): Promise<string> {
  const prompt = `Você é um especialista em educação e criação de planos de estudos personalizados.

Crie um plano de estudos detalhado de ${days} dias para aprender "${subject}".

Informações:
- Assunto: ${subject}
- Horas por dia: ${hoursPerDay}h
- Total de dias: ${days}

O plano deve ser estruturado da seguinte forma:

Dia 1: [Título do dia]
- Objetivo: [objetivo do dia]
- Conteúdo: [o que será estudado]
- Links sugeridos: [links úteis se houver]
- Exercícios práticos: [sugestões de exercícios]

Dia 2: [Título do dia]
...

Continue até o Dia ${days}.

IMPORTANTE:
- Seja específico e prático
- Progressão gradual do básico ao avançado
- Inclua links úteis quando relevante (documentação oficial, tutoriais, etc.)
- Sugira exercícios práticos para cada dia
- Use emojis para tornar mais visual (📚, 🎯, 🔗, 💻, etc.)
- Formate em markdown com títulos, listas e destaques

Gere APENAS o plano de estudos, sem explicações adicionais.`;

  const env = getEnv();

  try {
    return await callModel(env.GEMINI_MODEL, env.GEMINI_API_KEY, prompt, PRIMARY_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof RetryableUpstreamError) || env.GEMINI_FALLBACK_MODEL === env.GEMINI_MODEL) {
      throw error;
    }
    logger.warn(`Falling back to ${env.GEMINI_FALLBACK_MODEL}`);
    return callModel(env.GEMINI_FALLBACK_MODEL, env.GEMINI_API_KEY, prompt, FALLBACK_TIMEOUT_MS);
  }
}
