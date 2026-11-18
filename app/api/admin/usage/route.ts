import { NextResponse, type NextRequest } from 'next/server';
import { authorizeOwner } from '@/lib/admin-auth';
import { jsonError } from '@/lib/api-response';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { estimateCost } from '@/lib/pricing';
import { checkServices } from '@/lib/service-status';
import { RETENTION_DAYS, dayKey, lastDays, readDays, readHealth, readIps } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The owner's view: requests, plans, errors and estimated spend per day, which IPs asked on a given
 * day, and why each provider last failed. Needs `Authorization: Bearer <STATUS_TOKEN>`.
 */
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    await authorizeOwner(request, env);

    const params = request.nextUrl.searchParams;
    const now = new Date();
    const days = Math.min(Math.max(Number(params.get('days')) || 14, 1), RETENTION_DAYS);
    const date = params.get('date') ?? dayKey(now);
    if (!DATE.test(date) || !lastDays(RETENTION_DAYS, now).includes(date)) {
      throw new AppError('INVALID_REQUEST', 'Data inválida.', 400);
    }

    const [usage, ips, health, report] = await Promise.all([
      readDays(env, days, now),
      readIps(env, date),
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
        ips: { date, rows: ips },
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
