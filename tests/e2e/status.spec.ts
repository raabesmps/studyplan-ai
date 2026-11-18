import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { FAKE_GEMINI } from './helpers';

// The instance with Upstash, the owner token and all three services configured (see playwright.config.ts).
const APP = 'http://localhost:3102';
const OWNER_TOKEN = 'e2e-owner-token-0123456789';
const today = () => new Date().toISOString().slice(0, 10);

// These tests switch simulated outages on and off, so they run one after another.
test.describe.configure({ mode: 'serial' });
test.use({ baseURL: APP });

const setService = (request: APIRequestContext, query: string) => request.post(`${FAKE_GEMINI}/__service?${query}`);

test.afterEach(async ({ request }) => {
  await setService(request, 'claude=200&gemini=200&redis=200');
});

const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-service="${id}"]`);

test.describe('public status', () => {
  test('shows the site and the three APIs as operational', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByRole('heading', { level: 1, name: 'Status do serviço' })).toBeVisible();
    for (const id of ['site', 'claude', 'gemini', 'redis']) {
      await expect(row(page, id)).toContainText('Operacional');
    }
    await expect(row(page, 'claude')).toContainText(/\d+ ms/);
    await expect(row(page, 'site')).not.toContainText('ms');
  });

  test('shows an API that is down, and recovers when it comes back', async ({ page, request }) => {
    await setService(request, 'claude=500');
    await page.goto('/status');
    await expect(row(page, 'claude')).toContainText('Fora do ar');
    await expect(row(page, 'gemini')).toContainText('Operacional');

    await setService(request, 'claude=200');
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(row(page, 'claude')).toContainText('Operacional');
  });

  test('shows a rate-limited API as degraded', async ({ page, request }) => {
    await setService(request, 'gemini=429');
    await page.goto('/status');
    await expect(row(page, 'gemini')).toContainText('Degradado');
  });

  test('the public API says nothing about why, how much or who', async ({ request }) => {
    await setService(request, 'claude=401');
    const response = await request.get('/api/status');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/reason|auth|usd|cost|e2e-|token|simulated/i);
    expect(JSON.parse(text).services.find((s: { id: string }) => s.id === 'claude').status).toBe('down');
  });

  test('is linked from the home page, which also says how long IPs are kept', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/endereço IP de quem gera planos fica guardado por 35 dias/)).toBeVisible();
    await page.getByRole('link', { name: 'Status do serviço' }).click();
    await expect(page).toHaveURL(/\/status$/);
  });

  test('is not meant for search engines, and the health endpoint is plain liveness', async ({ page, request }) => {
    await page.goto('/status');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(health.headers()['cache-control']).toBe('no-store');
  });

  test('works in English', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('studyplan-ai:locale', 'en'));
    await page.goto('/status');
    await expect(page.getByRole('heading', { level: 1, name: 'Service status' })).toBeVisible();
    await expect(row(page, 'claude')).toContainText('Operational');
  });
});

test.describe('owner panel', () => {
  test('refuses a wrong token and keeps the data hidden', async ({ page }) => {
    await page.goto('/status');
    await page.getByLabel('Token do dono').fill('not-the-owner-token-at-all');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Token inválido.')).toBeVisible();
    await expect(page.getByTestId('owner-data')).toHaveCount(0);
  });

  test('locks an address out after too many wrong tokens', async ({ page, request }) => {
    const ip = `192.0.2.${100 + Math.floor(Math.random() * 100)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    for (let i = 0; i < 10; i++) {
      const response = await request.get('/api/admin/usage', { headers: { authorization: 'Bearer wrong-wrong-wrong-1', 'x-forwarded-for': ip } });
      expect(response.status()).toBe(401);
    }
    await page.goto('/status');
    await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Muitas tentativas erradas. Tente de novo mais tarde.')).toBeVisible();
  });

  test('shows requests, plans, spend and the IP that asked, after a plan is generated', async ({ page, request }) => {
    const ip = `198.51.100.${100 + Math.floor(Math.random() * 100)}`;
    const subject = `SCENARIO:ok ${randomUUID().slice(0, 8)}`;
    const plan = await request.post('/api/generate-plan', {
      headers: { 'x-forwarded-for': ip },
      data: { subject, hoursPerDay: 1, days: 2, level: 'beginner', language: 'pt' },
    });
    expect(plan.status()).toBe(200);
    await plan.text(); // read to the end: the usage is written as the stream closes

    await page.goto('/status');
    await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('owner-data')).toBeVisible();

    const ipRow = page.getByTestId('ip-table').getByRole('row').filter({ hasText: ip });
    await expect(ipRow).toHaveCount(1);
    await expect(ipRow.getByRole('cell').nth(0)).toHaveText('1'); // requests
    await expect(ipRow.getByRole('cell').nth(1)).toHaveText('1'); // plans

    const daily = page.getByRole('table', { name: 'Por dia' });
    await expect(daily.getByRole('rowheader', { name: today() })).toBeVisible();
    await expect(page.getByText(/de 1000 planos do teto diário/)).toBeVisible();
    await expect(page.getByTestId('spend-today')).toContainText('US$');
    await expect(page.getByText(/Gemini é contado como gratuito/)).toBeVisible();
  });

  test('records a Claude failure with its reason and the switch to Gemini', async ({ page, request }) => {
    // Claude is the failover on this instance; make Gemini fail so Claude answers, then check what was noted.
    const ip = `203.0.113.${100 + Math.floor(Math.random() * 100)}`;
    const response = await request.post('/api/generate-plan', {
      headers: { 'x-forwarded-for': ip },
      data: { subject: `SCENARIO:bothdown ${randomUUID().slice(0, 8)}`, hoursPerDay: 1, days: 2, level: 'beginner', language: 'pt' },
    });
    await response.text();

    await page.goto('/status');
    await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('owner-data')).toBeVisible();

    // Gemini failed with 5xx, then Claude failed with 529: both are noted with their reasons.
    await expect(page.locator('[data-provider="gemini"]')).toContainText('provedor sobrecarregado');
    await expect(page.locator('[data-provider="claude"]')).toContainText('provedor sobrecarregado');
    const errors = page.getByRole('table', { name: 'Por dia' }).getByRole('row').nth(1).getByRole('cell').nth(5);
    await expect(errors).not.toHaveText('0');
  });

  test('explains why a service is down, which only the owner sees', async ({ page, request }) => {
    await setService(request, 'claude=401');
    await page.goto('/status');
    await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('[data-detail="claude"]')).toContainText('chave recusada');
    await expect(page.locator('[data-detail="claude"]')).toContainText('Fora do ar');
  });

  test('keeps the token out of the URL, cookies and localStorage, and signs out for good', async ({ page, context }) => {
    await page.goto('/status');
    await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('owner-data')).toBeVisible();

    expect(page.url()).not.toContain(OWNER_TOKEN);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('e2e-owner-token');
    expect(await page.evaluate(() => sessionStorage.getItem('studyplan-ai:owner-token'))).toBe(OWNER_TOKEN);

    await page.reload();
    await expect(page.getByTestId('owner-data')).toBeVisible(); // same tab: still signed in

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByLabel('Token do dono')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('studyplan-ai:owner-token'))).toBeNull();
  });

  test('the owner API is not cacheable and rejects the token in a query string', async ({ request }) => {
    const ok = await request.get('/api/admin/usage', { headers: { authorization: `Bearer ${OWNER_TOKEN}` } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()['cache-control']).toBe('no-store');
    const viaQuery = await request.get(`/api/admin/usage?token=${OWNER_TOKEN}`, { headers: { 'x-forwarded-for': '192.0.2.250' } });
    expect(viaQuery.status()).toBe(401);
  });
});

