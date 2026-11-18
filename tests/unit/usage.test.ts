import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';
import { estimateCost } from '@/lib/pricing';
import { RETENTION_DAYS, lastDays, readDays, readHealth, recordUsage } from '@/lib/usage';
import { fakeUpstash } from '../fake-upstash';

let redis: ReturnType<typeof fakeUpstash>;
const DAY = '2026-03-10'; // the fake clock starts at 2026-03-10T12:00Z

/** Records with the fake clock as "now", so the day keys are the ones the assertions use. */
const record = (event: Parameters<typeof recordUsage>[1]) => recordUsage(getEnv(), event, redis.now);

beforeEach(() => {
  for (const name of ['AI_PROVIDER', 'ANTHROPIC_MODEL', 'RATE_LIMIT_DISABLED', 'DEMO_MODE', 'DAILY_LIMIT']) vi.stubEnv(name, '');
  vi.stubEnv('ANTHROPIC_API_KEY', 'k');
  vi.stubEnv('GEMINI_API_KEY', 'g');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-token-token');
  redis = fakeUpstash();
  vi.stubGlobal('fetch', vi.fn(redis.handler));
});

describe('estimateCost', () => {
  it('prices Claude models per million tokens', () => {
    expect(estimateCost('claude', 'claude-haiku-5-5', 1_000_000, 1_000_000)).toEqual({ usd: 0.6, known: true });
    expect(estimateCost('claude', 'claude-sonnet-5-5', 1_000_000, 0)).toEqual({ usd: 2, known: true });
    expect(estimateCost('claude', 'claude-opus-5-5', 0, 1_000_000)).toEqual({ usd: 20, known: true });
  });

  it('counts a typical plan at a fraction of a cent', () => {
    const { usd } = estimateCost('claude', 'claude-haiku-5-5', 600, 4000);
    expect(usd).toBeGreaterThan(0.0001);
    expect(usd).toBeLessThan(0.005);
  });

  it('flags an unknown model and falls back to the cheapest price', () => {
    expect(estimateCost('claude', 'claude-future-9', 1_000_000, 0)).toEqual({ usd: 0.1, known: false });
  });

  it('treats the Gemini free tier as free', () => {
    expect(estimateCost('gemini', 'gemini-3-flash-preview', 5_000_000, 5_000_000)).toEqual({ usd: 0, known: true });
  });
});

describe('recordUsage', () => {
  it('counts a delivered plan per day, per provider, with its tokens', async () => {
    await record({
      outcome: 'plan',
      provider: 'claude',
      tokens: { claude: { input: 600, output: 4000 } },
    });

    expect(redis.hash(`studyplan:stats:${DAY}`)).toEqual({
      requests: 1,
      plans: 1,
      plans_claude: 1,
      claude_in: 600,
      claude_out: 4000,
    });
    expect(redis.string('studyplan:ok:claude')).toBe(redis.now.toISOString());
  });

  it.each([
    ['sample', 'samples'],
    ['rate_limited', 'rate_limited'],
    ['error', 'errors'],
    ['cancelled', 'cancelled'],
  ] as const)('counts a "%s" request under %s and not as a plan', async (outcome, field) => {
    await record({ outcome });
    expect(redis.hash(`studyplan:stats:${DAY}`)).toEqual({ requests: 1, [field]: 1 });
  });

  it('accumulates across requests', async () => {
    await record({ outcome: 'plan', provider: 'gemini', tokens: { gemini: { input: 10, output: 20 } } });
    await record({ outcome: 'plan', provider: 'gemini', tokens: { gemini: { input: 10, output: 20 } } });
    await record({ outcome: 'rate_limited' });

    expect(redis.hash(`studyplan:stats:${DAY}`)).toMatchObject({ requests: 3, plans: 2, plans_gemini: 2, gemini_in: 20, gemini_out: 40, rate_limited: 1 });
  });

  it('notes failovers, the last failure of each provider and its reason', async () => {
    await record({
      outcome: 'plan',
      provider: 'gemini',
      failovers: 1,
      failures: [{ provider: 'claude', reason: 'billing' }],
    });
    expect(redis.hash(`studyplan:stats:${DAY}`)).toMatchObject({ failovers: 1, plans_gemini: 1 });
    expect(JSON.parse(redis.string('studyplan:fail:claude')!)).toEqual({ at: redis.now.toISOString(), reason: 'billing' });
    expect(redis.string('studyplan:fail:gemini')).toBeNull();
  });

  it('expires everything after the retention period', async () => {
    await record({ outcome: 'plan', provider: 'claude' });
    const expiries = redis.requests[0].commands.filter((c) => c[0] === 'EXPIRE');
    expect(expiries.length).toBeGreaterThanOrEqual(1);
    for (const command of expiries) expect(command[2]).toBe(RETENTION_DAYS * 24 * 3600);

    redis.advance(RETENTION_DAYS * 24 * 3600 + 1);
    expect(redis.hash(`studyplan:stats:${DAY}`)).toEqual({}); // the counters are gone
  });

  it('writes nothing that identifies a visitor: only counters and provider health', async () => {
    await record({ outcome: 'plan', provider: 'claude', tokens: { claude: { input: 1, output: 1 } } });
    await record({ outcome: 'rate_limited' });
    const keys = [...redis.entries.keys()].sort();
    expect(keys).toEqual([`studyplan:ok:claude`, `studyplan:stats:${DAY}`]);
    expect(JSON.stringify(redis.requests)).not.toMatch(/ips|ipplans|x-forwarded|\d+\.\d+\.\d+\.\d+/);
  });

  it('does nothing without Upstash', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    await record({ outcome: 'plan' });
    expect(redis.requests).toHaveLength(0);
  });

  it('never throws: a failing store is reported and swallowed', async () => {
    const alert = vi.spyOn(console, 'error').mockImplementation(() => {});
    redis.state.failWith = new Response('boom', { status: 500 });
    await expect(record({ outcome: 'plan' })).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Could not record usage'), expect.any(String));
    alert.mockRestore();
  });
});

