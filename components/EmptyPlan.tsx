'use client';

import { useT } from '@/lib/use-locale';

/** Empty state: an outline of the timeline that the first plan will fill. */
export default function EmptyPlan() {
  const { t } = useT();

  return (
    <section aria-labelledby="empty-title">
      <ol aria-hidden="true" className="list-none p-0">
        {[0, 1, 2].map((i) => (
          <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-5">
            <div className="relative flex justify-center">
              <span className="z-10 h-9 w-9 rounded-full border-2 border-dashed border-edge bg-paper" />
              {i < 2 && <span className="absolute bottom-0 left-1/2 top-9 w-0.5 -translate-x-1/2 border-l-2 border-dashed border-line" />}
            </div>
            <div className="mb-5 h-20 rounded-xl border-[1.5px] border-dashed border-line" />
          </li>
        ))}
      </ol>
      <h2 id="empty-title" className="mt-2 text-2xl font-extrabold tracking-tight">
        {t.empty.title}
      </h2>
      <p className="mt-1 max-w-prose text-muted">{t.empty.text}</p>
    </section>
  );
}
