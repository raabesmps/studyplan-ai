import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ALERT, GENERATING_STATUS, PLAN_SECTION, collectStatuses, generate, upstreamCalls } from './helpers';

// This instance runs with AI_PROVIDER=claude (the default) and Gemini as the failover.
test.use({ baseURL: 'http://localhost:3101' });

const subject = (scenario: string) => `SCENARIO:${scenario} ${randomUUID().slice(0, 8)}`;
const SWITCHING = 'O Claude não respondeu. Gerando com o Gemini…';
const SWITCHED_NOTE = 'Este plano foi gerado com o Gemini, porque o Claude estava indisponível no momento.';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Claude is the default provider', () => {
  test('streams progress and shows the plan without ever touching Gemini', async ({ page, request }) => {
    const s = subject('ok');
    await generate(page, s, 4);
    const statuses = await collectStatuses(page, `${PLAN_SECTION}, ${ALERT}`);

    const days = statuses.map((x) => /dia (\d+) de 4/.exec(x)?.[1]).filter(Boolean).map(Number);
    expect(days).toEqual([1, 2, 3, 4]);
    await expect(page.locator('article')).toHaveCount(4);
    await expect(page.getByText(/estava indisponível/)).toHaveCount(0);

    const calls = await upstreamCalls(request, s);
    expect(calls.map((c) => c.provider)).toEqual(['claude']);
  });

  test('asks Claude for a cheap model, low effort and structured output, with the key authorized', async ({
    page,
    request,
  }) => {
    const s = subject('ok');
    await generate(page, s, 2);
    await expect(page.locator(PLAN_SECTION)).toBeVisible();

    const [call] = await upstreamCalls(request, s);
    expect(call).toMatchObject({
      provider: 'claude',
      model: 'claude-haiku-5-5',
      effort: 'low',
      structured: 'json_schema',
      authorized: true,
    });
  });

  test('retries the format once on Claude itself, without switching provider', async ({ page, request }) => {
    const s = subject('invalid-then-ok');
    await generate(page, s, 3);
    const statuses = await collectStatuses(page, `${PLAN_SECTION}, ${ALERT}`, 20_000);

    expect(statuses).toContain('Ajustando o formato do plano…');
    await expect(page.locator('article')).toHaveCount(3);
    await expect(page.getByText(/estava indisponível/)).toHaveCount(0);
    const calls = await upstreamCalls(request, s);
    expect(calls.map((c) => [c.provider, c.isRetry])).toEqual([['claude', false], ['claude', true]]);
  });
});

test.describe('failover to Gemini', () => {
  for (const scenario of ['claude-529', 'claude-429', 'claude-credit', 'claude-401', 'claude-midstream']) {
    test(`switches and tells the visitor when Claude fails with "${scenario}"`, async ({ page, request }) => {
      const s = subject(scenario);
      await generate(page, s, 3);
      const statuses = await collectStatuses(page, `${PLAN_SECTION}, ${ALERT}`, 25_000);

      expect(statuses).toContain(SWITCHING);
      await expect(page.locator(PLAN_SECTION)).toBeVisible();
      await expect(page.locator('article')).toHaveCount(3);
      await expect(page.getByText(SWITCHED_NOTE)).toBeVisible();
      await expect(page.locator(ALERT)).toHaveCount(0);

      const calls = await upstreamCalls(request, s);
      expect(calls.map((c) => c.provider)).toEqual(['claude', 'gemini']);
      // Nothing the Claude API said (like the billing message) may reach the page.
      expect(await page.locator('body').innerText()).not.toMatch(/credit balance|Anthropic API|invalid x-api-key|Overloaded/i);
    });
  }

  test('keeps the note next to the plan, and clears it when the next generation starts', async ({ page }) => {
    await generate(page, subject('claude-529'), 2);
    await expect(page.getByText(SWITCHED_NOTE)).toBeVisible({ timeout: 25_000 });

    await generate(page, subject('ok'), 2);
    await expect(page.getByText(SWITCHED_NOTE)).toHaveCount(0);
    await expect(page.locator(PLAN_SECTION)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/estava indisponível/)).toHaveCount(0);
  });

  test('the notice follows the interface language', async ({ page }) => {
    await page.getByRole('button', { name: /English/ }).click();
    await generate(page, subject('claude-529'), 2);
    await expect(
      page.getByText('This plan was generated with Gemini because Claude was unavailable at the moment.')
    ).toBeVisible({ timeout: 25_000 });
  });

  test('shows only an error, with no notice, when both providers are down', async ({ page, request }) => {
    const s = subject('bothdown');
    await generate(page, s, 3);
    const alert = page.locator(ALERT);
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText('O serviço de IA não respondeu');
    await expect(page.getByText(/foi gerado com o Gemini/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar plano' })).toBeEnabled();
    await expect(page.locator('#subject')).toHaveValue(s);

    const calls = await upstreamCalls(request, s);
    expect(calls[0].provider).toBe('claude');
    expect(calls.some((c) => c.provider === 'gemini')).toBe(true);
  });

  test('cancelling while Claude writes stops that call and does not fail over', async ({ page, request }) => {
    const s = subject('slow');
    await generate(page, s, 6);
    await expect(page.locator(GENERATING_STATUS)).toContainText('dia 2 de 6', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('Geração cancelada. O que você digitou foi mantido.')).toBeVisible();
    await expect.poll(async () => (await upstreamCalls(request, s))[0]?.closedEarly, { timeout: 10_000 }).toBe(true);
    const calls = await upstreamCalls(request, s);
    expect(calls.map((c) => c.provider)).toEqual(['claude']);
    await expect(page.getByText(/estava indisponível/)).toHaveCount(0);
  });
});

test.describe('accessibility with the failover notice', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no axe violations in the ${colorScheme} theme`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme, locale: 'pt-BR', baseURL: 'http://localhost:3101' });
      const page = await context.newPage();
      await page.goto('/');
      await generate(page, subject('claude-529'), 2);
      await expect(page.getByText(SWITCHED_NOTE)).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(900);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await context.close();
    });
  }
});
