import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Browser-only setup: runs for the jsdom (component) tests, not for node tests.
if (typeof document !== 'undefined') {
  // React Testing Library only auto-cleans when test globals are on; we import everything explicitly.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  // jsdom does not implement matchMedia (used by the theme hook). Defined directly on window, not with
  // vi.stubGlobal, so `unstubGlobals` does not remove it after the first test.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
}
