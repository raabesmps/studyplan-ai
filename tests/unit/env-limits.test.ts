import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv, rateLimitConfigured } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { encodeEvent, parseEventLine } from '@/lib/stream';

const NAMES = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_SECONDS',
  'DAILY_LIMIT',
  'RATE_LIMIT_DISABLED',
  'DEMO_MODE',
];

beforeEach(() => {
  for (const name of NAMES) vi.stubEnv(name, '');
  vi.stubEnv('GEMINI_API_KEY', 'key');
});

describe('rate limit and demo configuration', () => {
  it('has safe defaults: 5 per hour per visitor, 200 per day, demo off', () => {
    expect(getEnv()).toMatchObject({
      RATE_LIMIT_MAX: 5,
      RATE_LIMIT_WINDOW_SECONDS: 3600,
      DAILY_LIMIT: 200,
      RATE_LIMIT_DISABLED: 'false',
      DEMO_MODE: 'false',
    });
  });

  it('reads the limits as numbers', () => {
    vi.stubEnv('RATE_LIMIT_MAX', '10');
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '120');
    vi.stubEnv('DAILY_LIMIT', '50');
    expect(getEnv()).toMatchObject({ RATE_LIMIT_MAX: 10, RATE_LIMIT_WINDOW_SECONDS: 120, DAILY_LIMIT: 50 });
  });

  it.each([
    ['RATE_LIMIT_MAX', '0'],
    ['RATE_LIMIT_MAX', 'many'],
    ['RATE_LIMIT_MAX', '2.5'],
    ['DAILY_LIMIT', '-1'],
    ['RATE_LIMIT_WINDOW_SECONDS', '0'],
    ['DEMO_MODE', 'yes'],
    ['RATE_LIMIT_DISABLED', '1'],
    ['UPSTASH_REDIS_REST_URL', 'not a url'],
  ])('rejects %s=%s as a configuration error', (name, value) => {
    vi.stubEnv(name, value);
    expect(() => getEnv()).toThrow(AppError);
  });

  it('knows when both Upstash credentials are present', () => {
    expect(rateLimitConfigured(getEnv())).toBe(false);
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    expect(rateLimitConfigured(getEnv())).toBe(false); // the token is still missing
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(rateLimitConfigured(getEnv())).toBe(true);
  });

  it('does not need an AI key in demo mode', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(() => getEnv()).toThrow(AppError);
    vi.stubEnv('DEMO_MODE', 'true');
    expect(getEnv().DEMO_MODE).toBe('true');
  });
});

describe('production refuses to run without rate limiting', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('throws CONFIG_ERROR when Upstash is not configured', () => {
    expect(() => getEnv()).toThrow(expect.objectContaining({ code: 'CONFIG_ERROR', status: 500 }));
  });

  it('runs once Upstash is configured', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(() => getEnv()).not.toThrow();
  });

  it('runs without Upstash only when that is chosen explicitly', () => {
    vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
    expect(() => getEnv()).not.toThrow();
  });

  it('does not need rate limiting in demo mode (no AI is called)', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    expect(() => getEnv()).not.toThrow();
  });

  it('does not ask for it outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => getEnv()).not.toThrow();
  });
});

describe('demo stream event', () => {
  it('round-trips both reasons', () => {
    for (const reason of ['demo-mode', 'daily-limit'] as const) {
      expect(parseEventLine(encodeEvent({ type: 'demo', reason }))).toEqual({ type: 'demo', reason });
    }
  });

  it.each([['{"type":"demo"}'], ['{"type":"demo","reason":"other"}'], ['{"type":"demo","reason":5}']])(
    'ignores a malformed event: %s',
    (line) => {
      expect(parseEventLine(line)).toBeNull();
    }
  );
});
