import { expect, test, type Page } from '@playwright/test';

// 首批只覆盖游客 / 未登录可走的关键路径：
// 不创建 test 账号、不登录、不发帖、不写库。需要登录的路径一律不写。
// 后端（Supabase）不可达时，依赖后端的用例优雅跳过并注明原因，
// 只断言本地可验证的部分（挂载成功、无黑屏、标题正确、落在登录/游客路径）。

async function verifyGuestPublicRoutes(page: Page) {
  const nav = page.getByRole('navigation', { name: '游客浏览导航' });
  const routes = [
    { label: '动态', heading: '动态' },
    { label: '日常', heading: '日常' },
    { label: '表白墙', heading: '表白墙', optional: true },
    { label: '公告', heading: '公告', optional: true },
  ];

  for (const route of routes) {
    const link = nav.getByRole('link', { name: route.label, exact: true });
    if (await link.count() === 0) {
      if (route.optional) continue;
      throw new Error(`游客导航缺少公开入口：${route.label}`);
    }
    await link.click();
    const heading = page.getByRole('heading', { level: 1, name: route.heading, exact: true });
    if (route.optional) {
      const unavailable = page.getByRole('heading', { level: 2, name: '暂未开放游客浏览', exact: true });
      await expect(heading.or(unavailable)).toBeVisible({ timeout: 15000 });
    } else {
      await expect(heading).toBeVisible({ timeout: 15000 });
    }
    await expect(nav).toBeVisible();
  }
}

test('首页可加载：挂载成功、无黑屏、标题正确', async ({ page }) => {
  await page.goto('/#/home');
  await expect(page).toHaveTitle(/Class Memory/);
  // #root 挂载出真实内容（不是黑屏空壳）
  await expect(page.locator('#root')).not.toBeEmpty();
  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length).toBeGreaterThan(0);
  // 页面不是黑屏：根节点应有可见内容
  const rootVisible = await page.locator('#root > *').first().isVisible();
  expect(rootVisible).toBe(true);
});

test('登录页可打开：未登录时落在登录入口', async ({ page }) => {
  await page.goto('/#/home');
  // 未登录时站内只会呈现三种状态之一：登录表单、游客壳、公开落地页；
  // 三者都说明应用正常挂载且未把未登录用户放进需登录的页面。
  const loginField = page.getByPlaceholder('QQ 邮箱 / 用户名');
  const guestShell = page.getByText('访客浏览', { exact: true });
  const landingLogin = page.getByRole('button', { name: '登录 / 注册' });
  await expect(
    loginField.or(guestShell).or(landingLogin),
  ).toBeVisible({ timeout: 20000 });
});

test('游客模式可浏览：能进游客壳并看到游客导航', async ({ page }) => {
  await page.goto('/#/home');
  // 先等登录表单或游客壳出现，判断后端是否可达
  const loginField = page.getByPlaceholder('QQ 邮箱 / 用户名');
  const guestShell = page.getByText('访客浏览', { exact: true });
  const guestEntryButton = page.getByRole('button', { name: '游客登录（仅浏览）' });
  const landingGuestButton = page.getByRole('button', { name: '游客登录' });
  try {
    await expect(
      loginField.or(guestShell).or(landingGuestButton),
    ).toBeVisible({ timeout: 20000 });
  } catch {
    // eslint-disable-next-line no-console
    console.log('[e2e] 游客用例跳过：后端不可达，登录页与游客入口均未出现');
    test.skip(true, '后端不可达：登录页与游客入口均未出现，跳过游客浏览用例');
  }

  // 已在游客壳里：直接断言游客导航
  if (await guestShell.isVisible()) {
    await expect(page.getByRole('navigation', { name: '游客浏览导航' })).toBeVisible();
    const headerBrand = page.locator('.guest-header .guest-brand-copy strong');
    const footerBrand = page.locator('.guest-cruip-footer-brand strong');
    await expect(headerBrand).toBeVisible();
    const configuredTitle = (await headerBrand.innerText()).trim();
    await expect(footerBrand).toHaveText(configuredTitle);
    await expect(page.locator('.guest-cruip-hero .guest-eyebrow')).toContainText(configuredTitle.toUpperCase());
    await expect(page.locator('.guest-cruip-cta .guest-eyebrow')).toContainText(configuredTitle.toUpperCase());
    await expect(page.locator('.guest-discovery-section')).toHaveCount(0);
    await expect(page.getByText('把我们的青春，留在这里')).toHaveCount(0);
    await verifyGuestPublicRoutes(page);
    return;
  }
  // 否则点游客入口进游客壳
  const entry = guestEntryButton.or(landingGuestButton);
  if (await entry.first().isVisible()) {
    await entry.first().click();
    // 游客昵称弹窗：填昵称后点「进入网站」（昵称只存当前标签页，不创建账号）
    const nicknameInput = page.getByPlaceholder('给自己取一个昵称');
    if (await nicknameInput.isVisible().catch(() => false)) {
      await nicknameInput.fill('E2E访客');
      await page.getByRole('button', { name: '进入网站' }).click();
    }
    await expect(guestShell).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('navigation', { name: '游客浏览导航' })).toBeVisible();
    const headerBrand = page.locator('.guest-header .guest-brand-copy strong');
    const footerBrand = page.locator('.guest-cruip-footer-brand strong');
    await expect(headerBrand).toBeVisible();
    const configuredTitle = (await headerBrand.innerText()).trim();
    await expect(footerBrand).toHaveText(configuredTitle);
    await expect(page.locator('.guest-cruip-hero .guest-eyebrow')).toContainText(configuredTitle.toUpperCase());
    await expect(page.locator('.guest-cruip-cta .guest-eyebrow')).toContainText(configuredTitle.toUpperCase());
    await expect(page.locator('.guest-discovery-section')).toHaveCount(0);
    await expect(page.getByText('把我们的青春，留在这里')).toHaveCount(0);
    await verifyGuestPublicRoutes(page);
  } else {
    // eslint-disable-next-line no-console
    console.log('[e2e] 游客用例跳过：后端未开放游客入口，无游客登录按钮');
    test.skip(true, '后端未开放游客入口：无游客登录按钮，跳过游客浏览用例');
  }
});

