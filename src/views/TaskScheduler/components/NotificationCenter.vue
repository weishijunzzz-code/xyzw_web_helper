<template>
  <div class="notification-center">
    <!-- 通知列表 -->
    <div class="notification-list">
      <div v-if="filteredNotifications.length === 0" class="notification-empty">
        <n-empty description="暂无通知消息" size="small">
          <template #icon>
            <n-icon :component="NotificationsOutline" />
          </template>
        </n-empty>
      </div>
      
      <template v-else>
        <div
          v-for="notification in filteredNotifications"
          :key="notification.id"
          class="notification-item"
          :class="{ unread: !notification.read }"
          @click="handleRead(notification)"
        >
          <div class="notification-icon" :class="notification.type">
            <n-icon :component="getIcon(notification.type)" />
          </div>
          
          <div class="notification-content">
            <div class="notification-header">
              <span class="notification-title">{{ notification.title }}</span>
              <span class="notification-time">{{ formatTime(notification.createdAt) }}</span>
            </div>
            <p class="notification-message">{{ notification.content }}</p>
            <div v-if="notification.taskName" class="notification-task">
              <n-tag size="small" type="info">{{ notification.taskName }}</n-tag>
            </div>
          </div>
          
          <div class="notification-actions">
            <n-button
              text
              size="tiny"
              type="error"
              @click.stop="handleDelete(notification.id)"
            >
              <template #icon>
                <n-icon :component="CloseOutline" />
              </template>
            </n-button>
          </div>
        </div>
      </template>
    </div>
    
    <!-- 底部操作栏 -->
    <div class="notification-footer">
      <n-space justify="space-between" align="center" style="width: 100%">
        <n-text depth="3" size="small">
          共 {{ notificationStore.notifications.length }} 条通知
          <span v-if="notificationStore.unreadCount > 0" class="unread-badge">
            ({{ notificationStore.unreadCount }} 未读)
          </span>
        </n-text>
        <n-space>
          <n-button
            v-if="notificationStore.unreadCount > 0"
            size="small"
            text
            @click="handleMarkAllRead"
          >
            全部已读
          </n-button>
          <n-button
            v-if="notificationStore.notifications.length > 0"
            size="small"
            text
            type="error"
            @click="handleClearAll"
          >
            清空
          </n-button>
        </n-space>
      </n-space>
    </div>
    
    <!-- 设置面板 -->
    <n-divider />
    
    <div class="notification-settings">
      <h4 class="settings-title">
        <n-icon :component="SettingsOutline" />
        通知设置
      </h4>
      
      <n-space vertical>
        <n-form-item label="浏览器通知" label-placement="left">
          <n-switch
            v-model:value="notificationStore.settings.browserEnabled"
            @update:value="handleSettingChange"
          />
        </n-form-item>
        
        <n-form-item label="提示音" label-placement="left">
          <n-switch
            v-model:value="notificationStore.settings.soundEnabled"
            @update:value="handleSettingChange"
          />
        </n-form-item>
        
        <n-form-item
          v-if="notificationStore.settings.soundEnabled"
          label="音量"
          label-placement="left"
        >
          <n-slider
            v-model:value="notificationStore.settings.soundVolume"
            :min="0"
            :max="1"
            :step="0.1"
            style="width: 150px"
            @update:value="handleSettingChange"
          />
          <n-button size="small" text @click="testSound">
            测试
          </n-button>
        </n-form-item>
        
        <n-form-item label="免打扰时段" label-placement="left">
          <n-switch
            v-model:value="notificationStore.settings.quietHours.enabled"
            @update:value="handleSettingChange"
          />
        </n-form-item>
        
        <n-space
          v-if="notificationStore.settings.quietHours.enabled"
          align="center"
        >
          <n-time-picker
            v-model:value="quietStart"
            format="HH:mm"
            @update:value="handleQuietHoursChange"
          />
          <span>至</span>
          <n-time-picker
            v-model:value="quietEnd"
            format="HH:mm"
            @update:value="handleQuietHoursChange"
          />
        </n-space>
      </n-space>
    </div>
    
    <!-- 规则管理 -->
    <n-divider />
    
    <div class="notification-rules">
      <h4 class="rules-title">
        <n-icon :component="ListOutline" />
        通知规则
        <n-button size="small" text @click="showAddRuleModal = true">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          添加规则
        </n-button>
      </h4>
      
      <div class="rules-list">
        <div
          v-for="rule in notificationStore.rules"
          :key="rule.id"
          class="rule-item"
        >
          <div class="rule-info">
            <n-switch
              v-model:value="rule.enabled"
              size="small"
              @update:value="handleRuleToggle(rule)"
            />
            <span class="rule-name">{{ rule.name }}</span>
            <n-tag size="small" type="info">
              {{ getEventTypeText(rule.conditions.eventType) }}
            </n-tag>
          </div>
          <n-button
            text
            size="tiny"
            type="error"
            @click="handleDeleteRule(rule.id)"
          >
            <template #icon>
              <n-icon :component="TrashOutline" />
            </template>
          </n-button>
        </div>
      </div>
    </div>
    
    <!-- 添加规则弹窗 -->
    <n-modal
      v-model:show="showAddRuleModal"
      preset="card"
      title="添加通知规则"
      style="width: 90%; max-width: 500px"
    >
      <n-form :model="newRule" label-placement="top">
        <n-form-item label="规则名称">
          <n-input v-model:value="newRule.name" placeholder="输入规则名称" />
        </n-form-item>
        
        <n-form-item label="触发条件">
          <n-select
            v-model:value="newRule.conditions.eventType"
            :options="eventTypeOptions"
            placeholder="选择触发条件"
          />
        </n-form-item>
        
        <n-form-item label="冷却时间（分钟）">
          <n-input-number
            v-model:value="newRule.cooldown"
            :min="1"
            :max="1440"
            placeholder="输入冷却时间"
          />
        </n-form-item>
        
        <n-form-item label="通知渠道">
          <n-checkbox-group v-model:value="newRule.channels">
            <n-space>
              <n-checkbox value="browser">浏览器通知</n-checkbox>
              <n-checkbox value="sound">提示音</n-checkbox>
            </n-space>
          </n-checkbox-group>
        </n-form-item>
      </n-form>
      
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddRuleModal = false">取消</n-button>
          <n-button type="primary" @click="handleAddRule">确定</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMessage, useDialog } from 'naive-ui';
