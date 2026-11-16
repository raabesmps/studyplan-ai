'use client';

import type { CSSProperties } from 'react';
import { Check, Clock, ExternalLink, Search } from 'lucide-react';
import type { Day } from '@/lib/schema';
import { useT } from '@/lib/use-locale';

interface DayCardProps {
  day: Day;
  /** Position in the list, used to stagger the reveal. */
  index: number;
  isLast: boolean;
  /** Indexes of the exercises already completed. */
  done: number[];
  complete: boolean;
  onToggleExercise: (index: number) => void;
  onToggleDay: () => void;
}

function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** One stop on the timeline: a numbered node, the spine down to the next day, and the day's card. */
export default function DayCard({
  day,
  index,
  isLast,
  done,
  complete,
  onToggleExercise,
  onToggleDay,
}: DayCardProps) {
  const { t } = useT();
  const titleId = `day-${day.day}-title`;
  const doneSet = new Set(done);

  return (
    <li
      className="reveal grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-5 print:break-inside-avoid"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="relative flex justify-center" aria-hidden="true">
        <span
          className={`z-10 grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-bold ${
            complete ? 'border-ink bg-mark text-on-mark' : 'border-edge bg-surface text-ink'
          }`}
        >
          {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : day.day}
        </span>
        {!isLast && (
          <span
            className={`absolute bottom-0 left-1/2 top-9 w-0.5 -translate-x-1/2 ${complete ? 'bg-fill' : 'bg-line'}`}
          />
        )}
      </div>

      <article
        aria-labelledby={titleId}
        className={`mb-5 rounded-xl border bg-surface p-4 sm:p-6 ${complete ? 'border-ink' : 'border-line'}`}
      >
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h3 id={titleId} className="min-w-0 text-xl font-bold leading-snug break-words">
            <span className="sr-only">{t.day.label(day.day)}: </span>
            <span className={complete ? 'hl' : undefined}>{day.title}</span>
          </h3>
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={complete} onChange={onToggleDay} className="check" />
            {complete ? t.day.done : t.day.markDone}
          </label>
        </header>

        <p className="mt-3 text-muted">{day.objective}</p>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <section aria-label={t.day.topicsOf(day.day)}>
            <h4 className="mb-2 font-bold">{t.day.topics}</h4>
            <ul className="list-disc space-y-1 pl-5 marker:text-muted">
              {day.topics.map((topic, i) => (
                <li key={i}>{topic}</li>
              ))}
            </ul>
          </section>

          <section aria-label={t.day.exercisesOf(day.day)}>
            <h4 className="mb-2 font-bold">{t.day.exercises}</h4>
            <ul className="space-y-2.5">
              {day.exercises.map((exercise, i) => {
                const checked = doneSet.has(i);
                return (
                  <li key={i}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleExercise(i)}
                        className="check mt-0.5"
                      />
                      <span>
                        <span className={checked ? 'hl' : undefined}>{exercise}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {day.resources.length > 0 && (
          <section aria-label={t.day.searchOf(day.day)} className="mt-6">
            <h4 className="mb-2 flex items-center gap-2 font-bold">
              <Search className="h-4 w-4" aria-hidden="true" />
              {t.day.search}
            </h4>
            <ul className="space-y-1.5">
              {day.resources.map((resource, i) => (
                <li key={i}>
                  <a
                    href={searchUrl(resource.query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words text-pen underline underline-offset-2 hover:no-underline"
                  >
                    {resource.title}, “{resource.query}”
                    <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                    <span className="sr-only">{t.day.opensSearch}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-sm text-muted">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {t.day.duration(day.minutes)}
        </p>
      </article>
    </li>
  );
}
