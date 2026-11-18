'use client';

import { useT } from '@/lib/use-locale';

interface ProgressBarProps {
  /** One entry per day, true when that day is complete. */
  days: boolean[];
}

/** One segment per day, so the bar reads the same way as the timeline below it. */
export default function ProgressBar({ days }: ProgressBarProps) {
  const { t } = useT();
  const total = days.length;
  const done = days.filter(Boolean).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const summary = t.progress.summary(done, total);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span id="plan-progress-label" className="font-semibold">
          {t.progress.label}
        </span>
        <span className="text-sm text-muted">{summary}</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="plan-progress-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={summary}
        className="mt-2 flex gap-1"
      >
        {days.map((complete, i) => (
          <span
            key={i}
            className={`h-3 min-w-0 flex-1 rounded-full transition-colors ${complete ? 'bg-fill' : 'bg-line'}`}
          />
        ))}
      </div>
    </div>
  );
}
