import { z } from 'zod';
import { AppError } from './errors';

export const PROVIDERS = ['claude', 'gemini'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

const optionalSecret = z.string().trim().min(1).optional();

const EnvSchema = z.object({
  // Which provider answers first. The other one (if it has a key) takes over when this one fails.
  AI_PROVIDER: z.enum(PROVIDERS).default('claude'),

  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  // Plan writing needs no deep reasoning; "low" keeps latency and cost down.
  ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  // Overridable so tests can point the app at a local fake of the Claude API.
  ANTHROPIC_BASE_URL: z.string().trim().url().optional(),

  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3-flash-preview'),
  GEMINI_FALLBACK_MODEL: z.string().trim().min(1).default('gemini-3.5-flash'),
  // Overridable so tests can point the app at a local fake of the Gemini API.
  GEMINI_API_BASE_URL: z.string().trim().url().default('https://generativelanguage.googleapis.com/v1beta/models'),
  // Gemini plan generation needs no deep reasoning; "minimal" roughly halves latency. "off" omits the setting.
  GEMINI_THINKING_LEVEL: z.enum(['off', 'minimal', 'low', 'medium', 'high']).default('minimal'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Treats an empty variable the same as an unset one. */
const read = (name: string): string | undefined => process.env[name] || undefined;

/** Reads and validates env vars on call (not on import), so builds work without any key. */
export function getEnv(): Env {
  const parsed = EnvSchema.safeParse({
    AI_PROVIDER: read('AI_PROVIDER'),
    ANTHROPIC_API_KEY: read('ANTHROPIC_API_KEY'),
    ANTHROPIC_MODEL: read('ANTHROPIC_MODEL'),
    ANTHROPIC_EFFORT: read('ANTHROPIC_EFFORT'),
    ANTHROPIC_BASE_URL: read('ANTHROPIC_BASE_URL'),
    GEMINI_API_KEY: read('GEMINI_API_KEY'),
    GEMINI_MODEL: read('GEMINI_MODEL'),
    GEMINI_FALLBACK_MODEL: read('GEMINI_FALLBACK_MODEL'),
    GEMINI_API_BASE_URL: read('GEMINI_API_BASE_URL'),
    GEMINI_THINKING_LEVEL: read('GEMINI_THINKING_LEVEL'),
  });

  if (!parsed.success || providerOrder(parsed.data).length === 0) {
    throw new AppError('CONFIG_ERROR', 'O serviço não está configurado.', 500, {
      cause: parsed.success ? new Error('No AI provider has an API key') : parsed.error,
    });
  }
  return parsed.data;
}

function hasKey(env: Env, provider: ProviderName): boolean {
  return provider === 'claude' ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.GEMINI_API_KEY);
}

/**
 * The providers to try, in order: the configured one first, then the other as a failover.
 * A provider without an API key is left out.
 */
export function providerOrder(env: Pick<Env, 'AI_PROVIDER' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY'>): ProviderName[] {
  const first = env.AI_PROVIDER;
  const second: ProviderName = first === 'claude' ? 'gemini' : 'claude';
  return [first, second].filter((provider) => hasKey(env as Env, provider));
}
