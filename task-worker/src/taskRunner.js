import { v4 as uuidv4 } from 'crypto';
import apiClient from './apiClient.js';
import GameClient from './gameClient.js';
import env from './loadEnv.js';

class TaskRunner {
  constructor() {
    this.activeExecutions = new Map();
    this.gameClients = new Map();
  }

  // 执行定时任务
  async runTask(task) {
    const executionBatchId = uuidv4();
    const { id: taskId, name: taskName, userId, selectedTokens, selectedTasks } = task;

    console.log(`[TaskRunner] 开始执行任务: ${taskName} (批次: ${executionBatchId})`);

    // 获取Token列表
    const tokenIds = selectedTokens || [];
    if (tokenIds.length === 0) {
      console.log(`[TaskRunner] 任务 ${taskName} 没有配置Token，跳过执行`);
      return;
    }

    const taskList = selectedTasks || [];
    if (taskList.length === 0) {
      console.log(`[TaskRunner] 任务 ${taskName} 没有配置执行操作，跳过执行`);
      return;
    }

    // 记录执行开始
    const executionLog = {
      taskId,
      taskName,
      userId,
      executionBatchId,
      status: 'running',
      startedAt: new Date().toISOString(),
      tokensTotal: tokenIds.length,
      tokensSuccess: 0,
      tokensFailed: 0,
    };

    this.activeExecutions.set(executionBatchId, executionLog);

    // 逐个执行Token的任务
    const results = [];
    for (const tokenId of tokenIds) {
      try {
        const result = await this.executeTokenTask(task, tokenId, executionBatchId, taskList);
        results.push(result);
        
        if (result.success) {
          executionLog.tokensSuccess++;
        } else {
          executionLog.tokensFailed++;
        }
      } catch (error) {
        console.error(`[TaskRunner] 执行Token ${tokenId} 失败:`, error.message);
        executionLog.tokensFailed++;
        results.push({
          tokenId,
          success: false,
          error: error.message,
        });
      }
    }

    // 记录执行完成
    executionLog.status = executionLog.tokensFailed === 0 ? 'completed' : 'partial';
    executionLog.completedAt = new Date().toISOString();
    executionLog.results = results;

    // 保存执行日志到后端
    await this.saveExecutionLog(executionLog);

    this.activeExecutions.delete(executionBatchId);

    console.log(`[TaskRunner] 任务 ${taskName} 执行完成: 成功 ${executionLog.tokensSuccess}/${executionLog.tokensTotal}`);

    return executionLog;
  }

