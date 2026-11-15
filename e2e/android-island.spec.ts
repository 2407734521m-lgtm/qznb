import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('Android Chrome: upload percentage stays complete inside the island layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome viewport regression only');

  // The signed-out shell intentionally does not mount signed-in live activities.
  // Render the production island/upload CSS in an isolated viewport fixture instead.
  const [islandCss, uploadCss] = await Promise.all([
    readFile(path.join(process.cwd(), 'src/components/MusicIsland.css'), 'utf8'),
    readFile(path.join(process.cwd(), 'src/components/QianzhiIslandUploadActivity.css'), 'utf8'),
  ]);

  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
    <style>
      html, body { margin: 0; width: 100%; min-height: 100%; background: #f5f7fb; }
      ${islandCss}
      ${uploadCss}
      .android-island-fixture {
        position: fixed;
        top: max(env(safe-area-inset-top, 0px), 18px);
        left: 50%;
        display: flex;
        width: max-content;
        max-width: calc(100vw - 24px);
        align-items: center;
        gap: 12px;
        padding: 7px 12px;
        border-radius: 999px;
        transform: translateX(-50%);
        background: #050506;
        box-sizing: border-box;
      }
    </style>
    <div class="qz-island-host" aria-label="岛层">
      <div class="android-island-fixture">
        <span class="qz-upload-island-compact">
          <span class="qz-upload-island-icon" aria-hidden="true">↑</span>
          <span>上传中</span>
        </span>
        <span class="qz-upload-island-percent">100%</span>
      </div>
    </div>
  `);

  const host = page.locator('.qz-island-host');
  await expect(host).toHaveCSS('z-index', '4001');
  const percentage = page.locator('.qz-upload-island-percent');
  await expect(percentage).toHaveText('100%');
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
});

test('Android Chrome: the real island capsule docks on upward touch and restores on downward touch', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome touch regression only');

  await page.goto('/#/home');
  const host = page.locator('.qz-island-host').first();
  await expect(host).toBeVisible({ timeout: 20000 });

  const pill = host.locator('[data-islandcn-hit="pill"]');
  await expect(pill).toBeAttached({ timeout: 15000 });
  const pillBox = await pill.boundingBox();
  expect(pillBox).not.toBeNull();
  expect(pillBox!.width).toBeGreaterThan(40);
  expect(pillBox!.height).toBeGreaterThan(15);

  const cdp = await page.context().newCDPSession(page);
  const x = pillBox!.x + pillBox!.width / 2;
  const y = pillBox!.y + pillBox!.height / 2;

  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x, y, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x, y: y - 64, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(host).toHaveAttribute('data-docked', 'true', { timeout: 5000 });

    const peek = page.locator('.qz-island-peek');
    await expect(peek).toBeVisible();
    const peekBox = await peek.boundingBox();
    expect(peekBox).not.toBeNull();
    const restoreX = peekBox!.x + peekBox!.width / 2;
    const restoreY = peekBox!.y + Math.min(8, peekBox!.height / 2);

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 2, x: restoreX, y: restoreY, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 2, x: restoreX, y: restoreY + 40, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(host).toHaveAttribute('data-docked', 'false', { timeout: 5000 });
  } finally {
    await cdp.detach();
  }
});
