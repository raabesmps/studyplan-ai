import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';
import { checkServices, resetServiceCache } from '@/lib/service-status';
import { fakeUpstash } from '../fake-upstash';

const CLAUDE_URL = 'https://claude.example.test';
const GEMINI_URL = 'https://gemini.example.test/v1beta/models';
const REDIS_URL = 'https://redis.example.test';

type Answer = Response | Error | (() => Promise<Response>);
let claudeAnswer: Answer;
let geminiAnswer: Answer;
let redis: ReturnType<typeof fakeUpstash>;
const calls: string[] = [];

const modelList = () => new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }));
const claudeError = (status: number) =>
  new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'secret detail' } }), { status });

async function answer(a: Answer): Promise<Response> {
  if (a instanceof Error) throw a;
  return typeof a === 'function' ? a() : a.clone();
}

beforeEach(() => {
  resetServiceCache();
  calls.length = 0;
  for (const name of ['AI_PROVIDER', 'RATE_LIMIT_DISABLED', 'DEMO_MODE', 'STATUS_CACHE_SECONDS']) vi.stubEnv(name, '');
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret');
  vi.stubEnv('ANTHROPIC_BASE_URL', CLAUDE_URL);
  vi.stubEnv('GEMINI_API_KEY', 'gem-secret');
  vi.stubEnv('GEMINI_API_BASE_URL', GEMINI_URL);
  vi.stubEnv('UPSTASH_REDIS_REST_URL', REDIS_URL);
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-token-token');
  claudeAnswer = modelList();
  geminiAnswer = new Response('{"models":[]}');
  redis = fakeUpstash();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith(CLAUDE_URL)) return answer(claudeAnswer);
      if (url.startsWith(GEMINI_URL)) return answer(geminiAnswer);
      if (url.startsWith(REDIS_URL)) return redis.handler(input, init);
      throw new Error(`Unexpected URL ${url}`);
    })
  );
});

const check = async (options?: { fresh?: boolean; now?: number }) => {
  const report = await checkServices(getEnv(), options);
  return Object.fromEntries(report.services.map((service) => [service.id, service]));
};

describe('checkServices', () => {
  it('reports every service up, with a round trip, when all answer', async () => {
    const services = await check();
    for (const id of ['claude', 'gemini', 'redis'] as const) {
      expect(services[id]).toMatchObject({ status: 'up', reason: null });
      expect(services[id].latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses only free calls: list models for the AIs, PING for Redis, never a generation', async () => {
    await check();
    expect(calls.some((url) => /\/v1\/messages|generateContent/.test(url))).toBe(false);
    expect(calls.find((url) => url.startsWith(CLAUDE_URL))).toContain('/v1/models');
    expect(calls.find((url) => url.startsWith(GEMINI_URL))).toContain('pageSize=1');
    expect(redis.requests[0].commands).toEqual([['PING']]);
  });

  it('sends keys in headers, never in a URL', async () => {
    await check();
    expect(calls.join(' ')).not.toMatch(/sk-ant-secret|gem-secret|token-token/);
  });

  it.each([
    [401, 'down', 'auth'],
    [403, 'down', 'auth'],
    [429, 'degraded', 'rate_limit'],
    [500, 'down', 'overloaded'],
    [529, 'down', 'overloaded'],
    [404, 'down', 'unknown'],
  ] as const)('maps a Claude answer of %s to %s (%s)', async (status, state, reason) => {
    claudeAnswer = claudeError(status);
    expect((await check()).claude).toMatchObject({ status: state, reason });
  });

  it.each([
    [400, 'down', 'unknown'],
    [403, 'down', 'auth'],
    [429, 'degraded', 'rate_limit'],
    [503, 'down', 'overloaded'],
  ] as const)('maps a Gemini answer of %s to %s (%s)', async (status, state, reason) => {
    geminiAnswer = new Response('{}', { status });
    expect((await check()).gemini).toMatchObject({ status: state, reason });
  });

  it('reports a network failure as down and unreachable, and a hang as a timeout', async () => {
    geminiAnswer = new TypeError('fetch failed');
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith(GEMINI_URL)) throw new TypeError('fetch failed');
        if (url.startsWith(CLAUDE_URL)) throw timeout;
        return redis.handler(input, init);
      })
    );
    const services = await check();
    expect(services.gemini).toMatchObject({ status: 'down', reason: 'unreachable', latencyMs: null });
    expect(services.claude).toMatchObject({ status: 'down', reason: 'timeout', latencyMs: null });
  });

  it('reports Redis down, and tells a rejected token apart', async () => {
    redis.state.failWith = new Response('boom', { status: 500 });
    expect((await check()).redis).toMatchObject({ status: 'down', reason: 'unreachable' });

    resetServiceCache();
    redis.state.failWith = new Response('{"error":"Unauthorized"}', { status: 401 });
    expect((await check()).redis).toMatchObject({ status: 'down', reason: 'auth' });
  });

  it('skips a service that has no configuration instead of calling it', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const services = await check();
    expect(services.gemini).toMatchObject({ status: 'not_configured', latencyMs: null });
    expect(services.redis).toMatchObject({ status: 'not_configured' });
    expect(calls.every((url) => url.startsWith(CLAUDE_URL))).toBe(true);
  });

  it('keeps provider error text out of the report', async () => {
    claudeAnswer = claudeError(500);
    expect(JSON.stringify(await check())).not.toContain('secret detail');
  });
});

describe('checkServices: caching', () => {
  it('reuses the result inside the cache window, so visitors cannot hammer the providers', async () => {
    const first = await checkServices(getEnv(), { now: 1_000_000 });
    const callsAfterFirst = calls.length;
    const again = await checkServices(getEnv(), { now: 1_000_000 + 29_000 });
    expect(again).toBe(first);
    expect(calls).toHaveLength(callsAfterFirst);
  });

  it('checks again once the window has passed', async () => {
    await checkServices(getEnv(), { now: 1_000_000 });
    const before = calls.length;
    await checkServices(getEnv(), { now: 1_000_000 + 31_000 });
    expect(calls.length).toBeGreaterThan(before);
  });

  it('shares one in-flight check between simultaneous callers', async () => {
    const [a, b, c] = await Promise.all([checkServices(getEnv()), checkServices(getEnv()), checkServices(getEnv())]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(calls.filter((url) => url.startsWith(CLAUDE_URL))).toHaveLength(1);
  });

  it('lets the owner force a fresh check', async () => {
    await checkServices(getEnv());
    const before = calls.length;
    await checkServices(getEnv(), { fresh: true });
    expect(calls.length).toBeGreaterThan(before);
  });

  it('honors STATUS_CACHE_SECONDS, including 0 (no caching)', async () => {
    vi.stubEnv('STATUS_CACHE_SECONDS', '0');
    await checkServices(getEnv(), { now: 5_000_000 });
    const before = calls.length;
    await checkServices(getEnv(), { now: 5_000_001 });
    expect(calls.length).toBeGreaterThan(before);
  });
});
