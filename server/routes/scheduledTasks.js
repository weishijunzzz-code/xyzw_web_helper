import { Cron } from 'croner';
import { Router } from 'express';
import { createRun, getRun, listRuns, prepareRetry, saveRun } from '../lib/executionHistory.js';
import { persistedResult } from '../lib/executionResults.js';
import { gameLogger } from '../lib/logger.js';
import { executeScheduledTask } from '../lib/taskExecutor.js';

const cronJobs = new Map();
const scheduleErrors = new Map();

export function scheduleInfo(task) {
  if (!task.enabled) return { nextRunAt: null, nextRunReason: '已停用' };
  const job = cronJobs.get(task.id);
  try {
    const next = job?.nextRun();
    return { nextRunAt: next?.toISOString() || null, nextRunReason: next ? null : scheduleErrors.get(task.id) || (job ? '没有下一次运行时间' : '调度尚未建立') };
  } catch { return { nextRunAt: null, nextRunReason: '调度时间计算失败' }; }
}

// Both trigger paths persist the same outcome before notifying clients.
export async function executeTaskAndPersist(task, userId, db, gameManager, execute = executeScheduledTask, suppliedRun = null) {
  task = structuredClone(task);
  const run = suppliedRun || createRun(db, userId, task);
  task = structuredClone(run.snapshot);
  let lastResult;
  try { lastResult = persistedResult(await execute(task, userId, db, gameManager)); }
  catch (error) { lastResult = { version: 2, status: 'error', success: false, error: error.message }; }
  lastResult.runId = run.id;
  run.state = 'finished'; run.finishedAt = new Date().toISOString(); run.result = lastResult;
  saveRun(db, userId, run);
  // A retry is independent: retain the original plan's last result and original failure details.
  if (!run.parentRunId) db.updateScheduledTask(task.id, { lastRun: run.finishedAt, lastResult }, userId);
  gameLogger.info(`[云端任务] 结束: ${task.name}, 状态: ${lastResult.status}`);
  try { gameManager.push?.taskComplete?.(null, task.name, { taskId: task.id, status: lastResult.status, runId: run.id, persisted: true }); }
  catch (error) { gameLogger.warn(`结果已保存，完成通知发送失败: ${error.message}`); }
  return lastResult;
}

function isValidCron(expr) {
  try {
    // croner 支持 L, ?, W 等扩展语法
    new Cron(expr, { maxRuns: 0 });
    return true;
  } catch {
    return false;
  }
}

