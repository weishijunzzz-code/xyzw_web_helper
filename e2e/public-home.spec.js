import { expect, test } from '@playwright/test';

test.setTimeout(120000);
const box = (locator) => locator.boundingBox();
const columns = (page, selector) => page.locator(selector).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

test('public home maintains aligned compact layouts at every breakpoint', async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.home-hero-title')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.home-feature-item')).toHaveCount(4);
    await expect(page.locator('.home-stat-item')).toHaveCount(4);
    expect(await columns(page, '.home-features-grid')).toBe(width >= 1024 ? 4 : width >= 640 ? 2 : 1);
    expect(await columns(page, '.home-stats-grid')).toBe(width >= 1024 ? 4 : 2);
    const reference = (await box(page.locator('.home-nav-brand'))).x;
    for (const selector of ['.home-hero-text', '.home-section-header', '.home-stats-grid', '.home-footer-brand']) expect(Math.abs((await box(page.locator(selector))).x - reference)).toBeLessThan(1);
    const logo = await box(page.locator('.home-footer-logo'));
    const brand = await box(page.locator('.home-footer-text'));
    expect(Math.abs(logo.y + logo.height / 2 - brand.y - brand.height / 2)).toBeLessThan(1);
    expect(brand.x).toBeGreaterThan(logo.x);
    await expect(page.locator('.home-hero-title')).toHaveCSS('font-size', '20px');
    await expect(page.locator('.home-page')).not.toContainText(/1000\+|50K\+|100K\+|99\.9%/);
    if (width >= 1024) {
      expect((await box(page.locator('.home-hero-section'))).height).toBeLessThan(480);
      expect((await box(page.locator('.home-section-title'))).y).toBeLessThan(600);
    }
    if ([1440, 390].includes(width)) await page.screenshot({ path: `.screenshots/public-home-${width}.png`, fullPage: true });
  }
});

test('home anchors, menus and real destinations remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero-title')).toBeVisible();
  await page.locator('.home-hero-actions').getByRole('button', { name: '查看功能', exact: true }).click();
  await expect.poll(async () => (await box(page.locator('.home-section-title'))).y).toBeGreaterThanOrEqual(64);
  await expect.poll(async () => (await box(page.locator('.home-section-title'))).y).toBeLessThan(360);
  const destinations = await page.locator('.home-footer-link').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  expect(destinations).toEqual(['/changelog', '/tokens', '/admin/dashboard', '/admin/game-features', '/admin/backup']);
  expect(await page.evaluate((paths) => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
    return paths.every((path) => router.resolve(path).name !== 'NotFound');
  }, destinations)).toBe(true);
  await page.locator('.home-hero-actions').getByRole('button', { name: '管理账号', exact: true }).click();
  await expect(page).toHaveURL(/\/tokens$/);
  await page.goto('/');
  await page.locator('.home-nav-actions').getByRole('button', { name: '进入控制台', exact: true }).click();
  await expect(page).toHaveURL(/\/tokens$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: '打开导航菜单' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.home-drawer-menu')).toBeVisible();
  await page.locator('.home-drawer-actions').getByRole('button', { name: '管理账号', exact: true }).click();
  await expect(page).toHaveURL(/\/tokens$/);
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.home-hero-actions').getByRole('button', { name: '查看功能', exact: true }).click();
  await expect.poll(async () => (await box(page.locator('.home-section-title'))).y).toBeLessThan(360);
});

test('home footer and controls stay readable in every appearance and accent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero-title')).toBeVisible();
  for (const appearance of ['light', 'dark']) {
    for (const accent of ['violet', 'slate', 'blue', 'emerald', 'rose']) {
      await page.evaluate(async ({ appearance, accent }) => {
        (await import('/src/composables/useTheme.js')).setThemeMode(appearance);
        (await import('/src/composables/useAccent.js')).setAccent(accent);
      }, { appearance, accent });
      await expect(page.locator('.home-footer')).toHaveCSS('background-color', appearance === 'light' ? 'rgb(255, 255, 255)' : 'rgb(31, 41, 55)');
      await expect(page.locator('.home-footer-text')).toHaveCSS('color', appearance === 'light' ? 'rgb(51, 51, 51)' : 'rgb(255, 255, 255)');
      await expect.poll(() => page.locator('.home-footer-link').first().evaluate((el) => {
        const luminance = (color) => {
          const linear = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const foreground = luminance(getComputedStyle(el).color);
        const background = luminance(getComputedStyle(el.closest('footer')).backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      })).toBeGreaterThanOrEqual(4.5);
      await expect.poll(() => page.locator('.home-hero-actions').getByRole('button', { name: '管理账号', exact: true }).evaluate((el) => el.style.getPropertyValue('--n-color').toLowerCase())).toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim().toLowerCase()));
    }
  }
  await page.screenshot({ path: '.screenshots/public-home-dark.png', fullPage: true });
});
