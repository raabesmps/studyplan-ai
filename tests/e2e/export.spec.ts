import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PLAN_SECTION, generate } from './helpers';

const subject = () => `SCENARIO:ok ${randomUUID().slice(0, 8)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function openPlan(page: import('@playwright/test').Page, days = 4) {
  const s = subject();
  await page.goto('/');
  await generate(page, s, days);
  await expect(page.locator(PLAN_SECTION)).toBeVisible();
  return s;
}

test('downloads a markdown file that mirrors the progress', async ({ page }) => {
  const s = await openPlan(page);
  const day1 = page.getByRole('region', { name: 'Exercícios do dia 1' }).getByRole('checkbox');
  await day1.nth(0).check();
  await day1.nth(1).check();
  // Only day 1 starts open: open day 3 to tick one of its exercises.
  await page.getByRole('button', { name: /^Dia 3:/ }).click();
  await page.getByRole('region', { name: 'Exercícios do dia 3' }).getByRole('checkbox').first().check();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar .md' }).click()]);
  expect(download.suggestedFilename()).toBe(`${slug(s)}.md`);
  const md = await readFile((await download.path())!, 'utf8');

  expect(md.startsWith(`# ${s}\n`)).toBe(true);
  expect(md.match(/^## Dia \d/gm)).toHaveLength(4);
  expect(md.split('## Dia 1')[1].split('## Dia 2')[0].match(/- \[x\]/g)).toHaveLength(2);
  expect(md.split('## Dia 3')[1].split('## Dia 4')[0].match(/- \[x\]/g)).toHaveLength(1);
  expect(md.split('## Dia 3')[1].split('## Dia 4')[0].match(/- \[ \]/g)).toHaveLength(1);
  expect(md).not.toMatch(/https?:\/\//);
});

test('downloads a calendar file with one event per day at the chosen date and time', async ({ page }) => {
  const s = await openPlan(page, 4);
  const toggle = page.getByRole('button', { name: 'Adicionar ao calendário' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.getByLabel('Primeiro dia').fill('2026-12-01');
  await page.getByLabel('Horário', { exact: true }).fill('08:15');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo .ics' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${slug(s)}.ics`);
  const ics = await readFile((await download.path())!, 'utf8');

  expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(/(^|[^\r])\n/.test(ics)).toBe(false);
  const unfolded = ics.replace(/\r\n /g, '');
  expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  expect([...unfolded.matchAll(/DTSTART:(\S+)/g)].map((m) => m[1])).toEqual([
    '20261201T081500',
    '20261202T081500',
    '20261203T081500',
    '20261204T081500',
  ]);
  expect([...unfolded.matchAll(/DTEND:(\S+)/g)].map((m) => m[1])[0]).toBe('20261201T094500');
  expect(unfolded).not.toMatch(/TZID|DTSTART;/); // floating: same wall-clock time in any calendar
  expect(new Set([...unfolded.matchAll(/UID:(\S+)/g)].map((m) => m[1])).size).toBe(4);
  expect(unfolded).toContain('Objetivo: Objetivo do dia 1.');
  expect(unfolded).toContain('Exercício um');
});

test('Enter in the calendar form downloads the file (keyboard)', async ({ page }) => {
  await openPlan(page, 2);
  await page.getByRole('button', { name: 'Adicionar ao calendário' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Primeiro dia').press('Enter')]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});

test('copies the markdown to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPlan(page, 2);
  await page.getByRole('button', { name: 'Copiar como Markdown' }).click();
  await expect(page.getByRole('button', { name: 'Copiado!' })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.replace(/\r\n/g, '\n')).toContain('## Dia 1:');
});

test('prints black on white without the interface chrome, even with the dark theme on', async ({ page }) => {
  await openPlan(page, 3);
  await page.getByRole('button', { name: 'Mudar para o tema escuro' }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(13, 16, 23)');

  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.locator('#plan-title').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
  await expect(page.locator('#plan-title')).toBeVisible();
  await expect(page.locator('article:visible')).toHaveCount(3);
  for (const hidden of [page.locator('#subject'), page.getByRole('button', { name: 'Baixar .md' }), page.getByRole('heading', { name: 'Meus planos' }), page.locator('footer')]) {
    await expect(hidden).toBeHidden();
  }
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(5000);
});
