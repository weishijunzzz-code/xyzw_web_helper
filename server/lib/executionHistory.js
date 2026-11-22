import { randomUUID } from 'node:crypto';

const key = (taskId, runId) => `cloud-run:${taskId}:${runId}`;
const indexKey = taskId => `cloud-runs:${taskId}`;
export function getRun(db, userId, taskId, runId) { return db.getKV?.(key(taskId, runId), userId) || null; }
export function saveRun(db, userId, run) {
  db.setKV?.(key(run.taskId, run.id), run, userId);
}
export function createRun(db, userId, task, { parentRunId = null, selection = null } = {}) {
  const run = { id: randomUUID(), taskId: task.id, name: task.name, parentRunId, selection, startedAt: new Date().toISOString(), state: 'running', snapshot: structuredClone(task) };
  if (run.snapshot.dailySettings === undefined) run.snapshot.dailySettings = Object.fromEntries((task.tokenIds || []).map(id => [id, db.getKV?.(`daily-settings:${id}`, userId) || null]));
  if (run.snapshot.batchSettings === undefined) run.snapshot.batchSettings = db.getKV?.('batchSettings', userId) || null;
  // Snapshots contain configuration, never recursively embed previous execution results.
  delete run.snapshot.lastResult;
  delete run.snapshot.lastRun;
  saveRun(db, userId, run);
  const index = db.getKV?.(indexKey(task.id), userId) || [];
  db.setKV?.(indexKey(task.id), [{ id: run.id, parentRunId, startedAt: run.startedAt }, ...index], userId);
  return run;
}
export function listRuns(db, userId, taskId, offset = 0) {
  return (db.getKV?.(indexKey(taskId), userId) || []).slice(offset, offset + 20).map(item => {
    const run = getRun(db, userId, taskId, item.id);
    return { ...item, state: run?.state || 'unknown', status: run?.result?.status, finishedAt: run?.finishedAt };
  });
}
export function prepareRetry(parent, selection) {
  if (parent?.state !== 'finished' || parent.result?.version !== 2) throw new Error('该记录不支持按失败项补跑');
  if (!Array.isArray(selection) || !selection.length || selection.length > 1000) throw new Error('请选择失败项');
  const allowed = new Map();
  for (const result of parent.result.summary?.results || []) {
    for (const account of result.accounts?.details || []) {
      if (['error', 'partial', 'unverified', 'incomplete'].includes(account.status)) allowed.set(JSON.stringify([account.id, result.task]), account);
    }
  }
  const unique = new Map();
  for (const item of selection) {
    const account = allowed.get(JSON.stringify([item.tokenId, item.task]));
    if (!account) throw new Error('选择中包含成功项目或不属于该记录的任务');
    unique.set(JSON.stringify([item.tokenId, item.task]), { tokenId: item.tokenId, task: item.task });
  }
  const task = structuredClone(parent.snapshot);
  task.retrySelection = [...unique.values()];
  task.tokenIds = [...new Set(task.retrySelection.map(item => item.tokenId))];
  task.settings.selectedTasks = parent.snapshot.settings.selectedTasks.filter(name => task.retrySelection.some(item => item.task === name));
  task.retrySteps = {};
  for (const item of task.retrySelection) {
    const account = allowed.get(JSON.stringify([item.tokenId, item.task]));
    if (item.task === 'startBatch' && account.steps?.length) task.retrySteps[item.tokenId] = account.steps.filter(step => ['error', 'unverified', 'partial'].includes(step.status)).map(step => step.name);
  }
  return task;
}
