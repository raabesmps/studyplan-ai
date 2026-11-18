import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-response';
import { getEnv } from '@/lib/env';
import { checkServices } from '@/lib/service-status';
import { dailyCounterKey, dayKey } from '@/lib/usage';
import { pipeline } from '@/lib/upstash';

export const dynamic = 'force-dynamic';

/**
 * Public status: is each service this app depends on reachable? Only the state and the round trip are
 * public; why a service is down, the usage and the spend are for the owner (/api/admin/usage).
 */
export async function GET() {
  try {
    const env = getEnv();
    const report = await checkServices(env);
    const redisUp = report.services.some((service) => service.id === 'redis' && service.status === 'up');

    // Whether visitors are currently being served sample plans because the daily budget is spent.
    let dailyLimitReached: boolean | null = null;
    if (redisUp) {
      try {
        const [used] = await pipeline(env, [['GET', dailyCounterKey(dayKey(new Date()))]]);
        dailyLimitReached = Number(used) >= env.DAILY_LIMIT;
      } catch {
        dailyLimitReached = null;
      }
    }

    return NextResponse.json(
      {
        checkedAt: report.checkedAt,
        site: { status: 'up' },
        services: report.services.map(({ id, status, latencyMs }) => ({ id, status, latencyMs })),
        dailyLimitReached,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return jsonError(error, 'Status check failed:');
  }
}
