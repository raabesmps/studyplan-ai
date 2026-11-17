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
        new Promise<{ ran: boolean; blockedBy: string | null }>((resolve) => {
          let blockedBy: string | null = null;
          document.addEventListener('securitypolicyviolation', (event) => (blockedBy = event.violatedDirective));
          // What an XSS hole would let an attacker write into the page.
          document.body.insertAdjacentHTML('beforeend', '<img src="x:" onerror="window.__injected = true">');
          setTimeout(() => resolve({ ran: Boolean((window as { __injected?: boolean }).__injected), blockedBy }), 300);
        })
    );
    expect(result.ran).toBe(false);
    expect(result.blockedBy).toMatch(/script-src/);
  });
});
