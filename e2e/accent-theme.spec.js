import { expect, test } from '@playwright/test';

test.setTimeout(60000);

const palettes = {
  violet: ['#7c3aed', '#a78bfa'], slate: ['#475569', '#94a3b8'],
  blue: ['#2563eb', '#60a5fa'], emerald: ['#059669', '#34d399'], rose: ['#e11d48', '#fb7185'],
};

const expectedTokens = {"violet": [{"primary-color": "#7c3aed", "primary-color-hover": "#6d28d9", "primary-color-pressed": "#5b21b6", "primary-color-light": "#f5f3ff", "secondary-color": "#8b5cf6"}, {"primary-color": "#a78bfa", "primary-color-hover": "#c4b5fd", "primary-color-pressed": "#8b5cf6", "primary-color-light": "rgba(167,139,250,.18)", "secondary-color": "#a78bfa"}], "slate": [{"primary-color": "#475569", "primary-color-hover": "#334155", "primary-color-pressed": "#1e293b", "primary-color-light": "#f1f5f9", "secondary-color": "#64748b"}, {"primary-color": "#94a3b8", "primary-color-hover": "#cbd5e1", "primary-color-pressed": "#e2e8f0", "primary-color-light": "rgba(148,163,184,.18)", "secondary-color": "#64748b"}], "blue": [{"primary-color": "#2563eb", "primary-color-hover": "#1d4ed8", "primary-color-pressed": "#1e40af", "primary-color-light": "#eff6ff", "secondary-color": "#3b82f6"}, {"primary-color": "#60a5fa", "primary-color-hover": "#93c5fd", "primary-color-pressed": "#3b82f6", "primary-color-light": "rgba(96,165,250,.18)", "secondary-color": "#60a5fa"}], "emerald": [{"primary-color": "#059669", "primary-color-hover": "#047857", "primary-color-pressed": "#065f46", "primary-color-light": "#ecfdf5", "secondary-color": "#10b981"}, {"primary-color": "#34d399", "primary-color-hover": "#6ee7b7", "primary-color-pressed": "#10b981", "primary-color-light": "rgba(52,211,153,.18)", "secondary-color": "#34d399"}], "rose": [{"primary-color": "#e11d48", "primary-color-hover": "#be123c", "primary-color-pressed": "#9f1239", "primary-color-light": "#fff1f2", "secondary-color": "#f43f5e"}, {"primary-color": "#fb7185", "primary-color-hover": "#fda4af", "primary-color-pressed": "#f43f5e", "primary-color-light": "rgba(251,113,133,.18)", "secondary-color": "#fb7185"}]};

async function openProfile(page) {
  await page.addInitScript(() => {
    // A disconnected fixture enables the settings route without game traffic.
    if (!localStorage.getItem('gameTokens')) localStorage.setItem('gameTokens', JSON.stringify([{ id: 'accent-fixture', name: 'Theme preview', token: '' }]));
  });
  await page.goto('/admin/profile');
  await expect(page.locator('.profile-page .accent-swatch')).toHaveCount(5, { timeout: 20000 });
}

async function mode(page, value) {
  await page.evaluate(async (value) => {
    const { setThemeMode } = await import('/src/composables/useTheme.js');
    setThemeMode(value);
  }, value);
}

test('five accents in both appearances update CSS, Naive UI and both entries', async ({ page }) => {
  await openProfile(page);
  for (const [name, colors] of Object.entries(palettes)) {
    const index = Object.keys(palettes).indexOf(name);
    for (const [i, appearance] of ['light', 'dark'].entries()) {
      await mode(page, appearance);
      await page.locator('.profile-page .accent-swatch').nth(index).click();
      await expect(page.locator('html')).toHaveAttribute('data-accent', name);
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim().toLowerCase())).toBe(colors[i]);
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
      await expect.poll(() => page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return Object.fromEntries(['primary-color', 'primary-color-hover', 'primary-color-pressed', 'primary-color-light', 'secondary-color'].map((key) => [key, css.getPropertyValue(`--${key}`).trim().toLowerCase()]));
      })).toEqual(expectedTokens[name][i]);
      await expect(page.locator('.theme-panel .accent-swatch').nth(index)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => page.locator('.theme-toggle-btn').evaluate((el) => el.style.getPropertyValue('--n-ripple-color').toLowerCase())).toBe(colors[i]);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('accent-theme'))).toBe(name);
      await page.locator('.theme-panel').screenshot({ path: `.screenshots/accent-${name}-${appearance}.png` });
      await page.getByRole('button', { name: '主题设置', exact: true }).click();
    }
  }
  await page.getByRole('button', { name: '主题设置', exact: true }).click();
  await page.locator('.theme-panel .accent-swatch').nth(1).click();
  await expect(page.locator('.profile-page .accent-swatch').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'slate');
});

test('default, invalid storage, cross-tab synchronization and system mode', async ({ page, context }) => {
  await openProfile(page);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
  await page.evaluate(() => localStorage.setItem('accent-theme', 'invalid'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
  const other = await context.newPage();
  await openProfile(other);
  await other.locator('.accent-swatches .accent-swatch').nth(2).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
  await mode(page, 'system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('system');
});

test('responsive swatches and reduced motion', async ({ page }) => {
  await openProfile(page);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(width <= 768 ? '/mobile/profile' : '/admin/profile');
    await expect(page.locator('.accent-swatches .accent-swatch')).toHaveCount(5);
    const boxes = await page.locator('.accent-swatches .accent-swatch').evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, height: r.height }; }));
    expect(boxes.every((r) => r.x >= 0 && r.right <= width && r.width >= 44 && r.height >= 44)).toBe(true);
    if (width === 1440 || width === 390) {
      await page.locator('.accent-swatches').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.screenshots/accent-${width}.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.accent-swatch').first()).toHaveCSS('transition-duration', '0s');
});
