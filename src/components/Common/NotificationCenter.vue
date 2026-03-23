<template>
  <div class="notification-center">
    <!-- 触发按钮 -->
    <div class="notification-trigger" @click="togglePanel">
      <n-badge :value="unreadCount" :max="99" :show="unreadCount > 0">
        <n-icon size="20"><Bell /></n-icon>
      </n-badge>
    </div>

    <!-- 消息面板 -->
    <n-drawer
      v-model:show="showPanel"
      placement="right"
      style="width: 360px; max-width: 90vw"
    >
      <n-drawer-content title="消息中心" :native-scrollbar="false">
        <!-- 头部操作 -->
        <div class="notification-header">
          <n-space>
            <n-button text size="small" @click="markAllAsRead">
              <template #icon>
                <n-icon><CheckmarkDone /></n-icon>
              </template>
              全部已读
            </n-button>
            <n-button text size="small" @click="clearAll">
              <template #icon>
                <n-icon><Trash /></n-icon>
              </template>
              清空
            </n-button>
          </n-space>
        </div>

        <!-- 消息列表 -->
        <div v-if="notifications.length > 0" class="notification-list">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            class="notification-item"
            :class="{ unread: !notification.read }"
            @click="handleClick(notification)"
          >
            <div class="notification-icon" :class="notification.type">
              <n-icon size="18">
                <component :is="getIcon(notification.type)" />
              </n-icon>
            </div>
            <div class="notification-content">
              <div class="notification-title">{{ notification.title }}</div>
              <div class="notification-text">{{ notification.content }}</div>
              <div class="notification-time">{{ formatTime(notification.timestamp) }}</div>
            </div>
            <div class="notification-actions">
              <n-button
                text
                size="tiny"
                @click.stop="remove(notification.id)"
              >
                <n-icon><Close /></n-icon>
              </n-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="notification-empty">
          <n-empty description="暂无消息" size="small">
            <template #icon>
              <n-icon size="48"><MailOpen /></n-icon>
            </template>
          </n-empty>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNotificationStore } from '@/composables/useNotification'
import {
  Bell,
  CheckmarkDone,
  Trash,
  Close,
  MailOpen,
  CheckmarkCircle,
  AlertCircle,
  Warning,
  InformationCircle
} from '@vicons/ionicons5'

const store = useNotificationStore()
const showPanel = ref(false)

const notifications = computed(() => store.allNotifications)
const unreadCount = computed(() => store.unreadCount)

const togglePanel = () => {
  showPanel.value = !showPanel.value
}

const getIcon = (type) => {
  const icons = {
    success: CheckmarkCircle,
    error: AlertCircle,
    warning: Warning,
    info: InformationCircle
  }
  return icons[type] || InformationCircle
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString()
}

const handleClick = (notification) => {
  store.markAsRead(notification.id)
  if (notification.link) {
    window.location.href = notification.link
  }
}

const markAllAsRead = () => {
  store.markAllAsRead()
}

const clearAll = () => {
  store.clear()
}

const remove = (id) => {
  store.remove(id)
}
</script>

<style scoped lang="scss">
.notification-center {
  position: relative;
}

.notification-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-secondary);

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.notification-header {
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: var(--spacing-sm);
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.notification-item {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-secondary);

  &:hover {
    background: var(--bg-tertiary);
  }

  &.unread {
    background: var(--primary-color-light);

    .notification-title::after {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      background: var(--primary-color);
      border-radius: 50%;
      margin-left: var(--spacing-xs);
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

  &.success {
    background: var(--success-color-light, rgba(34, 197, 94, 0.1));
    color: var(--success-color);
  }

  &.error {
    background: var(--error-color-light, rgba(239, 68, 68, 0.1));
    color: var(--error-color);
  }

  &.warning {
    background: var(--warning-color-light, rgba(245, 158, 11, 0.1));
    color: var(--warning-color);
  }

  &.info {
    background: var(--info-color-light, rgba(59, 130, 246, 0.1));
    color: var(--info-color);
  }
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: 2px;
}

.notification-text {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-time {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.notification-actions {
  opacity: 0;
  transition: opacity var(--transition-fast);

  .notification-item:hover & {
    opacity: 1;
  }
}

.notification-empty {
  padding: var(--spacing-xl);
}
</style>
