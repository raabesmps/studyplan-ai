'use client';

import { Calendar, Clock, GraduationCap, X } from 'lucide-react';
import DayCard from './DayCard';
import ExportActions from './ExportActions';
import ProgressBar from './ProgressBar';
import { isDayComplete, toggleDay, toggleExercise } from '@/lib/progress';
import { updateProgress, type SavedPlan } from '@/lib/plans-store';
import type { Day } from '@/lib/schema';
import { useT } from '@/lib/use-locale';

interface StudyPlanDisplayProps {
  saved: SavedPlan;
  onClose?: () => void;
}

export default function StudyPlanDisplay({ saved, onClose }: StudyPlanDisplayProps) {
  const { t } = useT();
  const { plan, completed } = saved;

  const onToggleExercise = (day: Day, index: number) =>
    updateProgress(saved.id, toggleExercise(completed, day, index));
  const onToggleDay = (day: Day) => updateProgress(saved.id, toggleDay(completed, day));

  return (
    <section aria-labelledby="plan-title">
      <div className="flex items-start justify-between gap-3">
        <h2
          id="plan-title"
          className="min-w-0 text-balance text-3xl font-extrabold leading-tight tracking-tight break-words sm:text-4xl"
        >
          {plan.subject}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t.plan.close}
            className="grid h-10 w-10 shrink-0 place-content-center rounded-lg border-[1.5px] border-edge bg-surface hover:border-ink print:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
        <li className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {t.plan.hoursPerDay(saved.hoursPerDay)}
        </li>
        <li className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          {t.plan.daysCount(plan.days.length)}
        </li>
        <li className="flex items-center gap-1.5">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
          {t.levels[plan.level]}
        </li>
      </ul>

      <div className="mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <ProgressBar days={plan.days.map((d) => isDayComplete(completed, d))} />
        <div className="mt-4 space-y-3 print:hidden">
          <ExportActions saved={saved} />
          <p className="text-sm text-muted">{t.plan.autosaved}</p>
        </div>
      </div>

      <ol className="mt-8 list-none p-0">
        {plan.days.map((day, i) => (
          <DayCard
            key={day.day}
            day={day}
            index={i}
            isLast={i === plan.days.length - 1}
            done={completed[String(day.day)] ?? []}
            complete={isDayComplete(completed, day)}
            onToggleExercise={(index) => onToggleExercise(day, index)}
            onToggleDay={() => onToggleDay(day)}
          />
        ))}
      </ol>
    </section>
  );
}
