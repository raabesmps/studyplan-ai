/** Timeline-shaped placeholder shown while a plan is being generated. */
export default function PlanSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-10 w-2/3 rounded-lg bg-line motion-safe:animate-pulse" />
      <div className="mt-6 h-24 rounded-xl bg-line motion-safe:animate-pulse" />
      <ol className="mt-8 list-none p-0">
        {[0, 1, 2].map((i) => (
          <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-5">
            <div className="relative flex justify-center">
              <span className="z-10 h-9 w-9 rounded-full border-2 border-line bg-surface" />
              {i < 2 && <span className="absolute bottom-0 left-1/2 top-9 w-0.5 -translate-x-1/2 bg-line" />}
            </div>
            <div className="mb-5 space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-6 motion-safe:animate-pulse">
              <div className="h-6 w-3/4 rounded bg-line" />
              <div className="h-4 w-full rounded bg-line" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-16 rounded bg-line" />
                <div className="h-16 rounded bg-line" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
