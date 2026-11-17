import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const FAKE_GEMINI = 'http://localhost:4010';

export const PLAN_SECTION = 'section[aria-labelledby="plan-title"]';
export const GENERATING_STATUS = 'section[aria-labelledby="generating-title"] > p';
/** Next.js adds its own (empty) role=alert route announcer; ours is the one with content. */
export const ALERT = '[role="alert"]:not(#__next-route-announcer__)';

export interface UpstreamCall {
  provider: 'claude' | 'gemini';
  subject: string;
  model: string;
  scenario: string;
  days: number;
  isRetry: boolean;
  closedEarly: boolean;
  // Gemini calls
  keyInHeader?: boolean;
  keyInUrl?: boolean;
  thinking?: unknown;
  // Claude calls
  authorized?: boolean;
  effort?: string | null;
  structured?: string | null;
}

/** What the app sent to the (fake) Gemini for a given subject. Subjects must be unique per test. */
export async function upstreamCalls(request: APIRequestContext, subject: string): Promise<UpstreamCall[]> {
  const response = await request.get(`${FAKE_GEMINI}/__log`);
  const all = (await response.json()) as UpstreamCall[];
  return all.filter((call) => call.subject === subject);
}

export async function generate(page: Page, subject: string, days: number, button = /Gerar plano|Generate plan/) {
  await page.locator('#subject').fill(subject);
  await page.locator('#days').fill(String(days));
  await page.getByRole('button', { name: button }).click();
}

/** Every distinct status text shown while generating, in order, until `done` appears. */
export async function collectStatuses(page: Page, done: string, timeoutMs = 30_000): Promise<string[]> {
  const seen: string[] = [];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await page.locator(GENERATING_STATUS).textContent({ timeout: 200 }).catch(() => null);
    if (text && seen[seen.length - 1] !== text) seen.push(text);
    if (await page.locator(done).count()) break;
    await page.waitForTimeout(30);
  }
  return seen;
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
