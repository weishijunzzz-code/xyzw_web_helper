import { Router } from 'express';
import { Cron } from 'croner';
import { executeScheduledTask } from '../lib/taskExecutor.js';
import { gameLogger } from '../lib/logger.js';

const cronJobs = new Map();

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
    res.json(db.getAllScheduledTasks(req.userId));
  });

  r.post('/', (req, res) => {
    const { name, cron: cronExpr, taskType, tokenIds, settings, enabled } = req.body;
    if (!cronExpr) return res.status(400).json({ error: 'cron expression required' });
    if (!isValidCron(cronExpr)) return res.status(400).json({ error: `invalid cron expression: "${cronExpr}"` });
    const id = 'sched_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const task = { id, name: name || '', cron: cronExpr, taskType: taskType || 'batch_daily', tokenIds: tokenIds || [], settings: settings || {}, enabled: enabled !== false };
    db.addScheduledTask(task, req.userId);
    if (task.enabled) {
      scheduleJob(id, cronExpr, req.userId, db, gameManager);
    }
    res.json({ ...task, createdAt: new Date().toISOString() });
  });

  r.put('/:id', (req, res) => {
    const { id } = req.params;
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

  r.post('/:id/run', async (req, res) => {
    const tasks = db.getAllScheduledTasks(req.userId);
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    // 任务执行可能持续数分钟，同步 await 会超过前端 30s 请求超时导致误报失败。
    // 改为后台执行并立即返回；完成后与 cron 触发同口径写入 lastResult，进度通过实时日志/任务列表查看。
    res.json({ ok: true, status: 'started', taskId: task.id, name: task.name });
    try {
      const result = await executeTask(task, req.userId, db, gameManager);
      const allFailed = Array.isArray(result.results)
        && result.results.length > 0
        && result.results.every(r => r.status === 'error');
      db.updateScheduledTask(task.id, { lastRun: new Date().toISOString(), lastResult: { success: !allFailed, summary: result } }, req.userId);
      gameLogger.info(`[手动执行] 完成: ${task.name}, 结果: ${JSON.stringify((result.results || []).map(r => `${r.task}:${r.status}`))}`);
    } catch (e) {
      db.updateScheduledTask(task.id, { lastRun: new Date().toISOString(), lastResult: { success: false, error: e.message } }, req.userId);
      gameLogger.error(`[手动执行] 失败: ${task.name} - ${e.message}`);
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
      try {
        const result = await executeTask(task, userId, db, gameManager);
        // 口径：只要存在至少一个任务且全部 error，整体即视为失败（summary 里仍有逐任务明细）
        const allFailed = Array.isArray(result.results)
          && result.results.length > 0
          && result.results.every(r => r.status === 'error');
        db.updateScheduledTask(taskId, { lastRun: new Date().toISOString(), lastResult: { success: !allFailed, summary: result } }, userId);
      } catch (e) {
        db.updateScheduledTask(taskId, { lastRun: new Date().toISOString(), lastResult: { success: false, error: e.message } }, userId);
      }
    });
    cronJobs.set(taskId, job);
  } catch (e) {
    console.error(`Failed to schedule job ${taskId} with cron "${cronExpr}":`, e.message);
  }
}

function cancelJob(taskId) {
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
      if (task.enabled && isValidCron(task.cron)) {
        scheduleJob(task.id, task.cron, user.id, db, gameManager);
      }
    }
  }
}

async function executeTask(task, userId, db, gameManager) {
  return executeScheduledTask(task, userId, db, gameManager);
}
