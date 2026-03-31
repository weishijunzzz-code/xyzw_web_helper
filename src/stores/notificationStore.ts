import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { notificationDB, notificationRuleDB, settingsDB } from '@/utils/indexedDB';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationChannel = 'browser' | 'sound' | 'sms' | 'email' | 'webhook';

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: {
    eventType: 'task_success' | 'task_failed' | 'task_partial' | 'execution_error' | 'system_error';
    taskIds?: string[]; // 空数组表示所有任务
    minFailedCount?: number; // 最小失败次数触发
    consecutiveFailures?: number; // 连续失败次数
  };
  channels: NotificationChannel[];
  cooldown: number; // 冷却时间（分钟）
  lastTriggered?: string;
}

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  taskId?: string;
  taskName?: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationSettings {
  browserEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  desktopEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  webhookUrl?: string;
  webhookEnabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;
  };
}

const STORAGE_KEY = 'task_notification_settings';
const NOTIFICATIONS_KEY = 'task_notifications';
const RULES_KEY = 'task_notification_rules';

// 默认通知规则
const defaultRules: NotificationRule[] = [
  {
    id: 'rule_1',
    name: '任务执行失败通知',
    enabled: true,
    conditions: {
      eventType: 'task_failed'
    },
    channels: ['browser', 'sound'],
    cooldown: 5
  },
  {
    id: 'rule_2',
    name: '多次连续失败告警',
    enabled: true,
    conditions: {
      eventType: 'task_failed',
      consecutiveFailures: 3
    },
    channels: ['browser', 'sound'],
    cooldown: 15
  },
  {
    id: 'rule_3',
    name: '系统错误通知',
    enabled: true,
    conditions: {
      eventType: 'system_error'
    },
    channels: ['browser'],
    cooldown: 1
  }
];

// 默认设置
const defaultSettings: NotificationSettings = {
  browserEnabled: true,
  soundEnabled: true,
  soundVolume: 0.5,
  desktopEnabled: false,
  smsEnabled: false,
  emailEnabled: false,
  webhookEnabled: false,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  }
};

