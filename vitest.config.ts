import { defineConfig } from 'vitest/config';

// 单元测试只跑 src 下的 *.test.ts(x)：e2e/ 是 Playwright 用例（*.spec.ts），
// 由 npm run test:e2e 单独跑，不进 vitest。
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
    environment: 'node',
  },
});