import {
  NotificationsOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  WarningOutline,
  InformationCircleOutline,
  CloseOutline,
  SettingsOutline,
  ListOutline,
  AddOutline,
  TrashOutline
} from '@vicons/ionicons5';
import { useNotificationStore } from '@/stores/notificationStore';

const message = useMessage();
const dialog = useDialog();
const notificationStore = useNotificationStore();

// 筛选类型
const filterType = ref('all');

// 计算属性
const filteredNotifications = computed(() => {
  let list = notificationStore.notifications;
  
  if (filterType.value !== 'all') {
    if (filterType.value === 'unread') {
      list = list.filter(n => !n.read);
    } else {
      list = list.filter(n => n.type === filterType.value);
    }
  }
  
  return list;
});

// 免打扰时间
const quietStart = ref(notificationStore.settings.quietHours.start);
const quietEnd = ref(notificationStore.settings.quietHours.end);

// 添加规则弹窗
const showAddRuleModal = ref(false);
const newRule = ref({
  name: '',
  enabled: true,
  conditions: {
    eventType: 'task_failed'
  },
  channels: ['browser', 'sound'],
  cooldown: 5
});

// 事件类型选项
const eventTypeOptions = [
  { label: '任务执行成功', value: 'task_success' },
  { label: '任务执行失败', value: 'task_failed' },
  { label: '任务部分执行成功', value: 'task_partial' },
  { label: '执行错误', value: 'execution_error' },
  { label: '系统错误', value: 'system_error' }
];

// 获取图标
const getIcon = (type) => {
  const map = {
    success: CheckmarkCircleOutline,
    error: CloseCircleOutline,
    warning: WarningOutline,
    info: InformationCircleOutline
  };
  return map[type] || InformationCircleOutline;
};

// 获取事件类型文本
const getEventTypeText = (type) => {
  const map = {
    task_success: '成功',
    task_failed: '失败',
    task_partial: '部分成功',
    execution_error: '执行错误',
    system_error: '系统错误'
  };
  return map[type] || type;
};

