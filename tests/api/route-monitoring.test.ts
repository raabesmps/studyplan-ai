import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate-plan/route';
import { GET as getUsage } from '@/app/api/admin/usage/route';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getStatus } from '@/app/api/status/route';
import { MAX_ADMIN_ATTEMPTS } from '@/lib/admin-auth';
import { resetServiceCache } from '@/lib/service-status';
import { readEvents } from '@/lib/stream';
import { claudeError, claudeStream, makePlan, planChunks, sseBody } from '../fixtures';
import { fakeUpstash } from '../fake-upstash';

const TOKEN = 'correct-horse-battery-staple-123';
const REDIS = 'https://redis.example.test';
const CLAUDE = 'https://claude.example.test';
const GEMINI = 'https://gemini.example.test/v1beta/models';
const valid = { subject: 'SQL joins', hoursPerDay: 2, days: 3, level: 'intermediate', language: 'pt' };
const DAY = '2026-03-10';

let redis: ReturnType<typeof fakeUpstash>;
type Answer = () => Response;
const queues = { claude: [] as Answer[], gemini: [] as Answer[] };
const state = { claudeModels: 200, geminiModels: 200 };

beforeEach(() => {
  // The app keys its statistics by UTC day: pin "now" to the day the assertions use.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
  resetServiceCache();
  for (const name of ['AI_PROVIDER', 'RATE_LIMIT_MAX', 'DAILY_LIMIT', 'RATE_LIMIT_DISABLED', 'DEMO_MODE', 'STATUS_CACHE_SECONDS']) {
    vi.stubEnv(name, '');
  }
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret-key');
  vi.stubEnv('ANTHROPIC_BASE_URL', CLAUDE);
  vi.stubEnv('GEMINI_API_KEY', 'gemini-secret-key');
  vi.stubEnv('GEMINI_API_BASE_URL', GEMINI);
  vi.stubEnv('UPSTASH_REDIS_REST_URL', REDIS);
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-secret-token');
  vi.stubEnv('STATUS_TOKEN', TOKEN);

  redis = fakeUpstash();
  queues.claude = [];
  queues.gemini = [];
  state.claudeModels = 200;
  state.geminiModels = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(REDIS)) return redis.handler(input, init);
      if (url.startsWith(`${CLAUDE}/v1/models`)) {
        return state.claudeModels === 200
          ? new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }))
          : claudeError(state.claudeModels, 'api_error', 'internal detail');
      }
      if (url.startsWith(`${GEMINI}?`)) return new Response('{}', { status: state.geminiModels });
      const queue = url.includes(':streamGenerateContent') ? queues.gemini : url.endsWith('/v1/messages') ? queues.claude : null;
      if (!queue) throw new Error(`Unexpected URL ${url}`);
      const next = queue.shift();
      if (!next) throw new Error(`Unexpected extra call to ${url}`);
      return next();
    })
  );
});

const gemini = () =>
  new Response(sseBody(planChunks(makePlan(3)), [{ usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 3000, thoughtsTokenCount: 100 } }]), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

const generate = async (ip = '203.0.113.7') => {
  const response = await POST(
    new NextRequest('http://localhost/api/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(valid),
    })
  );
  if (response.headers.get('content-type')?.includes('ndjson')) for await (const _ of readEvents(response.body!)) void _;
  return response;
};

