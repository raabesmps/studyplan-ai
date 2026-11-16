import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { THEME_STORAGE_KEY } from '@/lib/theme-storage';
import './globals.css';

const sans = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'StudyPlan AI',
  description:
    'Study plans you can check off. Create a 1 to 30 day plan on any subject, with a progress checklist. / Planos de estudo de 1 a 30 dias com checklist de progresso.',
};

// Runs before first paint so a saved theme choice never flashes the wrong colors.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
