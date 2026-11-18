/**
 * The visitor's address as the platform forwards it (the first hop of `x-forwarded-for`).
 * Only trustworthy behind a proxy that sets the header itself, as Vercel does.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
