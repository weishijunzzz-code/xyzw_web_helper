import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ScheduledTask, TaskTemplate } from '@/stores/scheduledTaskStore';
import type { TaskExecutionRecord } from '@/views/TaskScheduler/types';
import type { NotificationMessage, NotificationRule, NotificationSettings } from '@/stores/notificationStore';

// 数据库版本
const DB_VERSION = 1;
const DB_NAME = 'TaskSchedulerDB';

// 数据库 Schema 定义
interface TaskSchedulerDB extends DBSchema {
  tasks: {
    key: string;
    value: ScheduledTask;
    indexes: { 'by-status': string; 'by-template': string };
  };
  templates: {
    key: string;
    value: TaskTemplate;
  };
  history: {
    key: string;
    value: TaskExecutionRecord;
    indexes: { 'by-task': string; 'by-time': string };
  };
  notifications: {
    key: string;
    value: NotificationMessage;
  };
  notificationRules: {
    key: string;
    value: NotificationRule;
  };
  settings: {
    key: string;
    value: { key: string; data: any };
  };
}

let db: IDBPDatabase<TaskSchedulerDB> | null = null;

// 初始化数据库
export async function initDB(): Promise<IDBPDatabase<TaskSchedulerDB>> {
  if (db) return db;
  
  db = await openDB<TaskSchedulerDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, newVersion, transaction) {
      // 任务存储
      if (!database.objectStoreNames.contains('tasks')) {
        const taskStore = database.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('by-status', 'status');
        taskStore.createIndex('by-template', 'templateId');
      }
      
      // 模板存储
      if (!database.objectStoreNames.contains('templates')) {
        database.createObjectStore('templates', { keyPath: 'id' });
      }
      
      // 历史记录存储
      if (!database.objectStoreNames.contains('history')) {
        const historyStore = database.createObjectStore('history', { keyPath: 'id' });
        historyStore.createIndex('by-task', 'taskId');
        historyStore.createIndex('by-time', 'startTime');
      }
      
      // 通知存储
      if (!database.objectStoreNames.contains('notifications')) {
        database.createObjectStore('notifications', { keyPath: 'id' });
      }
      
      // 通知规则存储
      if (!database.objectStoreNames.contains('notificationRules')) {
        database.createObjectStore('notificationRules', { keyPath: 'id' });
      }
      
      // 设置存储
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    }
  });
  
  return db;
}

// 任务相关操作
export const taskDB = {
  // 获取所有任务
  async getAll(): Promise<ScheduledTask[]> {
    const db = await initDB();
    return db.getAll('tasks');
  },
  
  // 根据ID获取任务
  async getById(id: string): Promise<ScheduledTask | undefined> {
    const db = await initDB();
    return db.get('tasks', id);
  },
  
  // 保存任务
  async save(task: ScheduledTask): Promise<void> {
    const db = await initDB();
    await db.put('tasks', task);
  },
  
  // 批量保存任务
  async saveAll(tasks: ScheduledTask[]): Promise<void> {
    const db = await initDB();
    const tx = db.transaction('tasks', 'readwrite');
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  },
  
  // 删除任务
  async delete(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('tasks', id);
  },
  
  // 根据状态查询
  async getByStatus(status: string): Promise<ScheduledTask[]> {
    const db = await initDB();
    return db.getAllFromIndex('tasks', 'by-status', status);
  },
  
  // 清空所有任务
  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('tasks');
  }
};

// 模板相关操作
export const templateDB = {
  async getAll(): Promise<TaskTemplate[]> {
    const db = await initDB();
    return db.getAll('templates');
  },
  
  async save(template: TaskTemplate): Promise<void> {
    const db = await initDB();
    await db.put('templates', template);
  },
  
  async saveAll(templates: TaskTemplate[]): Promise<void> {
    const db = await initDB();
    const tx = db.transaction('templates', 'readwrite');
    await Promise.all(templates.map(t => tx.store.put(t)));
    await tx.done;
  },
  
  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('templates');
  }
};

// 历史记录相关操作
export const historyDB = {
  async getAll(): Promise<TaskExecutionRecord[]> {
    const db = await initDB();
    return db.getAll('history');
  },
  
  async getByTaskId(taskId: string): Promise<TaskExecutionRecord[]> {
    const db = await initDB();
    return db.getAllFromIndex('history', 'by-task', taskId);
  },
  
  async save(record: TaskExecutionRecord): Promise<void> {
    const db = await initDB();
    await db.put('history', record);
  },
  
  async saveAll(records: TaskExecutionRecord[]): Promise<void> {
    const db = await initDB();
    const tx = db.transaction('history', 'readwrite');
    await Promise.all(records.map(r => tx.store.put(r)));
    await tx.done;
  },
  
  // 获取最近N条记录
  async getRecent(count: number): Promise<TaskExecutionRecord[]> {
    const db = await initDB();
    const all = await db.getAll('history');
    return all
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, count);
  },
  
  // 删除指定时间之前的记录
  async deleteBefore(date: Date): Promise<void> {
    const db = await initDB();
    const all = await db.getAll('history');
    const toDelete = all.filter(r => new Date(r.startTime) < date);
    const tx = db.transaction('history', 'readwrite');
    await Promise.all(toDelete.map(r => tx.store.delete(r.id)));
    await tx.done;
  },
  
  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('history');
  }
};

