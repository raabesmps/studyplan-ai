import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Bricolage_Grotesque } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { THEME_STORAGE_KEY } from '@/lib/theme-storage';
import './globals.css';

const sans = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const DESCRIPTION =
  'Study plans you can check off. Create a 1 to 30 day plan on any subject, with a progress checklist. / Planos de estudo de 1 a 30 dias com checklist de progresso.';

export const metadata: Metadata = {
  metadataBase: new URL('https://studyplan.aquifunciona.dev.br'),
  title: 'StudyPlan AI',
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'StudyPlan AI',
    title: 'StudyPlan AI',
    description: DESCRIPTION,
    locale: 'pt_BR',
    alternateLocale: ['en_US'],
  },
  twitter: { card: 'summary_large_image', title: 'StudyPlan AI', description: DESCRIPTION },
};

// Runs before first paint so a saved theme choice never flashes the wrong colors.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request headers makes the page render per request, which the CSP nonce requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" className={sans.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {/* Page-view counts by Vercel (no cookies). Only on Vercel: elsewhere /_vercel/insights does not exist. */}
        {process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  );
}
