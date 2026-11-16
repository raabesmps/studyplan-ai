import { NextRequest, NextResponse } from 'next/server';
import { generateStudyPlan } from '@/lib/gemini';
import { AppError, toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { PlanRequest } from '@/lib/schema';

export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new AppError('INVALID_REQUEST', 'Requisição inválida.', 400);
    }

    const parsed = PlanRequest.safeParse(payload);
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'Requisição inválida.', 400);
    }
    const input = parsed.data;

    logger.info(`Generating plan: ${input.hoursPerDay}h/day - ${input.days} days - ${input.level}`);

    const plan = await generateStudyPlan(input);

    return NextResponse.json({ plan });
  } catch (error: unknown) {
    logger.error('Failed to generate plan:', error);
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
