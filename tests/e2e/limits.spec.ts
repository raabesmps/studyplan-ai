import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ALERT, FAKE_GEMINI, PLAN_SECTION, generate, upstreamCalls } from './helpers';

// This instance runs with the rate limiter on (3 plans per visitor), against the fake Upstash.
// The fake store is shared with the status page tests, which run at the same time, so nothing here
// clears it: every test is its own "visitor" (an x-forwarded-for address nobody else uses).
test.describe.configure({ mode: 'serial' });

const APP = 'http://localhost:3102';
const body = (subject: string, days = 2) => ({ subject, hoursPerDay: 1, days, level: 'beginner', language: 'pt' });
const subject = () => `SCENARIO:ok ${randomUUID().slice(0, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);

test.describe('per-visitor limit', () => {
  test.use({ baseURL: APP, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.10' } });

  test('refuses the 4th plan with 429 and Retry-After, without calling the AI', async ({ request }) => {
    const s = subject();
    for (let i = 0; i < 3; i++) {
      const ok = await request.post('/api/generate-plan', { data: body(s) });
      expect(ok.status()).toBe(200);
    }
    const blocked = await request.post('/api/generate-plan', { data: body(s) });
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(3500);
    expect((await blocked.json()).error.code).toBe('RATE_LIMITED');

    expect(await upstreamCalls(request, s)).toHaveLength(3);
  });

});

test.describe('what the visitor sees when over the limit', () => {
  test.use({ baseURL: APP, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.11' } });

  test('tells the visitor how long to wait', async ({ page, request }) => {
    for (let i = 0; i < 3; i++) await request.post('/api/generate-plan', { data: body(subject()) });
    await page.goto('/');
    await generate(page, subject(), 2);

    await expect(page.locator(ALERT)).toContainText('Muitas tentativas em pouco tempo');
    await expect(page.locator(ALERT)).toContainText('Tente de novo em 60 min.');
    await expect(page.locator(PLAN_SECTION)).toHaveCount(0);
  });
});

test.describe('another visitor', () => {
  test.use({ baseURL: APP });

  test('is not affected by someone else being blocked', async ({ playwright }) => {
    const visitor = (ip: string) =>
      playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { 'x-forwarded-for': ip } });
    const first = await visitor('198.51.100.20');
    const second = await visitor('198.51.100.21');

    for (let i = 0; i < 3; i++) await first.post('/api/generate-plan', { data: body(subject()) });
    expect((await first.post('/api/generate-plan', { data: body(subject()) })).status()).toBe(429);
    expect((await second.post('/api/generate-plan', { data: body(subject()) })).status()).toBe(200);
    await Promise.all([first.dispose(), second.dispose()]);
  });
});

test.describe('daily cap', () => {
  test.use({ baseURL: APP, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.30' } });

  // Give the app its budget back even if the test failed: the status page tests share this instance.
  test.afterEach(async ({ request }) => {
    await request.post(`${FAKE_GEMINI}/__redis/set?key=studyplan:day:${today()}&value=0`);
  });

  test('shows a clearly marked sample plan, and the AI is not called', async ({ page, request }) => {
    await request.post(`${FAKE_GEMINI}/__redis/set?key=studyplan:day:${today()}&value=1000`);
    const s = subject();

    await page.goto('/');
    await generate(page, s, 3);

    await expect(page.locator(PLAN_SECTION)).toBeVisible();
    await expect(page.getByText('O limite diário de planos gerados por IA foi atingido')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(3); // the sample is cut to the days asked for
    expect(await upstreamCalls(request, s)).toHaveLength(0);
  });
});

test.describe('request size', () => {
  test.use({ baseURL: APP, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.40' } });

  test('rejects an oversized body with 413 and does not use the visitor quota', async ({ request }) => {
    const big = await request.post('/api/generate-plan', { data: { ...body('x'), subject: 'a'.repeat(6000) } });
    expect(big.status()).toBe(413);
    for (let i = 0; i < 3; i++) {
      expect((await request.post('/api/generate-plan', { data: body(subject()) })).status()).toBe(200);
    }
  });
});
