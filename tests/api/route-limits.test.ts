import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate-plan/route';
import { Plan } from '@/lib/schema';
import { readEvents, type StreamEvent } from '@/lib/stream';
import { claudeStream, makePlan, planChunks } from '../fixtures';
import { fakeUpstash } from '../fake-upstash';

const UPSTASH_TOKEN = 'upstash-secret-token-789';
const valid = { subject: 'SQL joins', hoursPerDay: 2, days: 3, level: 'intermediate', language: 'pt' };

let redis: ReturnType<typeof fakeUpstash>;
const claudeCalls = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  for (const name of ['AI_PROVIDER', 'ANTHROPIC_MODEL', 'ANTHROPIC_EFFORT', 'ANTHROPIC_BASE_URL', 'GEMINI_API_KEY']) {
    vi.stubEnv(name, '');
  }
  for (const name of ['RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_SECONDS', 'DAILY_LIMIT', 'RATE_LIMIT_DISABLED', 'DEMO_MODE']) {
    vi.stubEnv(name, '');
  }
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key-123');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', UPSTASH_TOKEN);

  redis = fakeUpstash();
  claudeCalls.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://redis.example.test')) return redis.handler(input, init);
    if (url.endsWith('/v1/messages')) {
      claudeCalls();
      return claudeStream(planChunks(makePlan(3)));
    }
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

const request = (body: unknown = valid, ip = '203.0.113.7', raw?: string) =>
  new NextRequest('http://localhost/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: raw ?? JSON.stringify(body),
  });

async function events(response: Response): Promise<StreamEvent[]> {
  const found: StreamEvent[] = [];
  for await (const event of readEvents(response.body!)) found.push(event);
  return found;
}

const generate = async (ip?: string, body: unknown = valid) => {
  const response = await POST(request(body, ip));
  const isStream = response.headers.get('content-type')?.includes('ndjson');
  return { response, events: isStream ? await events(response) : [] };
};

describe('POST /api/generate-plan: per-visitor rate limit', () => {
  it('serves 5 plans, then answers 429 with Retry-After and no AI call', async () => {
    for (let i = 0; i < 5; i++) expect((await generate()).events.at(-1)?.type).toBe('plan');
    expect(claudeCalls).toHaveBeenCalledTimes(5);

    redis.advance(900);
    const { response } = await generate();
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('2700');
    expect(await response.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Muitas tentativas em pouco tempo.', retryAfter: 2700 },
    });
    expect(claudeCalls).toHaveBeenCalledTimes(5);
  });

  it('keeps visitors apart', async () => {
    for (let i = 0; i < 6; i++) await generate('198.51.100.1');
    expect((await generate('198.51.100.1')).response.status).toBe(429);
    expect((await generate('198.51.100.2')).response.status).toBe(200);
  });

  it('lets the visitor back in when the window ends', async () => {
    for (let i = 0; i < 6; i++) await generate();
    redis.advance(3601);
    expect((await generate()).response.status).toBe(200);
  });

  it('does not spend quota on invalid requests', async () => {
    for (let i = 0; i < 10; i++) expect((await generate(undefined, { ...valid, days: 99 })).response.status).toBe(400);
    expect(redis.requests).toHaveLength(0);
    expect((await generate()).response.status).toBe(200);
  });

  it('honors RATE_LIMIT_MAX', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    expect((await generate()).response.status).toBe(200);
    expect((await generate()).response.status).toBe(429);
  });
});

describe('POST /api/generate-plan: daily cap', () => {
  beforeEach(() => {
    vi.stubEnv('DAILY_LIMIT', '2');
  });

  it('serves a sample plan, marked as such, once the cap is reached', async () => {
    await generate('198.51.100.1');
    await generate('198.51.100.2');
    expect(claudeCalls).toHaveBeenCalledTimes(2);

    const { response, events: found } = await generate('198.51.100.3');
    expect(response.status).toBe(200);
    expect(claudeCalls).toHaveBeenCalledTimes(2); // no third AI call
    expect(found.map((event) => event.type)).toEqual(['demo', 'plan']);
    expect(found[0]).toEqual({ type: 'demo', reason: 'daily-limit' });

    const plan = Plan.parse((found[1] as { plan: unknown }).plan);
    expect(plan.days.length).toBeLessThanOrEqual(3);
  });

  it('serves the sample in the language that was asked for', async () => {
    await generate('198.51.100.1');
    await generate('198.51.100.2');
    const { events: found } = await generate('198.51.100.3', { ...valid, subject: 'cooking', language: 'en' });
    expect(Plan.parse((found[1] as { plan: unknown }).plan).subject).toBe('How to learn anything');
  });

  it('still answers 429 to a visitor over their own quota, even past the cap', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    await generate('198.51.100.1');
    await generate('198.51.100.2');
    expect((await generate('198.51.100.1')).response.status).toBe(429);
  });
});

describe('POST /api/generate-plan: limiter failures', () => {
  it('fails closed with 503 when Upstash is down, without leaking anything', async () => {
    redis.state.failWith = new Response('boom', { status: 500 });
    const { response } = await generate();
    expect(response.status).toBe(503);
    const text = JSON.stringify(await response.json());
    expect(JSON.parse(text).error.code).toBe('UPSTREAM_FAILED');
    expect(text).not.toContain(UPSTASH_TOKEN);
    expect(text).not.toContain('redis.example.test');
    expect(claudeCalls).not.toHaveBeenCalled();
  });

  it('reports the failure to operators even in production, without the token', async () => {
    const alert = vi.spyOn(console, 'error').mockImplementation(() => {});
    redis.state.failWith = new Response('boom', { status: 401 });
    await generate();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Rate limiter failed'), expect.any(String));
    expect(JSON.stringify(alert.mock.calls)).not.toContain(UPSTASH_TOKEN);
    alert.mockRestore();
  });
});

describe('POST /api/generate-plan: switches', () => {
  it('skips the limiter entirely when Upstash is not configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    for (let i = 0; i < 8; i++) expect((await generate()).response.status).toBe(200);
    expect(redis.requests).toHaveLength(0);
  });

  it('skips the limiter when RATE_LIMIT_DISABLED=true', async () => {
    vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
    for (let i = 0; i < 8; i++) expect((await generate()).response.status).toBe(200);
    expect(redis.requests).toHaveLength(0);
  });

  it('demo mode serves samples without any AI or Redis call, and needs no API key', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    for (let i = 0; i < 8; i++) {
      const { response, events: found } = await generate();
      expect(response.status).toBe(200);
      expect(found[0]).toEqual({ type: 'demo', reason: 'demo-mode' });
      expect(found[1].type).toBe('plan');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/generate-plan: body size', () => {
  it('rejects an oversized body with 413 before doing anything else', async () => {
    const response = await POST(request(undefined, undefined, JSON.stringify({ ...valid, subject: 'a'.repeat(5000) })));
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
