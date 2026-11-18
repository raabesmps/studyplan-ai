import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PLAN_SECTION, generate } from './helpers';

test.describe('security headers', () => {
  test('pages carry the static headers and a nonce-based CSP', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-powered-by']).toBeUndefined();

    const csp = headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });

  test('every page request gets a different nonce, and the page uses it', async ({ request }) => {
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)![1];
    const first = await request.get('/');
    const second = await request.get('/');
    const [a, b] = [nonceOf(first.headers()['content-security-policy']), nonceOf(second.headers()['content-security-policy'])];
    expect(a).not.toBe(b);

    const html = await first.text();
    expect(html).toContain(`nonce="${a}"`);
    expect(html).not.toContain(`nonce="${b}"`);
  });

  test('the API answers with nosniff and no CSP needed', async ({ request }) => {
    const response = await request.post('/api/generate-plan', { data: { subject: '' } });
    expect(response.status()).toBe(400);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('the CSP does not break the app', () => {
  test('hydrates, applies the saved theme before paint and generates a plan with no policy violations', async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(message.text())) violations.push(message.text());
    });
    page.on('pageerror', (error) => violations.push(error.message));
    await page.addInitScript(() => localStorage.setItem('studyplan-ai:theme', 'dark'));

    await page.goto('/');
    // Set by the nonced inline script, before React hydrates.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await generate(page, `SCENARIO:ok ${randomUUID().slice(0, 8)}`, 2);
    await expect(page.locator(PLAN_SECTION)).toBeVisible();
    await expect(page.locator('article')).toHaveCount(2); // the staggered cards use style="--i"

    expect(violations).toEqual([]);
  });

  test('injected markup with an inline event handler cannot run code', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(
      () =>
        new Promise<{ ran: boolean; blockedBy: string[] }>((resolve) => {
          const blockedBy: string[] = [];
          document.addEventListener('securitypolicyviolation', (event) => blockedBy.push(event.violatedDirective));
          // What an XSS hole would let an attacker write into the page.
          document.body.insertAdjacentHTML('beforeend', '<img src="data:," onerror="window.__injected = true">');
          setTimeout(() => resolve({ ran: Boolean((window as { __injected?: boolean }).__injected), blockedBy }), 300);
        })
    );
    expect(result.ran).toBe(false);
    expect(result.blockedBy.some((directive) => directive.startsWith('script-src'))).toBe(true);
  });
});

test.describe('who may call the API', () => {
  const body = { subject: 'x', hoursPerDay: 1, days: 1, level: 'beginner', language: 'pt' };

  test('refuses bodies that are not declared as JSON (a cross-site page could send these without a preflight)', async ({
    request,
  }) => {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded']) {
      const response = await request.post('/api/generate-plan', {
        headers: { 'content-type': contentType },
        data: JSON.stringify(body),
      });
      expect(response.status(), contentType).toBe(415);
    }
  });

  test('refuses requests a browser marks as cross-site or that come from another origin', async ({ request }) => {
    const crossSite = await request.post('/api/generate-plan', { data: body, headers: { 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status()).toBe(403);

    const foreign = await request.post('/api/generate-plan', { data: body, headers: { origin: 'https://evil.example' } });
    expect(foreign.status()).toBe(403);
  });

  test('accepts the site\'s own origin', async ({ request, baseURL }) => {
    const own = await request.post('/api/generate-plan', { data: { ...body, days: 99 }, headers: { origin: baseURL! } });
    expect(own.status()).toBe(400); // got past the origin check and failed validation instead
  });

  test('API responses are not cacheable and not embeddable by other origins', async ({ request }) => {
    const response = await request.post('/api/generate-plan', { data: { subject: '' } });
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('publishes a security.txt', async ({ request }) => {
    const response = await request.get('/.well-known/security.txt');
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/^Contact: https:\/\/github\.com\/raabesmps\/studyplan-ai\/security\/advisories\/new$/m);
  });

  test('the CSP also blocks frames, media and workers', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'];
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("media-src 'none'");
    expect(csp).toContain("worker-src 'none'");
  });
});

test.describe('a malicious plan from the model', () => {
  test('is cleaned before it reaches the page, the storage or the Markdown export', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('studyplan-ai:locale', 'pt'));
    await page.goto('/');
    await generate(page, `SCENARIO:xss ${randomUUID().slice(0, 8)}`, 2);
    await expect(page.locator(PLAN_SECTION)).toBeVisible();
    await expect(page.locator('article')).toHaveCount(2);

    // Nothing the model wrote became an element, and nothing ran.
    const injected = await page.evaluate(() => ({
      ran: (window as unknown as { __xss?: number }).__xss ?? null,
      elements: document.querySelectorAll('article img, article script, article iframe, article b, [onerror], [onload]').length,
      jsLinks: Array.from(document.querySelectorAll('a')).filter((a) => a.href.startsWith('javascript:')).length,
    }));
    expect(injected).toEqual({ ran: null, elements: 0, jsLinks: 0 });

    const day1 = page.locator('article').first();
    await expect(day1.getByRole('heading', { name: 'Fundamentos' })).toBeVisible();
    await expect(day1).toContainText('Tópico seguro');
    await expect(day1).toContainText('Exercício limpo');
    await expect(day1).not.toContainText('<');

    // The saved copy is clean too.
    const stored = await page.evaluate(() => localStorage.getItem('studyplan-ai:v2') ?? '');
    expect(stored).not.toMatch(/<(img|script|iframe|svg|b|a)\b|onerror|onload|\u202e/i);

    // And so is the Markdown a reader may open in another viewer.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar .md' }).click()]);
    const { readFile } = await import('node:fs/promises');
    const markdown = await readFile((await download.path())!, 'utf8');
    expect(markdown).not.toMatch(/<(img|script|iframe|svg|b|a)\b|onerror|onload|‮|​/i);
    // Brackets are escaped, so a viewer shows the text instead of making a link out of it.
    expect(markdown).toContain(String.raw`Link \[clique\](javascript:window.__xss=3)`);
  });
});
