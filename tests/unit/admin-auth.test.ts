import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ADMIN_ATTEMPTS, authorizeOwner, safeEqual } from '@/lib/admin-auth';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { fakeUpstash } from '../fake-upstash';

const TOKEN = 'correct-horse-battery-staple-123';
let redis: ReturnType<typeof fakeUpstash>;

beforeEach(() => {
  for (const name of ['AI_PROVIDER', 'RATE_LIMIT_DISABLED', 'DEMO_MODE']) vi.stubEnv(name, '');
  vi.stubEnv('GEMINI_API_KEY', 'g');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-token-token');
  vi.stubEnv('STATUS_TOKEN', TOKEN);
  redis = fakeUpstash();
  vi.stubGlobal('fetch', vi.fn(redis.handler));
});

const request = (authorization?: string, ip = '203.0.113.7') =>
  new Request('https://studyplan.example.test/api/admin/usage', {
    headers: { 'x-forwarded-for': ip, ...(authorization ? { authorization } : {}) },
  });

const outcome = async (authorization?: string, ip?: string) => {
  try {
    await authorizeOwner(request(authorization, ip), getEnv());
    return 'allowed';
  } catch (error) {
    return error instanceof AppError ? error.status : 'error';
  }
};

describe('safeEqual', () => {
  it('compares secrets of any length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('authorizeOwner', () => {
  it('lets the right token through', async () => {
    expect(await outcome(`Bearer ${TOKEN}`)).toBe('allowed');
  });

  it('is case-insensitive about the scheme only', async () => {
    expect(await outcome(`bearer ${TOKEN}`)).toBe('allowed');
    expect(await outcome(`Bearer ${TOKEN.toUpperCase()}`)).toBe(401);
  });

  it.each([
    ['no header', undefined],
    ['an empty bearer', 'Bearer '],
    ['a wrong token', 'Bearer not-the-token-at-all-1234'],
    ['a prefix of the token', `Bearer ${TOKEN.slice(0, -1)}`],
    ['the token plus more', `Bearer ${TOKEN}x`],
    ['another scheme', `Basic ${TOKEN}`],
    ['the bare token', TOKEN],
  ])('refuses %s with 401', async (_name, header) => {
    expect(await outcome(header)).toBe(401);
  });

  it('does not exist (404) when STATUS_TOKEN is not set, even for a right-looking guess', async () => {
    vi.stubEnv('STATUS_TOKEN', '');
    expect(await outcome(`Bearer ${TOKEN}`)).toBe(404);
    expect(redis.requests).toHaveLength(0);
  });

  it('is not accepted by the config at all if the token is short', () => {
    vi.stubEnv('STATUS_TOKEN', 'short');
    expect(() => getEnv()).toThrow(AppError);
  });

  it('refuses to run without Redis (the lockout needs it)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(await outcome(`Bearer ${TOKEN}`)).toBe(500);
  });
});

describe('authorizeOwner: guessing', () => {
  it(`locks an address out after ${MAX_ADMIN_ATTEMPTS} wrong tokens, and even the right one waits`, async () => {
    for (let i = 0; i < MAX_ADMIN_ATTEMPTS; i++) expect(await outcome('Bearer wrong-wrong-wrong-1')).toBe(401);
    expect(await outcome('Bearer wrong-wrong-wrong-1')).toBe(429);
    expect(await outcome(`Bearer ${TOKEN}`)).toBe(429);
  });

  it('reports how long the lockout lasts', async () => {
    for (let i = 0; i <= MAX_ADMIN_ATTEMPTS; i++) await outcome('Bearer wrong-wrong-wrong-1');
    const error = await authorizeOwner(request('Bearer wrong-wrong-wrong-1'), getEnv()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfter: 3600 });
  });

  it('opens again after an hour', async () => {
    for (let i = 0; i <= MAX_ADMIN_ATTEMPTS; i++) await outcome('Bearer wrong-wrong-wrong-1');
    redis.advance(3601);
    expect(await outcome(`Bearer ${TOKEN}`)).toBe('allowed');
  });

  it('keeps addresses apart: one attacker does not lock the owner out', async () => {
    for (let i = 0; i <= MAX_ADMIN_ATTEMPTS; i++) await outcome('Bearer wrong-wrong-wrong-1', '198.51.100.66');
    expect(await outcome('Bearer wrong-wrong-wrong-1', '198.51.100.66')).toBe(429);
    expect(await outcome(`Bearer ${TOKEN}`, '203.0.113.7')).toBe('allowed');
  });

  it('does not count a right token as a guess', async () => {
    for (let i = 0; i < MAX_ADMIN_ATTEMPTS * 2; i++) expect(await outcome(`Bearer ${TOKEN}`)).toBe('allowed');
  });

  it('stores the counter under a hashed address, never the raw IP', async () => {
    await outcome('Bearer wrong-wrong-wrong-1', '203.0.113.7');
    const keys = [...redis.entries.keys()];
    expect(keys.some((key) => key.startsWith('studyplan:adminfail:'))).toBe(true);
    expect(keys.join(' ')).not.toContain('203.0.113.7');
  });

  it('fails closed when Redis is down', async () => {
    redis.state.failWith = new Response('boom', { status: 500 });
    expect(await outcome('Bearer wrong-wrong-wrong-1')).toBe(503);
    expect(await outcome(`Bearer ${TOKEN}`)).toBe(503); // the lockout cannot be checked, so nobody gets in
  });
});
