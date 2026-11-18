'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle, RefreshCw, XCircle } from 'lucide-react';
import { useT } from '@/lib/use-locale';
import OwnerPanel from './OwnerPanel';

type ServiceState = 'up' | 'degraded' | 'down' | 'not_configured';

interface PublicStatus {
  checkedAt: string;
  site: { status: 'up' };
  services: { id: 'claude' | 'gemini' | 'redis'; status: ServiceState; latencyMs: number | null }[];
  dailyLimitReached: boolean | null;
}

const REFRESH_MS = 60_000;

/** Icon and text together: the state is never only a color. */
export function StateBadge({ state, label }: { state: ServiceState; label: string }) {
  const common = { className: 'h-5 w-5 shrink-0', 'aria-hidden': true } as const;
  const icon =
    state === 'up' ? (
      <CheckCircle2 {...common} />
    ) : state === 'degraded' ? (
      <AlertTriangle {...common} />
    ) : state === 'down' ? (
      <XCircle {...common} className="h-5 w-5 shrink-0 text-danger" />
    ) : (
      <MinusCircle {...common} className="h-5 w-5 shrink-0 text-muted" />
    );
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      {icon}
      <span className={state === 'degraded' ? 'bg-[var(--mark-soft)] px-1' : undefined}>{label}</span>
    </span>
  );
}

export default function StatusView() {
  const { t, locale } = useT();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Bumped by the Refresh button to run the check again right away.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetch('/api/status', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<PublicStatus>;
        })
        .then((data) => {
          if (cancelled) return;
          setStatus(data);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    };
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [round]);

  const refresh = () => {
    setChecking(true);
    setRound((value) => value + 1);
  };

  const rows = status
    ? [
        { id: 'site' as const, state: 'up' as ServiceState, latencyMs: null },
        ...status.services.map((service) => ({ id: service.id, state: service.status, latencyMs: service.latencyMs })),
      ]
    : [];

  return (
    <div className="space-y-10">
      <section aria-labelledby="services-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="services-title" className="text-2xl font-extrabold tracking-tight">
            {t.status.services}
          </h2>
          <div className="flex items-center gap-3 text-sm text-muted">
            {status && <span>{t.status.checkedAt(new Date(status.checkedAt).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US'))}</span>}
            <button type="button" onClick={refresh} disabled={checking} className="btn btn-secondary px-3.5 py-2 text-sm">
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {checking ? t.status.checking : t.status.refresh}
            </button>
          </div>
        </div>

        {/* Announces a failed or finished check to screen readers without moving focus. */}
        <div role="status" aria-live="polite" className="sr-only">
          {checking ? t.status.checking : failed ? t.status.loadFailed : ''}
        </div>

        {failed && (
          <p role="alert" className="rounded-xl border-[1.5px] border-danger bg-surface p-4 font-semibold">
            {t.status.loadFailed}
          </p>
        )}

        {status?.dailyLimitReached && (
          <p className="rounded-xl border border-line bg-surface p-4 text-muted">{t.status.budgetSpent}</p>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5" data-service={row.id}>
                <span className="font-semibold">{t.status.names[row.id]}</span>
                <span className="flex items-center gap-4">
                  {row.latencyMs !== null && <span className="text-sm text-muted">{t.status.ms(row.latencyMs)}</span>}
                  <StateBadge state={row.state} label={t.status.states[row.state]} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OwnerPanel />
    </div>
  );
}
