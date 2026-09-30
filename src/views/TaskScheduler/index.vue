<template>
  <div class="task-scheduler-page">
    <!-- 页面头部（仅定时任务分段显示） -->
    <PageHeader
      v-if="activeTab === 'scheduler'"
      :auto-refresh="autoRefresh"
      @refresh="refreshTasks"
      @clear-logs="clearAllLogs"
      @add-task="showTaskModal = true"
      @show-history="showHistoryDrawer = true"
      @show-notifications="showNotificationDrawer = true"
      @update:auto-refresh="autoRefresh = $event"
      @select-task="handleViewDetail"
      @select-history="handleHistorySelect"
      @execute-task="handleExecute"
    />

    <!-- 定时 / 云端 分段切换（移动端） -->
    <div class="view-segment" role="tablist">
      <button
        role="tab"
        class="segment-item"
        :class="{ active: activeTab === 'scheduler' }"
        :aria-selected="activeTab === 'scheduler'"
        @click="switchTab('scheduler')"
      >
        <n-icon size="16"><TimeOutline /></n-icon>
        定时任务
      </button>
      <button
        role="tab"
        class="segment-item"
        :class="{ active: activeTab === 'cloud' }"
        :aria-selected="activeTab === 'cloud'"
        @click="switchTab('cloud')"
      >
        <n-icon size="16"><CloudCircleOutline /></n-icon>
        云端任务
      </button>
    </div>

    <!-- 下拉刷新提示 -->
    <PullRefreshIndicator
      v-if="isMobile && isPulling"
      :distance="pullDistance"
      :refreshing="isRefreshing"
    />

    <!-- 页面内容 -->
    <div
      class="page-content"
      ref="pageContentRef"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <template v-if="activeTab === 'scheduler'">
        <!-- 统计概览 -->
        <StatisticCards :tasks="taskStore.tasks" />

        <!-- 下个执行 -->
        <NextExecution
          :next-task="taskStore.nextExecutingTask"
          :is-executing="executor.isExecuting.value"
          @execute="handleImmediateExecute"
          @detail="handleViewDetail"
        />

        <!-- 批量操作切换 -->
        <div class="batch-mode-toggle">
          <n-switch v-model:value="batchMode">
            <template #checked>退出批量模式</template>
            <template #unchecked>进入批量模式</template>
          </n-switch>
        </div>

        <!-- 任务列表 -->
        <TaskList
          v-if="!batchMode"
          :tasks="taskStore.tasks"
          :loading="taskStore.isLoading"
          @execute="handleExecute"
          @pause="handlePause"
          @start="handleStart"
          @edit="handleEdit"
          @delete="handleDelete"
          @add="showTaskModal = true"
        />

        <!-- 批量操作模式 -->
        <BatchOperations
          v-else
          :tasks="taskStore.tasks"
          @refresh="refreshTasks"
        />

        <!-- 数据统计图表 -->
        <TaskStatistics />

        <!-- 执行日志面板 (桌面端显示) -->
        <ExecutionLogs
          v-if="!isMobile"
          :logs="executor.executionLogs.value"
          @clear="executor.clearLogs()"
        />
      </template>

      <!-- 云端任务（移动端并入本页分段） -->
      <CloudTasks v-else class="embedded" />
    </div>

    <!-- 移动端悬浮日志按钮 -->
    <MobileLogButton
      v-if="isMobile && activeTab === 'scheduler'"
      :log-count="executor.executionLogs.value.length"
      @click="showLogsDrawer = true"
    />

    <!-- 移动端日志抽屉 -->
    <MobileLogsDrawer
      v-model:show="showLogsDrawer"
      :logs="executor.executionLogs.value"
      @clear="executor.clearLogs()"
    />

    <!-- 执行历史抽屉 -->
    <n-drawer
      v-model:show="showHistoryDrawer"
      placement="right"
      :width="isMobile ? '100%' : 800"
      :mask-closable="true"
    >
      <n-drawer-content title="执行历史记录" closable>
        <TaskHistory />
      </n-drawer-content>
    </n-drawer>

    <!-- 通知中心抽屉 -->
    <n-drawer
      v-model:show="showNotificationDrawer"
      placement="right"
      :width="isMobile ? '100%' : 450"
      :mask-closable="true"
    >
      <n-drawer-content title="通知中心" closable>
        <NotificationCenter />
      </n-drawer-content>
    </n-drawer>

    <!-- 任务执行进度弹窗 -->
    <ExecutionModal
      v-model:show="showExecutionModal"
      :progress="executionProgress"
      :status-text="executionStatusText"
      :results="executionResults"
      :is-executing="executor.isExecuting.value"
      @close="showExecutionModal = false"
    />

    <!-- 任务编辑/创建弹窗 -->
    <TaskModal
      v-model:show="showTaskModal"
      :task="editingTask"
      @save="handleSaveTask"
    />

    <!-- 任务详情弹窗 -->
    <TaskDetailModal
      v-model:show="showDetailModal"
      :task="viewingTask"
      :is-executing="executor.isExecuting.value"
      @execute="executeTaskNow"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TimeOutline, CloudCircleOutline } from '@vicons/ionicons5';