test.describe('owner panel on a server without a token', () => {
  test.use({ baseURL: 'http://localhost:3100' });

  test('does not exist: the page says it is off and the API answers 404', async ({ page, request }) => {
    await page.goto('/status');
    await page.getByLabel('Token do dono').fill('any-token-at-all-12345');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('O painel do dono não está ativado neste servidor.')).toBeVisible();
    expect((await request.get('/api/admin/usage', { headers: { authorization: `Bearer ${OWNER_TOKEN}` } })).status()).toBe(404);
  });

  test('shows Redis as not configured on the public page', async ({ page }) => {
    await page.goto('/status');
    await expect(row(page, 'redis')).toContainText('Não configurado');
    await expect(row(page, 'claude')).toContainText('Não configurado');
    await expect(row(page, 'gemini')).toContainText('Operacional');
  });
});

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the status page with the owner panel open, ${theme} theme`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('studyplan-ai:theme', value), theme);
      await page.goto('/status');
      await expect(row(page, 'claude')).toBeVisible();
      await page.getByLabel('Token do dono').fill(OWNER_TOKEN);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByTestId('owner-data')).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }

  test('the English page with a service down', async ({ page, request }) => {
    await setService(request, 'gemini=500');
    await page.addInitScript(() => localStorage.setItem('studyplan-ai:locale', 'en'));
    await page.goto('/status');
    await expect(row(page, 'gemini')).toContainText('Down');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
