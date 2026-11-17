import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 3100; // not 3002, so a `npm run dev` session never gets mixed up with the tests
const CLAUDE_APP_PORT = 3101; // the same build with Claude as the primary provider
const FAKE_GEMINI_PORT = 4010;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // Each worker is a whole browser against one `next start`; more than this starves slower machines.
  workers: 2,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    locale: 'pt-BR',
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Stands in for Gemini: no network, no quota, no API key.
      command: `node tests/e2e/support/fake-gemini.mjs ${FAKE_GEMINI_PORT}`,
      url: `http://localhost:${FAKE_GEMINI_PORT}/__log`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER) || !process.env.CI,
    },
    {
      // The production build, pointed at the fake. Started fresh by default, so a leftover server that
      // talks to the real API is never reused by accident. Set E2E_REUSE_SERVER=1 to iterate quickly
      // against servers you started yourself (fake Gemini on 4010, `next start -p 3100`).
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 240_000,
      env: {
        // The main suite exercises the Gemini pipeline; Claude and failover run on the second instance.
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'e2e-test-key',
        GEMINI_API_BASE_URL: `http://localhost:${FAKE_GEMINI_PORT}/v1beta/models`,
        ANTHROPIC_API_KEY: '',
      },
    },
    {
      // Same build, with Claude as the default provider and Gemini as its failover (like production).
      command: `npx next start -p ${CLAUDE_APP_PORT}`,
      url: `http://localhost:${CLAUDE_APP_PORT}`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
      timeout: 120_000,
      env: {
        AI_PROVIDER: 'claude',
        ANTHROPIC_API_KEY: 'e2e-test-claude-key',
        ANTHROPIC_BASE_URL: `http://localhost:${FAKE_GEMINI_PORT}`,
        GEMINI_API_KEY: 'e2e-test-key',
        GEMINI_API_BASE_URL: `http://localhost:${FAKE_GEMINI_PORT}/v1beta/models`,
      },
    },
  ],
});
