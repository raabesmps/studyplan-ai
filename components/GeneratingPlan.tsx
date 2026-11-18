'use client';

import type { CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '@/lib/use-locale';

interface GeneratingPlanProps {
  subject: string;
  /** Days requested. */
  total: number;
  /** The day the model is writing right now, or null before it starts. */
  day: number | null;
  /** True while a second attempt runs after an invalid answer. */
  retrying: boolean;
  /** Set when the first AI provider failed and another one took over (already translated). */
  switchedMessage?: string | null;
  onCancel: () => void;
}

/**
 * Shown while a plan streams in. The timeline builds itself from real progress:
 * finished days get a check, the day being written pulses, the rest stay outlined.
 */
export default function GeneratingPlan({
  subject,
  total,
  day,
  retrying,
  switchedMessage,
  onCancel,
}: GeneratingPlanProps) {
  const { t } = useT();
  const current = day ?? 0;
  const status = retrying
    ? t.generating.adjusting
    : day === null
      ? (switchedMessage ?? t.generating.preparing)
      : t.generating.writing(day, total);

  return (
    <section aria-labelledby="generating-title" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id="generating-title"
          className="min-w-0 text-balance text-3xl font-extrabold leading-tight tracking-tight break-words sm:text-4xl"
        >
          {t.generating.title(subject)}
        </h2>
        <button type="button" onClick={onCancel} className="btn btn-secondary px-3.5 py-2 text-sm">
          <X className="h-4 w-4" aria-hidden="true" />
          {t.generating.cancel}
        </button>
      </div>

      {/* Visual only: the page-level live region already announced that generation started. */}
      <p aria-live="off" className="mt-3 text-lg text-muted">
        {status}
      </p>
      {switchedMessage && day !== null && !retrying && (
        <p aria-live="off" className="mt-1 text-sm text-muted">
          {switchedMessage}
        </p>
      )}

      <ol aria-hidden="true" className="mt-8 list-none p-0">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const written = n < current;
          const writing = n === current;
          return (
            <li
              key={n}
              className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-5"
              style={{ '--i': Math.min(i, 8) } as CSSProperties}
            >
              <div className="relative flex justify-center">
                <span
                  className={`z-10 grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-bold transition-colors ${
                    written
                      ? 'border-ink bg-fill text-paper'
                      : writing
                        ? 'border-pen bg-surface text-ink motion-safe:animate-pulse'
                        : 'border-dashed border-edge bg-paper text-muted'
                  }`}
                >
                  {written ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
                </span>
                {n < total && (
                  <span
                    className={`absolute bottom-0 left-1/2 top-9 w-0.5 -translate-x-1/2 transition-colors ${
                      written ? 'bg-fill' : 'bg-line'
                    }`}
                  />
                )}
              </div>
              <div
                className={`mb-3 min-h-14 rounded-xl border transition-colors ${
                  written
                    ? 'border-ink bg-surface'
                    : writing
                      ? 'border-pen bg-surface motion-safe:animate-pulse'
                      : 'border-dashed border-line'
                }`}
              >
                {(written || writing) && (
                  <div className="space-y-2 p-3.5">
                    <div className="h-3.5 w-2/5 rounded bg-line" />
                    <div className={`h-2.5 rounded bg-line ${written ? 'w-4/5' : 'w-3/5'}`} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
