import { describe, expect, it, vi } from 'vitest';
import { getEnv, providerOrder } from '@/lib/env';
import { AppError, toErrorBody } from '@/lib/errors';

describe('toErrorBody', () => {
  it('exposes the code, message and status of an AppError', () => {
    const { status, body } = toErrorBody(new AppError('INVALID_REQUEST', 'Campo inválido.', 400));
    expect(status).toBe(400);
    expect(body).toEqual({ error: { code: 'INVALID_REQUEST', message: 'Campo inválido.' } });
  });

  it('includes retryAfter only when it is set', () => {
    const limited = toErrorBody(new AppError('RATE_LIMITED', 'Devagar.', 429, { retryAfter: 120 }));
    expect(limited.body.error.retryAfter).toBe(120);
    expect('retryAfter' in toErrorBody(new AppError('INTERNAL', 'x', 500)).body.error).toBe(false);
  });

  it('never leaks the message of an unexpected error', () => {
    const { status, body } = toErrorBody(new Error('secret upstream detail: key=abc123'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('abc123');
  });

  it('handles non-Error throwables', () => {
    for (const thrown of ['boom', 42, null, undefined, { message: 'x' }]) {
      expect(toErrorBody(thrown).body.error.code).toBe('INTERNAL');
    }
  });

  it('keeps the cause on an AppError for logging without exposing it', () => {
    const cause = new Error('low level');
    const error = new AppError('UPSTREAM_FAILED', 'Falhou.', 502, { cause });
    expect(error.cause).toBe(cause);
    expect(JSON.stringify(toErrorBody(error).body)).not.toContain('low level');
  });
});

describe('getEnv', () => {
  it('fails with a safe CONFIG_ERROR when no provider has an API key', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    try {
      getEnv();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('CONFIG_ERROR');
      expect((error as AppError).status).toBe(500);
    }
  });

  it('rejects keys made only of whitespace', () => {
    vi.stubEnv('GEMINI_API_KEY', '   ');
    vi.stubEnv('ANTHROPIC_API_KEY', '  ');
    expect(() => getEnv()).toThrow(AppError);
  });

  it('applies defaults and trims values', () => {
    vi.stubEnv('GEMINI_API_KEY', '  key  ');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
    vi.stubEnv('GEMINI_THINKING_LEVEL', '');
    vi.stubEnv('GEMINI_API_BASE_URL', '');
    const env = getEnv();
    expect(env.GEMINI_API_KEY).toBe('key');
    expect(env.GEMINI_MODEL).toBe('gemini-3-flash-preview');
    expect(env.GEMINI_FALLBACK_MODEL).toBe('gemini-3.5-flash');
    expect(env.GEMINI_THINKING_LEVEL).toBe('minimal');
    expect(env.GEMINI_API_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta/models');
  });

  it('accepts overrides', () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_MODEL', 'my-model');
    vi.stubEnv('GEMINI_THINKING_LEVEL', 'off');
    vi.stubEnv('GEMINI_API_BASE_URL', 'http://localhost:4010/v1beta/models');
    const env = getEnv();
    expect(env).toMatchObject({
      GEMINI_MODEL: 'my-model',
      GEMINI_THINKING_LEVEL: 'off',
      GEMINI_API_BASE_URL: 'http://localhost:4010/v1beta/models',
    });
  });

  it('rejects an invalid thinking level or base URL', () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_THINKING_LEVEL', 'extreme');
    expect(() => getEnv()).toThrow(AppError);
    vi.stubEnv('GEMINI_THINKING_LEVEL', '');
    vi.stubEnv('GEMINI_API_BASE_URL', 'not a url');
    expect(() => getEnv()).toThrow(AppError);
  });

  it('is lazy: importing the module does not require any variable', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.resetModules();
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });
});

describe('AI provider configuration', () => {
  const clearAll = () => {
    for (const name of [
      'AI_PROVIDER',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_EFFORT',
      'ANTHROPIC_BASE_URL',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
    ]) {
      vi.stubEnv(name, '');
    }
  };

  it('defaults to Claude, on a cheap model with low effort', () => {
    clearAll();
    vi.stubEnv('ANTHROPIC_API_KEY', 'ant-key');
    const env = getEnv();
    expect(env.AI_PROVIDER).toBe('claude');
    expect(env.ANTHROPIC_MODEL).toBe('claude-haiku-5-5');
    expect(env.ANTHROPIC_EFFORT).toBe('low');
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it('accepts overrides for the Anthropic settings', () => {
    clearAll();
    vi.stubEnv('ANTHROPIC_API_KEY', 'ant-key');
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-5-5');
    vi.stubEnv('ANTHROPIC_EFFORT', 'high');
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://localhost:4010');
    expect(getEnv()).toMatchObject({
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      ANTHROPIC_EFFORT: 'high',
      ANTHROPIC_BASE_URL: 'http://localhost:4010',
    });
  });

  it.each([
    ['an unknown provider', 'AI_PROVIDER', 'openai'],
    ['an unknown effort', 'ANTHROPIC_EFFORT', 'max'],
    ['a malformed base URL', 'ANTHROPIC_BASE_URL', 'not a url'],
  ])('rejects %s', (_name, variable, value) => {
    clearAll();
    vi.stubEnv('ANTHROPIC_API_KEY', 'ant-key');
    vi.stubEnv(variable, value);
    expect(() => getEnv()).toThrow(AppError);
  });

  describe('providerOrder', () => {
    const both = { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' };

    it('puts the configured provider first and the other one as the failover', () => {
      expect(providerOrder({ AI_PROVIDER: 'claude', ...both })).toEqual(['claude', 'gemini']);
      expect(providerOrder({ AI_PROVIDER: 'gemini', ...both })).toEqual(['gemini', 'claude']);
    });

    it('leaves out a provider that has no key', () => {
      expect(providerOrder({ AI_PROVIDER: 'claude', GEMINI_API_KEY: 'g' })).toEqual(['gemini']);
      expect(providerOrder({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'a' })).toEqual(['claude']);
      expect(providerOrder({ AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' })).toEqual(['claude']);
    });

    it('is empty when nothing is configured', () => {
      expect(providerOrder({ AI_PROVIDER: 'claude' })).toEqual([]);
    });
  });
});
