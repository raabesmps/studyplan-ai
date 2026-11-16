interface ProgressBarProps {
  done: number;
  total: number;
}

export default function ProgressBar({ done, total }: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm text-slate-300">
        <span id="plan-progress-label">Progresso do plano</span>
        <span>
          {done} de {total} {total === 1 ? 'dia' : 'dias'} · {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="plan-progress-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${done} de ${total} dias concluídos`}
        className="h-3 overflow-hidden rounded-full bg-slate-700"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
