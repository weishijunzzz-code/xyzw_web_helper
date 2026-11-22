import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

test.setTimeout(60000);
test.use({ actionTimeout: 10000 });
async function mountCloud(page, options = {}) {
  const tokens = Array.from({ length: options.empty ? 0 : 17 }, (_, i) => ({ id: `account-${i}`, name: `云端长名称账号-${i}-用于省略规则验证`, server: `${5620 + i}服` }));
  const tasks = Array.from({ length: options.empty ? 0 : 9 }, (_, i) => ({ id: `task-${i}`, name: `日常计划 ${i}`, enabled: i !== 8, cron: '30 10 * * 2,3,4', tokenIds: tokens.slice(0, 4).map(t => t.id), settings: { selectedTasks: ['batchClaimFreeEnergy', 'climbTower'] }, lastRun: i ? '2026-11-16T08:00:00Z' : null, lastResult: { success: i % 2 === 0 } }));
  const state = { tasks, reads: 0, writes: [], active: 0, maxActive: 0, fail: options.fail, expired: options.expired };
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.routeWebSocket(/.*/, socket => {
    state.socket = socket;
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ type: 'log', data: { level: 'info', message: '模拟日志持续接收' } }));
  });
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'isolated-fixture');
    localStorage.setItem('auth_user', JSON.stringify({ userId: 'fixture', username: '布局测试' }));
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.fallback();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/token') return reply(tokens);
    if (path === '/api/status') return reply([{ id: 'account-0', status: 'connected' }]);
    if (path === '/api/scheduled-tasks' && request.method() === 'GET') { state.reads++; return reply(tasks); }
    if (request.method() === 'PUT' && path.startsWith('/api/scheduled-tasks/')) {
      const id = path.split('/').pop();
      const data = request.postDataJSON();
      state.writes.push({ id, ...data });
      state.active++;
      state.maxActive = Math.max(state.maxActive, state.active);
      await new Promise(resolve => setTimeout(resolve, 120));
      state.active--;
      if (state.expired) return reply({ error: 'expired' }, 401);
      if (id === state.fail) return reply({ error: '模拟更新失败' }, 500);
      Object.assign(tasks.find(t => t.id === id), data);
      return reply({ ok: true });
    }
    if (path.startsWith('/api/settings/')) return reply({ value: null });
    return reply({ error: `unexpected ${path}` }, 400);
  });
  await page.goto('/');
  await expect(page.locator('.home-page')).toBeVisible();
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
    router.addRoute({ path: '/cloud-preview', component: (await import('/src/views/CloudTasks.vue')).default });
    await router.push('/cloud-preview');
  });
  await expect(page.locator('.cloud-summary')).toBeVisible();
  if (!options.empty) await expect(page.locator('.cloud-account-card')).toHaveCount(17);
  return state;
}
async function schedules(page) {
  await page.getByRole('tab', { name: /定时任务/ }).click();
}