  // 执行单个Token的任务
  async executeTokenTask(task, tokenId, executionBatchId, taskList) {
    const { userId } = task;
    
    console.log(`[TaskRunner] 执行Token ${tokenId} 的任务`);

    const startTime = Date.now();
    const logs = [];
    const steps = [];

    // 创建游戏客户端
    const gameClient = new GameClient();
    
    try {
      // 1. 获取Token信息（需要通过API获取Token详情）
      // 这里需要扩展后端API来支持通过内部API获取Token
      
      // 2. 连接游戏服务器
      steps.push({ step: 'connect', status: 'running', time: new Date().toISOString() });
      
      // 暂时模拟连接成功
      logs.push({ time: new Date().toISOString(), level: 'info', message: '开始连接游戏服务器' });
      
      // 3. 依次执行任务列表中的操作
      for (const taskType of taskList) {
        const stepResult = await this.executeTaskType(gameClient, taskType, logs, steps);
        if (!stepResult.success) {
          throw new Error(`任务步骤 ${taskType} 执行失败: ${stepResult.error}`);
        }
      }

      const duration = Date.now() - startTime;

      return {
        tokenId,
        success: true,
        duration,
        steps,
        logs,
        executionBatchId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logs.push({ 
        time: new Date().toISOString(), 
        level: 'error', 
        message: `执行失败: ${error.message}` 
      });

      return {
        tokenId,
        success: false,
        error: error.message,
        duration,
        steps,
        logs,
        executionBatchId,
      };
    } finally {
      // 关闭游戏连接
      gameClient.disconnect();
    }
  }

  // 执行具体任务类型
  async executeTaskType(gameClient, taskType, logs, steps) {
    console.log(`[TaskRunner] 执行任务: ${taskType}`);
    
    const taskStartTime = Date.now();
    
    try {
      switch (taskType) {
        case 'signin':
          // 每日签到
          logs.push({ time: new Date().toISOString(), level: 'info', message: '执行每日签到' });
          // await gameClient.sendSignIn();
          await this.simulateDelay(1000);
          break;

        case 'dailyTasks':
          // 日常任务
          logs.push({ time: new Date().toISOString(), level: 'info', message: '执行日常任务' });
          // await gameClient.completeDailyTasks();
          await this.simulateDelay(2000);
          break;

        case 'claimRewards':
          // 领取奖励
          logs.push({ time: new Date().toISOString(), level: 'info', message: '领取日常任务奖励' });
          // await gameClient.claimDailyRewards();
          await this.simulateDelay(1000);
          break;

        case 'towerChallenge':
          // 咸将塔挑战
          logs.push({ time: new Date().toISOString(), level: 'info', message: '执行咸将塔挑战' });
          // await gameClient.challengeTower();
          await this.simulateDelay(3000);
          break;

        case 'arenaChallenge':
          // 竞技场挑战
          logs.push({ time: new Date().toISOString(), level: 'info', message: '执行竞技场挑战' });
          // await gameClient.challengeArena();
          await this.simulateDelay(2000);
          break;

        case 'clubSignin':
          // 俱乐部签到
          logs.push({ time: new Date().toISOString(), level: 'info', message: '执行俱乐部签到' });
          // await gameClient.clubSignin();
          await this.simulateDelay(1000);
          break;

        case 'refreshTokens':
          // 刷新Token（通过URL重新获取）
          logs.push({ time: new Date().toISOString(), level: 'info', message: '刷新Token' });
          // await this.refreshToken(tokenId);
          await this.simulateDelay(1500);
          break;

        default:
          logs.push({ time: new Date().toISOString(), level: 'warn', message: `未知的任务类型: ${taskType}` });
          return { success: false, error: `未知任务类型: ${taskType}` };
      }

      const duration = Date.now() - taskStartTime;
      steps.push({ 
        step: taskType, 
        status: 'completed', 
        duration,
        time: new Date().toISOString() 
      });

      logs.push({ 
        time: new Date().toISOString(), 
        level: 'info', 
        message: `任务 ${taskType} 执行成功 (${duration}ms)` 
      });

      return { success: true };
    } catch (error) {
      const duration = Date.now() - taskStartTime;
      steps.push({ 
        step: taskType, 
        status: 'failed', 
        duration,
        error: error.message,
        time: new Date().toISOString() 
      });

      return { success: false, error: error.message };
    }
  }

  // 保存执行日志到后端
  async saveExecutionLog(logData) {
    try {
      // 转换日志格式以匹配后端API
      const apiLogData = {
        taskId: logData.taskId,
        taskName: logData.taskName,
        userId: logData.userId,
        executionBatchId: logData.executionBatchId,
        status: logData.status,
        startedAt: logData.startedAt,
        completedAt: logData.completedAt,
        duration: logData.results?.reduce((sum, r) => sum + (r.duration || 0), 0),
        tokensTotal: logData.tokensTotal,
        tokensSuccess: logData.tokensSuccess,
        tokensFailed: logData.tokensFailed,
        // 如果有单个token的详细日志，需要单独保存
      };

      // 这里需要将日志保存到后端
      // 由于后端API限制，我们可能需要为每个token创建单独的日志
      if (logData.results) {
        for (const result of logData.results) {
          await apiClient.createExecutionLog({
            taskId: logData.taskId,
            taskName: logData.taskName,
            tokenId: result.tokenId,
            tokenName: result.tokenId, // 需要通过API获取token名称
            status: result.success ? 'completed' : 'failed',
            executionBatchId: logData.executionBatchId,
            startedAt: logData.startedAt,
            completedAt: logData.completedAt,
            duration: result.duration,
            error: result.error,
            steps: JSON.stringify(result.steps),
            logs: JSON.stringify(result.logs),
          });
        }
      }

      console.log(`[TaskRunner] 执行日志已保存`);
    } catch (error) {
      console.error(`[TaskRunner] 保存执行日志失败:`, error.message);
    }
  }

  // 模拟延迟（用于测试）
  simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取正在执行的任务列表
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  // 获取执行结果
  getExecutionResult(executionBatchId) {
    // 这里应该从后端查询执行结果
    return this.activeExecutions.get(executionBatchId);
  }
}

export default TaskRunner;
