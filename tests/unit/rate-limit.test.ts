import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { checkRateLimit, visitorKey } from '@/lib/rate-limit';
import { fakeUpstash } from '../fake-upstash';

const TOKEN = 'upstash-secret-token-789';
let redis: ReturnType<typeof fakeUpstash>;

const headers = (ip = '203.0.113.7') => new Headers({ 'x-forwarded-for': ip });

beforeEach(() => {
  for (const name of ['RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_SECONDS', 'DAILY_LIMIT', 'RATE_LIMIT_DISABLED', 'DEMO_MODE']) {
    vi.stubEnv(name, '');
  }
  vi.stubEnv('GEMINI_API_KEY', 'k');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test/');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN);
  redis = fakeUpstash();
  vi.stubGlobal('fetch', vi.fn(redis.handler));
});

const check = (ip?: string) => checkRateLimit(getEnv(), headers(ip), redis.now);

describe('checkRateLimit: per-visitor quota', () => {
  it('allows 5 plans per window and refuses the 6th with the time left', async () => {
    for (let i = 0; i < 5; i++) expect(await check()).toEqual({ ok: true });

    redis.advance(600); // 10 minutes into the hour
    expect(await check()).toEqual({ ok: false, scope: 'ip', retryAfter: 3000 });
  });

  it('does not push the window forward on later hits', async () => {
    await check();
    redis.advance(1800);
    for (let i = 0; i < 4; i++) await check();
    expect(await check()).toMatchObject({ ok: false, scope: 'ip', retryAfter: 1800 });
  });

  it('opens a fresh quota once the window has passed', async () => {
    for (let i = 0; i < 6; i++) await check();
    redis.advance(3601);
    expect(await check()).toEqual({ ok: true });
  });

  it('counts each visitor separately', async () => {
    for (let i = 0; i < 6; i++) await check('198.51.100.1');
    expect(await check('198.51.100.1')).toMatchObject({ ok: false, scope: 'ip' });
    expect(await check('198.51.100.2')).toEqual({ ok: true });
  });

  it('honors RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_SECONDS', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '2');
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60');
    await check();
    await check();
    expect(await check()).toEqual({ ok: false, scope: 'ip', retryAfter: 60 });
  });

  it('keys visitors by the first forwarded address and never stores the raw IP', async () => {
    const forwarded = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' });
    await checkRateLimit(getEnv(), forwarded, redis.now);

    expect(await visitorKey(forwarded)).toBe(await visitorKey(new Headers({ 'x-forwarded-for': '203.0.113.9' })));
    const keys = [...redis.entries.keys()];
    expect(keys.some((key) => key.includes('203.0.113.9'))).toBe(false);
    expect(keys.some((key) => key.startsWith('studyplan:ip:'))).toBe(true);
  });

  it('falls back to x-real-ip, then to a shared bucket', async () => {
    expect(await visitorKey(new Headers({ 'x-real-ip': '192.0.2.5' }))).toBe(
      await visitorKey(new Headers({ 'x-forwarded-for': '192.0.2.5' }))
    );
    expect(await visitorKey(new Headers())).toBe(await visitorKey(new Headers({ 'x-forwarded-for': 'unknown' })));
  });
});

describe('checkRateLimit: daily cap', () => {
  beforeEach(() => {
    vi.stubEnv('DAILY_LIMIT', '3');
  });

  it('refuses everyone past the cap and points at the next UTC day', async () => {
    await check('198.51.100.1');
    await check('198.51.100.2');
    await check('198.51.100.3');

    // 12:00 UTC: 12 hours to midnight.
    expect(await check('198.51.100.4')).toEqual({ ok: false, scope: 'daily', retryAfter: 12 * 3600 });
  });

  it('starts a new budget on the next UTC day', async () => {
    for (let i = 1; i <= 4; i++) await check(`198.51.100.${i}`);
    redis.advance(13 * 3600);
    expect(await check('198.51.100.9')).toEqual({ ok: true });
  });

  it('does not spend the shared budget on a visitor who is already over their own quota', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    await check('198.51.100.1'); // uses 1 of 3
    for (let i = 0; i < 5; i++) await check('198.51.100.1'); // all blocked by the visitor quota
    expect(await check('198.51.100.2')).toEqual({ ok: true }); // 2 of 3
    expect(await check('198.51.100.3')).toEqual({ ok: true }); // 3 of 3
    expect(await check('198.51.100.4')).toMatchObject({ ok: false, scope: 'daily' });
  });
});

describe('checkRateLimit: talking to Upstash', () => {
  it('sends one authenticated pipeline request per counter', async () => {
    await check();
    expect(redis.requests).toHaveLength(2);
    for (const request of redis.requests) {
      expect(request.url).toBe('https://redis.example.test/pipeline');
      expect(request.authorization).toBe(`Bearer ${TOKEN}`);
      expect(request.commands.map((command) => command[0])).toEqual(['INCR', 'EXPIRE', 'TTL']);
    }
  });

  it('repairs a counter that was left without an expiry', async () => {
    // The first pipeline cannot set the expiry (simulated), so the key comes back with TTL -1.
    redis.state.ignoreExpire = true;
    const original = redis.handler;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await original(input, init);
        redis.state.ignoreExpire = false; // the repair request goes through
        return response;
      })
    );

    expect(await check()).toEqual({ ok: true });
    const repair = redis.requests.find((request) => request.commands.length === 1);
    expect(repair?.commands[0]).toEqual(['EXPIRE', expect.stringContaining('studyplan:ip:'), 3600]);
  });

  it.each([
    ['an HTTP error', new Response('nope', { status: 500 })],
    ['a rejected token', new Response('{"error":"Unauthorized"}', { status: 401 })],
    ['a malformed body', new Response('{"not":"an array"}')],
    ['a command error', new Response('[{"error":"ERR boom"},{"result":1},{"result":3600}]')],
    ['a wrong result type', new Response('[{"result":"x"},{"result":1},{"result":3600}]')],
  ])('fails closed on %s, without leaking details', async (_name, answer) => {
    redis.state.failWith = answer;
    const error = await check().then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'UPSTREAM_FAILED', status: 503 });
    expect((error as AppError).message).not.toContain(TOKEN);
  });

  it('fails closed when the network call itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(check()).rejects.toMatchObject({ code: 'UPSTREAM_FAILED', status: 503 });
  });
});
