import type { Env } from './env';

export type RedisCommand = (string | number)[];

const REQUEST_TIMEOUT_MS = 2500;

/**
 * Runs commands as one Upstash REST pipeline (a single HTTP round trip) and returns each result.
 * Throws on any transport, auth or command error, so callers decide whether to fail closed or open.
 */
export async function pipeline(env: Env, commands: RedisCommand[]): Promise<unknown[]> {
  const response = await fetch(`${env.UPSTASH_REDIS_REST_URL!.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Upstash answered HTTP ${response.status}`);

  const results: unknown = await response.json();
  if (!Array.isArray(results) || results.length !== commands.length) throw new Error('Unexpected Upstash response');
  return results.map((entry: { result?: unknown; error?: string }) => {
    if (entry.error) throw new Error(`Upstash command failed: ${entry.error}`);
    return entry.result;
  });
}
