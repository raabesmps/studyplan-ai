import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Node by default; component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/{unit,api,components}/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.ts', 'components/**/*.tsx', 'app/api/**/*.ts'],
      thresholds: {
        // The pure logic in lib/ is what these tests are for.
        'lib/**/*.ts': { statements: 80, branches: 75, functions: 80, lines: 80 },
      },
    },
  },
});
