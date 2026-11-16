'use client';

import { useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { Sparkles, BookOpen, RotateCw } from 'lucide-react';
import StudyPlanForm from '@/components/StudyPlanForm';
import StudyPlanDisplay from '@/components/StudyPlanDisplay';
import LegacyPlanView from '@/components/LegacyPlanView';
import PlanSkeleton from '@/components/PlanSkeleton';
import SavedPlans from '@/components/SavedPlans';
import { logger } from '@/lib/logger';
import { Plan, type PlanRequest } from '@/lib/schema';
import { addPlan, removeLegacyPlan, removePlan, type SavedPlan } from '@/lib/plans-store';
import { usePlans } from '@/lib/use-plans';

const NETWORK_ERROR = 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
const GENERIC_ERROR = 'Erro ao gerar plano de estudos. Tente novamente.';

export default function Home() {
  const { plans, legacy } = usePlans();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<PlanRequest | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // undefined = follow the most recently used plan; null = the user closed the plan view.
  const [selection, setSelection] = useState<string | null | undefined>(undefined);

  const latestId = plans.reduce<SavedPlan | null>(
    (best, p) => (best === null || p.updatedAt > best.updatedAt ? p : best),
    null
  )?.id ?? null;
  const activeId = selection === undefined ? latestId : selection;
  const activePlan = plans.find((p) => p.id === activeId);
  const activeLegacy = legacy.find((p) => p.id === activeId);

  const handleGenerate = async (input: PlanRequest) => {
    setLastInput(input);
    setLoading(true);
    setError(null);
    setAnnouncement('Gerando plano de estudos…');

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error?.message || GENERIC_ERROR);
      }

      const parsed = Plan.safeParse(data?.plan);
      if (!parsed.success) throw new Error(GENERIC_ERROR);

      const now = new Date().toISOString();
      const saved: SavedPlan = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        hoursPerDay: input.hoursPerDay,
        language: input.language,
        plan: parsed.data,
        completed: {},
      };
      addPlan(saved);
      setSelection(saved.id);
      setAnnouncement(`Plano de ${saved.plan.subject} gerado com ${saved.plan.days.length} dias.`);
    } catch (err: unknown) {
      logger.error('Generate request failed:', err);
      const message = err instanceof TypeError ? NETWORK_ERROR : err instanceof Error ? err.message : GENERIC_ERROR;
      setError(message);
      setAnnouncement('Não foi possível gerar o plano.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, isLegacy: boolean) => {
    if (isLegacy) removeLegacyPlan(id);
    else removePlan(id);
    if (activeId === id) setSelection(null);
  };

  const hasAnyPlan = plans.length > 0 || legacy.length > 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <main className="container mx-auto px-4 py-8 sm:py-12">
          <motion.header
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center sm:mb-12"
          >
            <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-3">
                <Sparkles className="h-8 w-8 text-white" aria-hidden="true" />
              </div>
              <h1 className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
                StudyPlan AI
              </h1>
            </div>
            <p className="mx-auto max-w-2xl text-lg text-slate-300 sm:text-xl">
              Crie um plano de estudos personalizado, de 1 a 30 dias, sobre qualquer assunto que você queira aprender
            </p>
          </motion.header>

          <div className="mx-auto max-w-4xl">
            <StudyPlanForm onGenerate={handleGenerate} loading={loading} />

            <div role="status" aria-live="polite" className="sr-only">
              {announcement}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-red-700 bg-red-900/30 p-4 text-center text-red-200"
              >
                <p>{error}</p>
                {lastInput && (
                  <button
                    type="button"
                    onClick={() => handleGenerate(lastInput)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                    Tentar de novo
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div aria-busy="true">
                <PlanSkeleton />
              </div>
            ) : activePlan ? (
              <StudyPlanDisplay key={activePlan.id} saved={activePlan} onClose={() => setSelection(null)} />
            ) : activeLegacy ? (
              <LegacyPlanView plan={activeLegacy} onClose={() => setSelection(null)} />
            ) : (
              !hasAnyPlan && (
                <section
                  aria-labelledby="empty-title"
                  className="mt-8 rounded-2xl border border-dashed border-slate-600 p-8 text-center"
                >
                  <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
                  <h2 id="empty-title" className="text-xl font-semibold text-white">
                    Nenhum plano ainda
                  </h2>
                  <p className="mt-1 text-slate-300">
                    Informe o que você quer aprender acima e gere o seu primeiro plano.
                  </p>
                </section>
              )
            )}

            <SavedPlans
              plans={plans}
              legacy={legacy}
              activeId={activeId ?? null}
              onSelect={setSelection}
              onDelete={handleDelete}
            />
          </div>

          <footer className="mt-16 text-center text-sm text-slate-400">
            Powered by{' '}
            <a
              href="https://ai.google.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 underline underline-offset-2 hover:text-blue-200"
            >
              Google Gemini API
            </a>
          </footer>
        </main>
      </div>
    </MotionConfig>
  );
}
