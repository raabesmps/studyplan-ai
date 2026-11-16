import { Clock, ExternalLink, Search } from 'lucide-react';
import type { Day } from '@/lib/schema';

interface DayCardProps {
  day: Day;
  /** Indexes of the exercises already completed. */
  done: number[];
  complete: boolean;
  onToggleExercise: (index: number) => void;
  onToggleDay: () => void;
}

function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export default function DayCard({ day, done, complete, onToggleExercise, onToggleDay }: DayCardProps) {
  const titleId = `day-${day.day}-title`;
  const doneSet = new Set(done);

  return (
    <article
      aria-labelledby={titleId}
      className={`rounded-xl border p-4 sm:p-6 transition-colors motion-reduce:transition-none ${
        complete ? 'border-emerald-600/70 bg-emerald-950/30' : 'border-slate-700 bg-slate-800/60'
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-300">Dia {day.day}</p>
          <h3 id={titleId} className="text-lg sm:text-xl font-bold text-white break-words">
            {day.title}
          </h3>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={complete}
            onChange={onToggleDay}
            className="h-5 w-5 accent-emerald-500 cursor-pointer"
          />
          {complete ? 'Dia concluído' : 'Marcar dia como concluído'}
        </label>
      </header>

      <p className="mt-3 text-slate-200">{day.objective}</p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section aria-label={`Tópicos do dia ${day.day}`}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-2">Tópicos</h4>
          <ul className="list-disc pl-5 space-y-1 text-slate-200">
            {day.topics.map((topic, i) => (
              <li key={i}>{topic}</li>
            ))}
          </ul>
        </section>

        <section aria-label={`Exercícios do dia ${day.day}`}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300 mb-2">Exercícios</h4>
          <ul className="space-y-2">
            {day.exercises.map((exercise, i) => {
              const checked = doneSet.has(i);
              return (
                <li key={i}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleExercise(i)}
                      className="mt-1 h-5 w-5 shrink-0 accent-emerald-500 cursor-pointer"
                    />
                    <span className={checked ? 'text-slate-400 line-through' : 'text-slate-200'}>
                      {exercise}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {day.resources.length > 0 && (
        <section aria-label={`Onde buscar no dia ${day.day}`} className="mt-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300 mb-2">
            <Search className="w-4 h-4" aria-hidden="true" />
            Buscar para estudar
          </h4>
          <ul className="space-y-1">
            {day.resources.map((resource, i) => (
              <li key={i}>
                <a
                  href={searchUrl(resource.query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2 break-words"
                >
                  {resource.title} — “{resource.query}”
                  <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                  <span className="sr-only">(abre uma busca em nova aba)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-5 flex items-center gap-1.5 text-sm text-slate-300">
        <Clock className="w-4 h-4" aria-hidden="true" />
        Duração estimada: {day.minutes} min
      </footer>
    </article>
  );
}
