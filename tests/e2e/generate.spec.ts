import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ALERT, GENERATING_STATUS, PLAN_SECTION, collectStatuses, generate, upstreamCalls } from './helpers';

const subject = (scenario: string) => `SCENARIO:${scenario} ${randomUUID().slice(0, 8)}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('streams real progress day by day, then shows the plan and saves it', async ({ page }) => {
  await generate(page, subject('ok'), 5);

  const statuses = await collectStatuses(page, `${PLAN_SECTION}, ${ALERT}`);
  expect(statuses[0]).toBe('Preparando o roteiro…');
  const days = statuses.map((s) => /dia (\d+) de 5/.exec(s)?.[1]).filter(Boolean).map(Number);
  expect(days).toEqual([1, 2, 3, 4, 5]);

  await expect(page.locator(PLAN_SECTION)).toBeVisible();
  await expect(page.locator('article')).toHaveCount(5);
  await expect(page.getByRole('status')).toContainText('gerado com 5 dias');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('studyplan-ai:v2')!).plans.length)).toBe(1);
});

test('the timeline builds itself while the plan is written', async ({ page }) => {
  await generate(page, subject('slow'), 4);
  await expect(page.locator(GENERATING_STATUS)).toContainText('dia 3 de 4', { timeout: 15_000 });
  // Days 1 and 2 are written (check marks); day 3 is being written.
  await expect(page.locator('section[aria-labelledby="generating-title"] ol li span svg')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('keeps progress after a reload', async ({ page }) => {
  await generate(page, subject('ok'), 3);
  await expect(page.locator(PLAN_SECTION)).toBeVisible();

  const day1 = page.getByRole('region', { name: 'Exercícios do dia 1' });
  await day1.getByRole('checkbox').nth(0).check();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await day1.getByRole('checkbox').nth(1).check();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  await page.getByRole('checkbox', { name: 'Marcar dia como concluído' }).first().check();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');

  await page.reload();
  await expect(page.locator(PLAN_SECTION)).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  await expect(page.getByText('2 de 3 dias concluídos').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Meus planos' }).getByText(/2 de 3 dias/)).toBeVisible();
});

test('the checklist works with the keyboard alone, with a visible focus ring', async ({ page }) => {
  await generate(page, subject('ok'), 2);
  await expect(page.locator(PLAN_SECTION)).toBeVisible();

  const first = page.getByRole('region', { name: 'Exercícios do dia 1' }).getByRole('checkbox').first();
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('sends the API key only in a header, asks for minimal thinking and makes exactly one call', async ({
  page,
  request,
}) => {
  const s = subject('ok');
  await generate(page, s, 2);
  await expect(page.locator(PLAN_SECTION)).toBeVisible();

  const calls = await upstreamCalls(request, s);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    model: 'gemini-3-flash-preview',
    keyInHeader: true,
    keyInUrl: false,
    thinking: { thinkingLevel: 'minimal' },
  });
});

test('falls back to the second model when the first one fails mid-stream', async ({ page, request }) => {
  const s = subject('fallback');
  await generate(page, s, 3);
  await expect(page.locator(PLAN_SECTION)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('article')).toHaveCount(3);
  await expect(page.locator(ALERT)).toHaveCount(0);

  const calls = await upstreamCalls(request, s);
  expect(calls.map((c) => c.model)).toEqual(['gemini-3-flash-preview', 'gemini-3.5-flash']);
});

test('says it is adjusting the format and retries once when the first answer is invalid', async ({ page, request }) => {
  const s = subject('invalid-then-ok');
  await generate(page, s, 3);
  const statuses = await collectStatuses(page, `${PLAN_SECTION}, ${ALERT}`, 20_000);

  expect(statuses).toContain('Ajustando o formato do plano…');
  await expect(page.locator('article')).toHaveCount(3);
  const calls = await upstreamCalls(request, s);
  expect(calls.map((c) => c.isRetry)).toEqual([false, true]);
});
