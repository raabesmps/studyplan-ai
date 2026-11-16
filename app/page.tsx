'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import EmptyPlan from '@/components/EmptyPlan';
import LegacyPlanView from '@/components/LegacyPlanView';
import PlanSkeleton from '@/components/PlanSkeleton';
import SavedPlans from '@/components/SavedPlans';
import StudyPlanDisplay from '@/components/StudyPlanDisplay';
import StudyPlanForm from '@/components/StudyPlanForm';
import { logger } from '@/lib/logger';
import { addPlan, removeLegacyPlan, removePlan, type SavedPlan } from '@/lib/plans-store';
import { Plan, type PlanRequest } from '@/lib/schema';
import { useT } from '@/lib/use-locale';
import { usePlans } from '@/lib/use-plans';
import type { Messages } from '@/lib/i18n';

type ErrorKind = keyof Messages['errors'];
type Announcement = { kind: 'generating' } | { kind: 'generated'; subject: string; days: number } | { kind: 'failed' };

/** Failure that carries a stable code, so the message can follow the interface language. */
class GenerateError extends Error {
  constructor(readonly kind: ErrorKind) {
    super(kind);
  }
}

function isErrorKind(value: unknown, errors: Messages['errors']): value is ErrorKind {
  return typeof value === 'string' && value in errors;
}

export default function Home() {
  const { t } = useT();
  const { plans, legacy } = usePlans();
  const [loading, setLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [lastInput, setLastInput] = useState<PlanRequest | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // undefined = follow the most recently used plan; null = the user closed the plan view.
  const [selection, setSelection] = useState<string | null | undefined>(undefined);

  const latestId =
    plans.reduce<SavedPlan | null>((best, p) => (best === null || p.updatedAt > best.updatedAt ? p : best), null)
      ?.id ?? null;
  const activeId = selection === undefined ? latestId : selection;
  const activePlan = plans.find((p) => p.id === activeId);
  const activeLegacy = legacy.find((p) => p.id === activeId);

  const handleGenerate = async (input: PlanRequest) => {
    setLastInput(input);
    setLoading(true);
    setErrorKind(null);
    setAnnouncement({ kind: 'generating' });

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const code = data?.error?.code;
        throw new GenerateError(isErrorKind(code, t.errors) ? code : 'generic');
      }

      const parsed = Plan.safeParse(data?.plan);
      if (!parsed.success) throw new GenerateError('INVALID_RESPONSE');

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
      setAnnouncement({ kind: 'generated', subject: saved.plan.subject, days: saved.plan.days.length });
    } catch (err: unknown) {
      logger.error('Generate request failed:', err);
      setErrorKind(err instanceof GenerateError ? err.kind : err instanceof TypeError ? 'network' : 'generic');
      setAnnouncement({ kind: 'failed' });
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

  const announcementText = !announcement
    ? ''
    : announcement.kind === 'generating'
      ? t.announce.generating
      : announcement.kind === 'generated'
        ? t.announce.generated(announcement.subject, announcement.days)
        : t.announce.failed;

  return (
    <>
      <a href="#main" className="skip-link">
        {t.skipToContent}
      </a>
      <AppHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-8 max-w-3xl sm:mb-12">
          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t.hero.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{t.hero.text}</p>
        </div>

        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <StudyPlanForm onGenerate={handleGenerate} loading={loading} />
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div role="status" aria-live="polite" className="sr-only">
              {announcementText}
            </div>

            {errorKind && (
              <div
                role="alert"
                className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-danger bg-surface p-4"
              >
                <p className="min-w-0 flex-1 font-semibold">{t.errors[errorKind]}</p>
                {lastInput && (
                  <button
                    type="button"
                    onClick={() => handleGenerate(lastInput)}
                    disabled={loading}
                    className="btn btn-secondary px-3.5 py-2 text-sm"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                    {t.retry}
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
              !hasAnyPlan && <EmptyPlan />
            )}
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <SavedPlans
              plans={plans}
              legacy={legacy}
              activeId={activeId ?? null}
              onSelect={setSelection}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted sm:px-6">
        <a
          href="https://ai.google.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-pen underline underline-offset-2 hover:no-underline"
        >
          {t.footer.poweredBy}
        </a>
      </footer>
    </>
  );
}
