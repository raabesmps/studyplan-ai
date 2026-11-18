import type { Env, ProviderName } from './env';
import { rateLimitConfigured } from './env';
import type { FailureReason } from './errors';
import { logger } from './logger';
import { estimateCost } from './pricing';
import { pipeline, type RedisCommand } from './upstash';

/**
 * What the app records about its own use, for the owner's part of the status page: counts per day and
 * tokens (for an estimate of the spend). Nothing here identifies a visitor: no IP address, hashed or
 * not, is ever written to the usage log. Everything expires after RETENTION_DAYS.
 */

export const RETENTION_DAYS = 35;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 3600;
const HEALTH_SECONDS = 7 * 24 * 3600;

export type Outcome = 'plan' | 'sample' | 'rate_limited' | 'error' | 'cancelled';

export interface UsageEvent {
  outcome: Outcome;
  /** The provider that delivered the plan (outcome "plan"). */
  provider?: ProviderName;
  /** How many times a provider gave up before the outcome. */
  failovers?: number;
  tokens?: Partial<Record<ProviderName, { input: number; output: number }>>;
  failures?: { provider: ProviderName; reason: FailureReason }[];
}

export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
const statsKey = (day: string) => `studyplan:stats:${day}`;
const healthKey = (kind: 'fail' | 'ok', provider: ProviderName) => `studyplan:${kind}:${provider}`;
/** The app-wide daily counter kept by the rate limiter. */
export const dailyCounterKey = (day: string) => `studyplan:day:${day}`;

/**
 * Records one finished request. Best effort: statistics are never worth failing a visitor's request,
 * so errors are reported to the operator and swallowed. Does nothing without Upstash.
 */
export async function recordUsage(env: Env, event: UsageEvent, now: Date = new Date()): Promise<void> {
  if (!rateLimitConfigured(env)) return;
  try {
    const day = dayKey(now);
    const stats = statsKey(day);
    const commands: RedisCommand[] = [['HINCRBY', stats, 'requests', 1]];

    const count = (field: string, by = 1) => commands.push(['HINCRBY', stats, field, by]);
    if (event.outcome === 'plan') {
      count('plans');
      if (event.provider) count(`plans_${event.provider}`);
    } else if (event.outcome === 'sample') count('samples');
    else if (event.outcome === 'rate_limited') count('rate_limited');
    else if (event.outcome === 'error') count('errors');
    else count('cancelled');

    if (event.failovers) count('failovers', event.failovers);
    for (const [provider, tokens] of Object.entries(event.tokens ?? {})) {
      if (tokens.input) count(`${provider}_in`, tokens.input);
      if (tokens.output) count(`${provider}_out`, tokens.output);
    }
    commands.push(['EXPIRE', stats, RETENTION_SECONDS]);

    const at = now.toISOString();
    for (const failure of event.failures ?? []) {
      commands.push([
        'SET',
        healthKey('fail', failure.provider),
        JSON.stringify({ at, reason: failure.reason }),
        'EX',
        HEALTH_SECONDS,
      ]);
    }
    if (event.outcome === 'plan' && event.provider) {
      commands.push(['SET', healthKey('ok', event.provider), at, 'EX', HEALTH_SECONDS]);
    }

    await pipeline(env, commands);
  } catch (error) {
    logger.alert('Could not record usage', error);
  }
}

// --- reading -------------------------------------------------------------------------------

export interface DayStats {
  date: string;
  requests: number;
  plans: number;
  plansClaude: number;
  plansGemini: number;
  samples: number;
  rateLimited: number;
  errors: number;
  cancelled: number;
  failovers: number;
  tokens: Record<ProviderName, { input: number; output: number }>;
  costUsd: number;
}

export interface ProviderHealth {
  lastFailure: { at: string; reason: FailureReason } | null;
  lastSuccess: string | null;
}

/** Redis returns a hash as a flat [field, value, field, value, ...] list. */
function toRecord(flat: unknown): Record<string, number> {
  const record: Record<string, number> = {};
  if (!Array.isArray(flat)) return record;
  for (let i = 0; i + 1 < flat.length; i += 2) record[String(flat[i])] = Number(flat[i + 1]) || 0;
  return record;
}

function toDayStats(env: Env, date: string, flat: unknown): DayStats {
  const f = toRecord(flat);
  const tokens = {
    claude: { input: f.claude_in ?? 0, output: f.claude_out ?? 0 },
    gemini: { input: f.gemini_in ?? 0, output: f.gemini_out ?? 0 },
  };
  const costUsd =
    estimateCost('claude', env.ANTHROPIC_MODEL, tokens.claude.input, tokens.claude.output).usd +
    estimateCost('gemini', env.GEMINI_MODEL, tokens.gemini.input, tokens.gemini.output).usd;
  return {
    date,
    requests: f.requests ?? 0,
    plans: f.plans ?? 0,
    plansClaude: f.plans_claude ?? 0,
    plansGemini: f.plans_gemini ?? 0,
    samples: f.samples ?? 0,
    rateLimited: f.rate_limited ?? 0,
    errors: f.errors ?? 0,
    cancelled: f.cancelled ?? 0,
    failovers: f.failovers ?? 0,
    tokens,
    costUsd,
  };
}

/** The UTC days from `now` backwards, newest first. */
export function lastDays(count: number, now: Date): string[] {
  return Array.from({ length: count }, (_, i) => dayKey(new Date(now.getTime() - i * 24 * 3600 * 1000)));
}

/** Per-day statistics for the last `days` UTC days, newest first, plus the app-wide counter for today. */
export async function readDays(env: Env, days: number, now: Date = new Date()): Promise<{ days: DayStats[]; usedToday: number }> {
  const dates = lastDays(Math.min(Math.max(days, 1), RETENTION_DAYS), now);
  const results = await pipeline(env, [
    ...dates.map((date): RedisCommand => ['HGETALL', statsKey(date)]),
    ['GET', dailyCounterKey(dates[0])],
  ]);
  return {
    days: dates.map((date, i) => toDayStats(env, date, results[i])),
    usedToday: Number(results[dates.length]) || 0,
  };
}

const REASONS: readonly string[] = ['billing', 'auth', 'rate_limit', 'overloaded', 'timeout', 'invalid_response', 'unknown'];

function parseFailure(raw: unknown): ProviderHealth['lastFailure'] {
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw) as { at?: unknown; reason?: unknown };
    if (typeof value.at === 'string' && typeof value.reason === 'string' && REASONS.includes(value.reason)) {
      return { at: value.at, reason: value.reason as FailureReason };
    }
  } catch {
    // A value we did not write: ignore it.
  }
  return null;
}

/** When each provider last failed (and why) and last delivered a plan. */
export async function readHealth(env: Env): Promise<Record<ProviderName, ProviderHealth>> {
  const [claudeFail, claudeOk, geminiFail, geminiOk] = await pipeline(env, [
    ['GET', healthKey('fail', 'claude')],
    ['GET', healthKey('ok', 'claude')],
    ['GET', healthKey('fail', 'gemini')],
    ['GET', healthKey('ok', 'gemini')],
  ]);
  const ok = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    claude: { lastFailure: parseFailure(claudeFail), lastSuccess: ok(claudeOk) },
    gemini: { lastFailure: parseFailure(geminiFail), lastSuccess: ok(geminiOk) },
  };
}
