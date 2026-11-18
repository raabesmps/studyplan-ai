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

  // Rate limiting (Upstash Redis over REST). Both must be set to turn it on.
  UPSTASH_REDIS_REST_URL: z.string().trim().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optionalSecret,
  // Plans one visitor (IP) may generate per window.
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(3600),
  // Plans the whole app may generate per UTC day; past it, visitors get a sample plan instead.
  DAILY_LIMIT: z.coerce.number().int().min(1).default(200),
  // Production refuses to run without rate limiting unless this is explicitly "true".
  RATE_LIMIT_DISABLED: z.enum(['true', 'false']).default('false'),
  // "true" serves sample plans and never calls an AI provider (no API key needed).
  DEMO_MODE: z.enum(['true', 'false']).default('false'),

  // Unlocks the owner's part of the status page (usage per day, per IP, estimated spend). Unset = that
  // part does not exist. Long on purpose: it is the only thing between the internet and visitors' IPs.
  STATUS_TOKEN: z.string().trim().min(16, 'STATUS_TOKEN must have at least 16 characters').optional(),
  // How long a service check is reused, so the status page cannot be used to hammer the providers.
  STATUS_CACHE_SECONDS: z.coerce.number().int().min(0).max(600).default(30),
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
    UPSTASH_REDIS_REST_URL: read('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: read('UPSTASH_REDIS_REST_TOKEN'),
    RATE_LIMIT_MAX: read('RATE_LIMIT_MAX'),
    RATE_LIMIT_WINDOW_SECONDS: read('RATE_LIMIT_WINDOW_SECONDS'),
    DAILY_LIMIT: read('DAILY_LIMIT'),
    RATE_LIMIT_DISABLED: read('RATE_LIMIT_DISABLED'),
    DEMO_MODE: read('DEMO_MODE'),
    STATUS_TOKEN: read('STATUS_TOKEN'),
    STATUS_CACHE_SECONDS: read('STATUS_CACHE_SECONDS'),
  });

  const fail = (cause: unknown): never => {
    throw new AppError('CONFIG_ERROR', 'O serviço não está configurado.', 500, { cause });
  };
  if (!parsed.success) return fail(parsed.error);
  const env = parsed.data;
  if (env.DEMO_MODE !== 'true' && providerOrder(env).length === 0) return fail(new Error('No AI provider has an API key'));
  // Forgetting these on a deploy would leave the app open to anyone's spending, so production fails loudly.
  if (process.env.NODE_ENV === 'production' && env.DEMO_MODE !== 'true' && !rateLimitConfigured(env) && env.RATE_LIMIT_DISABLED !== 'true') {
    return fail(new Error('Rate limiting is not configured (set the UPSTASH_* variables or RATE_LIMIT_DISABLED=true)'));
  }
  return env;
}

/** Whether the Upstash credentials needed for rate limiting are present. */
export function rateLimitConfigured(env: Pick<Env, 'UPSTASH_REDIS_REST_URL' | 'UPSTASH_REDIS_REST_TOKEN'>): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
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
