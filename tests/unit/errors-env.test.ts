import { describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';
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
  it('fails with a safe CONFIG_ERROR when the API key is missing', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    try {
      getEnv();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('CONFIG_ERROR');
      expect((error as AppError).status).toBe(500);
    }
  });

  it('rejects a key made only of whitespace', () => {
    vi.stubEnv('GEMINI_API_KEY', '   ');
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
    vi.resetModules();
    await expect(import('@/lib/env')).resolves.toBeDefined();
  });
});
