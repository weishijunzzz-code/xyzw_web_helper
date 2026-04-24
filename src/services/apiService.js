import api from '@/api';

const apiService = {
  getTasks: async () => {
    const result = await api.tasks.getScheduled();
    return { success: result.success, data: result.data?.tasks || [] };
  },

  getTodayStats: async (date = null) => {
    const params = { limit: 500 };
    if (date) {
      params.date = date;
    }
    const result = await api.tasks.getExecutionLogs(params);
    const logs = result.data?.logs || [];

    const todayExecutedCount = logs.filter(l => l.status === 'completed' || l.status === 'success').length;
    const todayFailedCount = logs.filter(l => l.status === 'failed' || l.status === 'error').length;

    const taskExecutions = [];
    const batchGroups = new Map();
    const noBatchLogs = [];

    logs.forEach(log => {
      const batchId = log.executionBatchId;
      if (batchId) {
        if (!batchGroups.has(batchId)) {
          batchGroups.set(batchId, []);
        }
        batchGroups.get(batchId).push(log);
      } else {
        noBatchLogs.push(log);
      }
    });

    batchGroups.forEach((batchLogs, batchId) => {
      const firstLog = batchLogs[0];
      const success = batchLogs.filter(l => l.status === 'completed' || l.status === 'success').length;
      const failedLogs = batchLogs.filter(l => l.status === 'failed' || l.status === 'error');
      const failed = failedLogs.length;

      const sortedLogs = batchLogs.sort((a, b) =>
        new Date(a.startedAt || a.executedAt).getTime() - new Date(b.startedAt || a.executedAt).getTime()
      );

      taskExecutions.push({
        taskId: firstLog.taskId,
        taskName: firstLog.taskName,
        executionBatchId: batchId,
        startedAt: sortedLogs[0]?.startedAt || sortedLogs[0]?.executedAt,
        completedAt: sortedLogs[sortedLogs.length - 1]?.completedAt,
        success,
        failed,
        total: batchLogs.length,
        logs: sortedLogs,
        failedTokens: failedLogs.map(l => ({
          tokenId: l.tokenId,
          tokenName: l.tokenName,
          startedAt: l.startedAt,
          error: l.error,
          result: l.result,
          logId: l.id
        }))
      });
    });

    if (noBatchLogs.length > 0) {
      const taskGroups = new Map();
      noBatchLogs.forEach(log => {
        const taskId = log.taskId;
        if (!taskGroups.has(taskId)) {
          taskGroups.set(taskId, []);
        }
        taskGroups.get(taskId).push(log);
      });

      const GROUP_WINDOW_MS = 5 * 60 * 1000;

      taskGroups.forEach((taskLogs, taskId) => {
        const sortedLogs = taskLogs.sort((a, b) =>
          new Date(b.startedAt || b.executedAt).getTime() - new Date(a.startedAt || a.executedAt).getTime()
        );

        if (sortedLogs.length === 0) return;

        const groups = [];
        let currentGroup = null;

        for (let i = 0; i < sortedLogs.length; i++) {
          const log = sortedLogs[i];
          const logTime = new Date(log.startedAt || log.executedAt).getTime();
          const tokenId = log.tokenId || log.token_id;

          const timeInWindow = currentGroup && (
            Math.abs(currentGroup.minTime - logTime) <= GROUP_WINDOW_MS ||
            Math.abs(currentGroup.maxTime - logTime) <= GROUP_WINDOW_MS
          );
          const tokenExists = currentGroup && tokenId && currentGroup.tokenSet.has(tokenId);

          if (currentGroup && timeInWindow && !tokenExists) {
            currentGroup.total++;
            currentGroup.logs.push(log);
            if (tokenId) currentGroup.tokenSet.add(tokenId);
            if (log.status === 'completed' || log.status === 'success') {
              currentGroup.success++;
            } else if (log.status === 'failed' || log.status === 'error') {
              currentGroup.failed++;
              currentGroup.failedTokens.push({
                tokenId: log.tokenId,
                tokenName: log.tokenName,
                startedAt: log.startedAt || log.executedAt,
                error: log.error,
                result: log.result,
                logId: log.id
              });
            }
            currentGroup.minTime = Math.min(currentGroup.minTime, logTime);
            currentGroup.maxTime = Math.max(currentGroup.maxTime, logTime);
          } else {
            if (currentGroup) {
              delete currentGroup.tokenSet;
              delete currentGroup.minTime;
              delete currentGroup.maxTime;
              groups.push(currentGroup);
            }

            currentGroup = {
              taskId: taskId,
              taskName: log.taskName,
              startedAt: log.startedAt || log.executedAt,
              completedAt: log.completedAt,
              success: log.status === 'completed' || log.status === 'success' ? 1 : 0,
              failed: log.status === 'failed' || log.status === 'error' ? 1 : 0,
              total: 1,
              logs: [log],
              failedTokens: log.status === 'failed' || log.status === 'error' ? [{
                tokenId: log.tokenId,
                tokenName: log.tokenName,
                startedAt: log.startedAt || log.executedAt,
                error: log.error,
                result: log.result,
                logId: log.id
              }] : [],
              tokenSet: new Set([tokenId]),
              minTime: logTime,
              maxTime: logTime
            };
          }
        }

        if (currentGroup && currentGroup.total > 0) {
          delete currentGroup.tokenSet;
          delete currentGroup.minTime;
          delete currentGroup.maxTime;
          groups.push(currentGroup);
        }

        taskExecutions.push(...groups);
      });
    }

    taskExecutions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    const todaySuccessCount = taskExecutions.reduce((sum, exec) => sum + exec.success, 0);

    return {
      success: result.success,
      data: {
        todayExecutedCount,
        todaySuccessCount,
        todayFailedCount,
        taskExecutions
      }
    };
  },

  getTaskExecutions: async (taskId, params = {}) => {
    const result = await api.tasks.getExecutionLogs({ taskId, ...params });
    return { success: result.success, data: result.data?.logs || [] };
  },

  updateTask: async (taskId, taskData) => {
    const result = await api.tasks.updateScheduled(taskId, taskData);
    return result;
  },

  createTask: async (taskData) => {
    const result = await api.tasks.createScheduled(taskData);
    return result;
  },

  deleteTask: async (taskId) => {
    const result = await api.tasks.deleteScheduled(taskId);
    return result;
  },

  runTask: async (taskId) => {
    const result = await api.tasks.executeScheduled(taskId);
    return result;
  },

  runTaskForToken: async (taskId, tokenId) => {
    const result = await api.tasks.executeScheduledForToken(taskId, tokenId);
    return result;
  },

  clearTaskExecutions: async () => {
    const result = await api.tasks.cleanupLogs();
    return result;
  },

  getScheduleExecutions: async (taskId, startedAt, executionBatchId, date = null) => {
    if (executionBatchId) {
      const result = await api.tasks.getExecutionLogs({ executionBatchId });
      return { success: result.success, data: result.data?.logs || [] };
    }

    const params = { taskId };
    if (date) params.date = date;
    const result = await api.tasks.getExecutionLogs(params);
    const logs = result.data?.logs || [];

    if (logs.length === 0) return { success: result.success, data: [] };

    const GROUP_WINDOW_MS = 5 * 60 * 1000;
    const sortedLogs = logs.sort((a, b) =>
      new Date(b.startedAt || b.executedAt).getTime() - new Date(a.startedAt || a.executedAt).getTime()
    );

    const targetTime = new Date(startedAt).getTime();
    const filtered = sortedLogs.filter(log => {
      const logTime = new Date(log.startedAt || log.executedAt).getTime();
      return Math.abs(targetTime - logTime) <= GROUP_WINDOW_MS;
    });

    return { success: result.success, data: filtered };
  },

  getExecutionDetail: async (taskId, tokenId, startedAt, date = null) => {
    const params = { taskId, tokenId };
    if (date) params.date = date;
    const result = await api.tasks.getExecutionLogs(params);
    const logs = result.data?.logs || [];
    const log = logs.find(l => l.tokenId === tokenId && l.startedAt?.startsWith(startedAt?.split('T')[0] || ''));
    return { success: result.success, data: log || null };
  },

  getTokens: async () => {
    const result = await api.tokens.getAll();
    return { success: result.success, data: result.data?.tokens || [] };
  },

  shouldUseBackend: async () => {
    return true;
  },

  getTaskTemplates: async () => {
    const result = await api.tasks.getTemplates();
    return { success: result.success, data: result.data?.templates || [] };
  },

  createTaskTemplate: async (templateData) => {
    return { success: true };
  },

  saveTokenSettings: async (tokenId, settings) => {
    return { success: true };
  },

  createToken: async (tokenData) => {
    const result = await api.tokens.add(tokenData);
    return result;
  },

  updateTokensOrder: async (orders) => {
    const result = await api.tokens.updateOrder(orders);
    return result;
  },

  createExecutionLog: async (logData) => {
    const result = await api.tasks.createExecutionLog(logData);
    return result;
  }
};

export default apiService;
