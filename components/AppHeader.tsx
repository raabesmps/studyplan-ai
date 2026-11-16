'use client';

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { LOCALES } from '@/lib/i18n';
import { setLocale, useT } from '@/lib/use-locale';
import { setTheme, useTheme } from '@/lib/use-theme';

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--mark)" />
      <path
        d="M9 17l5 5 9-11"
        fill="none"
        stroke="#11141c"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AppHeader() {
  const { t, locale } = useT();
  const theme = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  // Keep <html lang> in sync with the interface language (screen readers pick the right voice).
  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
  }, [locale]);

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 print:hidden">
      <div className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
        <Logo />
        StudyPlan AI
      </div>

      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label={t.header.language}
          className="inline-flex rounded-lg border-[1.5px] border-edge bg-surface p-0.5"
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={code === locale}
              aria-label={t.languages[code]}
              onClick={() => setLocale(code)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                code === locale ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          aria-label={theme === 'dark' ? t.header.themeToLight : t.header.themeToDark}
          className="grid h-10 w-10 place-content-center rounded-lg border-[1.5px] border-edge bg-surface text-ink transition-colors hover:border-ink"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
