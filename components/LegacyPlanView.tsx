'use client';

import { Archive, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LegacyPlan } from '@/lib/plans-store';
import { useT } from '@/lib/use-locale';

interface LegacyPlanViewProps {
  plan: LegacyPlan;
  onClose: () => void;
}

/** Renders **bold** and *italic* as React nodes. Never uses innerHTML. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderLine(line: string, i: number): ReactNode {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    return (
      <p key={i} className="mt-5 text-lg font-bold">
        {renderInline(heading[2])}
      </p>
    );
  }
  const item = /^\s*[-*]\s+(.*)$/.exec(line);
  if (item) {
    return (
      <p key={i} className="ml-4 flex gap-2">
        <span aria-hidden="true">•</span>
        <span>{renderInline(item[1])}</span>
      </p>
    );
  }
  if (line.trim() === '' || /^-{3,}$/.test(line.trim())) return <div key={i} className="h-2" />;
  return <p key={i}>{renderInline(line)}</p>;
}

export default function LegacyPlanView({ plan, onClose }: LegacyPlanViewProps) {
  const { t } = useT();

  return (
    <section aria-labelledby="legacy-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="legacy-title" className="min-w-0 text-3xl font-extrabold tracking-tight break-words">
          {plan.subject}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.plan.close}
          className="grid h-10 w-10 shrink-0 place-content-center rounded-lg border-[1.5px] border-edge bg-surface hover:border-ink"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-muted">
        <Archive className="h-4 w-4" aria-hidden="true" />
        {t.saved.legacyBadge}
      </p>
      <p className="mt-3 max-w-prose text-muted">{t.legacy.note}</p>
      <div className="mt-5 space-y-1 rounded-xl border border-line bg-surface p-4 leading-relaxed break-words sm:p-6">
        {plan.plan.split('\n').map(renderLine)}
      </div>
    </section>
  );
}