const stats = () => redis.hash(`studyplan:stats:${DAY}`);
const owner = (path = '/api/admin/usage', token: string | null = TOKEN, ip = '198.51.100.9') =>
  getUsage(
    new NextRequest(`http://localhost${path}`, {
      headers: { 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    })
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/generate-plan: usage is recorded', () => {
  it('counts a plan from Claude with its tokens and the visitor', async () => {
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))));
    await generate('203.0.113.7');

    expect(stats()).toEqual({ requests: 1, plans: 1, plans_claude: 1, claude_in: 10, claude_out: 50 });
    expect(redis.hash(`studyplan:ips:${DAY}`)).toEqual({ '203.0.113.7': 1 });
    expect(redis.hash(`studyplan:ipplans:${DAY}`)).toEqual({ '203.0.113.7': 1 });
    expect(redis.string('studyplan:ok:claude')).not.toBeNull();
  });

  it('counts a failover with the reason Claude failed and the tokens Gemini used (thinking included)', async () => {
    queues.claude.push(() => claudeError(400, 'invalid_request_error', 'Your credit balance is too low'));
    queues.gemini.push(gemini);
    await generate();

    expect(stats()).toMatchObject({ requests: 1, plans: 1, plans_gemini: 1, failovers: 1, gemini_in: 500, gemini_out: 3100 });
    expect(JSON.parse(redis.string('studyplan:fail:claude')!)).toMatchObject({ reason: 'billing' });
    expect(redis.string('studyplan:ok:gemini')).not.toBeNull();
  });

  it.each([
    [401, 'auth'],
    [429, 'rate_limit'],
    [529, 'overloaded'],
  ])('notes why Claude failed with %s (%s)', async (status, reason) => {
    queues.claude.push(() => claudeError(status, 'x', 'detail'));
    queues.gemini.push(gemini);
    await generate();
    expect(JSON.parse(redis.string('studyplan:fail:claude')!).reason).toBe(reason);
  });

  it('counts an error, not a plan, when every provider fails', async () => {
    queues.claude.push(() => claudeError(529, 'overloaded_error', 'Overloaded'));
    queues.gemini.push(() => new Response('{}', { status: 500 }), () => new Response('{}', { status: 500 }));
    await generate();

    expect(stats()).toMatchObject({ requests: 1, errors: 1, failovers: 1 });
    expect(stats().plans).toBeUndefined();
    expect(redis.hash(`studyplan:ipplans:${DAY}`)).toEqual({});
  });

  it('counts a visitor over their quota as rate limited, with no AI call', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))));
    await generate();
    const blocked = await generate();

    expect(blocked.status).toBe(429);
    expect(stats()).toMatchObject({ requests: 2, plans: 1, rate_limited: 1 });
    expect(redis.hash(`studyplan:ips:${DAY}`)).toEqual({ '203.0.113.7': 2 });
  });

  it('counts a sample plan served because the daily budget is spent', async () => {
    vi.stubEnv('DAILY_LIMIT', '1');
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))));
    await generate('198.51.100.1');
    await generate('198.51.100.2');
    expect(stats()).toMatchObject({ requests: 2, plans: 1, samples: 1 });
  });

  it('does not let a failing usage log break the visitor\'s request', async () => {
    const alert = vi.spyOn(console, 'error').mockImplementation(() => {});
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))));
    // The limiter works; only the usage write is made to fail.
    const original = redis.handler;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith(REDIS) && String(init?.body).includes('HINCRBY')) return new Response('boom', { status: 500 });
        return String(input).startsWith(REDIS) ? original(input, init) : claudeStream(planChunks(makePlan(3)));
      })
    );
    const response = await generate();
    expect(response.status).toBe(200);
    alert.mockRestore();
  });
});

describe('GET /api/health', () => {
  it('answers ok without touching any other service', async () => {
    const fetchSpy = vi.mocked(fetch);
    const response = getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('GET /api/status (public)', () => {
  it('reports each service up, and that the daily budget is not spent', async () => {
    const body = await (await getStatus()).json();
    expect(body.site).toEqual({ status: 'up' });
    expect(body.services.map((s: { id: string; status: string }) => `${s.id}:${s.status}`)).toEqual(['claude:up', 'gemini:up', 'redis:up']);
    expect(body.dailyLimitReached).toBe(false);
  });

  it('reports a service that is down', async () => {
    state.claudeModels = 500;
    const body = await (await getStatus()).json();
    expect(body.services.find((s: { id: string }) => s.id === 'claude').status).toBe('down');
  });

  it('shows only state and latency: no reasons, keys, counts, spend or IPs', async () => {
    await generate('203.0.113.77');
    state.claudeModels = 401;
    resetServiceCache();
    const text = JSON.stringify(await (await getStatus()).json());

    expect(text).not.toMatch(/reason|auth|203\.0\.113|sk-ant|secret|token|usd|cost|internal detail/i);
    for (const service of JSON.parse(text).services) expect(Object.keys(service).sort()).toEqual(['id', 'latencyMs', 'status']);
  });

  it('says when the daily budget is spent', async () => {
    vi.stubEnv('DAILY_LIMIT', '1');
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))));
    await generate();
    expect((await (await getStatus()).json()).dailyLimitReached).toBe(true);
  });

  it('still answers when Redis is down, marking it down', async () => {
    redis.state.failWith = new Response('boom', { status: 500 });
    const body = await (await getStatus()).json();
    expect(body.services.find((s: { id: string }) => s.id === 'redis').status).toBe('down');
    expect(body.dailyLimitReached).toBeNull();
  });
});

