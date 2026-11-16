import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // Semantic tokens: the values live in app/globals.css and switch with the theme.
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        edge: 'var(--edge)',
        pen: 'var(--pen)',
        mark: 'var(--mark)',
        'on-mark': 'var(--on-mark)',
        fill: 'var(--fill)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
