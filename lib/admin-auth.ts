import { createHash, timingSafeEqual } from 'node:crypto';
import type { Env } from './env';
import { rateLimitConfigured } from './env';
import { AppError } from './errors';
import { visitorKey } from './rate-limit';
import { pipeline } from './upstash';

/** Wrong guesses allowed per address per hour, then the address is locked out for the rest of the hour. */
export const MAX_ADMIN_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 3600;

const NOT_FOUND = () => new AppError('INVALID_REQUEST', 'Não encontrado.', 404);
const DENIED = () => new AppError('INVALID_REQUEST', 'Acesso negado.', 401);

/** Compares two secrets in constant time (hashing first makes the lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : '';
}

/**
 * Lets the request through only if it carries the owner's token (`Authorization: Bearer ...`).
 * - Without STATUS_TOKEN configured the owner's endpoints do not exist (404).
 * - Wrong guesses are counted per address; after MAX_ADMIN_ATTEMPTS the address is locked out (429).
 *   The count lives in Redis, and if Redis is down the request is refused rather than left unguarded.
 */
export async function authorizeOwner(request: Request, env: Env): Promise<void> {
  if (!env.STATUS_TOKEN) throw NOT_FOUND();
  if (!rateLimitConfigured(env)) throw new AppError('CONFIG_ERROR', 'O serviço não está configurado.', 500);

  const key = `studyplan:adminfail:${await visitorKey(request.headers)}`;
  const known = safeEqual(bearerToken(request), env.STATUS_TOKEN);

  try {
    if (known) {
      // Only a locked-out address is refused, and the right token does not unlock it early.
      const [count] = await pipeline(env, [['GET', key]]);
      if (Number(count) >= MAX_ADMIN_ATTEMPTS) throw new AppError('RATE_LIMITED', 'Muitas tentativas.', 429);
      return;
    }

    const [count, , ttl] = await pipeline(env, [
      ['INCR', key],
      ['EXPIRE', key, LOCKOUT_SECONDS, 'NX'],
      ['TTL', key],
    ]);
    if (Number(count) > MAX_ADMIN_ATTEMPTS) {
      throw new AppError('RATE_LIMITED', 'Muitas tentativas.', 429, { retryAfter: Math.max(1, Number(ttl)) });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('UPSTREAM_FAILED', 'Serviço indisponível.', 503, { cause: error });
  }
  throw DENIED();
}
