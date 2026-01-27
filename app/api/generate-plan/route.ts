import { NextRequest, NextResponse } from 'next/server';
import { generateStudyPlan } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { subject, hoursPerDay, days } = await request.json();

    if (!subject || !hoursPerDay) {
      return NextResponse.json(
        { error: 'Assunto e horas por dia são obrigatórios' },
        { status: 400 }
      );
    }

    if (hoursPerDay <= 0 || hoursPerDay > 24) {
      return NextResponse.json(
        { error: 'Horas por dia deve ser entre 1 e 24' },
        { status: 400 }
      );
    }

    const planDays = days || 7;
    if (planDays < 1 || planDays > 30) {
      return NextResponse.json(
        { error: 'Número de dias deve ser entre 1 e 30' },
        { status: 400 }
      );
    }

    console.log(`🚀 Gerando plano de estudos: ${subject} - ${hoursPerDay}h/dia - ${planDays} dias`);

    const plan = await generateStudyPlan(subject, hoursPerDay, planDays);

    return NextResponse.json({ plan });
  } catch (error: unknown) {
    console.error('❌ Erro ao gerar plano:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    if (errorMessage.includes('API_KEY')) {
      return NextResponse.json(
        { error: 'API Key não configurada. Verifique seu arquivo .env.local' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: errorMessage || 'Erro ao gerar plano de estudos. Tente novamente.' },
      { status: 500 }
    );
  }
}
