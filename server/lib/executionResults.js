// Outcome describes reported execution, not an independent verification of game state.
export function aggregateStatus(items) {
  const statuses = items.map(item => item.status);
  if (!statuses.length || statuses.every(s => s === 'skip')) return 'skip';
  if (statuses.every(s => s === 'ok')) return 'ok';
  if (statuses.every(s => s === 'error')) return 'error';
  if (statuses.includes('partial') || (statuses.includes('error') && statuses.includes('ok'))) return 'partial';
  if (statuses.includes('unverified')) return 'unverified';
  if (statuses.includes('incomplete')) return statuses.includes('error') ? 'partial' : 'incomplete';
  return statuses.includes('error') ? 'error' : 'unverified';
}

export function accountSummary(details) {
  return { total: details.length, completed: details.filter(a => a.status === 'ok').length,
    failed: details.filter(a => a.status === 'error').length, status: aggregateStatus(details), details };
}

export function persistedResult(summary) {
  summary = summary && typeof summary === 'object' ? summary : { reason: '执行器未返回结果' };
  const candidate = summary.status || (Array.isArray(summary.results) ? aggregateStatus(summary.results) : 'unverified');
  const status = ['ok', 'partial', 'error', 'skip', 'unverified', 'incomplete'].includes(candidate) ? candidate : 'unverified';
  return { version: 2, status, success: status === 'ok', summary };
}
