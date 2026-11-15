import { expect, test } from '@playwright/test';

test('Android Chrome: island stays within the viewport and renders the complete upload percentage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome viewport regression only');

  await page.goto('/#/home');
  const island = page.getByRole('region', { name: '堯实时活动' });
  await expect(island).toBeAttached({ timeout: 20000 });

  const host = page.locator('.qz-island-host');
  await expect(host).toHaveCSS('z-index', '4001');

  // Drive the same window event consumed by the application upload lifecycle.
  await page.evaluate(() => {
    const id = 'e2e-android-upload';
    window.dispatchEvent(new CustomEvent('qz-island-upload', {
      detail: { id, phase: 'start', label: '正在上传图片', progress: 0 },
    }));
    window.dispatchEvent(new CustomEvent('qz-island-upload', {
      detail: { id, phase: 'progress', label: '正在上传图片', progress: 100 },
    }));
  });

  const percentage = page.locator('.qz-upload-island-percent');
  await expect(percentage).toHaveText('100%', { timeout: 10000 });
  await expect(percentage).toBeVisible();

  const metrics = await percentage.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      textWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      whiteSpace: style.whiteSpace,
      flexShrink: style.flexShrink,
    };
  });

  expect(metrics.width).toBeGreaterThan(0);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(412);
  expect(metrics.textWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(metrics.flexShrink).toBe('0');

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('qz-island-upload', {
      detail: { id: 'e2e-android-upload', phase: 'complete', label: '正在上传图片', progress: 100 },
    }));
  });
});
