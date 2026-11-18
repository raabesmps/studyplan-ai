import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PLAN_SECTION, expectNoHorizontalScroll, generate } from './helpers';

const subject = () => `SCENARIO:ok ${randomUUID().slice(0, 8)}`;

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

async function withPlan(page: Page, days = 3) {
  await page.goto('/');
  await generate(page, subject(), days);
  await expect(page.locator(PLAN_SECTION)).toBeVisible();
  // let the one-time reveal animation finish so contrast is measured on settled colors
  await page.waitForTimeout(900);
}

test.describe('language', () => {
  test('switches the interface, updates <html lang>, and remembers the choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planos de estudo que você pode marcar como feitos');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('pt-BR');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Study plans you can check off');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Study plans you can check off');
  });

  test('translates a plan that is already on screen', async ({ page }) => {
    await withPlan(page);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText('Estimated time: 90 min').first()).toBeVisible();
    await expect(page.getByText(/of 3 days done/).first()).toBeVisible();
    for (const name of ['Copy as Markdown', 'Download .md', 'Save as PDF', 'Add to calendar']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
  });

  test('follows the browser language on the first visit', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Study plans you can check off');
    await context.close();
  });
});

test.describe('theme', () => {
  test('toggles, remembers the choice, and applies it before first paint (no flash)', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(242, 244, 247)');

    await page.getByRole('button', { name: 'Mudar para o tema escuro' }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(13, 16, 23)');

    // The inline script sets the attribute before the document finishes parsing.
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => document.readyState !== 'loading' || document.documentElement.dataset.theme === 'dark');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });

  test('follows the OS preference until the learner chooses', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark', locale: 'pt-BR' });
    const page = await context.newPage();
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(13, 16, 23)');
    await page.getByRole('button', { name: 'Mudar para o tema claro' }).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(242, 244, 247)');
    await page.reload();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(242, 244, 247)');
    await context.close();
  });
});

test.describe('responsive and motion', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('has no horizontal scroll at 360px: empty, generating and with a plan', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalScroll(page);
    await generate(page, `SCENARIO:slow ${randomUUID().slice(0, 8)}`, 4);
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await generate(page, subject(), 4);
    await expect(page.locator(PLAN_SECTION)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Adicionar ao calendário' }).click();
    await expectNoHorizontalScroll(page);
  });
});

test('works with prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'pt-BR' });
  const page = await context.newPage();
  await withPlan(page, 2);
  await page.getByRole('region', { name: 'Exercícios do dia 1' }).getByRole('checkbox').first().check();
  await expect(page.getByRole('region', { name: 'Exercícios do dia 1' }).getByRole('checkbox').first()).toBeChecked();
  await context.close();
});

test.describe('plans from the previous version', () => {
  test('are listed as read-only, never executed, and invalid entries are dropped', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'studyplan-ai-plans',
        JSON.stringify([
          { id: 'o1', subject: 'Plano antigo', hoursPerDay: 2, days: 3, createdAt: '2025-01-02T10:00:00.000Z', plan: '# Título\n- item **forte**\n<script>window.__xss=1</script>' },
          { id: 'bad', subject: 5 },
        ])
      );
    });
    await page.goto('/');
    const list = page.getByRole('region', { name: 'Meus planos' });
    await expect(list.getByText('Legado, somente leitura')).toHaveCount(1);
    await list.getByRole('button', { name: /^Plano antigo/ }).click();

    const view = page.locator('section[aria-labelledby="legacy-title"]');
    await expect(view.getByRole('checkbox')).toHaveCount(0);
    await expect(view).toContainText('<script>');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('corrupted storage does not break the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('studyplan-ai:v2', '{corrupted'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Seu roteiro aparece aqui' })).toBeVisible();
  });
});

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`empty state in the ${theme} theme`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: theme, locale: 'pt-BR' });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Seu roteiro aparece aqui' })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await context.close();
    });

    test(`a plan with progress and the calendar panel open in the ${theme} theme`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: theme, locale: 'pt-BR' });
      const page = await context.newPage();
      await withPlan(page, 3);
      await page.getByRole('region', { name: 'Exercícios do dia 1' }).getByRole('checkbox').first().check();
      await page.getByRole('checkbox', { name: 'Marcar dia como concluído' }).first().check();
      await page.getByRole('button', { name: 'Adicionar ao calendário' }).click();
      expect(await axeViolations(page)).toEqual([]);
      await context.close();
    });
  }

  test('the English interface', async ({ page }) => {
    await withPlan(page, 2);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Study plans you can check off');
    expect(await axeViolations(page)).toEqual([]);
  });

  test('the error state', async ({ page }) => {
    await page.goto('/');
    await generate(page, `SCENARIO:500both ${randomUUID().slice(0, 8)}`, 3);
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible({ timeout: 20_000 });
    expect(await axeViolations(page)).toEqual([]);
  });
});
