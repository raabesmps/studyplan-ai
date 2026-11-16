import { z } from 'zod';
import { AppError } from './errors';

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3-flash-preview'),
  GEMINI_FALLBACK_MODEL: z.string().trim().min(1).default('gemini-3.5-flash'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Reads and validates env vars on call (not on import), so builds work without a key. */
export function getEnv(): Env {
  const parsed = EnvSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || undefined,
  });

  if (!parsed.success) {
    throw new AppError('CONFIG_ERROR', 'O serviço não está configurado.', 500, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