test('cloud pushing uses the server account ID when the local ID differs', async ({ page }) => {
  const account = { id: 'cloud-5621', name: '测试账号', server: '5621服' };
  const accounts = [account];
  const requests = [];
  const statuses = {};
  await page.routeWebSocket(/.*/, socket => socket.onMessage(() => {}));
  await page.addInitScript((local) => {
    localStorage.setItem('gameTokens', JSON.stringify([local]));
    localStorage.setItem('selectedTokenId', local.id);
    localStorage.setItem('auth_token', 'isolated-fixture');
    localStorage.setItem('auth_user', JSON.stringify({ userId: 'fixture', username: '测试' }));
  }, { ...account, id: 'local-5621', token: '' });
  await page.route('**/api/push-level/**', async (route) => {
    const request = route.request();
    const action = new URL(request.url()).pathname.split('/').at(-1);
    if (action === 'accounts') return route.fulfill({ json: accounts });
    if (action === 'status') return route.fulfill({ json: statuses });
    const { tokenId } = request.postDataJSON();
    requests.push({ action, tokenId });
    if (tokenId !== account.id) return route.fulfill({ status: 404, json: { error: '账号不存在' } });
    statuses[tokenId] = { running: action === 'start', currLevel: 40 };
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto('/admin/PushingLevels');
  const localCheckbox = page.locator('.token-cell').filter({ hasText: account.name }).getByRole('checkbox');
  await localCheckbox.click();
  const start = page.getByRole('button', { name: '云端开始', exact: true });
  await expect(start).toBeDisabled();
  await expect(page.locator('.cloud-account-hint')).toContainText('未按当前 ID 同步');

  await page.locator('.cloud-account-field .n-base-selection').click();
  await page.getByText('测试账号 · 5621服', { exact: true }).click();
  await start.click();
  await expect(page.getByText('测试账号 · 运行中 · 40 关')).toBeVisible();
  statuses[account.id] = {
    running: true, phase: 'waiting', currLevel: 41, passed: 1, failed: 0, failStreak: 0,
    lastBattle: { won: true, level: 40, completedAt: '2026-11-21T06:00:00Z' },
  };
  await expect(page.getByText('测试账号 · 等待结算 · 41 关')).toBeVisible();
  await expect(page.getByText('累计过关 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/最近一场 过关.*第 40 关/)).toBeVisible();
  statuses[account.id] = {
    ...statuses[account.id], phase: 'settling', failed: 1, failStreak: 1,
    lastBattle: { won: false, level: 41, completedAt: '2026-11-21T06:00:03Z' },
  };
  await expect(page.getByText('失败 1 场', { exact: true })).toBeVisible();
  await expect(page.getByText(/最近一场 失败.*第 41 关/)).toBeVisible();
  await page.getByRole('button', { name: '云端停止', exact: true }).click();
  await expect(page.getByText('测试账号 · 已停止 · 40 关')).toBeVisible();
  expect(requests).toEqual([
    { action: 'start', tokenId: 'cloud-5621' },
    { action: 'stop', tokenId: 'cloud-5621' },
  ]);
  accounts.length = 0;
  await page.getByRole('button', { name: '刷新状态', exact: true }).click();
  await expect(page.getByRole('link', { name: '前往云端任务同步' })).toBeVisible();
  await expect(start).toBeDisabled();
});
async function batch(page, enabled) {
  await page.getByRole('button', { name: '批量开关', exact: true }).click();
  await page.locator('.n-dropdown-option-body__label').filter({ hasText: enabled ? /全部启用/ : /全部停用/ }).click();
  await expect(page.getByRole('dialog')).toContainText(enabled ? '不会立即执行' : '不中断正在执行');
  await page.getByRole('button', { name: '确认', exact: true }).click();
}

test('cloud cards fit every viewport and preserve tabs, search and live logs', async ({ page }) => {
  await mountCloud(page);
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const grid = page.locator('.cloud-card-grid:visible');
    const gridWidth = await grid.evaluate(el => el.clientWidth);
    const cols = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(gridWidth >= 1280 ? 4 : gridWidth >= 960 ? 3 : gridWidth >= 600 ? 2 : 1);
    await page.getByPlaceholder('搜索账号 / 服').fill('账号-1-');
    await expect(page.locator('.cloud-account-card')).toHaveCount(1);
    await schedules(page);
    await expect(page.locator('.cloud-schedule-card')).toHaveCount(9);
    await page.getByRole('tab', { name: /云端账号/ }).click();
    await expect(page.getByPlaceholder('搜索账号 / 服')).toHaveValue('账号-1-');
    await page.getByPlaceholder('搜索账号 / 服').fill('');
    if ([1440, 390].includes(width)) {
      await page.screenshot({ path: `.screenshots/cloud-accounts-${width}.png` });
      await schedules(page);
      await page.screenshot({ path: `.screenshots/cloud-schedules-${width}.png` });
      await page.getByRole('tab', { name: /云端账号/ }).click();
    }
  }
  await page.getByRole('button', { name: '执行日志', exact: true }).click();
  await expect(page.locator('.cloud-log-panel')).toContainText('模拟日志持续接收');
  expect((await page.locator('.n-drawer').boundingBox()).width).toBe(320);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '执行日志', exact: true }).click();
  await expect(page.locator('.cloud-log-panel')).toContainText('模拟日志持续接收');
  await page.getByRole('button', { name: '清空日志', exact: true }).click();
  await expect(page.locator('.cloud-log-panel')).toContainText('暂无日志');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /云端账号/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /定时任务/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /定时任务/ })).toHaveAttribute('aria-selected', 'true');
});

