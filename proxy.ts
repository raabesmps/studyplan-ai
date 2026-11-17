import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@/lib/csp';

/** Gives every page response its own CSP nonce (Next.js reads it from the request header to tag its scripts). */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: the API returns JSON and static files need no policy. Prefetches reuse the page's.
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