import { useTaskScheduler } from './composables/useTaskScheduler';

// 导入组件
import PageHeader from './components/PageHeader.vue';
import PullRefreshIndicator from './components/PullRefreshIndicator.vue';
import StatisticCards from './components/StatisticCards.vue';
import NextExecution from './components/NextExecution.vue';
import TaskList from './components/TaskList/index.vue';
import TaskStatistics from './components/TaskStatistics.vue';
import BatchOperations from './components/BatchOperations.vue';
import ExecutionLogs from './components/ExecutionLogs.vue';
import MobileLogButton from './components/MobileLogButton.vue';
import MobileLogsDrawer from './components/MobileLogsDrawer.vue';
import TaskHistory from './components/TaskHistory.vue';
import NotificationCenter from './components/NotificationCenter.vue';
import ExecutionModal from './components/ExecutionModal.vue';
import TaskModal from './components/TaskModal.vue';
import TaskDetailModal from './components/TaskDetailModal.vue';
import CloudTasks from '@/views/CloudTasks.vue';

const route = useRoute();
const router = useRouter();

// 分段切换：/mobile/task-scheduler?tab=cloud 为云端任务，默认定时任务
const activeTab = computed(() => (route.query.tab === 'cloud' ? 'cloud' : 'scheduler'));

const switchTab = (tab) => {
  if (tab === activeTab.value) return;
  router.replace({
    query: { ...route.query, tab: tab === 'cloud' ? 'cloud' : undefined }
  });
  // 切换分段后回到顶部，避免停留在上一分段的长列表位置
  // （移动端真实滚动容器是 body，桌面端布局可能用 .mobile-main，两者都重置）
  document.body?.scrollTo({ top: 0 });
  document.querySelector('.mobile-main')?.scrollTo({ top: 0 });
};

// 使用组合式函数；云端分段下关闭下拉刷新
const {
  // Store
  taskStore,
  executor,

  // State
  isMobile,
  showTaskModal,
  showDetailModal,
  showExecutionModal,
  showLogsDrawer,
  showHistoryDrawer,
  showNotificationDrawer,
  editingTask,
  viewingTask,
  autoRefresh,
  executionProgress,
  executionStatusText,
  executionResults,
  pageContentRef,
  isPulling,
  isRefreshing,
  pullDistance,
  batchMode,

  // Methods
  refreshTasks,
  clearAllLogs,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleExecute,
  handleImmediateExecute,
  executeTaskNow,
  handlePause,
  handleStart,
  handleEdit,
  handleDelete,
  handleViewDetail,
  handleSaveTask,
  handleHistorySelect
} = useTaskScheduler({
  canPull: () => activeTab.value === 'scheduler'
});
</script>

<style scoped lang="scss">
.task-scheduler-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f3f4f6);
  position: relative;

  // 分段条实际渲染高度（含边框），供 PageHeader 移动端 sticky 偏移参考
  --view-segment-h: 48px;
}

// 定时 / 云端 分段切换条（移动端吸顶）
.view-segment {
  display: none;
  position: sticky;
  top: 0;
  z-index: 80;
  gap: 4px;
  max-width: 340px;
  margin: 0 auto 16px;
  padding: 4px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 999px;
  box-shadow: var(--shadow-light, 0 2px 8px rgba(0, 0, 0, 0.06));

  .segment-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 38px;
    padding: 0 12px;
    border: none;
    background: transparent;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

    &:active {
      transform: scale(0.97);
    }

    &.active {
      color: #fff;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
    }
  }

  [data-theme="dark"] & {
    background: var(--bg-primary, #1f2937);
    border-color: rgba(255, 255, 255, 0.08);
  }
}

.page-content {
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: calc(100vh - 200px);
}

// 深色模式适配
[data-theme="dark"] {
  .task-scheduler-page {
    background: var(--bg-secondary, #111827);
  }
}

// 批量模式切换
.batch-mode-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

// 响应式
@media (max-width: 768px) {
  .view-segment {
    display: flex;
    // MobileLayout 固定头高 64px，子树被 zoom 缩放，CSS 值需反向放大
    top: calc(64px / var(--mobile-content-zoom, 1));
  }

  .page-content {
    padding: 16px 20px;
    padding-bottom: 100px; // 为悬浮按钮留出空间
  }
}
</style>
