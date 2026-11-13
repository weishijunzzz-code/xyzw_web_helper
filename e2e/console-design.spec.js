import { expect, test } from '@playwright/test';

test.setTimeout(120000);
test('neutral dashboard and sidebar follow every accent in both modes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gameTokens', JSON.stringify([{ id: 'design-fixture', name: 'Preview', token: '' }])));
  await page.goto('/admin/dashboard');
  await expect(page.locator('.welcome-content')).toBeVisible({ timeout: 30000 });
  for (const appearance of ['light', 'dark']) {
    for (const accent of ['violet', 'slate', 'blue', 'emerald', 'rose']) {
      await page.evaluate(async ({ accent, appearance }) => {
        (await import('/src/composables/useTheme.js')).setThemeMode(appearance);
        (await import('/src/composables/useAccent.js')).setAccent(accent);
      }, { accent, appearance });
      const selected = page.locator('.side-item.active').first();
      await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.poll(() => selected.evaluate((el) => {
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
        const probe = document.createElement('span'); probe.style.color = primary; el.appendChild(probe);
        const expected = getComputedStyle(probe).color; probe.remove();
        return getComputedStyle(el, '::before').backgroundColor === expected;
      })).toBe(true);
      await expect(page.locator('.welcome-section')).toHaveCSS('background-image', 'none');
      await expect(page.locator('.welcome-section')).toHaveCSS('color', appearance === 'light' ? 'rgb(51, 51, 51)' : 'rgb(255, 255, 255)');
      await page.waitForTimeout(350); // Let the specified 300ms color transition settle.
      await page.screenshot({ path: `.screenshots/console-${accent}-${appearance}.png` });
    }
  }
});

test('public pages have neutral surfaces and readable content', async ({ page }) => {
  for (const [route, selector] of [['/', '.home-page'], ['/design-login', '.login-page'], ['/design-register', '.register-page'], ['/missing-design-page', '.not-found-page']]) {
    if (route.startsWith('/design-')) {
      await page.goto('/');
      await expect(page.locator('.home-page')).toBeVisible({ timeout: 30000 });
      await page.evaluate(async (route) => {
        const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
        const component = route.endsWith('login') ? (await import('/src/views/Login.vue')).default : (await import('/src/views/Register.vue')).default;
        router.addRoute({ path: route, component });
        await router.push(route);
      }, route);
    } else await page.goto(route);
    await expect(page.locator(selector)).toBeVisible({ timeout: 30000 });
    await expect(page.locator(selector)).toHaveCSS('background-image', 'none');
    await page.screenshot({ path: `.screenshots/console-public-${route.replaceAll('/', '') || 'home'}.png` });
  }
});

test('canvas charts redraw with resolved accent colors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-page')).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
    const component = (await import('/src/components/Common/DataChart.vue')).default;
    router.addRoute({ path: '/design-chart', component, props: { data: [10, 20, 15], labels: ['A', 'B', 'C'] } });
    await router.push('/design-chart');
  });
  await expect(page.locator('.chart-container canvas')).toBeVisible();
  for (const accent of ['slate', 'blue', 'emerald', 'rose', 'violet']) {
    await page.evaluate(async (accent) => (await import('/src/composables/useAccent.js')).setAccent(accent), accent);
    await expect.poll(() => page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/echarts.js?'))?.name;
      if (!url) return false;
      const echarts = await import(url);
      const chart = echarts.getInstanceByDom(document.querySelector('.chart-container'));
      return chart?.getOption().color[0].toLowerCase() === getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim().toLowerCase();
    })).toBe(true);
  }
  await page.goto('/');
});


test('mobile pages retain readable text and fit the viewport without zoom', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gameTokens', JSON.stringify([{ id: 'mobile-design-fixture', name: 'Preview', token: '' }])));
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/mobile/profile', '/mobile/game-features', '/admin/cloud-tasks']) {
      await page.goto(route);
      await expect(page.locator('.mobile-main, .main').first()).toBeVisible({ timeout: 30000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const zoom = await page.locator('.mobile-main, .main').first().evaluate((el) => {
        const descendants = [el, ...el.querySelectorAll('*')];
        return descendants.every((node) => getComputedStyle(node).zoom === '1');
      });
      expect(zoom).toBe(true);
      if (route === '/mobile/profile') {
        await expect(page.locator('.profile-page h2').first()).toHaveCSS('font-size', '20px');
        const swatches = page.locator('.accent-swatches .accent-swatch');
        await expect(swatches).toHaveCount(5);
        expect(await swatches.first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      if (width === 390) await page.screenshot({ path: `.screenshots/mobile-polish-${route.replaceAll('/', '-')}.png` });
    }
  }
});


test('Arco buttons and body appearance follow all ten theme combinations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gameTokens', JSON.stringify([{ id: 'arco-fixture', name: 'Preview', token: '' }])));
  await page.goto('/admin/profile');
  const button = page.locator('.arco-btn-primary').first();
  await expect(button).toBeVisible({ timeout: 30000 });
  for (const appearance of ['light', 'dark']) {
    for (const accent of ['violet', 'slate', 'blue', 'emerald', 'rose']) {
      await page.evaluate(async ({ appearance, accent }) => {
        (await import('/src/composables/useTheme.js')).setThemeMode(appearance);
        (await import('/src/composables/useAccent.js')).setAccent(accent);
      }, { appearance, accent });
      const color = await page.evaluate(() => {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
        return `rgb(${color.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16)).join(', ')})`;
      });
      await expect(button).toHaveCSS('background-color', color);
      if (appearance === 'dark') await expect(page.locator('body')).toHaveAttribute('arco-theme', 'dark');
      else await expect(page.locator('body')).not.toHaveAttribute('arco-theme', 'dark');
    }
  }
});