export function scheduledTaskRoutes(db, gameManager) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(db.getAllScheduledTasks(req.userId).map(task => ({ ...task, ...scheduleInfo(task) })));
  });

  r.post('/', (req, res) => {
    const { name, cron: cronExpr, taskType, tokenIds, settings, enabled } = req.body;
    if (!cronExpr) return res.status(400).json({ error: 'cron expression required' });
    if (!isValidCron(cronExpr)) return res.status(400).json({ error: `invalid cron expression: "${cronExpr}"` });
    const id = 'sched_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    if (settings?.executionMode && !['account', 'task'].includes(settings.executionMode)) return res.status(400).json({ error: 'invalid execution mode' });
    const task = { id, name: name || '', cron: cronExpr, taskType: taskType || 'batch_daily', tokenIds: tokenIds || [], settings: { ...settings, executionMode: settings?.executionMode || 'account' }, enabled: enabled !== false };
    db.addScheduledTask(task, req.userId);
    if (task.enabled) {
      scheduleJob(id, cronExpr, req.userId, db, gameManager);
    }
    res.json({ ...task, createdAt: new Date().toISOString() });
  });

  r.put('/:id', (req, res) => {
    const { id } = req.params;
    if (req.body.settings?.executionMode && !['account', 'task'].includes(req.body.settings.executionMode)) return res.status(400).json({ error: 'invalid execution mode' });
    db.updateScheduledTask(id, req.body, req.userId);
    cancelJob(id);
    const tasks = db.getAllScheduledTasks(req.userId);
    const task = tasks.find(t => t.id === id);
    if (task?.enabled && task.cron) {
      scheduleJob(id, task.cron, req.userId, db, gameManager);
    }
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    cancelJob(req.params.id);
    db.removeScheduledTask(req.params.id, req.userId);
    res.json({ ok: true });
  });

  r.get('/:id/runs', (req, res) => {
    const tasks = db.getAllScheduledTasks(req.userId);
    if (!tasks.some(task => task.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    res.json(listRuns(db, req.userId, req.params.id, Math.max(0, Number(req.query.offset) || 0)));
  });
  r.get('/:id/runs/:runId', (req, res) => {
    if (!db.getAllScheduledTasks(req.userId).some(task => task.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    const run = getRun(db, req.userId, req.params.id, req.params.runId);
    if (!run) return res.status(404).json({ error: 'not found' });
    res.json(run);
  });
  r.post('/:id/retry', async (req, res) => {
    if (!db.getAllScheduledTasks(req.userId).some(task => task.id === req.params.id)) return res.status(404).json({ error: 'not found' });
    try {
      const parent = getRun(db, req.userId, req.params.id, req.body.runId);
      const retryTask = prepareRetry(parent, req.body.selection);
      const run = createRun(db, req.userId, retryTask, { parentRunId: parent.id, selection: retryTask.retrySelection });
      res.json({ ok: true, status: 'started', runId: run.id, taskId: retryTask.id });
      await executeTaskAndPersist(retryTask, req.userId, db, gameManager, executeScheduledTask, run);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error.message });
      else gameLogger.error(`补跑记录保存失败: ${error.message}`);
    }
  });

  r.post('/:id/run', async (req, res) => {
    try {
    const tasks = db.getAllScheduledTasks(req.userId);
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    // 任务执行可能持续数分钟，同步 await 会超过前端 30s 请求超时导致误报失败。
    // 改为后台执行并立即返回；完成后与 cron 触发同口径写入 lastResult，进度通过实时日志/任务列表查看。
    const snapshot = structuredClone(task);
    const run = createRun(db, req.userId, snapshot);
    res.json({ ok: true, status: 'started', taskId: task.id, name: task.name, runId: run.id });
    await executeTaskAndPersist(snapshot, req.userId, db, gameManager, executeScheduledTask, run);
    } catch (error) {
      gameLogger.error(`执行记录保存失败: ${error.message}`);
      if (!res.headersSent) res.status(500).json({ error: '无法建立执行记录，请稍后重试' });
    }
  });

  initAllJobs(db, gameManager);

  return r;
}

function scheduleJob(taskId, cronExpr, userId, db, gameManager) {
  cancelJob(taskId);
  try {
    const job = new Cron(cronExpr, { timezone: 'Asia/Shanghai' }, async () => {
      const tasks = db.getAllScheduledTasks(userId);
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.enabled) return;
      try { await executeTaskAndPersist(task, userId, db, gameManager); }
      catch (error) { gameLogger.error(`定时执行记录保存失败: ${error.message}`); }
    });
    cronJobs.set(taskId, job);
    scheduleErrors.delete(taskId);
  } catch (e) {
    scheduleErrors.set(taskId, "调度建立失败");
    console.error(`Failed to schedule job ${taskId} with cron "${cronExpr}":`, e.message);
  }
}

function cancelJob(taskId) {
  scheduleErrors.delete(taskId);
  const job = cronJobs.get(taskId);
  if (job) {
    job.stop();
    cronJobs.delete(taskId);
  }
}

function initAllJobs(db, gameManager) {
  const users = db.getAllUsers ? db.getAllUsers() : [];
  for (const user of users) {
    const tasks = db.getAllScheduledTasks(user.id);
    for (const task of tasks) {
      if (task.enabled) {
        if (isValidCron(task.cron)) scheduleJob(task.id, task.cron, user.id, db, gameManager);
        else scheduleErrors.set(task.id, 'Cron 表达式无效');
      }
    }
  }
}