test('bulk changes skip matching tasks, bound concurrency and retry only failures', async ({ page }) => {
  const state = await mountCloud(page, { fail: 'task-2' });
  await schedules(page);
  await batch(page, false);
  await expect(page.locator('.cloud-notice')).toContainText('成功 7 个，失败或未提交 1 个');
  expect(state.maxActive).toBeLessThanOrEqual(3);
  expect(state.writes).toHaveLength(8);
  expect(state.writes.every(t => t.id !== 'task-8' && t.enabled === false)).toBe(true);
  state.fail = null;
  await page.getByRole('button', { name: '重试失败任务' }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.cloud-notice')).toContainText('成功 1 个，失败或未提交 0 个');
  expect(state.writes.at(-1).id).toBe('task-2');
  expect(state.writes).toHaveLength(9);
  await batch(page, true);
  await expect(page.locator('.cloud-notice')).toContainText('成功 9 个，失败或未提交 0 个');
  await expect(page.getByRole('switch', { checked: true })).toHaveCount(9);
  state.fail = 'task-0';
  await page.getByRole('switch').first().click();
  await expect(page.locator('.cloud-notice').filter({ hasText: '模拟更新失败' })).toBeVisible();
  await expect(page.getByRole('switch').first()).toBeChecked();
});

test('cloud supports empty lists and stops bulk submission on expired login', async ({ page }) => {
  await mountCloud(page, { empty: true });
  await expect(page.getByText('云端还没有账号，可从本地全部同步')).toBeVisible();
  await schedules(page);
  await expect(page.getByRole('button', { name: '批量开关' })).toBeDisabled();
  await page.reload();
  const state = await mountCloud(page, { expired: true });
  await schedules(page);
  await batch(page, false);
  await expect(page.getByText('云端任务登录')).toBeVisible();
  expect(state.writes.length).toBeLessThanOrEqual(3);
});

test('cloud card content remains legible across all accent and appearance combinations', async ({ page }) => {
  await mountCloud(page);
  await schedules(page);
  for (const appearance of ['light', 'dark']) {
    for (const accent of ['blue', 'violet', 'slate', 'emerald', 'rose']) {
      await page.evaluate(({ appearance, accent }) => {
        document.documentElement.dataset.theme = appearance;
        document.documentElement.classList.toggle('dark', appearance === 'dark');
        document.documentElement.dataset.accent = accent;
        window.dispatchEvent(new Event('theme-change'));
      }, { appearance, accent });
      await expect(page.locator('.cloud-schedule-card').first()).toBeVisible();
      for (const selector of ['.cloud-card-title', '.cloud-card-description', '.cloud-task-toggle']) {
        const contrast = await page.locator(`.cloud-schedule-card ${selector}`).first().evaluate(el => {
          const luminance = color => {
            const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const foreground = luminance(getComputedStyle(el).color);
          const background = luminance(getComputedStyle(el.closest('article')).backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});


test('cloud retains edit, export and import workflows', async ({ page }) => {
  const state = await mountCloud(page);
  await schedules(page);
  await page.locator('.cloud-schedule-card').first().getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.locator('.cloud-task-form')).toBeVisible();
  await expect(page.getByText('编辑定时任务：日常计划 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^xyzw-scheduled-tasks-/);
  let imported;
  await page.route('**/api/scheduled-tasks', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    imported = route.request().postDataJSON();
    state.tasks.push({ id: 'imported', ...imported });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'imported', ...imported }) });
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'xyzw-scheduled-tasks', tasks: [{ name: '导入验证', cron: '0 9 * * *', enabled: false, tokenIds: ['must-not-transfer'], settings: { selectedTasks: ['climbTower'] } }] })) });
  await expect(page.locator('.cloud-schedule-card')).toHaveCount(10);
  expect(imported.tokenIds).toEqual([]);
  expect(imported.enabled).toBe(false);
  expect(imported.settings.executionMode).toBe("task");
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByText('新建定时任务', { exact: true })).toBeVisible();
});


test('cloud integrates with desktop and mobile console shells', async ({ page }) => {
  await mountCloud(page);
  await page.evaluate(async () => {
    const { gameTokens } = await import('/src/stores/tokenStore.ts');
    gameTokens.value = [{ id: 'isolated-shell', name: '界面测试账号', token: '', importMethod: 'bin' }];
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async width => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
      await router.push(width >= 1024 ? '/admin/cloud-tasks' : '/mobile/cloud-tasks');
    }, width);
    await expect(page.locator('.cloud-account-card')).toHaveCount(17);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.cloud-sections').getByRole('tab', { name: /定时任务/ }).click();
    await expect(page.locator('.cloud-schedule-card')).toHaveCount(9);
    if (width !== 320) await page.screenshot({ path: `.screenshots/cloud-console-${width}.png` });
    await page.locator('.cloud-sections').getByRole('tab', { name: /云端账号/ }).click();
  }
});


