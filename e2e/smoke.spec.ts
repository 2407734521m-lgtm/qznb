import { expect, test } from '@playwright/test';

// 首批只覆盖游客 / 未登录可走的关键路径：
// 不创建 test 账号、不登录、不发帖、不写库。需要登录的路径一律不写。
// 后端（Supabase）不可达时，依赖后端的用例优雅跳过并注明原因，
// 只断言本地可验证的部分（挂载成功、无黑屏、标题正确、落在登录/游客路径）。

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
