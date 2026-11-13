import { expect, test } from '@playwright/test';

test.setTimeout(120000);
async function fixtures(page) {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.routeWebSocket(/.*/, (socket) => socket.close());
  await page.addInitScript(() => {
    if (localStorage.getItem('gameTokens')) return;
    const tokens = Array.from({ length: 6 }, (_, i) => ({ id: `batch-fixture-${i}`, name: `排骨汤长名称测试账号-更多超长文字用于省略测试-${i}-78803487`, token: '', server: `测试服务器${i}`, importMethod: 'bin' }));
    localStorage.setItem('gameTokens', JSON.stringify(tokens));
    localStorage.setItem('selectedTokenId', tokens[0].id);
    localStorage.setItem('batchSettings', JSON.stringify({ tokenListColumns: 3 }));
    localStorage.setItem('tokenGroups', JSON.stringify([{ id: 'preview-group', name: '测试分组', color: '#2563EB', tokenIds: tokens.map((token) => token.id) }]));
    localStorage.setItem('scheduledTasks', JSON.stringify([{ id: 'preview-task', name: '测试定时任务', enabled: false, selectedTokens: [] }]));
  });
}
async function box(locator) { return locator.boundingBox(); }

test('batch mobile controls, header and two-column accounts fit every target width', async ({ page }) => {
  await fixtures(page);
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/mobile/batch-daily-tasks');
    const rows = page.locator('.token-row');
    await expect(rows).toHaveCount(6, { timeout: 30000 });
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await box(page.locator('.mobile-header'))).height).toBe(52);
    const nav = page.locator('.mobile-bottom-nav .nav-container');
    const navBounds = await box(nav);
    expect(navBounds.width).toBeGreaterThanOrEqual(width - 20);
    const navItems = await page.locator('.mobile-bottom-nav .nav-item').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width, right: r.right, height: r.height }; }));
    expect(navItems).toHaveLength(5);
    expect(navItems.every((item) => Math.abs(item.width - navItems[0].width) < 1 && item.x >= 0 && item.right <= width && item.height >= 44)).toBe(true);
    expect(navItems[4].right - navItems[0].x).toBeGreaterThanOrEqual(width - 28);
    const list = await box(page.locator('.token-list-card'));
    expect(list.y).toBeLessThan(width >= 375 ? 240 : 310);
    const left = await box(page.locator('.header-left'));
    const center = await box(page.locator('.header-center'));
    const right = await box(page.locator('.header-right'));
    expect(left.x + left.width).toBeLessThanOrEqual(center.x);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x);
    expect(right.x + right.width).toBeLessThanOrEqual(width);
    const themeButton = page.getByRole('button', { name: '主题设置', exact: true });
    await expect(themeButton).toBeVisible();
    const themeBounds = await box(themeButton);
    expect(themeBounds.x + themeBounds.width).toBeLessThanOrEqual(width);
    await themeButton.click();
    const panel = page.locator('.theme-panel');
    await expect(panel).toBeVisible();
    const panelBounds = await box(panel);
    expect(panelBounds.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(width);
    await panel.locator('.accent-swatch').nth(1).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'slate');
    await panel.locator('.accent-swatch').nth(2).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
    await panel.locator('.theme-option').nth(1).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await panel.locator('.theme-option').first().click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    if (width === 390) await page.screenshot({ path: '.screenshots/mobile-theme-panel-390.png' });
    await themeButton.click();
    await expect(panel).toBeHidden();
    for (const selector of ['.schedule-actions .n-button', '.execution-actions .n-button']) {
      const buttons = page.locator(selector);
      await expect(buttons).toHaveCount(4);
      const bounds = await buttons.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, height: r.height }; }));
      expect(bounds.every((r) => r.x >= 0 && r.right <= width && r.height >= 36)).toBe(true);
      expect(Math.abs(bounds[0].y - bounds[1].y)).toBeLessThan(1);
      if (width >= 375) expect(Math.abs(bounds[2].y - bounds[0].y)).toBeLessThan(1);
      else expect(bounds[2].y).toBeGreaterThan(bounds[0].y);
    }
    const bounds = await rows.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right }; }));
    expect(bounds.every((r) => r.x >= 0 && r.right <= width)).toBe(true);
    expect(Math.abs(bounds[1].y - bounds[0].y)).toBeLessThan(1);
    expect(bounds[1].x).toBeGreaterThan(bounds[0].x);
    expect(Math.abs(bounds[2].x - bounds[0].x)).toBeLessThan(1);
    expect(bounds[2].y).toBeGreaterThan(bounds[0].y);
    await expect(page.locator('.token-display-name')).toHaveCount(6);
    await expect(page.locator('.token-display-name').first()).toHaveCSS('white-space', 'nowrap');
    await expect(rows.first().getByText('测试分组', { exact: true })).toBeVisible();
    if ([320, 390, 768].includes(width)) await page.screenshot({ path: `.screenshots/batch-mobile-${width}.png` });
    if (width <= 390) expect(await page.locator('.token-display-name').first().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const settings = rows.first().locator('button');
    expect((await box(settings)).width).toBeGreaterThanOrEqual(36);
    await settings.click();
    await expect(page.getByText('任务设置 - 排骨汤长名称测试账号-更多超长文字用于省略测试-0-78803487', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.n-modal-mask').waitFor({ state: 'hidden' });
    await rows.last().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    expect((await box(rows.last())).y + (await box(rows.last())).height).toBeLessThanOrEqual((await box(page.locator('.mobile-bottom-nav'))).y);
    if (width === 390) await page.screenshot({ path: '.screenshots/batch-accounts-390.png' });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('batchSettings')).tokenListColumns)).toBe(3);
  }
  await page.evaluate(() => localStorage.setItem('selectedTokenId', ''));
  await page.reload();
  await expect(page.locator('.header-center')).toHaveCount(0);
  expect((await box(page.locator('.header-right'))).x).toBeGreaterThan(600);
  await expect(page.getByRole('button', { name: '主题设置', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mobile/dashboard');
  await expect(page.getByRole('button', { name: '主题设置', exact: true })).toBeVisible();
  expect((await box(page.locator('.header-left'))).width).toBeLessThanOrEqual(64);
  await page.screenshot({ path: '.screenshots/mobile-home-theme-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/batch-daily-tasks');
  const desktop = page.locator('.token-row');
  await expect(desktop).toHaveCount(6);
  const first = await box(desktop.nth(0)); const third = await box(desktop.nth(2));
  expect(Math.abs(first.y - third.y)).toBeLessThan(1);
  expect(third.x).toBeGreaterThan(first.x);
});

test('blue default migrates violet once and preserves subsequent choices', async ({ browser }) => {
  for (const saved of [null, 'invalid', 'violet', 'slate', 'blue', 'emerald', 'rose']) {
    const context = await browser.newContext(); const page = await context.newPage();
    await fixtures(page);
    await page.addInitScript((saved) => {
      if (!localStorage.getItem('fixture-initialized')) {
        if (saved !== null) localStorage.setItem('accent-theme', saved);
        localStorage.setItem('fixture-initialized', '1');
      }
    }, saved);
    await page.goto('/mobile/profile');
    const expected = saved === null || ['invalid', 'violet'].includes(saved) ? 'blue' : saved;
    await expect(page.locator('html')).toHaveAttribute('data-accent', expected);
    expect(await page.evaluate(() => localStorage.getItem('accent-default-blue-v1'))).toBe('1');
    await page.locator('.accent-swatches .accent-swatch').first().click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
    await page.evaluate(() => document.documentElement.removeAttribute('data-accent'));
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim().toLowerCase())).toBe('#2563eb');
    await context.close();
  }
});
