import { z } from 'zod';
import { AppError } from './errors';

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3-flash-preview'),
  GEMINI_FALLBACK_MODEL: z.string().trim().min(1).default('gemini-3.5-flash'),
  // Overridable so tests can point the app at a local fake of the Gemini API.
  GEMINI_API_BASE_URL: z.string().trim().url().default('https://generativelanguage.googleapis.com/v1beta/models'),
  // Plan generation needs no deep reasoning; "minimal" roughly halves latency. "off" omits the setting.
  GEMINI_THINKING_LEVEL: z.enum(['off', 'minimal', 'low', 'medium', 'high']).default('minimal'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Reads and validates env vars on call (not on import), so builds work without a key. */
export function getEnv(): Env {
  const parsed = EnvSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || undefined,
    GEMINI_THINKING_LEVEL: process.env.GEMINI_THINKING_LEVEL || undefined,
    GEMINI_API_BASE_URL: process.env.GEMINI_API_BASE_URL || undefined,
  });

  if (!parsed.success) {
    throw new AppError('CONFIG_ERROR', 'O serviço não está configurado.', 500, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
