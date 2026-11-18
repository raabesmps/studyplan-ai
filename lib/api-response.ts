import { NextResponse } from 'next/server';
import { toErrorBody } from './errors';
import { logger } from './logger';

/** A safe, uncacheable JSON error for any thrown value: only the code and a public message get out. */
export function jsonError(error: unknown, context = 'Request failed:'): NextResponse {
  logger.error(context, error);
  const { status, body } = toErrorBody(error);
  const headers: HeadersInit = { 'Cache-Control': 'no-store' };
  if (body.error.retryAfter !== undefined) headers['Retry-After'] = String(body.error.retryAfter);
  return NextResponse.json(body, { status, headers });
}
