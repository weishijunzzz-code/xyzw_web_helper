import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireAccount, createAccountSession } from '../server/lib/accountSessions.js';
import { DailyTaskRunner } from '../server/lib/dailyTaskRunner.js';
import { createRun, getRun, listRuns, prepareRetry } from '../server/lib/executionHistory.js';
import { GameManager } from '../server/lib/gameManager.js';
import { executeScheduledTask } from '../server/lib/taskExecutor.js';
import { executeTaskAndPersist } from '../server/routes/scheduledTasks.js';

function manager() {
  const connected = new Set(); const calls = [];
  return { calls, gameData: new Map(), getWebSocketStatus: id => connected.has(id) ? 'connected' : 'disconnected',
    async connect(id) { calls.push(`connect:${id}`); connected.add(id); }, disconnect(id) { if (connected.delete(id)) calls.push(`close:${id}`); },
    async sendMessageWithPromise(id, cmd) { calls.push(`${cmd}:${id}`); return cmd === 'role_getroleinfo' ? { role: { roleId: id } } : {}; },
    sendMessage(id, cmd) { calls.push(`${cmd}:${id}`); }, async _refreshCredentials() { calls.push('refresh'); } };
}
function memoryDb(ids = ['a', 'b']) {
  const values = new Map(); const updates = [];
  return { updates, getAllTokens: () => ids.map(id => ({ id, name: id })), getKV: (key, user) => structuredClone(values.get(`${user}:${key}`)), setKV(key, value, user) { values.set(`${user}:${key}`, structuredClone(value)); }, updateScheduledTask(id, data) { updates.push({ id, ...data }); } };
}
test('readiness retries only three times, requires valid role data and retains failed attempts', async () => {
  const game = manager(); let probes = 0; const waits = [];
  const raw = game.sendMessageWithPromise;
  game.sendMessageWithPromise = async (id, cmd, ...args) => cmd === 'role_getroleinfo' && ++probes < 3 ? {} : raw(id, cmd, ...args);
  const session = createAccountSession(game, 'u', 'a', { wait: async ms => waits.push(ms) });
  session.beginTask(); await session.ensure();
  assert.equal(probes, 3);
  assert.deepEqual(waits, [5000, 15000]);
  assert.deepEqual(session.metadata().attempts.map(a => a.status), ['error', 'error', 'ok']);
  assert.equal(session.metadata().submitted, false);
});
test('permanent readiness error fails immediately and never submits a business command', async () => {
  const game = manager(); game.connect = async () => { throw new Error('Token not found'); };
  const session = createAccountSession(game, 'u', 'a', { wait: async () => {} });
  await assert.rejects(session.send('store_purchase', {}, 1), /not found/);
  assert.equal(session.metadata().attempts.length, 1);
  assert.equal(session.metadata().submitted, false);
  assert(!game.calls.some(c => c.startsWith('store_purchase')));
});
test('uncertain business requests cannot be automatically replayed inside a module', async () => {
  const game = manager(); const raw = game.sendMessageWithPromise; let purchases = 0;
  game.sendMessageWithPromise = async (id, cmd, ...args) => {
    if (cmd === 'store_purchase') { purchases++; throw new Error('请求超时，服务端可能已处理'); }
    return raw(id, cmd, ...args);
  };
  const session = createAccountSession(game, 'u', 'a'); session.beginTask();
  await assert.rejects(session.send('store_purchase', { count: 1 }, 1), /超时/);
  await assert.rejects(session.send('store_purchase', { count: 1 }, 1), /禁止自动重发/);
  assert.equal(purchases, 1);
  assert.equal(session.metadata().submitted, true);
});
test('transport does not reconnect and replay mutating commands through either entry point', async () => {
  let sends = 0; let reconnects = 0;
  const game = { connections: new Map([['a', { status: 'connected', client: { async sendWithPromise() { sends++; throw new Error('请求超时'); } } }]]), connectWithRetry() { reconnects++; }, sendMessageWithPromise: GameManager.prototype.sendMessageWithPromise };
  await assert.rejects(GameManager.prototype.sendMessageWithPromise.call(game, 'a', 'store_purchase', {}, 1));
  await assert.rejects(GameManager.prototype.sendWithReconnect.call(game, 'a', 'u', 'store_purchase', {}, 1, 5));
  assert.equal(sends, 2); assert.equal(reconnects, 0);
});
test('same account leases serialize across jobs, unrelated accounts proceed, release is idempotent', async () => {
  const game = {}; const first = await acquireAccount(game, 'u', 'a'); let acquired = false;
  const second = acquireAccount(game, 'u', 'a').then(release => { acquired = true; return release; });
  const other = await acquireAccount(game, 'u', 'b');
  assert.equal(acquired, false); other(); first(); first();
  const releaseSecond = await second; assert.equal(acquired, true); releaseSecond();
});
test('new account mode reuses a connection, legacy mode retains batch barriers and closes per task', async () => {
  const task = { id: 's', name: 'test', tokenIds: ['a'], settings: { selectedTasks: ['batchclubsign', 'unknown2'], taskDelay: 1, executionMode: 'account' } };
  const game = manager(); const db = memoryDb(['a']);
  await executeScheduledTask(task, 'u', db, game);
  assert.equal(game.calls.filter(c => c === 'connect:a').length, 1);
  assert.equal(game.calls.filter(c => c === 'close:a').length, 1);
  const legacy = manager(); delete task.settings.executionMode;
  await executeScheduledTask(task, 'u', db, legacy);
  assert.equal(legacy.calls.filter(c => c === 'connect:a').length, 2);
  assert.equal(legacy.calls.filter(c => c === 'close:a').length, 2);
});
test('retry selection rejects successes, scopes accounts and preserves original record', async () => {
  const db = memoryDb(); const task = { id: 's', name: 'test', tokenIds: ['a', 'b'], settings: { selectedTasks: ['startBatch', 'climbTower'], executionMode: 'account' } };
  const run = createRun(db, 'u', task);
  run.state = 'finished'; run.result = { version: 2, status: 'partial', summary: { results: [{ task: 'startBatch', accounts: { details: [{ id: 'a', status: 'partial', steps: [{ name: 'success-step', status: 'ok' }, { name: 'failed-step', status: 'error' }] }, { id: 'b', status: 'ok' }] } }] } };
  db.setKV(`cloud-run:s:${run.id}`, run, 'u');
  assert.throws(() => prepareRetry(run, [{ tokenId: 'b', task: 'startBatch' }]), /成功项目/);
  const retryTask = prepareRetry(run, [{ tokenId: 'a', task: 'startBatch' }]);
  assert.deepEqual(retryTask.tokenIds, ['a']); assert.deepEqual(retryTask.retrySteps.a, ['failed-step']);
  const retryRun = createRun(db, 'u', retryTask, { parentRunId: run.id, selection: retryTask.retrySelection });
  await executeTaskAndPersist(retryTask, 'u', db, {}, async () => ({ status: 'ok', results: [] }), retryRun);
  assert.deepEqual(getRun(db, 'u', 's', run.id), run);
  assert.equal(getRun(db, 'other-user', 's', run.id), null);
  assert.equal(getRun(db, 'u', 's', retryRun.id).result.status, 'ok');
  assert.equal(listRuns(db, 'u', 's').length, 2);
  assert.equal(db.updates.length, 0);
});
test('daily retry executes only the selected failed step, never successful steps', async () => {
  const calls = [];
  const runner = new DailyTaskRunner({ async sendGetRoleInfo() { return { role: { roleId: 'a' } }; }, async sendMessageWithPromise(id, cmd) { calls.push(cmd); return {}; }, getWebSocketStatus: () => 'connected' }, { commandDelay: 0, taskDelay: 0 });
  const outcome = await runner.run('a', {}, { retryStepNames: ['领取周常任务奖励'] });
  assert.deepEqual(outcome.steps.map(s => s.name), ['领取周常任务奖励']);
  assert(!calls.includes('task_claimdailyreward'));
  assert(calls.includes('task_claimweekreward'));
});


