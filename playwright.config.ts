import { defineConfig } from '@playwright/test';

/** Browser checks against the production build. "iPhone" is Chromium with an iPhone's viewport, touch and UA. */
const PORT = 4174;
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  retries: 0,
  use: { baseURL: `http://localhost:${PORT}/`, launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
  projects: [
    { name: 'iphone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: `npx vite build && npx vite preview --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/`, reuseExistingServer: false, timeout: 120_000 },
});
