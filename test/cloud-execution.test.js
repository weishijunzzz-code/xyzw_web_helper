import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DailyTaskRunner } from '../server/lib/dailyTaskRunner.js';
import { aggregateStatus, persistedResult } from '../server/lib/executionResults.js';
import { createServerDeps } from '../server/lib/serverDeps.js';
import { executeScheduledTask, executeSelectedTasks } from '../server/lib/taskExecutor.js';
import { executeTaskAndPersist, scheduledTaskRoutes, scheduleInfo } from '../server/routes/scheduledTasks.js';

function fixture(ids = ['a', 'b']) {
  return { tokens: { value: ids.map(id => ({ id, name: `账号${id}` })) }, tokenStatus: { value: {} }, shouldStop: { value: false }, logs: [], addLog() {}, tokenStore: { async sendMessageWithPromise() {} } };
}
test('strict result aggregation never defaults missing or skipped execution to success', () => {
  assert.equal(persistedResult(undefined).status, 'unverified');
  assert.equal(persistedResult({}).success, false);
  for (const [states, status] of [[[], 'skip'], [['skip'], 'skip'], [['ok'], 'ok'], [['ok', 'error'], 'partial'], [['error'], 'error'], [['ok', 'unverified'], 'unverified'], [['ok', 'skip'], 'unverified']]) {
    assert.equal(aggregateStatus(states.map(status => ({ status }))), status);
    assert.equal(persistedResult({ results: states.map(status => ({ status })) }).success, status === 'ok');
  }
});
test('normal tasks wait for the entire previous batch, reset statuses, and retain missing accounts', async () => {
  const deps = fixture(); const order = [];
  const summary = await executeSelectedTasks({ tokenIds: ['a', 'b', 'deleted'], settings: { selectedTasks: ['claimHangUpRewards', 'climbTower'] } }, deps, {
    hangUp: { async claimHangUpRewards() { await Promise.all(['a', 'b'].map(async id => { order.push(`start-${id}`); await new Promise(r => setTimeout(r, id === 'a' ? 5 : 1)); deps.tokenStatus.value[id] = 'completed'; order.push(`end-${id}`); })); } },
    tower: { async climbTower() { order.push('tower'); deps.tokenStatus.value.a = 'failed'; } },
  });
  assert(order.indexOf('tower') > order.indexOf('end-a'));
  assert(order.indexOf('tower') > order.indexOf('end-b'));
  assert.equal(summary.results[0].accounts.details[2].reason, '账号不存在');
  assert.equal(summary.results[1].accounts.details[1].status, 'unverified');
  assert.equal(summary.results[1].accounts.details[0].status, 'error');
  assert.notEqual(summary.status, 'ok');
});
test('caught command rejection cannot become completed success; unknown and empty tasks are not success', async () => {
  const deps = fixture(['a']);
  deps.tokenStore.sendMessageWithPromise = async () => { throw new Error('服务器拒绝领奖'); };
  const result = await executeSelectedTasks({ tokenIds: ['a'], settings: { selectedTasks: ['claimHangUpRewards', 'unknown'] } }, deps, { hangUp: { async claimHangUpRewards() { try { await deps.tokenStore.sendMessageWithPromise('a', 'claim'); } catch {} deps.tokenStatus.value.a = 'completed'; } } });
  assert.equal(result.results[0].accounts.details[0].status, 'error');
  assert.match(result.results[0].accounts.details[0].reason, /拒绝/);
  assert.equal(result.results[1].status, 'skip');
  assert.equal((await executeScheduledTask({ tokenIds: [], settings: {} })).status, 'skip');
});
function dailyStore(disconnected = false) {
  return { async sendGetRoleInfo() { return { role: { dailyTask: { complete: {} }, statistics: {}, statisticsTime: {} } }; }, async sendMessageWithPromise() { throw new Error('模拟步骤失败'); }, getWebSocketStatus() { return disconnected ? 'disconnected' : 'connected'; }, async createWebSocketConnection() { throw new Error('重连失败'); } };
}
test('daily runner returns failed steps and never reports unconditional completion', async () => {
  const logs = [];
  const runner = new DailyTaskRunner(dailyStore(), { commandDelay: 0, taskDelay: 0 });
  const result = await runner.run('a', { onLog: log => logs.push(log) }, {});
  assert.notEqual(result.status, 'ok');
  assert(result.steps.some(s => s.status === 'error' && s.reason.includes('模拟步骤失败')));
  assert(!logs.some(log => log.message === '所有任务执行完成'));
});
test('daily reconnect failure records all remaining steps as unexecuted errors', async () => {
  const progress = [];
  const result = await new DailyTaskRunner(dailyStore(true), { commandDelay: 0, taskDelay: 0 }).run('a', { onProgress: p => progress.push(p) }, {});
  assert.equal(result.status, 'error');
  assert(result.steps.every(s => s.reason.includes('未执行')));
  assert(!progress.includes(100));
});
test('both triggers share persistence and notify only after saving the strict outcome', async () => {
  for (const summary of [{ results: [{ status: 'partial' }] }, { status: 'skip', results: [] }, { results: [{ status: 'ok' }] }]) {
    const events = [];
    const result = await executeTaskAndPersist({ id: 'x', name: '测试' }, 'u', { updateScheduledTask(id, updates) { events.push('saved'); assert.equal(updates.lastResult.version, 2); } }, { push: { taskComplete(a, b, result) { events.push('pushed'); assert.equal(result.persisted, true); } } }, async () => summary);
    assert.deepEqual(events, ['saved', 'pushed']);
    assert.equal(result.success, result.status === 'ok');
  }
});
test('next run is read from live Cron jobs, changes on edit, and clears on disable', () => {
  const tasks = [{ id: 'cron-daily', enabled: true, cron: '0 6 * * *' }, { id: 'cron-weekly', enabled: true, cron: '0 9 * * 1' }, { id: 'cron-monthly', enabled: true, cron: '0 9 L * *' }];
  const db = { getAllUsers: () => [{ id: 'u' }], getAllScheduledTasks: () => tasks, updateScheduledTask(id, data) { Object.assign(tasks.find(t => t.id === id), data); }, removeScheduledTask() {} };
  const router = scheduledTaskRoutes(db, {});
  const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  try {
    for (const task of tasks) assert(scheduleInfo(task).nextRunAt);
    const dailyParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: 'numeric', hour12: false }).format(new Date(scheduleInfo(tasks[0]).nextRunAt));
    assert.equal(dailyParts, '06');
    assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date(scheduleInfo(tasks[1]).nextRunAt)), 'Monday');
    const monthly = new Date(scheduleInfo(tasks[2]).nextRunAt);
    assert([28, 29, 30, 31].includes(Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric' }).format(monthly))));
    const before = scheduleInfo(tasks[0]).nextRunAt;
    handler('put', '/:id')({ params: { id: tasks[0].id }, body: { cron: '0 18 * * *' }, userId: 'u' }, { json() {} });
    assert.notEqual(scheduleInfo(tasks[0]).nextRunAt, before);
    handler('put', '/:id')({ params: { id: tasks[0].id }, body: { enabled: false }, userId: 'u' }, { json() {} });
    assert.deepEqual(scheduleInfo(tasks[0]), { nextRunAt: null, nextRunReason: '已停用' });
  } finally { for (const task of tasks) handler('delete', '/:id')({ params: { id: task.id }, userId: 'u' }, { json() {} }); }
});