describe('GET /api/admin/usage (owner)', () => {
  it('refuses without the token, with a wrong one, and says nothing about the data', async () => {
    await generate();
    for (const token of [null, 'wrong-wrong-wrong-wrong']) {
      const response = await owner('/api/admin/usage', token);
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(JSON.stringify(await response.json())).not.toMatch(/203\.0\.113|requests|plans/);
    }
  });

  it('does not exist when STATUS_TOKEN is not configured', async () => {
    vi.stubEnv('STATUS_TOKEN', '');
    expect((await owner()).status).toBe(404);
  });

  it('locks an address out after repeated wrong tokens', async () => {
    for (let i = 0; i < MAX_ADMIN_ATTEMPTS; i++) await owner('/api/admin/usage', 'wrong-wrong-wrong-wrong', '198.51.100.66');
    const locked = await owner('/api/admin/usage', TOKEN, '198.51.100.66');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('Retry-After')).toBeNull(); // the right token is only told to wait, with no hint of a counter
  });

  it('returns per-day statistics, totals, the estimated spend and the IPs of the day', async () => {
    queues.claude.push(() => claudeStream(planChunks(makePlan(3))), () => claudeStream(planChunks(makePlan(3))));
    await generate('203.0.113.7');
    await generate('203.0.113.7');
    queues.claude.push(() => claudeError(400, 'invalid_request_error', 'credit balance is too low'));
    queues.gemini.push(gemini);
    await generate('198.51.100.5');

    const response = await owner('/api/admin/usage?days=3');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.retentionDays).toBe(35);
    expect(body.days.map((d: { date: string }) => d.date)).toEqual(['2026-03-10', '2026-03-09', '2026-03-08']);
    expect(body.days[0]).toMatchObject({ requests: 3, plans: 3, plansClaude: 2, plansGemini: 1, failovers: 1 });
    expect(body.totals).toMatchObject({ requests: 3, plans: 3, errors: 0, rateLimited: 0 });
    // 2 Claude plans of 10 input + 50 output tokens at Haiku prices; Gemini is free.
    expect(body.totals.costUsd).toBeCloseTo((2 * (10 * 0.1 + 50 * 0.5)) / 1_000_000, 10);
    expect(body.priceKnown).toBe(true);
    expect(body.usedToday).toBe(3);
    expect(body.dailyLimit).toBe(200);

    expect(body.ips.date).toBe(DAY);
    expect(body.ips.rows).toEqual([
      { ip: '203.0.113.7', requests: 2, plans: 2 },
      { ip: '198.51.100.5', requests: 1, plans: 1 },
    ]);
    expect(body.health.claude.lastFailure).toMatchObject({ reason: 'billing' });
    expect(body.health.gemini.lastSuccess).not.toBeNull();
  });

  it('includes why a service is down, which the public status never does', async () => {
    state.claudeModels = 401;
    const body = await (await owner('/api/admin/usage?fresh=1')).json();
    expect(body.services.find((s: { id: string }) => s.id === 'claude')).toMatchObject({ status: 'down', reason: 'auth' });
  });

  it('never returns a key or the owner token', async () => {
    const text = JSON.stringify(await (await owner()).json());
    expect(text).not.toMatch(/sk-ant-secret|gemini-secret|upstash-secret|correct-horse/);
  });

  it('lets the owner pick another day, and rejects dates it cannot have', async () => {
    const ok = await owner('/api/admin/usage?date=2026-03-09');
    expect((await ok.json()).ips).toEqual({ date: '2026-03-09', rows: [] });
    for (const bad of ['yesterday', '2026-3-9', '2020-01-01', '2026-03-10;DROP', '../etc']) {
      expect((await owner(`/api/admin/usage?date=${encodeURIComponent(bad)}`)).status, bad).toBe(400);
    }
  });

  it('keeps the number of days between 1 and the retention period', async () => {
    expect((await (await owner('/api/admin/usage?days=0')).json()).days).toHaveLength(14); // not a valid number: default
    expect((await (await owner('/api/admin/usage?days=500')).json()).days).toHaveLength(35);
    expect((await (await owner('/api/admin/usage?days=-3')).json()).days).toHaveLength(1);
  });
});