// 通知相关操作
export const notificationDB = {
  async getAll(): Promise<NotificationMessage[]> {
    const db = await initDB();
    return db.getAll('notifications');
  },
  
  async save(notification: NotificationMessage): Promise<void> {
    const db = await initDB();
    await db.put('notifications', notification);
  },
  
  async saveAll(notifications: NotificationMessage[]): Promise<void> {
    const db = await initDB();
    const tx = db.transaction('notifications', 'readwrite');
    await Promise.all(notifications.map(n => tx.store.put(n)));
    await tx.done;
  },
  
  async delete(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('notifications', id);
  },
  
  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('notifications');
  }
};

// 通知规则操作
export const notificationRuleDB = {
  async getAll(): Promise<NotificationRule[]> {
    const db = await initDB();
    return db.getAll('notificationRules');
  },
  
  async save(rule: NotificationRule): Promise<void> {
    const db = await initDB();
    await db.put('notificationRules', rule);
  },
  
  async saveAll(rules: NotificationRule[]): Promise<void> {
    const db = await initDB();
    const tx = db.transaction('notificationRules', 'readwrite');
    await Promise.all(rules.map(r => tx.store.put(r)));
    await tx.done;
  },
  
  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('notificationRules');
  }
};

// 设置操作
export const settingsDB = {
  async get(key: string): Promise<any> {
    const db = await initDB();
    const result = await db.get('settings', key);
    return result?.data;
  },
  
  async set(key: string, data: any): Promise<void> {
    const db = await initDB();
    await db.put('settings', { key, data });
  },
  
  async delete(key: string): Promise<void> {
    const db = await initDB();
    await db.delete('settings', key);
  }
};

// 数据迁移工具（从 localStorage 迁移到 IndexedDB）
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    // 迁移任务
    const tasksJson = localStorage.getItem('scheduledTasks');
    if (tasksJson) {
      const tasks = JSON.parse(tasksJson);
      if (Array.isArray(tasks) && tasks.length > 0) {
        await taskDB.saveAll(tasks);
        console.log(`[IndexedDB] 已迁移 ${tasks.length} 个任务`);
      }
    }
    
    // 迁移模板
    const templatesJson = localStorage.getItem('taskTemplates');
    if (templatesJson) {
      const templates = JSON.parse(templatesJson);
      if (Array.isArray(templates) && templates.length > 0) {
        await templateDB.saveAll(templates);
        console.log(`[IndexedDB] 已迁移 ${templates.length} 个模板`);
      }
    }
    
    // 迁移历史记录
    const historyJson = localStorage.getItem('task_execution_history');
    if (historyJson) {
      const history = JSON.parse(historyJson);
      if (Array.isArray(history) && history.length > 0) {
        await historyDB.saveAll(history);
        console.log(`[IndexedDB] 已迁移 ${history.length} 条历史记录`);
      }
    }
    
    // 迁移通知
    const notificationsJson = localStorage.getItem('task_notifications');
    if (notificationsJson) {
      const notifications = JSON.parse(notificationsJson);
      if (Array.isArray(notifications) && notifications.length > 0) {
        await notificationDB.saveAll(notifications);
        console.log(`[IndexedDB] 已迁移 ${notifications.length} 条通知`);
      }
    }
    
    // 迁移通知规则
    const rulesJson = localStorage.getItem('task_notification_rules');
    if (rulesJson) {
      const rules = JSON.parse(rulesJson);
      if (Array.isArray(rules) && rules.length > 0) {
        await notificationRuleDB.saveAll(rules);
        console.log(`[IndexedDB] 已迁移 ${rules.length} 条通知规则`);
      }
    }
    
    // 迁移设置
    const settingsJson = localStorage.getItem('task_notification_settings');
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      await settingsDB.set('notification', settings);
      console.log('[IndexedDB] 已迁移通知设置');
    }
    
    console.log('[IndexedDB] 数据迁移完成');
  } catch (error) {
    console.error('[IndexedDB] 数据迁移失败:', error);
  }
}

// 导出所有数据
export async function exportAllData() {
  const [tasks, templates, history, notifications, rules] = await Promise.all([
    taskDB.getAll(),
    templateDB.getAll(),
    historyDB.getAll(),
    notificationDB.getAll(),
    notificationRuleDB.getAll()
  ]);
  
  const settings = await settingsDB.get('notification');
  
  return {
    tasks,
    templates,
    history,
    notifications,
    rules,
    settings,
    exportTime: new Date().toISOString()
  };
}

// 导入数据
export async function importAllData(data: {
  tasks?: ScheduledTask[];
  templates?: TaskTemplate[];
  history?: TaskExecutionRecord[];
  notifications?: NotificationMessage[];
  rules?: NotificationRule[];
  settings?: any;
}): Promise<void> {
  if (data.tasks) await taskDB.saveAll(data.tasks);
  if (data.templates) await templateDB.saveAll(data.templates);
  if (data.history) await historyDB.saveAll(data.history);
  if (data.notifications) await notificationDB.saveAll(data.notifications);
  if (data.rules) await notificationRuleDB.saveAll(data.rules);
  if (data.settings) await settingsDB.set('notification', data.settings);
}