export const useNotificationStore = defineStore('notification', () => {
  // State
  const settings = ref<NotificationSettings>({ ...defaultSettings });
  const rules = ref<NotificationRule[]>([...defaultRules]);
  const notifications = ref<NotificationMessage[]>([]);
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length);
  
  // 任务失败计数（用于连续失败检测）
  const failureCounts = ref<Record<string, number>>({});

  // 音频上下文（用于播放提示音）
  let audioContext: AudioContext | null = null;

  // Actions
  const initialize = async () => {
    // 加载设置
    const savedSettings = await settingsDB.get('notification');
    if (savedSettings) {
      settings.value = { ...defaultSettings, ...savedSettings };
    } else {
      // 尝试从 localStorage 迁移
      const localSettings = localStorage.getItem(STORAGE_KEY);
      if (localSettings) {
        try {
          settings.value = { ...defaultSettings, ...JSON.parse(localSettings) };
          await settingsDB.set('notification', settings.value);
        } catch {
          settings.value = { ...defaultSettings };
        }
      }
    }

    // 加载规则
    const savedRules = await notificationRuleDB.getAll();
    if (savedRules && savedRules.length > 0) {
      rules.value = savedRules;
    } else {
      // 尝试从 localStorage 迁移
      const localRules = localStorage.getItem(RULES_KEY);
      if (localRules) {
        try {
          const parsed = JSON.parse(localRules);
          rules.value = parsed;
          await notificationRuleDB.saveAll(parsed);
        } catch {
          rules.value = [...defaultRules];
        }
      }
    }

    // 加载通知历史
    try {
      const savedNotifications = await notificationDB.getAll();
      if (savedNotifications && savedNotifications.length > 0) {
        notifications.value = savedNotifications;
        // 只保留最近100条
        if (notifications.value.length > 100) {
          notifications.value = notifications.value.slice(-100);
          await notificationDB.saveAll(notifications.value);
        }
      } else {
        // 尝试从 localStorage 迁移
        const localNotifications = localStorage.getItem(NOTIFICATIONS_KEY);
        if (localNotifications) {
          try {
            const parsed = JSON.parse(localNotifications);
            notifications.value = parsed;
            if (notifications.value.length > 100) {
              notifications.value = notifications.value.slice(-100);
            }
            await notificationDB.saveAll(notifications.value);
          } catch {
            notifications.value = [];
          }
        }
      }
    } catch (error) {
      console.error('加载通知失败:', error);
      notifications.value = [];
    }

    // 请求浏览器通知权限
    if (settings.value.browserEnabled && 'Notification' in window) {
      Notification.requestPermission();
    }
  };

  const saveSettings = async () => {
    await settingsDB.set('notification', settings.value);
    // 同时备份到 localStorage
    localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify(settings.value));
  };

  const saveRules = async () => {
    await notificationRuleDB.saveAll(rules.value);
    localStorage.setItem(RULES_KEY + '_backup', JSON.stringify(rules.value));
  };

  const saveNotifications = async () => {
    await notificationDB.saveAll(notifications.value);
    localStorage.setItem(NOTIFICATIONS_KEY + '_backup', JSON.stringify(notifications.value));
  };

  // 检查是否在免打扰时段
  const isInQuietHours = (): boolean => {
    if (!settings.value.quietHours.enabled) return false;
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { start, end } = settings.value.quietHours;
    
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // 跨天的情况，如 22:00 - 08:00
      return currentTime >= start || currentTime <= end;
    }
  };

  // 播放提示音
  const playNotificationSound = () => {
    if (!settings.value.soundEnabled || isInQuietHours()) return;
    
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(settings.value.soundVolume * 0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('播放提示音失败:', error);
    }
  };

  // 发送浏览器通知
  const sendBrowserNotification = (title: string, body: string) => {
    if (!settings.value.browserEnabled || isInQuietHours()) return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'task-notification',
        requireInteraction: false
      });
    }
  };

  // 添加通知消息
  const addNotification = (notification: Omit<NotificationMessage, 'id' | 'createdAt' | 'read'>) => {
    const newNotification: NotificationMessage = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      read: false
    };
    
    notifications.value.unshift(newNotification);
    
    // 限制数量
    if (notifications.value.length > 100) {
      notifications.value = notifications.value.slice(0, 100);
    }
    
    saveNotifications();
    
    // 发送浏览器通知
    sendBrowserNotification(notification.title, notification.content);
    
    // 播放提示音
    if (notification.type === 'error' || notification.type === 'warning') {
      playNotificationSound();
    }
    
    return newNotification;
  };

  // 标记已读
  const markAsRead = (id: string) => {
    const notification = notifications.value.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      saveNotifications();
    }
  };

  // 标记全部已读
  const markAllAsRead = () => {
    notifications.value.forEach(n => n.read = true);
    saveNotifications();
  };

  // 删除通知
  const deleteNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id);
    if (index > -1) {
      notifications.value.splice(index, 1);
      saveNotifications();
    }
  };

  // 清空所有通知
  const clearAllNotifications = () => {
    notifications.value = [];
    saveNotifications();
  };

  // 添加规则
  const addRule = (rule: Omit<NotificationRule, 'id'>) => {
    const newRule: NotificationRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    rules.value.push(newRule);
    saveRules();
    return newRule;
  };

  // 更新规则
  const updateRule = (id: string, updates: Partial<NotificationRule>) => {
    const rule = rules.value.find(r => r.id === id);
    if (rule) {
      Object.assign(rule, updates);
      saveRules();
    }
  };

  // 删除规则
  const deleteRule = (id: string) => {
    const index = rules.value.findIndex(r => r.id === id);
    if (index > -1) {
      rules.value.splice(index, 1);
      saveRules();
    }
  };

  // 检查规则冷却
  const isRuleInCooldown = (rule: NotificationRule): boolean => {
    if (!rule.lastTriggered) return false;
    const lastTriggered = new Date(rule.lastTriggered);
    const now = new Date();
    const cooldownMs = rule.cooldown * 60 * 1000;
    return now.getTime() - lastTriggered.getTime() < cooldownMs;
  };

  // 触发通知检查
  const triggerNotification = (
    eventType: NotificationRule['conditions']['eventType'],
    data: {
      taskId?: string;
      taskName?: string;
      message?: string;
      failedCount?: number;
      totalCount?: number;
    }
  ) => {
    // 更新失败计数
    if (eventType === 'task_failed' && data.taskId) {
      failureCounts.value[data.taskId] = (failureCounts.value[data.taskId] || 0) + 1;
    } else if (eventType === 'task_success' && data.taskId) {
      failureCounts.value[data.taskId] = 0;
    }

    // 检查每条规则
    rules.value.forEach(rule => {
      if (!rule.enabled || isRuleInCooldown(rule)) return;
      
      // 检查事件类型匹配
      if (rule.conditions.eventType !== eventType) return;
      
      // 检查任务ID匹配
      if (rule.conditions.taskIds && rule.conditions.taskIds.length > 0) {
        if (!data.taskId || !rule.conditions.taskIds.includes(data.taskId)) return;
      }
      
      // 检查最小失败次数
      if (rule.conditions.minFailedCount && data.failedCount !== undefined) {
        if (data.failedCount < rule.conditions.minFailedCount) return;
      }
      
      // 检查连续失败次数
      if (rule.conditions.consecutiveFailures && data.taskId) {
        if ((failureCounts.value[data.taskId] || 0) < rule.conditions.consecutiveFailures) return;
      }
      
      // 触发通知
      let title = '';
      let content = '';
      let type: NotificationType = 'info';
      
      switch (eventType) {
        case 'task_success':
          title = '任务执行成功';
          content = `任务 "${data.taskName || '未知任务'}" 已成功执行完成`;
          type = 'success';
          break;
        case 'task_failed':
          title = '任务执行失败';
          content = `任务 "${data.taskName || '未知任务'}" 执行失败：${data.message || '未知错误'}`;
          type = 'error';
          break;
        case 'task_partial':
          title = '任务部分执行成功';
          content = `任务 "${data.taskName || '未知任务'}" 部分执行成功 (${data.totalCount! - data.failedCount!}/${data.totalCount})`;
          type = 'warning';
          break;
        case 'execution_error':
          title = '执行错误';
          content = data.message || '执行任务时发生错误';
          type = 'error';
          break;
        case 'system_error':
          title = '系统错误';
          content = data.message || '系统发生错误';
          type = 'error';
          break;
      }
      
      // 添加通知
      addNotification({
        type,
        title,
        content,
        taskId: data.taskId,
        taskName: data.taskName
      });
      
      // 更新规则触发时间
      rule.lastTriggered = new Date().toISOString();
      saveRules();
    });
  };

  // 更新设置
  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    Object.assign(settings.value, newSettings);
    saveSettings();
    
    // 如果开启了浏览器通知，请求权限
    if (newSettings.browserEnabled && 'Notification' in window) {
      Notification.requestPermission();
    }
  };

  // 重置为默认
  const resetToDefault = () => {
    settings.value = { ...defaultSettings };
    rules.value = [...defaultRules];
    saveSettings();
    saveRules();
  };

  return {
    // State
    settings,
    rules,
    notifications,
    unreadCount,
    failureCounts,
    
    // Actions
    initialize,
    addNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    addRule,
    updateRule,
    deleteRule,
    triggerNotification,
    updateSettings,
    resetToDefault,
    playNotificationSound,
    sendBrowserNotification,
    isInQuietHours
  };
});
