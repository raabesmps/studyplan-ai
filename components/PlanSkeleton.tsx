/** Placeholder cards shown while a plan is being generated. */
export default function PlanSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 space-y-4">
      <div className="h-8 w-2/3 rounded-lg bg-slate-700/60 motion-safe:animate-pulse" />
      <div className="h-3 w-full rounded-full bg-slate-700/60 motion-safe:animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4 sm:p-6 motion-safe:animate-pulse"
        >
          <div className="h-4 w-16 rounded bg-slate-700" />
          <div className="h-6 w-3/4 rounded bg-slate-700" />
          <div className="h-4 w-full rounded bg-slate-700/80" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-20 rounded bg-slate-700/60" />
            <div className="h-20 rounded bg-slate-700/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
