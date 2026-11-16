import { NextRequest, NextResponse } from 'next/server';
import { generateStudyPlan } from '@/lib/gemini';
import { AppError, toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}

export async function POST(request: NextRequest) {
  try {
    let payload: { subject?: string; hoursPerDay?: number; days?: number };
    try {
      payload = await request.json();
    } catch {
      throw invalid('Requisição inválida.');
    }
    const { subject, hoursPerDay, days } = payload;

    if (!subject || !hoursPerDay) {
      throw invalid('Assunto e horas por dia são obrigatórios');
    }

    if (hoursPerDay <= 0 || hoursPerDay > 24) {
      throw invalid('Horas por dia deve ser entre 1 e 24');
    }

    const planDays = days || 7;
    if (planDays < 1 || planDays > 30) {
      throw invalid('Número de dias deve ser entre 1 e 30');
    }

    logger.info(`Generating plan: ${subject} - ${hoursPerDay}h/day - ${planDays} days`);

    const plan = await generateStudyPlan(subject, hoursPerDay, planDays);

    return NextResponse.json({ plan });
  } catch (error: unknown) {
    logger.error('Failed to generate plan:', error);
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
