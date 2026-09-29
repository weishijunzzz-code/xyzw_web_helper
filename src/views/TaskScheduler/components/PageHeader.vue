<template>
  <div class="page-header">
    <div class="header-content">
      <div class="header-left">
        <h1 class="page-title">定时任务监控</h1>
        <p class="page-subtitle">管理和监控您的定时任务</p>
      </div>
      <div class="header-actions">
        <!-- 全局搜索 -->
        <GlobalSearch
          v-model:visible="showSearch"
          @select-task="$emit('select-task', $event)"
          @select-history="$emit('select-history', $event)"
          @execute-task="$emit('execute-task', $event)"
        />

        <n-button-group>
          <n-button @click="$emit('refresh')">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新
          </n-button>
          <n-button @click="$emit('clear-logs')">
            <template #icon>
              <n-icon :component="TrashOutline" />
            </template>
            清空日志
          </n-button>
        </n-button-group>

        <n-switch :value="autoRefresh" @update:value="$emit('update:auto-refresh', $event)" size="small">
          <template #checked>自动刷新</template>
          <template #unchecked>手动刷新</template>
        </n-switch>

        <n-button type="primary" @click="$emit('add-task')">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          新增任务
        </n-button>

        <n-button @click="$emit('show-history')">
          <template #icon>
            <n-icon :component="TimeOutline" />
          </template>
          执行历史
        </n-button>

        <n-badge :value="notificationStore.unreadCount" :show="notificationStore.unreadCount > 0">
          <n-button @click="$emit('show-notifications')">
            <template #icon>
              <n-icon :component="NotificationsOutline" />
            </template>
            通知
          </n-button>
        </n-badge>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { 
  RefreshOutline, 
  TrashOutline, 
  AddOutline,
  TimeOutline,
  NotificationsOutline
} from '@vicons/ionicons5';
import { useNotificationStore } from '@/stores/notificationStore';
import GlobalSearch from './GlobalSearch.vue';

const props = defineProps({
  autoRefresh: {
    type: Boolean,
    default: false
  }
});

defineEmits(['refresh', 'clear-logs', 'add-task', 'show-history', 'show-notifications', 'update:auto-refresh', 'select-task', 'select-history', 'execute-task']);

const notificationStore = useNotificationStore();
const showSearch = ref(false);
</script>

<style scoped lang="scss">
// SaaS 工具栏：白底描边，与控制台侧边栏/顶栏视觉统一（替代旧紫蓝渐变横幅）
.page-header {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
  padding: 16px 32px;
  color: var(--text-primary);
  position: sticky;
  top: 60px; // 让位给 DefaultLayout 顶栏
  z-index: 90;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  flex: 1;
  min-width: 160px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

// 响应式
@media (max-width: 768px) {
  .page-header {
    padding: 12px 16px;
    // 移动端位于 MobileLayout 固定头（64px）之下；页面内容被 0.8 缩放，坐标需换算
    top: 80px;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
    gap: 8px;
  }

  .page-title {
    font-size: 18px;
  }
}
</style>
