import Anthropic from '@anthropic-ai/sdk';
import type { Env } from './env';
import { rateLimitConfigured } from './env';
import type { FailureReason } from './errors';
import { pipeline } from './upstash';

export type ServiceId = 'claude' | 'gemini' | 'redis';
export type ServiceState = 'up' | 'degraded' | 'down' | 'not_configured';

export interface ServiceCheck {
  id: ServiceId;
  status: ServiceState;
  /** Round trip of the check, when it got an answer. */
  latencyMs: number | null;
  /** Why it is not "up". For the owner only: the public status leaves it out. */
  reason: FailureReason | 'unreachable' | null;
}

export interface ServiceReport {
  checkedAt: string;
  services: ServiceCheck[];
}

const CHECK_TIMEOUT_MS = 5000;

const notConfigured = (id: ServiceId): ServiceCheck => ({ id, status: 'not_configured', latencyMs: null, reason: null });

/** Turns an HTTP status from a provider's free "list models" call into a state. */
function fromHttpStatus(id: ServiceId, status: number, latencyMs: number): ServiceCheck {
  if (status >= 200 && status < 300) return { id, status: 'up', latencyMs, reason: null };
  if (status === 429) return { id, status: 'degraded', latencyMs, reason: 'rate_limit' };
  if (status === 401 || status === 403) return { id, status: 'down', latencyMs, reason: 'auth' };
  return { id, status: 'down', latencyMs, reason: status >= 500 ? 'overloaded' : 'unknown' };
}

const unreachable = (id: ServiceId, error: unknown): ServiceCheck => {
  const name = (error as { name?: string })?.name;
  const timedOut = name === 'TimeoutError' || name === 'AbortError' || error instanceof Anthropic.APIConnectionTimeoutError;
  return { id, status: 'down', latencyMs: null, reason: timedOut ? 'timeout' : 'unreachable' };
};

/**
 * Each check uses a call that is free and spends no tokens: listing models (Claude, Gemini) and PING
 * (Redis). It proves the service is reachable and the key is accepted. It cannot see an empty
 * account balance: that only shows when a plan is generated, and is tracked in usage.ts.
 */
async function checkClaude(env: Env): Promise<ServiceCheck> {
  if (!env.ANTHROPIC_API_KEY) return notConfigured('claude');
  const startedAt = Date.now();
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL, maxRetries: 0 });
    await client.models.list({ limit: 1 }, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return { id: 'claude', status: 'up', latencyMs: Date.now() - startedAt, reason: null };
  } catch (error) {
    if (error instanceof Anthropic.APIError && error.status) {
      return fromHttpStatus('claude', error.status, Date.now() - startedAt);
    }
    return unreachable('claude', error);
  }
}

async function checkGemini(env: Env): Promise<ServiceCheck> {
  if (!env.GEMINI_API_KEY) return notConfigured('gemini');
  const startedAt = Date.now();
  try {
    const response = await fetch(`${env.GEMINI_API_BASE_URL}?pageSize=1`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: 'no-store',
    });
    // The body is not needed; do not wait for it to close.
    void response.body?.cancel().catch(() => {});
    return fromHttpStatus('gemini', response.status, Date.now() - startedAt);
  } catch (error) {
    return unreachable('gemini', error);
  }
}

async function checkRedis(env: Env): Promise<ServiceCheck> {
  if (!rateLimitConfigured(env)) return notConfigured('redis');
  const startedAt = Date.now();
  try {
    const [pong] = await pipeline(env, [['PING']]);
    const ok = pong === 'PONG';
    return { id: 'redis', status: ok ? 'up' : 'down', latencyMs: Date.now() - startedAt, reason: ok ? null : 'unknown' };
  } catch (error) {
    // Upstash answers 401 to a bad token, which pipeline() reports as an HTTP error.
    const auth = /HTTP 40[13]/.test(String((error as Error)?.message));
    return auth ? { id: 'redis', status: 'down', latencyMs: null, reason: 'auth' } : unreachable('redis', error);
  }
}

let cache: { at: number; report: Promise<ServiceReport> } | null = null;

/** Forgets the cached report (tests). */
export function resetServiceCache(): void {
  cache = null;
}

/**
 * Checks every configured service in parallel. The result is reused for STATUS_CACHE_SECONDS, and
 * concurrent callers share the same in-flight check, so a flood of visitors on the status page costs
 * the providers one call a window, not one per visitor. `fresh` skips the cache (owner only).
 */
export function checkServices(env: Env, options: { fresh?: boolean; now?: number } = {}): Promise<ServiceReport> {
  const now = options.now ?? Date.now();
  if (!options.fresh && cache && now - cache.at < env.STATUS_CACHE_SECONDS * 1000) return cache.report;

  const report = Promise.all([checkClaude(env), checkGemini(env), checkRedis(env)]).then((services) => ({
    checkedAt: new Date(now).toISOString(),
    services,
  }));
  cache = { at: now, report };
  // A failed check is never cached for long: let the next caller try again.
  report.catch(() => {
    if (cache?.report === report) cache = null;
  });
  return report;
}
