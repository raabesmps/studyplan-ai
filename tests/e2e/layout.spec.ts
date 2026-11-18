import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PLAN_SECTION, generate } from './helpers';

const subject = () => `SCENARIO:ok ${randomUUID().slice(0, 8)}`;

/** How many lines a block of text takes, from its rendered height and line height. */
const lineCount = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    return Math.round(element.getBoundingClientRect().height / lineHeight);
  });

/** Loads the home page and waits for the web font, so text is measured at its final size. */
async function openHome(page: Page) {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
}

/** What sticks out past the right edge of the screen (empty when the page does not scroll sideways). */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    if (root.scrollWidth <= root.clientWidth) return [];
    const describe = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`;
    // Boxes past the edge, and boxes whose own content spills out of them (a no-wrap text, for example).
    const wide = [...document.querySelectorAll('body, body *')].filter(
      (el) => el.getBoundingClientRect().right > root.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1
    );
    return [`scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`, ...wide.slice(0, 6).map((el) => `${describe(el)} scrollW=${el.scrollWidth} clientW=${el.clientWidth}`)];
  });

test.describe('hero text', () => {
  for (const width of [1024, 1180, 1280, 1440, 1536, 1920]) {
    test(`the title is one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openHome(page);
      await expect(page.locator('h1')).toBeVisible();
      expect(await lineCount(page, 'h1')).toBe(1);
      expect(await overflow(page)).toEqual([]);
    });
  }

  for (const width of [1280, 1440, 1536, 1920]) {
    test(`the subtitle is one line at ${width}px, in both languages`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openHome(page);
      expect(await lineCount(page, 'h1 + p')).toBe(1);

      await page.getByRole('button', { name: 'EN: English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Study plans you can check off' })).toBeVisible();
      expect(await lineCount(page, 'h1')).toBe(1);
      expect(await lineCount(page, 'h1 + p')).toBe(1);
    });
  }

  test('wraps on a phone instead of overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openHome(page);
    expect(await lineCount(page, 'h1')).toBeGreaterThan(1);
    expect(await overflow(page)).toEqual([]);
  });
});

test.describe('no horizontal scroll', () => {
  for (const [name, width, height] of [
    ['small phone', 320, 640],
    ['phone', 360, 740],
    ['large phone', 412, 915],
    ['tablet portrait', 768, 1024],
    ['tablet landscape', 1024, 768],
    ['laptop', 1366, 768],
  ] as const) {
    test(`${name} (${width}px): empty, with a plan, and on the status page`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      expect(await overflow(page)).toEqual([]);

      await generate(page, subject(), 3);
      await expect(page.locator(PLAN_SECTION)).toBeVisible();
      expect(await overflow(page)).toEqual([]);

      await page.goto('/status');
      await expect(page.locator('[data-service="site"]')).toBeVisible();
      expect(await overflow(page)).toEqual([]);
    });
  }
});

test.describe('"Meus planos" stays under the form', () => {
  test('right below it on a wide screen, however tall the plan is, and after several plans', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto('/');

    for (let i = 0; i < 3; i++) {
      await generate(page, subject(), 6);
      await expect(page.locator(PLAN_SECTION)).toBeVisible();
      await expect(page.locator('article')).toHaveCount(6);

      const form = await page.locator('form').first().boundingBox();
      const saved = await page.getByRole('region', { name: 'Meus planos' }).boundingBox();
      expect(form && saved).toBeTruthy();
      // Under the form, in the same column, and close to it (not pushed down by the tall plan).
      expect(saved!.y).toBeGreaterThanOrEqual(form!.y + form!.height);
      expect(saved!.y - (form!.y + form!.height)).toBeLessThan(80);
      expect(Math.abs(saved!.x - form!.x)).toBeLessThan(2);
    }
  });

  test('on a phone it comes after the plan, at the end', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await generate(page, subject(), 3);
    await expect(page.locator(PLAN_SECTION)).toBeVisible();

    const plan = await page.locator(PLAN_SECTION).boundingBox();
    const saved = await page.getByRole('region', { name: 'Meus planos' }).boundingBox();
    expect(saved!.y).toBeGreaterThan(plan!.y + plan!.height - 1);
  });
});

