import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { calculateNextExecutionTime, matchesCronExpression } from '@/utils/batch/cronUtils';
import { taskDB, templateDB, migrateFromLocalStorage } from '@/utils/indexedDB';

// 任务状态类型
export type TaskStatus = 'running' | 'paused' | 'error' | 'completed';

// 定时任务接口
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  status: TaskStatus;
  associatedAccounts: string[];
  templateId: string;
  templateName?: string;
  lastRunTime?: string;
  nextRunTime?: string;
  runCount: {
    total: number;
    today: number;
    todaySuccess: number;
    todayFailed: number;
  };
  createdAt: string;
  updatedAt: string;
  settings?: Record<string, any>;
}

// 任务统计接口
export interface TaskStatistics {
  total: number;
  active: number;
  todaySuccess: number;
  todayFailed: number;
}

// 任务模板接口
export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  tasks: string[];
  settings?: Record<string, any>;
}

export const useScheduledTaskStore = defineStore('scheduledTask', () => {
  // State
  const tasks = ref<ScheduledTask[]>([]);
  const templates = ref<TaskTemplate[]>([]);
  const isLoading = ref(false);
  const currentExecutingTask = ref<string | null>(null);

  // Getters
  const statistics = computed<TaskStatistics>(() => ({
    total: tasks.value.length,
    active: tasks.value.filter(t => t.status === 'running').length,
    todaySuccess: tasks.value.reduce((sum, t) => sum + (t.runCount?.todaySuccess || 0), 0),
    todayFailed: tasks.value.reduce((sum, t) => sum + (t.runCount?.todayFailed || 0), 0)
  }));

  const runningTasks = computed(() => 
    tasks.value.filter(t => t.status === 'running')
  );

  const pausedTasks = computed(() => 
    tasks.value.filter(t => t.status === 'paused')
  );

  // 获取即将执行的任务（按下次执行时间排序）
  const upcomingTasks = computed(() => {
    return tasks.value
      .filter(t => t.status === 'running' && t.nextRunTime)
      .sort((a, b) => {
        const timeA = new Date(a.nextRunTime!).getTime();
        const timeB = new Date(b.nextRunTime!).getTime();
        return timeA - timeB;
      });
  });

  // 获取最近一个要执行的任务
  const nextExecutingTask = computed(() => {
    return upcomingTasks.value[0] || null;
  });

  // Actions
  
  // 加载任务列表（从IndexedDB）
  const loadTasks = async () => {
    try {
      // 先尝试从 IndexedDB 加载
      const savedTasks = await taskDB.getAll();
      if (savedTasks && savedTasks.length > 0) {
        tasks.value = savedTasks;
        console.log(`[Store] 从 IndexedDB 加载了 ${savedTasks.length} 个任务`);
        // 清除旧的 localStorage，防止数据不一致
        localStorage.removeItem('scheduledTasks');
      } else {
        // 如果 IndexedDB 没有数据，尝试从 localStorage 迁移（仅一次）
        const saved = localStorage.getItem('scheduledTasks');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            tasks.value = parsed;
            // 迁移到 IndexedDB
            await taskDB.saveAll(parsed);
            console.log(`[Store] 从 localStorage 迁移了 ${parsed.length} 个任务到 IndexedDB`);
            // 迁移完成后清除 localStorage
            localStorage.removeItem('scheduledTasks');
          }
        }
      }
      // 更新下次执行时间
      updateNextRunTimes();
    } catch (error) {
      console.error('加载定时任务失败:', error);
    }
  };

  // 保存任务列表（到IndexedDB）
  const saveTasks = async () => {
    try {
      await taskDB.saveAll(tasks.value);
      // 同时备份到 localStorage 以防万一
      localStorage.setItem('scheduledTasks_backup', JSON.stringify(tasks.value));
    } catch (error) {
      console.error('保存定时任务失败:', error);
      // 如果 IndexedDB 失败，回退到 localStorage
      localStorage.setItem('scheduledTasks', JSON.stringify(tasks.value));
    }
  };

  // 更新所有任务的下次执行时间
  const updateNextRunTimes = () => {
    tasks.value.forEach(task => {
      if (task.status === 'running') {
        const nextTime = calculateNextExecutionTime({
          runType: 'cron',
          cronExpression: task.cronExpression
        } as any);
        if (nextTime) {
          task.nextRunTime = nextTime.toISOString();
        }
      }
    });
  };

  // 创建新任务
  const createTask = (taskData: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): ScheduledTask => {
    const now = new Date().toISOString();
    const newTask: ScheduledTask = {
      ...taskData,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      runCount: {
        total: 0,
        today: 0,
        todaySuccess: 0,
        todayFailed: 0
      }
    };

    // 计算下次执行时间
    const nextTime = calculateNextExecutionTime({
      runType: 'cron',
      cronExpression: newTask.cronExpression
    } as any);
    if (nextTime) {
      newTask.nextRunTime = nextTime.toISOString();
    }

    tasks.value.push(newTask);
    saveTasks();
    return newTask;
  };

  // 更新任务
  const updateTask = (id: string, updates: Partial<ScheduledTask>) => {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.value[index] = {
        ...tasks.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      // 如果更新了cron表达式，重新计算下次执行时间
      if (updates.cronExpression) {
        const nextTime = calculateNextExecutionTime({
          runType: 'cron',
          cronExpression: updates.cronExpression
        } as any);
        if (nextTime) {
          tasks.value[index].nextRunTime = nextTime.toISOString();
        }
      }
      
      saveTasks();
      return tasks.value[index];
    }
    return null;
  };

  // 删除任务
  const deleteTask = async (id: string) => {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      // 先从内存中移除
      tasks.value.splice(index, 1);
      // 然后从 IndexedDB 中删除该任务
      await taskDB.delete(id);
      // 更新 localStorage 备份（删除旧键，使用新键）
      localStorage.setItem('scheduledTasks_backup', JSON.stringify(tasks.value));
      // 同时清除旧的 localStorage 键，防止迁移时恢复
      localStorage.removeItem('scheduledTasks');
      return true;
    }
    return false;
  };

  // 暂停任务
  const pauseTask = (id: string) => {
    return updateTask(id, { status: 'paused' });
  };

  // 启动任务
  const startTask = (id: string) => {
    return updateTask(id, { status: 'running' });
  };

  // 立即执行任务
  const executeTaskImmediately = async (id: string, executeFn: (task: ScheduledTask) => Promise<void>) => {
    const task = tasks.value.find(t => t.id === id);
    if (!task) return false;

    currentExecutingTask.value = id;
    try {
      await executeFn(task);
      
      // 更新执行统计
      task.runCount.total++;
      task.runCount.today++;
      task.runCount.todaySuccess++;
      task.lastRunTime = new Date().toISOString();
      
      // 重新计算下次执行时间
      const nextTime = calculateNextExecutionTime({
        runType: 'cron',
        cronExpression: task.cronExpression
      } as any);
      if (nextTime) {
        task.nextRunTime = nextTime.toISOString();
      }
      
      saveTasks();
      return true;
    } catch (error) {
      task.runCount.todayFailed++;
      task.status = 'error';
      saveTasks();
      throw error;
    } finally {
      currentExecutingTask.value = null;
    }
  };

  // 检查并执行到期的任务
  const checkAndExecuteDueTasks = async (executeFn: (task: ScheduledTask) => Promise<void>) => {
    const now = new Date();
    const dueTasks = tasks.value.filter(task => {
      if (task.status !== 'running') return false;
      if (!task.nextRunTime) return false;
      
      const nextTime = new Date(task.nextRunTime);
      return nextTime <= now;
    });

    for (const task of dueTasks) {
      try {
        await executeTaskImmediately(task.id, executeFn);
      } catch (error) {
        console.error(`执行任务 ${task.name} 失败:`, error);
      }
    }
  };

  // 重置今日统计（每天0点调用）
  const resetDailyStats = () => {
    tasks.value.forEach(task => {
      task.runCount.today = 0;
      task.runCount.todaySuccess = 0;
      task.runCount.todayFailed = 0;
    });
    saveTasks();
  };

  // 默认任务模板
  const defaultTemplates: TaskTemplate[] = [
    {
      id: 'daily_signin',
      name: '每日签到',
      description: '执行每日签到任务',
      tasks: ['signin_getlist'],
      settings: {}
    },
    {
      id: 'claim_hangup',
      name: '领取挂机奖励',
      description: '领取挂机离线奖励',
      tasks: ['hangup_getaward'],
      settings: {}
    },
    {
      id: 'claim_bottle',
      name: '领取罐子',
      description: '领取金银铜罐子',
      tasks: ['bottle_getlist'],
      settings: {}
    },
    {
      id: 'arena_fight',
      name: '竞技场',
      description: '竞技场战斗',
      tasks: ['arena_getareatarget'],
      settings: {}
    },
    {
      id: 'tower_climb',
      name: '爬塔',
      description: '咸将塔爬塔',
      tasks: ['tower_getinfo'],
      settings: {}
    },
    {
      id: 'club_signin',
      name: '俱乐部签到',
      description: '俱乐部每日签到',
      tasks: ['club_signin'],
      settings: {}
    },
    {
      id: 'study_answer',
      name: '答题',
      description: '每日答题',
      tasks: ['study_getquestion'],
      settings: {}
    },
    {
      id: 'store_purchase',
      name: '黑市采购',
      description: '黑市自动采购',
      tasks: ['store_getlist'],
      settings: {}
    },
    {
      id: 'fish',
      name: '钓鱼',
      description: '自动钓鱼',
      tasks: ['artifact_lottery'],
      settings: {}
    },
    {
      id: 'recruit',
      name: '招募',
      description: '自动招募',
      tasks: ['recruit_getinfo'],
      settings: {}
    },
    {
      id: 'reset_bottle',
      name: '重置罐子',
      description: '重置金银铜罐子CD',
      tasks: ['bottle_reset'],
      settings: {}
    }
  ];

  // 加载任务模板
  const loadTemplates = async () => {
    try {
      const saved = await templateDB.getAll();
      if (saved && saved.length > 0) {
        templates.value = saved;
      } else {
        // 尝试从 localStorage 迁移
        const localSaved = localStorage.getItem('taskTemplates');
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            templates.value = parsed;
            await templateDB.saveAll(parsed);
          } else {
            templates.value = [...defaultTemplates];
            await templateDB.saveAll(templates.value);
          }
        } else {
          // 如果没有保存的模板，使用默认模板
          templates.value = [...defaultTemplates];
          await templateDB.saveAll(templates.value);
        }
      }
    } catch (error) {
      console.error('加载任务模板失败:', error);
      templates.value = [...defaultTemplates];
    }
  };

  // 保存任务模板
  const saveTemplates = async () => {
    try {
      await templateDB.saveAll(templates.value);
      localStorage.setItem('taskTemplates_backup', JSON.stringify(templates.value));
    } catch (error) {
      console.error('保存任务模板失败:', error);
      localStorage.setItem('taskTemplates', JSON.stringify(templates.value));
    }
  };

  // 创建任务模板
  const createTemplate = (templateData: Omit<TaskTemplate, 'id'>): TaskTemplate => {
    const newTemplate: TaskTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    templates.value.push(newTemplate);
    saveTemplates();
    return newTemplate;
  };

  // 导出配置
  const exportConfig = () => {
    return {
      tasks: tasks.value,
      templates: templates.value,
      exportTime: new Date().toISOString()
    };
  };

  // 导入配置
  const importConfig = (config: { tasks?: ScheduledTask[], templates?: TaskTemplate[] }) => {
    if (config.tasks) {
      tasks.value = config.tasks;
      saveTasks();
    }
    if (config.templates) {
      templates.value = config.templates;
      saveTemplates();
    }
  };

  // 重新排序任务
  const reorderTasks = (newOrder: ScheduledTask[]) => {
    tasks.value = newOrder;
    saveTasks();
  };

  // 移动任务到指定位置
  const moveTask = (fromIndex: number, toIndex: number) => {
    const item = tasks.value.splice(fromIndex, 1)[0];
    tasks.value.splice(toIndex, 0, item);
    saveTasks();
  };

  // 初始化
  const initialize = async () => {
    await loadTasks();
    await loadTemplates();
    updateNextRunTimes();
  };

  return {
    // State
    tasks,
    templates,
    isLoading,
    currentExecutingTask,
    
    // Getters
    statistics,
    runningTasks,
    pausedTasks,
    upcomingTasks,
    nextExecutingTask,
    
    // Actions
    initialize,
    loadTasks,
    saveTasks,
    createTask,
    updateTask,
    deleteTask,
    pauseTask,
    startTask,
    executeTaskImmediately,
    checkAndExecuteDueTasks,
    resetDailyStats,
    updateNextRunTimes,
    reorderTasks,
    moveTask,
    loadTemplates,
    saveTemplates,
    createTemplate,
    exportConfig,
    importConfig
  };
});
