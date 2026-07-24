import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'VITE_GOOGLE_MAPS_API_KEY= npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-390x667',
      use: { viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'mobile-390x320',
      use: { viewport: { width: 390, height: 320 }, isMobile: true, hasTouch: true },
    },
  ],
});