test('connection slots bound parallel accounts without real network traffic', async () => {
  let active = 0; let peak = 0;
  const manager = { gameData: new Map(), getWebSocketStatus: () => 'disconnected', async connectWithRetry() { active++; peak = Math.max(peak, active); return true; }, async sendMessageWithPromise() { return {}; }, disconnect() { active--; } };
  const tokens = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id }));
  const deps = createServerDeps(manager, { getAllTokens: () => tokens, getKV() {} }, 'u', { tokenIds: tokens.map(t => t.id), maxActive: 2 });
  await Promise.all(tokens.map(async token => { await deps.ensureConnection(token.id); deps.tokenStore.closeWebSocketConnection(token.id); deps.releaseConnectionSlot(); }));
  assert.equal(peak, 2); assert.equal(active, 0);
});


test('daily batch finishes and closes each account before starting the next', async () => {
  const deps = fixture(['a', 'b']); const order = [];
  deps.selectedTokens = { value: ['a', 'b'] };
  deps.ensureConnection = async id => order.push(`connect-${id}`);
  deps.releaseConnectionSlot = () => {};
  deps.loadSettings = async () => ({});
  deps.tokenStore.closeWebSocketConnection = id => order.push(`close-${id}`);
  const original = DailyTaskRunner.prototype.run;
  DailyTaskRunner.prototype.run = async function(id) { order.push(`run-${id}`); return { status: id === 'a' ? 'ok' : 'error', steps: [{ name: '模拟步骤', status: id === 'a' ? 'ok' : 'error' }] }; };
  try {
    const result = await executeSelectedTasks({ tokenIds: ['a', 'b'], settings: { selectedTasks: ['startBatch'] } }, deps, {});
    assert.deepEqual(order, ['connect-a', 'run-a', 'close-a', 'connect-b', 'run-b', 'close-b']);
    assert.equal(result.status, 'partial');
    assert.equal(result.results[0].accounts.details.length, 2);
  } finally { DailyTaskRunner.prototype.run = original; }
});
