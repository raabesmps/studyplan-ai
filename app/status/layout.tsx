import type { Metadata } from 'next';

// A page for the owner and curious visitors, not for search results.
export const metadata: Metadata = {
  title: 'Status | StudyPlan AI',
  robots: { index: false, follow: false },
};

export default function StatusLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