// 格式化时间
const formatTime = (timeStr) => {
  const date = new Date(timeStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }
  
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  
  // 小于24小时
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  
  // 大于24小时
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 标记已读
const handleRead = (notification) => {
  if (!notification.read) {
    notificationStore.markAsRead(notification.id);
  }
};

// 删除通知
const handleDelete = (id) => {
  notificationStore.deleteNotification(id);
};

// 标记全部已读
const handleMarkAllRead = () => {
  notificationStore.markAllAsRead();
  message.success('已全部标记为已读');
};

// 清空所有
const handleClearAll = () => {
  dialog.warning({
    title: '清空通知',
    content: '确定要清空所有通知吗？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      notificationStore.clearAllNotifications();
      message.success('通知已清空');
    }
  });
};

// 设置变更
const handleSettingChange = () => {
  notificationStore.saveSettings();
};

// 免打扰时间变更
const handleQuietHoursChange = () => {
  notificationStore.settings.quietHours.start = quietStart.value;
  notificationStore.settings.quietHours.end = quietEnd.value;
  notificationStore.saveSettings();
};

// 测试提示音
const testSound = () => {
  notificationStore.playNotificationSound();
};

// 规则开关
const handleRuleToggle = (rule) => {
  notificationStore.updateRule(rule.id, { enabled: rule.enabled });
};

// 删除规则
const handleDeleteRule = (id) => {
  dialog.warning({
    title: '删除规则',
    content: '确定要删除这条通知规则吗？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      notificationStore.deleteRule(id);
      message.success('规则已删除');
    }
  });
};

// 添加规则
const handleAddRule = () => {
  if (!newRule.value.name.trim()) {
    message.error('请输入规则名称');
    return;
  }
  
  notificationStore.addRule({
    name: newRule.value.name,
    enabled: true,
    conditions: {
      eventType: newRule.value.conditions.eventType
    },
    channels: newRule.value.channels,
    cooldown: newRule.value.cooldown
  });
  
  message.success('规则已添加');
  showAddRuleModal.value = false;
  
  // 重置表单
  newRule.value = {
    name: '',
    enabled: true,
    conditions: {
      eventType: 'task_failed'
    },
    channels: ['browser', 'sound'],
    cooldown: 5
  };
};

onMounted(() => {
  quietStart.value = notificationStore.settings.quietHours.start;
  quietEnd.value = notificationStore.settings.quietHours.end;
});
</script>

<style scoped lang="scss">
.notification-center {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.notification-list {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.notification-empty {
  padding: 40px 0;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: var(--bg-secondary, #f3f4f6);
  }
  
  &.unread {
    background-color: rgba(59, 130, 246, 0.05);
    
    .notification-title {
      font-weight: 600;
    }
  }
}

.notification-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  
  .n-icon {
    font-size: 18px;
  }
  
  &.success {
    background-color: rgba(16, 185, 129, 0.1);
    color: #10b981;
  }
  
  &.error {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  
  &.warning {
    background-color: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }
  
  &.info {
    background-color: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.notification-title {
  font-size: 14px;
  color: var(--text-primary, #1f2937);
}

.notification-time {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
}

.notification-message {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-task {
  margin-top: 8px;
}

.notification-actions {
  opacity: 0;
  transition: opacity 0.2s;
  
  .notification-item:hover & {
    opacity: 1;
  }
}

.notification-footer {
  padding: 12px;
  border-top: 1px solid var(--border-light, #e5e7eb);
  
  .unread-badge {
    color: #3b82f6;
    font-weight: 500;
  }
}

.notification-settings,
.notification-rules {
  padding: 0 12px;
}

.settings-title,
.rules-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--text-primary, #1f2937);
  
  .n-icon {
    font-size: 16px;
  }
  
  .n-button {
    margin-left: auto;
  }
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--bg-secondary, #f3f4f6);
  border-radius: 6px;
}

.rule-info {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .rule-name {
    font-size: 13px;
    color: var(--text-primary, #1f2937);
  }
}

// 深色模式适配
[data-theme="dark"] {
  .notification-item {
    &:hover {
      background-color: var(--bg-secondary, #374151);
    }
    
    &.unread {
      background-color: rgba(59, 130, 246, 0.1);
    }
  }
  
  .notification-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .notification-message {
    color: var(--text-secondary, #9ca3af);
  }
  
  .settings-title,
  .rules-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .rule-item {
    background-color: var(--bg-secondary, #374151);
    
    .rule-name {
      color: var(--text-primary, #e5e7eb);
    }
  }
}
</style>
