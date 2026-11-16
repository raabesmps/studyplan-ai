'use client';

import { format } from 'date-fns';
import { Archive, BookOpen, Clock, Trash2 } from 'lucide-react';
import { countCompletedDays } from '@/lib/progress';
import type { LegacyPlan, SavedPlan } from '@/lib/plans-store';

interface SavedPlansProps {
  plans: SavedPlan[];
  legacy: LegacyPlan[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, legacy: boolean) => void;
}

const cardClass = (active: boolean) =>
  `flex items-start justify-between gap-2 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
    active ? 'border-blue-400 bg-slate-800' : 'border-slate-700 bg-slate-800/50 hover:border-blue-500'
  }`;

export default function SavedPlans({ plans, legacy, activeId, onSelect, onDelete }: SavedPlansProps) {
  if (plans.length === 0 && legacy.length === 0) return null;

  const confirmDelete = (id: string, isLegacy: boolean) => {
    if (confirm('Tem certeza que deseja excluir este plano?')) onDelete(id, isLegacy);
  };

  return (
    <section aria-labelledby="saved-title" className="mt-12">
      <h2 id="saved-title" className="mb-6 flex items-center gap-2 text-2xl font-bold text-white">
        <BookOpen className="h-6 w-6 text-blue-400" aria-hidden="true" />
        Meus planos
      </h2>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((saved) => {
          const total = saved.plan.days.length;
          const done = countCompletedDays(saved.plan, saved.completed);
          const active = saved.id === activeId;
          return (
            <li key={saved.id} className={cardClass(active)}>
              <button
                type="button"
                onClick={() => onSelect(saved.id)}
                aria-current={active ? 'true' : undefined}
                className="min-w-0 flex-1 rounded text-left"
              >
                <span className="line-clamp-1 block text-lg font-semibold text-white">{saved.plan.subject}</span>
                <span className="mt-2 flex items-center gap-2 text-sm text-slate-300">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {saved.hoursPerDay}h/dia · {done}/{total} dias concluídos
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {format(new Date(saved.createdAt), 'dd/MM/yyyy')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(saved.id, false)}
                aria-label={`Excluir plano ${saved.plan.subject}`}
                className="rounded p-2 hover:bg-slate-700"
              >
                <Trash2 className="h-4 w-4 text-red-300" aria-hidden="true" />
              </button>
            </li>
          );
        })}

        {legacy.map((old) => {
          const active = old.id === activeId;
          return (
            <li key={old.id} className={cardClass(active)}>
              <button
                type="button"
                onClick={() => onSelect(old.id)}
                aria-current={active ? 'true' : undefined}
                className="min-w-0 flex-1 rounded text-left"
              >
                <span className="line-clamp-1 block text-lg font-semibold text-white">{old.subject}</span>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-900/40 px-2.5 py-0.5 text-xs text-amber-200">
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  Legado · somente leitura
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {format(new Date(old.createdAt), 'dd/MM/yyyy')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(old.id, true)}
                aria-label={`Excluir plano legado ${old.subject}`}
                className="rounded p-2 hover:bg-slate-700"
              >
                <Trash2 className="h-4 w-4 text-red-300" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
