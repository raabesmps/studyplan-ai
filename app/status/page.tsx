'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import StatusView from '@/components/StatusView';
import { useT } from '@/lib/use-locale';

export default function StatusPage() {
  const { t } = useT();
  return (
    <>
      <a href="#main" className="skip-link">
        {t.skipToContent}
      </a>
      <AppHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-pen underline underline-offset-2 hover:no-underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.status.back}
        </Link>
        <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{t.status.title}</h1>
        <p className="mb-10 mt-4 max-w-xl text-lg text-muted">{t.status.intro}</p>
        <StatusView />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted sm:px-6">{t.footer.privacy}</footer>
    </>
  );
}
