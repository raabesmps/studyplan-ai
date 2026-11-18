import { AppError } from './errors';

const REFUSED = 'Requisição inválida.';

/** The host the visitor typed, as the platform forwards it (a proxy may rewrite `Host`). */
function ownHost(headers: Headers): string | null {
  return headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
}

/**
 * Refuses requests that did not come from this app's own pages.
 *
 * - The body must be declared as JSON. Browsers send `text/plain` or form bodies cross-site without
 *   a CORS preflight, so requiring JSON means a page on another site cannot make a visitor's browser
 *   call the API (which would spend the visitor's quota and our budget).
 * - `Sec-Fetch-Site` and `Origin`, which browsers set and pages cannot forge, must point at this
 *   site when present. Non-browser clients (curl, tests) send neither and are still allowed: the
 *   rate limiter is what bounds them.
 */
export function assertSameOriginJson(request: Request): void {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    throw new AppError('INVALID_REQUEST', REFUSED, 415);
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new AppError('INVALID_REQUEST', REFUSED, 403);
  }

  const origin = request.headers.get('origin');
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // "null" (sandboxed frames, file:// pages) and malformed values never match.
    }
    if (!originHost || originHost !== ownHost(request.headers)) {
      throw new AppError('INVALID_REQUEST', REFUSED, 403);
    }
  }
}
