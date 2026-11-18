import { NextResponse, type NextRequest } from 'next/server';
import { authorizeOwner } from '@/lib/admin-auth';
import { jsonError } from '@/lib/api-response';
import { getEnv } from '@/lib/env';
import { estimateCost } from '@/lib/pricing';
import { checkServices } from '@/lib/service-status';
import { RETENTION_DAYS, readDays, readHealth } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * The owner's view: requests, plans, errors and estimated spend per day, and why each provider last
 * failed. Nothing in it identifies a visitor. Needs `Authorization: Bearer <STATUS_TOKEN>`.
 */
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    await authorizeOwner(request, env);

    const params = request.nextUrl.searchParams;
    const now = new Date();
    const days = Math.min(Math.max(Number(params.get('days')) || 14, 1), RETENTION_DAYS);

    const [usage, health, report] = await Promise.all([
      readDays(env, days, now),
      readHealth(env),
      checkServices(env, { fresh: params.get('fresh') === '1' }),
    ]);

    const sum = (pick: (day: (typeof usage.days)[number]) => number) => usage.days.reduce((total, day) => total + pick(day), 0);
    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        retentionDays: RETENTION_DAYS,
        dailyLimit: env.DAILY_LIMIT,
        usedToday: usage.usedToday,
        claudeModel: env.ANTHROPIC_MODEL,
        // False when the model has no entry in the price table: the spend is then a rough guess.
        priceKnown: estimateCost('claude', env.ANTHROPIC_MODEL, 0, 0).known,
        days: usage.days,
        totals: {
          requests: sum((d) => d.requests),
          plans: sum((d) => d.plans),
          samples: sum((d) => d.samples),
          rateLimited: sum((d) => d.rateLimited),
          errors: sum((d) => d.errors),
          costUsd: sum((d) => d.costUsd),
        },
        health,
        checkedAt: report.checkedAt,
        services: report.services,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return jsonError(error, 'Owner usage request refused:');
  }
}
