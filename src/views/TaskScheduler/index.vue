<template>
  <div class="task-scheduler-page">
    <!-- 页面头部 -->
    <PageHeader
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
    </div>
    
    <!-- 移动端悬浮日志按钮 -->
    <MobileLogButton
      v-if="isMobile"
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

// 使用组合式函数
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
} = useTaskScheduler();
</script>

<style scoped lang="scss">
.task-scheduler-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f3f4f6);
  position: relative;
}

.page-content {
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: calc(100vh - 200px);
  
  // 移动端可滚动
  @media (max-width: 768px) {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
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
  .page-content {
    padding: 16px 20px;
    padding-bottom: 100px; // 为悬浮按钮留出空间
  }
}
</style>
