'use client';

import Link from 'next/link';
import { useT } from '@/lib/use-locale';

const LINK = 'text-pen underline underline-offset-2 hover:no-underline';

/** The credits (both AI providers, linked), the privacy note and, on the home page, the status link. */
export default function SiteFooter({ showStatusLink = true }: { showStatusLink?: boolean }) {
  const { t } = useT();

  // "{claude}" and "{gemini}" in the text become links, wherever each language puts them.
  const credits = t.footer.madeWith.split(/(\{claude\}|\{gemini\})/).map((part, index) => {
    if (part === '{claude}') {
      return (
        <a key={index} href="https://www.anthropic.com/claude" target="_blank" rel="noopener noreferrer" className={LINK}>
          Claude
        </a>
      );
    }
    if (part === '{gemini}') {
      return (
        <a key={index} href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className={LINK}>
          Google Gemini
        </a>
      );
    }
    return part;
  });

  return (
    <footer className="mx-auto max-w-6xl space-y-1 px-4 pb-10 text-sm text-muted sm:px-6 print:hidden">
      <p>{credits}</p>
      <p>{t.footer.privacy}</p>
      {showStatusLink && (
        <p>
          <Link href="/status" className={LINK}>
            {t.footer.status}
          </Link>
        </p>
      )}
    </footer>
  );
}
