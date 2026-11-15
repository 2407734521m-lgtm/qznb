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



test('Android Chrome: call actions fit the expanded island on a 320px viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome viewport regression only');

  const callCss = await readFile(path.join(process.cwd(), 'src/components/QianzhiCallIslandActivity.css'), 'utf8');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #f5f7fb; }
      ${callCss}
    </style>
    <div id="expanded-island" style="position:absolute;left:50%;top:20px;transform:translateX(-50%);width:292.34px;padding:18.5px;border-radius:48px;background:#050506">
      <div class="qz-call-island-actions">
        <button class="qz-call-island-action">返回通话</button>
        <button class="qz-call-island-action">取消静音</button>
        <button class="qz-call-island-action is-danger">挂断</button>
      </div>
    </div>
  `);

  const island = page.locator('#expanded-island');
  const actions = page.locator('.qz-call-island-actions');
  const buttons = page.locator('.qz-call-island-action');
  const bounds = await actions.evaluate(element => {
    const parent = element.getBoundingClientRect();
    const children = [...element.children].map(child => {
      const rect = child.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      left: parent.left,
      right: parent.right,
      width: parent.width,
      children,
    };
  });

  await expect(buttons).toHaveCount(3);
  expect(bounds.width).toBeLessThanOrEqual(256);
  expect(bounds.children.every(item => item.width >= 60)).toBe(true);
  expect(bounds.children[0].left).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(bounds.children[2].right).toBeLessThanOrEqual(bounds.right + 1);
  await expect(island).toBeVisible();
});

test('Android Chrome: docked island keeps a reachable glass restore handle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome viewport regression only');

  const islandCss = await readFile(path.join(process.cwd(), 'src/components/MusicIsland.css'), 'utf8');
  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
    <style>
      html, body { margin: 0; min-height: 100%; background: #f5f7fb; }
      ${islandCss}
    </style>
    <div class="qz-island-host is-docked" aria-hidden="true">
      <div style="position:absolute;top:18px;left:50%;width:104px;height:31.5px;transform:translateX(-50%);border-radius:999px;background:#050506"></div>
    </div>
    <button class="qz-island-peek" type="button" aria-label="恢复灵动岛"></button>
  `);

  const host = page.locator('.qz-island-host');
  const peek = page.locator('.qz-island-peek');
  await expect(peek).toBeVisible();
  const values = await peek.evaluate(element => ({
    zIndex: getComputedStyle(element).zIndex,
    pointerEvents: getComputedStyle(element).pointerEvents,
    width: element.getBoundingClientRect().width,
    hitHeight: element.getBoundingClientRect().height,
    edgeHeight: getComputedStyle(element, '::before').height,
    handleHeight: getComputedStyle(element, '::after').height,
    hostZIndex: getComputedStyle(document.querySelector('.qz-island-host')!).zIndex,
  }));

  expect(Number(values.zIndex)).toBeGreaterThan(Number(values.hostZIndex));
  expect(values.pointerEvents).toBe('auto');
  expect(values.width).toBeGreaterThanOrEqual(82);
  expect(values.width).toBeLessThanOrEqual(96);
  expect(values.hitHeight).toBeGreaterThanOrEqual(32);
  expect(values.edgeHeight).toBe('8px');
  expect(values.handleHeight).toBe('2px');
  await expect(host).toHaveAttribute('class', /is-docked/);
});
