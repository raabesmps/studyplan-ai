import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// React Testing Library only auto-cleans when test globals are on; we import everything explicitly.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
