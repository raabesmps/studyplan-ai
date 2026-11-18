import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ALERT, GENERATING_STATUS, PLAN_SECTION, generate, upstreamCalls } from './helpers';

const subject = (scenario: string) => `SCENARIO:${scenario} ${randomUUID().slice(0, 8)}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('cancelling', () => {
  test('stops the upstream call, keeps what was typed and shows a neutral note', async ({ page, request }) => {
    const s = subject('slow');
    await generate(page, s, 6);
    await expect(page.locator(GENERATING_STATUS)).toContainText('dia 2 de 6', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('Geração cancelada. O que você digitou foi mantido.')).toBeVisible();
    await expect(page.locator(ALERT)).toHaveCount(0);
    await expect(page.locator('#subject')).toHaveValue(s);
    await expect(page.getByRole('button', { name: 'Gerar plano' })).toBeEnabled();
    await expect(page.locator(PLAN_SECTION)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('studyplan-ai:v2'))).toBeNull();

    // The server must have hung up on Gemini too, not just on the browser.
    await expect.poll(async () => (await upstreamCalls(request, s))[0]?.closedEarly, { timeout: 10_000 }).toBe(true);
  });

  test('lets the learner generate again right after cancelling', async ({ page }) => {
    await generate(page, subject('slow'), 4);
    await expect(page.locator(GENERATING_STATUS)).toContainText('dia 1 de 4', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText(/Geração cancelada\. O que/)).toBeVisible();

    await generate(page, subject('ok'), 3);
    await expect(page.locator(PLAN_SECTION)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Geração cancelada\. O que/)).toHaveCount(0);
  });

  test('leaving the page also aborts the upstream call', async ({ page, request }) => {
    const s = subject('slow');
    await generate(page, s, 6);
    await expect(page.locator(GENERATING_STATUS)).toContainText('dia 1 de 6', { timeout: 15_000 });
    await page.goto('about:blank');
    await expect.poll(async () => (await upstreamCalls(request, s))[0]?.closedEarly, { timeout: 10_000 }).toBe(true);
  });
});

test.describe('errors', () => {
  for (const [scenario, expected] of [
    ['429', 'Muitas tentativas em pouco tempo'],
    ['500both', 'O serviço de IA não respondeu'],
    ['midstream', 'O serviço de IA não respondeu'],
  ] as const) {
    test(`shows a localized message and a retry button for "${scenario}"`, async ({ page }) => {
      const s = subject(scenario);
      await generate(page, s, 3);
      const alert = page.locator(ALERT);
      await expect(alert).toBeVisible({ timeout: 20_000 });
      await expect(alert).toContainText(expected);
      await expect(alert).not.toContainText(/quota|boom|overloaded|high demand/i);
      await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();

      // Never locks up: the form is usable and the text is still there.
      await expect(page.getByRole('button', { name: 'Gerar plano' })).toBeEnabled();
      await expect(page.locator('#subject')).toHaveValue(s);
    });
  }

  test('the error message switches language together with the interface', async ({ page }) => {
    await generate(page, subject('500both'), 3);
    await expect(page.locator(ALERT)).toContainText('não respondeu', { timeout: 20_000 });
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator(ALERT)).toContainText('did not respond');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('shows when to try again when the server sends Retry-After', async ({ page }) => {
    await page.route('**/api/generate-plan', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '120' },
        body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'x', retryAfter: 120 } }),
      })
    );
    await generate(page, 'qualquer assunto', 3);
    await expect(page.locator(ALERT)).toContainText('Tente de novo em 2 min.');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator(ALERT)).toContainText('Try again in 2 min.');
  });

  test('reports a network failure', async ({ page }) => {
    await page.route('**/api/generate-plan', (route) => route.abort('connectionrefused'));
    await generate(page, 'qualquer assunto', 3);
    await expect(page.locator(ALERT)).toContainText('Sem conexão com o servidor');
  });
});

test('rejects invalid input with a friendly 400 from the real route', async ({ request }) => {
  const response = await request.post('/api/generate-plan', { data: { subject: 'a'.repeat(101), hoursPerDay: 1 } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: 'INVALID_REQUEST', message: 'O assunto deve ter no máximo 100 caracteres.' },
  });
});
