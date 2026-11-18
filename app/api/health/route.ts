import { NextResponse } from 'next/server';

// Never prerendered or cached: an uptime monitor must reach the running app, not a stored copy.
export const dynamic = 'force-dynamic';

/** Liveness only: says the app is up and answering. It touches no other service (see /api/status). */
export function GET() {
  return NextResponse.json({ status: 'ok', time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
