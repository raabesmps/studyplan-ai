'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, LogOut } from 'lucide-react';
import { useT } from '@/lib/use-locale';
import { StateBadge } from './StatusView';

type Reason = 'billing' | 'auth' | 'rate_limit' | 'overloaded' | 'timeout' | 'invalid_response' | 'unknown' | 'unreachable';
type ServiceState = 'up' | 'degraded' | 'down' | 'not_configured';
type ProviderId = 'claude' | 'gemini';

interface DayStats {
  date: string;
  requests: number;
  plans: number;
  plansClaude: number;
  plansGemini: number;
  samples: number;
  rateLimited: number;
  errors: number;
  failovers: number;
  tokens: Record<ProviderId, { input: number; output: number }>;
  costUsd: number;
}

interface Usage {
  generatedAt: string;
  dailyLimit: number;
  usedToday: number;
  claudeModel: string;
  priceKnown: boolean;
  days: DayStats[];
  totals: { requests: number; plans: number; samples: number; rateLimited: number; errors: number; costUsd: number };
  ips: { date: string; rows: { ip: string; requests: number; plans: number }[] };
  health: Record<ProviderId, { lastFailure: { at: string; reason: Reason } | null; lastSuccess: string | null }>;
  services: { id: 'claude' | 'gemini' | 'redis'; status: ServiceState; latencyMs: number | null; reason: Reason | null }[];
}

type Problem = 'denied' | 'lockedOut' | 'unavailable' | 'failed';

/** Kept for this tab only: closing the tab signs out. */
const TOKEN_KEY = 'studyplan-ai:owner-token';
const readToken = (): string => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
const writeToken = (token: string | null): void => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token only lives in memory then.
  }
};

type Result = { ok: true; data: Usage } | { ok: false; problem: Problem };

