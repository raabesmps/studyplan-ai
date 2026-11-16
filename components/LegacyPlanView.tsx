import { X, Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LegacyPlan } from '@/lib/plans-store';

interface LegacyPlanViewProps {
  plan: LegacyPlan;
  onClose: () => void;
}

/** Renders **bold** and *italic* as React nodes. Never uses innerHTML. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
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
      <p key={i} className="mt-5 text-lg font-bold text-white">
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
  return (
    <section
      aria-labelledby="legacy-title"
      className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/50 p-4 sm:p-8"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="legacy-title" className="text-2xl font-bold text-white break-words">
            {plan.subject}
          </h2>
          <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-900/40 px-3 py-1 text-sm text-amber-200">
            <Archive className="w-4 h-4" aria-hidden="true" />
            Plano legado · somente leitura
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar plano"
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-700"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-300">
        Este plano foi criado numa versão anterior e não tem checklist de progresso. Gere um novo plano para
        acompanhar seus estudos.
      </p>
      <div className="mt-4 space-y-1 rounded-lg bg-slate-900/50 p-4 sm:p-6 text-slate-200 leading-relaxed break-words">
        {plan.plan.split('\n').map(renderLine)}
      </div>
    </section>
  );
}
