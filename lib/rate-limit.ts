import { AppError } from './errors';
import { clientIp } from './client-ip';
import type { Env } from './env';
import { pipeline } from './upstash';

/** What the limiter decided. `daily` means the app-wide cap is used up; `ip` means this visitor's quota is. */
export type RateLimitResult = { ok: true } | { ok: false; scope: 'ip' | 'daily'; retryAfter: number };

/**
 * Fixed-window counter: INCR the key and make sure it expires. The window starts at the first hit.
 * Returns how many hits the window holds (this one included) and how many seconds are left in it.
 */
async function hit(env: Env, key: string, windowSeconds: number): Promise<{ count: number; secondsLeft: number }> {
  // NX: only set the expiry when there is none, so later hits do not push the window forward.
  const [count, , ttl] = await pipeline(env, [
    ['INCR', key],
    ['EXPIRE', key, windowSeconds, 'NX'],
    ['TTL', key],
  ]);
  if (typeof count !== 'number' || typeof ttl !== 'number') throw new Error('Unexpected Upstash result type');

  if (ttl < 0) {
    // A key without expiry would block the visitor forever; repair it instead of trusting the NX flag.
    await pipeline(env, [['EXPIRE', key, windowSeconds]]);
    return { count, secondsLeft: windowSeconds };
  }
  return { count, secondsLeft: ttl };
}

/**
 * A keyed fingerprint of the visitor's address (the first hop of x-forwarded-for), so the store never
 * holds a raw IP. It is an HMAC with a server secret, not a plain hash: there are only about four
 * billion IPv4 addresses, so a plain SHA-256 could be reversed by trying them all, while without the
 * secret an HMAC cannot. Changing the secret simply starts every visitor's count again.
 */
export async function visitorKey(headers: Headers, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`studyplan:visitor:${clientIp(headers)}`));
  return Array.from(new Uint8Array(mac).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const secondsUntilNextUtcDay = (now: Date): number =>
  Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));

/**
 * Applies the per-visitor quota, then the app-wide daily cap. The visitor quota is checked first, so a
 * visitor who is already blocked does not use up the shared daily budget.
 *
 * Fails closed: if the store is unreachable the request is refused, because without the limiter
 * nothing stops runaway spending. Only call when rate limiting is configured.
 */
export async function checkRateLimit(env: Env, headers: Headers, now: Date = new Date()): Promise<RateLimitResult> {
  try {
    const visitor = await visitorKey(headers, env.UPSTASH_REDIS_REST_TOKEN!);
    const perVisitor = await hit(env, `studyplan:ip:${visitor}`, env.RATE_LIMIT_WINDOW_SECONDS);
    if (perVisitor.count > env.RATE_LIMIT_MAX) {
      return { ok: false, scope: 'ip', retryAfter: perVisitor.secondsLeft };
    }

    const day = now.toISOString().slice(0, 10);
    // Two days of expiry so the key outlives its UTC day even when clocks drift.
    const daily = await hit(env, `studyplan:day:${day}`, 2 * 24 * 3600);
    if (daily.count > env.DAILY_LIMIT) {
      return { ok: false, scope: 'daily', retryAfter: secondsUntilNextUtcDay(now) };
    }
    return { ok: true };
  } catch (error) {
    throw new AppError('UPSTREAM_FAILED', 'O serviço de IA não respondeu.', 503, { cause: error });
  }
}
