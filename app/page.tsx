'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import StudyPlanForm from '@/components/StudyPlanForm';
import StudyPlanDisplay from '@/components/StudyPlanDisplay';
import SavedPlans from '@/components/SavedPlans';
import { logger } from '@/lib/logger';
import { planToMarkdown } from '@/lib/export';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planData, setPlanData] = useState<{
    subject: string;
    hoursPerDay: number;
    days: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (subject: string, hoursPerDay: number, days: number) => {
    setLoading(true);
    setError(null);
    setPlan(null);
    setPlanData(null);

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, hoursPerDay, days }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Erro ao gerar plano de estudos');
      }

      // Temporary bridge until the card UI replaces markdown rendering.
      setPlan(planToMarkdown(data.plan));
      setPlanData({ subject, hoursPerDay, days });
    } catch (err: unknown) {
      logger.error('Generate request failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar plano de estudos. Tente novamente.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              StudyPlan AI
            </h1>
          </div>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Crie um plano de estudos personalizado de 7 dias baseado em qualquer assunto que você queira aprender
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          <StudyPlanForm onGenerate={handleGenerate} loading={loading} />

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-center"
            >
              ⚠️ {error}
            </motion.div>
          )}

          {plan && planData && (
            <StudyPlanDisplay
              plan={plan}
              subject={planData.subject}
              hoursPerDay={planData.hoursPerDay}
              days={planData.days}
            />
          )}

          <SavedPlans />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-16 text-center text-slate-500 text-sm"
        >
          Powered by{' '}
          <a
            href="https://ai.google.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Google Gemini API
          </a>
        </motion.div>
      </div>
    </div>
  );
}
