import cron from 'node-cron';
import env from './loadEnv.js';
import apiClient from './apiClient.js';
import TaskRunner from './taskRunner.js';

class TaskScheduler {
  constructor() {
    this.tasks = new Map(); // 存储定时任务
    this.runningTasks = new Map(); // 正在执行的任务
    this.taskRunner = new TaskRunner();
    this.isRunning = false;
    this.checkInterval = null;
  }

  // 启动调度器
  async start() {
    console.log('[Scheduler] 启动任务调度器...');
    this.isRunning = true;
    
    // 立即加载一次任务
    await this.loadTasks();
    
    // 定期检查新任务
    this.checkInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.loadTasks();
      }
    }, env.TASK_CHECK_INTERVAL * 60 * 1000);

    console.log(`[Scheduler] 调度器已启动，检查间隔: ${env.TASK_CHECK_INTERVAL}分钟`);
  }

  // 停止调度器
  stop() {
    console.log('[Scheduler] 停止任务调度器...');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // 停止所有定时任务
    this.tasks.forEach((task, taskId) => {
      if (task.cronJob) {
        task.cronJob.stop();
        console.log(`[Scheduler] 停止任务: ${taskId}`);
      }
    });

    this.tasks.clear();
    console.log('[Scheduler] 调度器已停止');
  }

  // 从后端加载定时任务
  async loadTasks() {
    try {
      const tasks = await apiClient.getScheduledTasks();
      console.log(`[Scheduler] 从后端加载了 ${tasks.length} 个定时任务`);

      // 更新任务列表
      const currentTaskIds = new Set(this.tasks.keys());
      const newTaskIds = new Set(tasks.map(t => t.id));

      // 删除已不存在的任务
      for (const taskId of currentTaskIds) {
        if (!newTaskIds.has(taskId)) {
          this.removeTask(taskId);
        }
      }

      // 添加或更新任务
      for (const task of tasks) {
        if (task.enabled) {
          await this.addOrUpdateTask(task);
        } else {
          this.removeTask(task.id);
        }
      }
    } catch (error) {
      console.error('[Scheduler] 加载任务失败:', error.message);
    }
  }

  // 添加或更新任务
  async addOrUpdateTask(task) {
    const existingTask = this.tasks.get(task.id);
    
    // 如果任务已存在且配置相同，跳过
    if (existingTask && this.isTaskConfigEqual(existingTask, task)) {
      return;
    }

    // 移除旧任务
    if (existingTask) {
      this.removeTask(task.id);
    }

    // 创建新的定时任务
    const cronExpression = this.generateCronExpression(task);
    if (!cronExpression) {
      console.error(`[Scheduler] 无法为任务 ${task.id} 生成有效的cron表达式`);
      return;
    }

    console.log(`[Scheduler] 添加任务: ${task.id} (${task.name}) - ${cronExpression}`);

    const cronJob = cron.schedule(cronExpression, async () => {
      await this.executeTask(task);
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });

    this.tasks.set(task.id, {
      ...task,
      cronJob,
      cronExpression
    });
  }

  // 移除任务
  removeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      if (task.cronJob) {
        task.cronJob.stop();
      }
      this.tasks.delete(taskId);
      console.log(`[Scheduler] 移除任务: ${taskId}`);
    }
  }

  // 执行定时任务
  async executeTask(task) {
    // 检查是否已在运行
    if (this.runningTasks.has(task.id)) {
      console.log(`[Scheduler] 任务 ${task.id} 正在执行中，跳过`);
      return;
    }

    console.log(`[Scheduler] 开始执行任务: ${task.id} (${task.name})`);
    this.runningTasks.set(task.id, { startTime: Date.now() });

    try {
      await this.taskRunner.runTask(task);
      console.log(`[Scheduler] 任务 ${task.id} 执行完成`);
    } catch (error) {
      console.error(`[Scheduler] 任务 ${task.id} 执行失败:`, error.message);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  // 生成cron表达式
  generateCronExpression(task) {
    const { runType, runTime, cronExpression } = task;

    // 如果提供了自定义cron表达式，直接使用
    if (cronExpression) {
      return cronExpression;
    }

    // 解析时间 (HH:MM格式)
    const [hours, minutes] = (runTime || '00:00').split(':').map(Number);

    switch (runType) {
      case 'daily':
        // 每天执行: 分钟 小时 * * *
        return `${minutes} ${hours} * * *`;
      
      case 'monthly_first':
        // 每月1号执行: 分钟 小时 1 * *
        return `${minutes} ${hours} 1 * *`;
      
      case 'monthly_last':
        // 每月最后一天执行（使用28号近似）: 分钟 小时 28 * *
        return `${minutes} ${hours} 28 * *`;
      
      case 'weekly':
        // 每周一执行: 分钟 小时 * * 1
        return `${minutes} ${hours} * * 1`;
      
      case 'hourly':
        // 每小时执行: 0 * * * *
        return `0 * * * *`;
      
      default:
        // 默认每天执行
        return `${minutes} ${hours} * * *`;
    }
  }

  // 比较任务配置是否相同
  isTaskConfigEqual(task1, task2) {
    return task1.runType === task2.runType &&
           task1.runTime === task2.runTime &&
           task1.cronExpression === task2.cronExpression &&
           JSON.stringify(task1.selectedTokens) === JSON.stringify(task2.selectedTokens) &&
           JSON.stringify(task1.selectedTasks) === JSON.stringify(task2.selectedTasks);
  }

  // 获取调度器状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalTasks: this.tasks.size,
      runningTasks: this.runningTasks.size,
      tasks: Array.from(this.tasks.values()).map(t => ({
        id: t.id,
        name: t.name,
        cronExpression: t.cronExpression,
        enabled: t.enabled
      }))
    };
  }

  // 手动触发任务（用于测试）
  async triggerTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.error(`[Scheduler] 任务 ${taskId} 不存在`);
      return false;
    }

    await this.executeTask(task);
    return true;
  }
}

export default TaskScheduler;