test('cloud shows strict outcomes, legacy warnings, account details and server next run time', async ({ page }) => {
  const state = await mountCloud(page);
  for (let i = 0; i < 5; i++) {
    const status = ['ok', 'partial', 'error', 'skip', 'unverified'][i];
    state.tasks[i].lastRun = '2026-11-17T02:00:00Z';
    state.tasks[i].nextRunAt = '2026-11-18T02:30:00Z';
    state.tasks[i].lastResult = { version: 2, status, success: status === 'ok', summary: { results: [{ task: 'climbTower', status, accounts: { details: [{ id: 'account-0', name: '账号详情测试', status, reason: '模拟结果原因', steps: [{ name: '奖励领取', status, reason: '模拟步骤说明' }] }] } }] } };
  }
  state.socket.send(JSON.stringify({ type: 'taskComplete', data: { taskName: '模拟任务', result: { persisted: true, status: 'partial' } } }));
  await schedules(page);
  for (let i = 0; i < 5; i++) {
    const card = page.locator('.cloud-schedule-card').nth(i);
    await expect(card.locator('.cloud-task-result')).toContainText(['成功', '部分失败', '失败', '跳过', '未确认'][i]);
    await expect(card.locator('.cloud-next-run')).toHaveText('下次运行：2026-11-18 10:30:00');
    const last = await card.locator('.cloud-task-result').boundingBox();
    const next = await card.locator('.cloud-next-run').boundingBox();
    expect(next.y).toBeGreaterThanOrEqual(last.y + last.height);
  }
  await expect(page.locator('.cloud-schedule-card').nth(8).locator('.cloud-next-run')).toHaveText('下次运行：已停用');
  await page.locator('.cloud-schedule-card').nth(1).getByRole('button', { name: '执行详情' }).click();
  await expect(page.locator('.cloud-execution-modal')).toContainText('账号详情测试');
  await expect(page.locator('.cloud-execution-modal')).toContainText('模拟步骤说明');
  await page.screenshot({ path: '.screenshots/cloud-results-details.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.locator('.cloud-schedule-card').nth(6).getByRole('button', { name: '执行详情' }).click();
  await expect(page.locator('.cloud-execution-modal')).toContainText('旧版记录：使用旧成功判定');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.body.scrollTop = 0; document.documentElement.scrollTop = 0; });
  await page.screenshot({ path: '.screenshots/cloud-results-mobile.png', animations: 'disabled' });
});