/** Asks the server for the owner's data. Never throws: every outcome is a Result. */
async function requestUsage(secret: string, day: string | null): Promise<Result> {
  try {
    const query = new URLSearchParams({ days: '14', ...(day ? { date: day } : {}) });
    const response = await fetch(`/api/admin/usage?${query}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    if (response.status === 401) return { ok: false, problem: 'denied' };
    if (response.status === 429) return { ok: false, problem: 'lockedOut' };
    if (response.status === 404) return { ok: false, problem: 'unavailable' };
    if (!response.ok) return { ok: false, problem: 'failed' };
    return { ok: true, data: (await response.json()) as Usage };
  } catch {
    return { ok: false, problem: 'failed' };
  }
}

const number = (value: number, locale: string) => new Intl.NumberFormat(locale).format(value);

export default function OwnerPanel() {
  const { t, locale } = useT();
  const intlLocale = locale === 'pt' ? 'pt-BR' : 'en-US';
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const restored = useRef(false);
  const applyRef = useRef<(result: Result, secret: string) => void>(() => {});

  const money = (usd: number) =>
    new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(usd);
  const when = (iso: string) => new Date(iso).toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' });

  const apply = (result: Result, secret: string) => {
    if (result.ok) {
      setUsage(result.data);
      setProblem(null);
      setDate(result.data.ips.date);
      setToken(secret);
      writeToken(secret);
    } else {
      setProblem(result.problem);
      setUsage(null);
      setToken('');
      writeToken(null);
    }
    setLoading(false);
  };

  const load = (secret: string, day: string | null) => {
    setLoading(true);
    void requestUsage(secret, day).then((result) => apply(result, secret));
  };

  // Comes back signed in after a reload in the same tab.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readToken();
    if (!saved) return;
    void requestUsage(saved, null).then((result) => applyRef.current(result, saved));
  }, []);

  // The restore effect runs once; this keeps it calling the current version of apply.
  useEffect(() => {
    applyRef.current = apply;
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) load(draft.trim(), null);
    setDraft('');
  };

  const signOut = () => {
    setUsage(null);
    setToken('');
    setProblem(null);
    writeToken(null);
  };

  const problemText = problem && t.status.owner[problem];

  return (
    <section aria-labelledby="owner-title" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="owner-title" className="text-2xl font-extrabold tracking-tight">
          {t.status.owner.title}
        </h2>
        {usage && (
          <button type="button" onClick={signOut} className="btn btn-secondary px-3.5 py-2 text-sm">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t.status.owner.lock}
          </button>
        )}
      </div>

      {!usage && (
        <form onSubmit={submit} className="max-w-md space-y-3 rounded-xl border border-line bg-surface p-5">
          <p className="text-muted">{t.status.owner.intro}</p>
          <label htmlFor="owner-token" className="block font-semibold">
            {t.status.owner.token}
          </label>
          <input
            id="owner-token"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="field w-full"
            aria-describedby={problemText ? 'owner-problem' : undefined}
            aria-invalid={problem === 'denied' ? true : undefined}
          />
          <button type="submit" disabled={loading || !draft.trim()} className="btn btn-primary px-4 py-2.5">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            {loading ? t.status.owner.working : t.status.owner.unlock}
          </button>
          {problemText && (
            <p id="owner-problem" role="alert" className="font-semibold text-danger">
              {problemText}
            </p>
          )}
        </form>
      )}

      {usage && (
        <div className="space-y-8" data-testid="owner-data">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t.status.owner.requests, usage.days[0].requests],
              [t.status.owner.plans, usage.days[0].plans],
              [t.status.owner.samples, usage.days[0].samples],
              [t.status.owner.blocked, usage.days[0].rateLimited],
              [t.status.owner.errors, usage.days[0].errors],
              [t.status.owner.failovers, usage.days[0].failovers],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-sm text-muted">
                  {label} · {t.status.owner.today}
                </dt>
                <dd className="mt-1 text-3xl font-extrabold tabular-nums">{number(Number(value), intlLocale)}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-muted">
                {t.status.owner.spend} · {t.status.owner.today}
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="spend-today">
                {money(usage.days[0].costUsd)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-muted">{t.status.owner.budget(usage.usedToday, usage.dailyLimit)}</p>
              <progress
                className="mt-3 h-3 w-full accent-[var(--pen)]"
                max={usage.dailyLimit}
                value={Math.min(usage.usedToday, usage.dailyLimit)}
                aria-label={t.status.owner.budget(usage.usedToday, usage.dailyLimit)}
              />
            </div>
          </div>
          <p className="text-sm text-muted">{t.status.owner.estimateNote(usage.claudeModel)}</p>
          {!usage.priceKnown && <p className="text-sm font-semibold text-danger">{t.status.owner.unknownPrice}</p>}

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="p-4 text-left text-lg font-extrabold">{t.status.owner.daily}</caption>
              <thead className="border-y border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">{t.status.owner.day}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.requests}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.claudePlans}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.geminiPlans}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.samples}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.blocked}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.errors}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.spend}</th>
                  <th scope="col" className="px-4 py-2 font-semibold"><span className="sr-only">IP</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {usage.days.map((day) => (
                  <tr key={day.date} aria-current={day.date === date ? 'true' : undefined} className={day.date === date ? 'bg-[var(--mark-soft)]' : undefined}>
                    <th scope="row" className="px-4 py-2 font-semibold">{day.date}</th>
                    <td className="px-4 py-2 text-right">{day.requests}</td>
                    <td className="px-4 py-2 text-right">{day.plansClaude}</td>
                    <td className="px-4 py-2 text-right">{day.plansGemini}</td>
                    <td className="px-4 py-2 text-right">{day.samples}</td>
                    <td className="px-4 py-2 text-right">{day.rateLimited}</td>
                    <td className="px-4 py-2 text-right">{day.errors}</td>
                    <td className="px-4 py-2 text-right">{money(day.costUsd)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => load(token, day.date)}
                        disabled={loading || day.date === date}
                        className="font-semibold text-pen underline underline-offset-2 hover:no-underline disabled:text-muted disabled:no-underline"
                      >
                        {t.status.owner.showIps(day.date)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line font-extrabold tabular-nums">
                <tr>
                  <th scope="row" className="px-4 py-2">{t.status.owner.totalRow}</th>
                  <td className="px-4 py-2 text-right">{usage.totals.requests}</td>
                  <td className="px-4 py-2 text-right" colSpan={2}>{usage.totals.plans}</td>
                  <td className="px-4 py-2 text-right">{usage.totals.samples}</td>
                  <td className="px-4 py-2 text-right">{usage.totals.rateLimited}</td>
                  <td className="px-4 py-2 text-right">{usage.totals.errors}</td>
                  <td className="px-4 py-2 text-right">{money(usage.totals.costUsd)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[24rem] text-left text-sm" data-testid="ip-table">
              <caption className="p-4 text-left">
                <span className="block text-lg font-extrabold">{t.status.owner.ips(usage.ips.date)}</span>
                <span className="mt-1 block font-normal text-muted">{t.status.owner.ipsHint}</span>
              </caption>
              <thead className="border-y border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">{t.status.owner.ip}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.ipRequests}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{t.status.owner.ipPlans}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {usage.ips.rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-muted">{t.status.owner.noIps}</td>
                  </tr>
                ) : (
                  usage.ips.rows.map((row) => (
                    <tr key={row.ip}>
                      <th scope="row" className="px-4 py-2 font-mono font-semibold">{row.ip}</th>
                      <td className="px-4 py-2 text-right">{row.requests}</td>
                      <td className="px-4 py-2 text-right">{row.plans}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <section aria-labelledby="providers-title" className="space-y-3">
            <h3 id="providers-title" className="text-lg font-extrabold">{t.status.owner.providers}</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(['claude', 'gemini'] as const).map((id) => {
                const health = usage.health[id];
                return (
                  <li key={id} className="rounded-xl border border-line bg-surface p-4" data-provider={id}>
                    <p className="font-semibold">{t.status.names[id]}</p>
                    <p className="mt-2 text-sm">
                      <span className="text-muted">{t.status.owner.lastFailure}: </span>
                      {health.lastFailure
                        ? `${when(health.lastFailure.at)} · ${t.status.reasons[health.lastFailure.reason]}`
                        : t.status.owner.never}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted">{t.status.owner.lastSuccess}: </span>
                      {health.lastSuccess ? when(health.lastSuccess) : t.status.owner.never}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="detail-title" className="space-y-3">
            <h3 id="detail-title" className="text-lg font-extrabold">{t.status.owner.serviceDetail}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {usage.services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-detail={service.id}>
                  <span className="font-semibold">{t.status.names[service.id]}</span>
                  <span className="flex flex-wrap items-center gap-3">
                    {service.reason && <span className="text-sm text-muted">{t.status.reasons[service.reason]}</span>}
                    <StateBadge state={service.status} label={t.status.states[service.status]} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