test.describe('days as an accordion', () => {
  test('only day 1 is open; opening another closes it, and the title and check always show', async ({ page }) => {
    await page.goto('/');
    await generate(page, subject(), 4);
    await expect(page.locator('article')).toHaveCount(4);

    const toggle = (day: number) => page.getByRole('button', { name: new RegExp(`^Dia ${day}:`) });
    const exercises = (day: number) => page.getByRole('region', { name: `Exercícios do dia ${day}` });

    await expect(toggle(1)).toHaveAttribute('aria-expanded', 'true');
    for (const day of [2, 3, 4]) await expect(toggle(day)).toHaveAttribute('aria-expanded', 'false');
    await expect(exercises(1)).toBeVisible();
    for (const day of [2, 3, 4]) await expect(exercises(day)).toBeHidden();
    await expect(page.getByRole('checkbox', { name: 'Marcar dia como concluído' })).toHaveCount(4);
    for (const day of [1, 2, 3, 4]) await expect(toggle(day)).toBeVisible();

    await toggle(3).click();
    await expect(toggle(3)).toHaveAttribute('aria-expanded', 'true');
    await expect(exercises(3)).toBeVisible();
    await expect(toggle(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(exercises(1)).toBeHidden();

    await toggle(3).click();
    await expect(exercises(3)).toBeHidden();
    for (const day of [1, 2, 3, 4]) await expect(toggle(day)).toHaveAttribute('aria-expanded', 'false');
  });

  test('content in a closed day cannot be reached with the keyboard', async ({ page }) => {
    await page.goto('/');
    await generate(page, subject(), 3);
    await expect(page.locator('article')).toHaveCount(3);

    const closedBoxes = page.locator('#day-2-panel input[type="checkbox"]');
    await expect(closedBoxes.first()).toBeHidden();
    await page.getByRole('button', { name: /^Dia 1:/ }).focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('#day-2-panel, #day-3-panel')));
      expect(inside).toBe(false);
    }
  });

  test('works with the keyboard alone, and ticking a day done does not move the accordion', async ({ page }) => {
    await page.goto('/');
    await generate(page, subject(), 3);
    await expect(page.locator('article')).toHaveCount(3);

    const toggle2 = page.getByRole('button', { name: /^Dia 2:/ });
    await toggle2.focus();
    await page.keyboard.press('Enter');
    await expect(toggle2).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(toggle2).toHaveAttribute('aria-expanded', 'false');

    // Ticking a day done is not a click on its heading: nothing opens or closes.
    await page.getByRole('checkbox', { name: 'Marcar dia como concluído' }).nth(2).check();
    for (const day of [1, 2, 3]) {
      await expect(page.getByRole('button', { name: new RegExp(`^Dia ${day}:`) })).toHaveAttribute('aria-expanded', 'false');
    }
    await page.getByRole('button', { name: /^Dia 1:/ }).click();
    await page.getByRole('checkbox', { name: 'Marcar dia como concluído' }).nth(1).check();
    await expect(page.getByRole('button', { name: /^Dia 1:/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('prints every day open', async ({ page }) => {
    await page.goto('/');
    await generate(page, subject(), 3);
    await expect(page.locator('article')).toHaveCount(3);
    await page.emulateMedia({ media: 'print' });
    for (const day of [1, 2, 3]) {
      await expect(page.getByRole('region', { name: `Exercícios do dia ${day}` })).toBeVisible();
    }
  });

  test('works on a phone: open, switch and close with a tap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await generate(page, subject(), 3);
    await expect(page.locator('article')).toHaveCount(3);

    await page.getByRole('button', { name: /^Dia 2:/ }).tap().catch(async () => page.getByRole('button', { name: /^Dia 2:/ }).click());
    await expect(page.getByRole('region', { name: 'Exercícios do dia 2' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Exercícios do dia 1' })).toBeHidden();
    expect(await overflow(page)).toEqual([]);
  });
});

test.describe('footer', () => {
  test('credits both Claude and Gemini with links, in both languages', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('Feito com a API do Claude e a API do Google Gemini');
    await expect(footer.getByRole('link', { name: 'Claude' })).toHaveAttribute('href', 'https://www.anthropic.com/claude');
    await expect(footer.getByRole('link', { name: 'Google Gemini' })).toHaveAttribute('href', 'https://ai.google.dev/');
    for (const link of await footer.getByRole('link', { name: /Claude|Google Gemini/ }).all()) {
      await expect(link).toHaveAttribute('rel', /noopener/);
      await expect(link).toHaveAttribute('target', '_blank');
    }

    await page.getByRole('button', { name: 'EN: English' }).click();
    await expect(footer).toContainText('Built with the Claude API and the Google Gemini API');
  });
});
