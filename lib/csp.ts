/**
 * Content-Security-Policy for the pages. Scripts and styles run only with the per-request nonce, so an
 * injected tag or inline handler has nothing to execute with. The browser talks to this origin only
 * (the AI providers are called from the server), and nothing may frame the app.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced framework script load its own chunks. React needs eval in dev only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Dev injects <style> tags with HMR; in production only nonced styles run.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // style="..." attributes (the staggered-entrance --i custom property) cannot carry a nonce.
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** A fresh, unguessable value for every request. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
