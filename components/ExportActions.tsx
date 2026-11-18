'use client';

import { useId, useState } from 'react';
import { CalendarPlus, Check, Copy, FileDown, Printer } from 'lucide-react';
import { downloadTextFile } from '@/lib/download';
import { exportFilename, planToIcs, planToMarkdown } from '@/lib/export';
import type { SavedPlan } from '@/lib/plans-store';
import { useT } from '@/lib/use-locale';

const pad = (n: number) => String(n).padStart(2, '0');

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Buttons only: every format is produced by a pure function in lib/export.ts. */
export default function ExportActions({ saved }: { saved: SavedPlan }) {
  const { t } = useT();
  const panelId = useId();
  const [copied, setCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayLocal);
  const [startTime, setStartTime] = useState('09:00');
  const { plan } = saved;

  const markdown = () => planToMarkdown(plan, saved.language, saved.completed);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the download button is the fallback.
    }
  };

  const handleMarkdown = () =>
    downloadTextFile(exportFilename(plan.subject, 'md'), markdown(), 'text/markdown');

  const handlePrint = () => {
    // The browser uses the page title as the default PDF file name.
    const previous = document.title;
    document.title = plan.subject;
    window.print();
    document.title = previous;
  };

  const handleCalendar = (e: React.FormEvent) => {
    e.preventDefault();
    const ics = planToIcs(plan, { startDate, startTime, uidSeed: saved.id, language: saved.language });
    downloadTextFile(exportFilename(plan.subject, 'ics'), ics, 'text/calendar');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleCopy} className="btn btn-secondary px-3.5 py-2 text-sm">
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              {t.plan.copied}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t.plan.copy}
            </>
          )}
        </button>
        <button type="button" onClick={handleMarkdown} className="btn btn-secondary px-3.5 py-2 text-sm">
          <FileDown className="h-4 w-4" aria-hidden="true" />
          {t.export.markdown}
        </button>
        <button type="button" onClick={handlePrint} className="btn btn-secondary px-3.5 py-2 text-sm">
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t.export.print}
        </button>
        <button
          type="button"
          onClick={() => setCalendarOpen((open) => !open)}
          aria-expanded={calendarOpen}
          aria-controls={panelId}
          className="btn btn-secondary px-3.5 py-2 text-sm"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t.export.calendar}
        </button>
      </div>

      {calendarOpen && (
        <form
          id={panelId}
          onSubmit={handleCalendar}
          className="mt-4 rounded-xl border border-line p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${panelId}-date`} className="mb-1.5 block text-sm font-semibold">
                {t.export.startDate}
              </label>
              <input
                id={`${panelId}-date`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="field"
                required
              />
            </div>
            <div>
              <label htmlFor={`${panelId}-time`} className="mb-1.5 block text-sm font-semibold">
                {t.export.startTime}
              </label>
              <input
                id={`${panelId}-time`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="field"
                required
              />
            </div>
          </div>
          <p className="mt-3 max-w-prose text-sm text-muted">{t.export.help}</p>
          <button
            type="submit"
            disabled={!startDate || !startTime}
            className="btn btn-primary mt-4 px-4 py-2 text-sm"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {t.export.download}
          </button>
        </form>
      )}
    </div>
  );
}
