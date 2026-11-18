'use client';

import { Archive, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/i18n';
import { isDayComplete } from '@/lib/progress';
import type { LegacyPlan, SavedPlan } from '@/lib/plans-store';
import { useT } from '@/lib/use-locale';

interface SavedPlansProps {
  plans: SavedPlan[];
  legacy: LegacyPlan[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, legacy: boolean) => void;
}

const rowClass = (active: boolean) =>
  `flex items-stretch rounded-xl border transition-colors ${
    active ? 'border-ink bg-surface' : 'border-line bg-transparent hover:border-edge hover:bg-surface'
  }`;

export default function SavedPlans({ plans, legacy, activeId, onSelect, onDelete }: SavedPlansProps) {
  const { t, locale } = useT();
  if (plans.length === 0 && legacy.length === 0) return null;

  const confirmDelete = (id: string, isLegacy: boolean) => {
    if (confirm(t.saved.confirmDelete)) onDelete(id, isLegacy);
  };

  return (
    <section aria-labelledby="saved-title">
      <h2 id="saved-title" className="mb-3 text-xl font-extrabold tracking-tight">
        {t.saved.title}
      </h2>

      <ul className="space-y-2">
        {plans.map((saved) => {
          const days = saved.plan.days.map((d) => isDayComplete(saved.completed, d));
          const done = days.filter(Boolean).length;
          const active = saved.id === activeId;
          return (
            <li key={saved.id} className={rowClass(active)}>
              <button
                type="button"
                onClick={() => onSelect(saved.id)}
                aria-current={active ? 'true' : undefined}
                className="min-w-0 flex-1 rounded-xl p-3 text-left"
              >
                <span className="block truncate font-bold">{saved.plan.subject}</span>
                <span className="mt-0.5 block text-sm text-muted">
                  {t.saved.progress(done, days.length)}
                  {', '}
                  {formatDate(saved.createdAt, locale)}
                </span>
                <span aria-hidden="true" className="mt-2 flex gap-0.5">
                  {days.map((complete, i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${complete ? 'bg-fill' : 'bg-line'}`} />
                  ))}
                </span>
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(saved.id, false)}
                aria-label={t.saved.delete(saved.plan.subject)}
                className="rounded-xl px-3 text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}

        {legacy.map((old) => {
          const active = old.id === activeId;
          return (
            <li key={old.id} className={rowClass(active)}>
              <button
                type="button"
                onClick={() => onSelect(old.id)}
                aria-current={active ? 'true' : undefined}
                className="min-w-0 flex-1 rounded-xl p-3 text-left"
              >
                <span className="block truncate font-bold">{old.subject}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t.saved.legacyBadge}
                </span>
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(old.id, true)}
                aria-label={t.saved.deleteLegacy(old.subject)}
                className="rounded-xl px-3 text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
