import { defineConfig, devices } from '@playwright/test';

// 首批 E2E 只覆盖游客 / 未登录可走的关键路径，不创建任何账号、不做写操作。
// 默认测本地 `vite preview` 产物（CI 里先 build 再起 preview）；
// 如需测其他地址，设 E2E_BASE_URL。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // 手机宽度 390：用 Chromium + 移动视口（不用 iPhone 描述符，它默认走 WebKit，
      // CI 只装 chromium，本地也只有 chromium 缓存）。
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // 必须显式 --host 127.0.0.1：vite preview 默认绑 localhost，在本机可能只绑 ::1，
    // Playwright 按 127.0.0.1 探活会超时。
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