test('cloud polling pauses while hidden, resumes immediately, and stops on unmount', async ({ page }) => {
  await page.clock.install();
  const state = await mountCloud(page);
  const before = state.reads;
  await page.clock.runFor(31000);
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = state.reads;
  await page.clock.runFor(61000);
  expect(state.reads).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => state.reads).toBeGreaterThan(hidden);
  await page.evaluate(async () => { await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/'); });
  const unmounted = state.reads;
  await page.clock.runFor(61000);
  expect(state.reads).toBe(unmounted);
});


test('execution mode defaults preserve legacy plans and save account mode explicitly', async ({ page }) => {
  const state = await mountCloud(page);
  await schedules(page);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.locator('.cloud-task-form')).toContainText('按账号连续执行');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.cloud-schedule-card').first().getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.locator('.cloud-task-form')).toContainText('按任务批次执行');
  await page.locator('.cloud-task-form .n-form-item').filter({ hasText: '执行模式' }).locator('.n-base-selection').click();
  await page.getByText('按账号连续执行', { exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(() => state.writes.find(item => item.settings)?.settings.executionMode).toBe('account');
});

test('failed-item retry defaults exclude uncertain writes, requires review, and keeps independent history', async ({ page }) => {
  const state = await mountCloud(page);
  const result = { version: 2, runId: 'original', status: 'partial', summary: { results: [{ task: 'climbTower', status: 'partial', accounts: { details: [
    { id: 'account-0', name: '连接失败账号', status: 'error', stage: 'preflight', submitted: false, reason: '角色信息未就绪', attempts: [{ attempt: 1, status: 'error', reason: '连接失败' }] },
    { id: 'account-1', name: '超时待确认账号', status: 'unverified', submitted: true, reason: '请求超时' },
    { id: 'account-2', name: '已成功账号', status: 'ok' },
  ] } }] } };
  state.tasks[0].lastResult = result;
  state.tasks[0].lastRun = '2026-11-17T02:00:00Z';
  const records = [{ id: 'original', taskId: 'task-0', state: 'finished', startedAt: '2026-11-17T02:00:00Z', result }];
  let selection;
  await page.route('**/api/scheduled-tasks/task-0/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/runs')) return reply(records.map(run => ({ ...run, status: run.result?.status })));
    if (path.includes('/runs/')) return reply(records.find(run => path.endsWith(`/${run.id}`)));
    if (path.endsWith('/retry')) {
      selection = route.request().postDataJSON();
      records.unshift({ id: 'retry-1', parentRunId: 'original', taskId: 'task-0', state: 'running', startedAt: '2026-11-17T02:05:00Z' });
      return reply({ status: 'started', runId: 'retry-1' });
    }
    return route.fallback();
  });
  state.socket.send(JSON.stringify({ type: 'taskComplete', data: { result: { persisted: true } } }));
  await schedules(page);
  await page.locator('.cloud-schedule-card').first().getByRole('button', { name: '执行详情', exact: true }).click();
  const modal = page.locator('.cloud-execution-modal');
  await expect(modal.getByRole('checkbox')).toHaveCount(2);
  await expect(modal.getByRole('checkbox').first()).toBeChecked();
  await expect(modal.getByRole('checkbox').nth(1)).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.screenshots/cloud-retry-selection-mobile.png', animations: 'disabled' });
  await modal.getByRole('button', { name: /补跑失败项/ }).click();
  await expect(page.getByRole('dialog').filter({ hasText: '确认补跑失败项' })).toContainText('重复购买或消耗');
  await page.getByRole('button', { name: '确认补跑', exact: true }).click();
  await expect(modal).toContainText('执行中／等待账号队列');
  expect(selection.selection).toEqual([{ tokenId: 'account-0', task: 'climbTower' }]);
  expect(selection.runId).toBe('original');
  expect(state.tasks[0].lastResult).toEqual(result);
  records[0].state = 'finished'; records[0].result = { version: 2, runId: 'retry-1', status: 'ok', summary: { results: [] } };
  state.socket.send(JSON.stringify({ type: 'taskComplete', data: { result: { persisted: true, runId: 'retry-1', status: 'ok' } } }));
  await expect(modal).toContainText('本次为补跑，原记录：original');
  await expect(modal).not.toContainText('执行中／等待账号队列');
  await page.screenshot({ path: '.screenshots/cloud-retry-record.png', animations: 'disabled' });
});


test('camp detail presents confirmed counts, losses and preserved opportunities on mobile', async ({ page }) => {
  const state = await mountCloud(page);
  state.tasks[0].lastRun = '2026-11-17T03:00:00Z';
  state.tasks[0].lastResult = { version: 2, status: 'partial', summary: { results: [{ task: 'batchCampChallenge', status: 'partial', accounts: { details: [
    { id: 'account-0', name: '营地账号', status: 'partial', reason: '实战失利后继续处理剩余机会', camp: { initialUsed: 2, finalUsed: 4, remaining: 6, wins: 1, losses: 1, unknown: 0, battles: [{ nodeId: 11, name: '二区目标', status: 'error', simulatedWins: 3 }] } },
    { id: 'account-1', name: '保留机会账号', status: 'incomplete', reason: '无合格目标，保留剩余机会', camp: { initialUsed: 0, finalUsed: 0, remaining: 10, wins: 0, losses: 0, unknown: 0 } },
  ] } }] } };
  state.tasks[1].lastResult = { version: 2, status: 'incomplete', summary: { results: [] } };
  state.socket.send(JSON.stringify({ type: 'taskComplete', data: { result: { persisted: true } } }));
  await schedules(page);
  await expect(page.locator('.cloud-schedule-card').nth(1).locator('.cloud-task-result')).toContainText('未完成');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.cloud-schedule-card').first().getByRole('button', { name: '执行详情', exact: true }).click();
  const detail = page.locator('.cloud-execution-modal');
  await expect(detail).toContainText('开始已用 2 · 结束已用 4 · 剩余 6');
  await expect(detail).toContainText('本轮胜利 1 · 失败 1 · 结果不明 0');
  await expect(detail).toContainText('保留机会账号 · 未完成');
  await expect(detail).toContainText('区域2 二区目标：失败（模拟 3/3 胜）');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.screenshots/camp-challenge-details-390.png', animations: 'disabled' });
});