describe('reading usage', () => {
  it('lists UTC days newest first', () => {
    expect(lastDays(3, redis.now)).toEqual(['2026-03-10', '2026-03-09', '2026-03-08']);
  });

  it('returns per-day statistics with the estimated cost, and the daily counter', async () => {
    const env = getEnv();
    await record({ outcome: 'plan', provider: 'claude', tokens: { claude: { input: 1_000_000, output: 1_000_000 } } });
    redis.advance(24 * 3600);
    await record({ outcome: 'sample' });
    await fetch('https://redis.example.test/pipeline', { method: 'POST', body: JSON.stringify([['INCR', 'studyplan:day:2026-03-11'], ['INCR', 'studyplan:day:2026-03-11']]) });

    const { days, usedToday } = await readDays(env, 3, redis.now);
    expect(days.map((d) => d.date)).toEqual(['2026-03-11', '2026-03-10', '2026-03-09']);
    expect(days[0]).toMatchObject({ requests: 1, samples: 1, plans: 0, costUsd: 0 });
    expect(days[1]).toMatchObject({ requests: 1, plans: 1, plansClaude: 1, costUsd: 0.6 });
    expect(days[1].tokens.claude).toEqual({ input: 1_000_000, output: 1_000_000 });
    expect(days[2]).toMatchObject({ requests: 0, plans: 0, costUsd: 0 });
    expect(usedToday).toBe(2);
  });

  it('caps how many days can be asked for', async () => {
    const { days } = await readDays(getEnv(), 999, redis.now);
    expect(days).toHaveLength(RETENTION_DAYS);
    expect((await readDays(getEnv(), 0, redis.now)).days).toHaveLength(1);
  });

  it('reads when each provider last failed and last worked, ignoring values it did not write', async () => {
    const env = getEnv();
    await record({ outcome: 'plan', provider: 'gemini', failures: [{ provider: 'claude', reason: 'overloaded' }] });
    await fetch('https://redis.example.test/pipeline', { method: 'POST', body: JSON.stringify([['SET', 'studyplan:fail:gemini', '{"at":"x","reason":"<script>"}']]) });

    const health = await readHealth(env);
    expect(health.claude.lastFailure).toEqual({ at: redis.now.toISOString(), reason: 'overloaded' });
    expect(health.claude.lastSuccess).toBeNull();
    expect(health.gemini.lastSuccess).toBe(redis.now.toISOString());
    expect(health.gemini.lastFailure).toBeNull(); // an unknown reason is not trusted
  });
});