test('account workers respect configured concurrency and release sessions after exceptions', async () => {
  const game = manager(); let active = 0; let peak = 0; const rawConnect = game.connect; const rawClose = game.disconnect; const rawSend = game.sendMessageWithPromise; const live = new Set();
  game.connect = async id => { live.add(id); active++; peak = Math.max(peak, active); await rawConnect(id); };
  game.disconnect = id => { if (live.delete(id)) active--; rawClose(id); };
  game.sendMessageWithPromise = async (...args) => { await new Promise(resolve => setTimeout(resolve, 2)); return rawSend(...args); };
  await executeScheduledTask({ id: 'parallel', tokenIds: ['a', 'b', 'c', 'd'], settings: { executionMode: 'account', selectedTasks: ['unknown'], maxActive: 2 } }, 'u', memoryDb(['a', 'b', 'c', 'd']), game);
  assert.equal(peak, 2); assert.equal(active, 0);
});


test('exhausted transient readiness failure never starts business work', async () => {
  const game = manager(); const raw = game.sendMessageWithPromise;
  game.sendMessageWithPromise = async (id, cmd, ...args) => cmd === 'role_getroleinfo' ? {} : raw(id, cmd, ...args);
  const session = createAccountSession(game, 'u', 'a', { wait: async () => {} });
  await assert.rejects(session.send('store_purchase', {}, 1), /尚未就绪/);
  assert.equal(session.metadata().attempts.length, 3);
  assert.equal(session.metadata().submitted, false);
  assert(!game.calls.some(call => call.startsWith('store_purchase')));
  await assert.rejects(session.ensure(), /已用尽/);
  assert.equal(session.metadata().attempts.length, 3);
});
test('fire-and-forget reads do not invalidate acknowledged business results', async () => {
  const session = createAccountSession(manager(), 'u', 'a'); session.beginTask();
  await session.ensure(); session.sendWithoutReply('role_getroleinfo', {});
  assert.equal(session.metadata().unacknowledged, false);
});