test('私信列表未登录时不暴露私信内容', async ({ page }) => {
  await page.goto('/#/friends');
  // 未登录只能落在登录页或游客壳，绝不能看到私信会话列表
  const loginField = page.getByPlaceholder('QQ 邮箱 / 用户名');
  const guestShell = page.getByText('访客浏览', { exact: true });
  const landingLogin = page.getByRole('button', { name: '登录 / 注册' });
  await expect(
    loginField.or(guestShell).or(landingLogin),
  ).toBeVisible({ timeout: 20000 });
  // 私信页独有的搜索框绝不能出现
  await expect(
    page.getByPlaceholder('搜索昵称或 @用户名（真实姓名不公开）'),
  ).toHaveCount(0);
});

test('灵动岛支持上滑收纳与顶部边缘下滑唤回', async ({ page }) => {
  await page.goto('/#/home');
  const islandHost = page.locator('.qz-island-host');
  const pillHit = page.locator('.qz-island-host [data-islandcn-hit="pill"]');
  await expect(islandHost).toBeVisible({ timeout: 20000 });
  await expect(pillHit).toHaveCount(1);

  // Dispatch a realistic pointer sequence so the test does not depend on device-specific swipe APIs.
  await page.evaluate(() => {
    const hit = document.querySelector('.qz-island-host [data-islandcn-hit="pill"]');
    if (!hit) throw new Error('灵动岛触控区域未挂载');
    const pointer = (type: string, clientY: number) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 913,
      pointerType: 'touch',
      isPrimary: true,
      clientX: window.innerWidth / 2,
      clientY,
      button: 0,
    });
    hit.dispatchEvent(pointer('pointerdown', 42));
    window.dispatchEvent(pointer('pointermove', 10));
    window.dispatchEvent(pointer('pointerup', -12));
  });

  await expect(islandHost).toHaveAttribute('data-docked', 'true', { timeout: 5000 });
  const peek = page.locator('.qz-island-peek');
  await expect(peek).toBeVisible();

  await page.evaluate(() => {
    const peekButton = document.querySelector('.qz-island-peek');
    if (!peekButton) throw new Error('顶部恢复触控区域未挂载');
    const pointer = (type: string, clientY: number) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 914,
      pointerType: 'touch',
      isPrimary: true,
      clientX: window.innerWidth / 2,
      clientY,
      button: 0,
    });
    peekButton.dispatchEvent(pointer('pointerdown', 4));
    window.dispatchEvent(pointer('pointermove', 24));
    window.dispatchEvent(pointer('pointerup', 38));
  });

  await expect(islandHost).toHaveAttribute('data-docked', 'false', { timeout: 3000 });
  await expect(peek).toHaveCount(0);
});
