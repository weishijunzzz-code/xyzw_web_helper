import { ref, computed, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { useMessage, useDialog } from 'naive-ui';
import { useScheduledTaskStore } from '@/stores/scheduledTaskStore';
import { useTaskHistoryStore } from '@/stores/taskHistoryStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTaskExecutor } from './useTaskExecutor';
import type { 
  ScheduledTask, 
  TriggerType, 
  AccountExecutionResult,
  TaskFormData,
  TaskExecutionRecord
} from '../types';

export interface UseTaskSchedulerReturn {
  // Store
  taskStore: ReturnType<typeof useScheduledTaskStore>;
  historyStore: ReturnType<typeof useTaskHistoryStore>;
  notificationStore: ReturnType<typeof useNotificationStore>;
  executor: ReturnType<typeof useTaskExecutor>;
  
  // State
  isMobile: Ref<boolean>;
  showTaskModal: Ref<boolean>;
  showDetailModal: Ref<boolean>;
  showExecutionModal: Ref<boolean>;
  showLogsDrawer: Ref<boolean>;
  showHistoryDrawer: Ref<boolean>;
  showNotificationDrawer: Ref<boolean>;
  editingTask: Ref<ScheduledTask | null>;
  viewingTask: Ref<ScheduledTask | null>;
  autoRefresh: Ref<boolean>;
  executionProgress: Ref<number>;
  executionStatusText: Ref<string>;
  executionResults: Ref<AccountExecutionResult[]>;
  pageContentRef: Ref<HTMLElement | null>;
  isPulling: Ref<boolean>;
  isRefreshing: Ref<boolean>;
  pullDistance: Ref<number>;
  
  // Methods
  refreshTasks: () => void;
  clearAllLogs: () => void;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
  handleTouchEnd: () => Promise<void>;
  handleExecute: (task: ScheduledTask, triggerType?: TriggerType) => Promise<void>;
  handleImmediateExecute: (task: ScheduledTask) => Promise<void>;
  executeTaskNow: (task: ScheduledTask) => Promise<void>;
  handlePause: (task: ScheduledTask) => void;
  handleStart: (task: ScheduledTask) => void;
  handleEdit: (task: ScheduledTask) => void;
  handleDelete: (task: ScheduledTask) => void;
  handleViewDetail: (task: ScheduledTask) => void;
  handleSaveTask: (data: TaskFormData, taskId?: string) => void;
  checkDueTasks: () => Promise<void>;
  handleHistorySelect: (record: TaskExecutionRecord) => void;
}

export interface UseTaskSchedulerOptions {
  /**
   * 下拉刷新开关（如：云端任务分段下关闭，避免云端列表无法下拉时误触发刷新）
   */
  canPull?: () => boolean;
}

export function useTaskScheduler(options?: UseTaskSchedulerOptions): UseTaskSchedulerReturn {
  const message = useMessage();
  const dialog = useDialog();
  const taskStore = useScheduledTaskStore();
  const historyStore = useTaskHistoryStore();
  const notificationStore = useNotificationStore();
  const executor = useTaskExecutor();

  // 移动端检测
  const isMobile = ref<boolean>(false);
  const checkMobile = () => {
    isMobile.value = window.innerWidth <= 768;
  };

  // 状态
  const showTaskModal = ref<boolean>(false);
  const showDetailModal = ref<boolean>(false);
  const showExecutionModal = ref<boolean>(false);
  const showLogsDrawer = ref<boolean>(false);
  const showHistoryDrawer = ref<boolean>(false);
  const showNotificationDrawer = ref<boolean>(false);
  const editingTask = ref<ScheduledTask | null>(null);
  const viewingTask = ref<ScheduledTask | null>(null);
  const autoRefresh = ref<boolean>(false);
  const executionProgress = ref<number>(0);
  const executionStatusText = ref<string>('准备执行...');
  const executionResults = ref<AccountExecutionResult[]>([]);
  const pageContentRef = ref<HTMLElement | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // 下拉刷新状态
  const isPulling = ref<boolean>(false);
  const isRefreshing = ref<boolean>(false);
  const pullDistance = ref<number>(0);
  let touchStartY = 0;
  let touchStartX = 0;
  let startedAtTop = false;

  // 真实滚动容器：全局样式 html/body 高度 100%，移动端实际滚动发生在 body 上，
  // .page-content / .mobile-main 高度随内容增长、自身永不滚动，直接读它们的
  // scrollTop 恒为 0，会导致任意位置下滑都被误判为"处于顶部"而劫持页面滚动。
  // 因此从当前元素向上找到第一个真正可滚动的祖先，兜底回落到 body。
  const getScrollContainer = (): HTMLElement | null => {
    let node = pageContentRef.value?.parentElement ?? null;
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === 'auto' || oy === 'scroll') return node;
      }
      node = node.parentElement;
    }
    return document.body;
  };

  // 批量操作模式
  const batchMode = ref<boolean>(false);

  // 刷新任务列表
  const refreshTasks = () => {
    taskStore.updateNextRunTimes();
    message.success('任务列表已刷新');
  };

  // 清空所有日志
  const clearAllLogs = () => {
    dialog.warning({
      title: '清空日志',
      content: '确定要清空所有日志吗？此操作不可恢复。',
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: () => {
        executor.clearLogs();
        message.success('日志已清空');
      }
    });
  };

  // 下拉刷新处理
  const handleTouchStart = (e: TouchEvent) => {
    if (!isMobile.value) return;
    if (options?.canPull && !options.canPull()) return;

    const scroller = getScrollContainer();
    startedAtTop = !!scroller && scroller.scrollTop <= 0;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isMobile.value || !startedAtTop) return;

    const touchY = e.touches[0].clientY;
    const touchX = e.touches[0].clientX;
    const deltaY = touchY - touchStartY;
    const deltaX = Math.abs(touchX - touchStartX);

    // 垂直下滑超过阈值、且真实滚动容器仍在顶部时才拦截，
    // 否则不 preventDefault，让页面正常滚动
    if (deltaY > 10 && deltaY > deltaX && (getScrollContainer()?.scrollTop ?? 1) <= 0) {
      e.preventDefault();
      isPulling.value = true;
      // 阻尼效果
      pullDistance.value = Math.min(deltaY * 0.5, 100);
    }
  };

  const handleTouchEnd = async () => {
    startedAtTop = false;
    if (!isMobile.value || !isPulling.value) return;
    
    isPulling.value = false;
    
    if (pullDistance.value > 60 && !isRefreshing.value) {
      isRefreshing.value = true;
      
      try {
        await refreshTasks();
      } finally {
        isRefreshing.value = false;
      }
    }
    
    pullDistance.value = 0;
  };

  // 执行任务
  const handleExecute = async (task: ScheduledTask, triggerType: TriggerType = 'manual') => {
    showExecutionModal.value = true;
    executionProgress.value = 0;
    executionStatusText.value = '准备执行任务...';
    executionResults.value = [];
    
    const startTime = new Date().toISOString();
    
    try {
      const results = await executor.executeTaskTemplate(task, (progress: number) => {
        executionProgress.value = progress;
        executionStatusText.value = `正在执行... ${progress}%`;
      });
      
      executionResults.value = results;
      executionProgress.value = 100;
      executionStatusText.value = '执行完成';
      
      const successCount = results.filter((r: AccountExecutionResult) => r.success).length;
      const failedCount = results.length - successCount;
      
      // 更新任务执行统计
      taskStore.updateTask(task.id, {
        lastRunTime: new Date().toISOString(),
        runCount: {
          ...task.runCount,
          total: (task.runCount?.total || 0) + 1,
          today: (task.runCount?.today || 0) + 1,
          todaySuccess: (task.runCount?.todaySuccess || 0) + successCount,
          todayFailed: (task.runCount?.todayFailed || 0) + failedCount
        }
      });
      
      // 记录执行历史
      const endTime = new Date().toISOString();
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      const duration = endDate.getTime() - startDate.getTime();
      
      historyStore.addRecord({
        taskId: task.id,
        taskName: task.name,
        templateId: task.templateId,
        triggerType: triggerType,
        status: failedCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'failed'),
        startTime: startTime,
        endTime: endTime,
        duration: duration,
        totalAccounts: results.length,
        successCount: successCount,
        failedCount: failedCount,
        results: results.map((r: AccountExecutionResult) => ({
          tokenId: r.tokenId,
          tokenName: r.tokenName,
          success: r.success,
          message: r.message,
          executedAt: endTime
        }))
      });
      
      // 重新计算下次执行时间
      taskStore.updateNextRunTimes();
      
      // 触发通知
      if (successCount === results.length) {
        notificationStore.triggerNotification('task_success', {
          taskId: task.id,
          taskName: task.name
        });
        message.success(`任务 "${task.name}" 执行成功 (${successCount}/${results.length})`);
      } else if (successCount > 0) {
        notificationStore.triggerNotification('task_partial', {
          taskId: task.id,
          taskName: task.name,
          failedCount: failedCount,
          totalCount: results.length
        });
        message.warning(`任务 "${task.name}" 部分执行成功 (${successCount}/${results.length})`);
      } else {
        notificationStore.triggerNotification('task_failed', {
          taskId: task.id,
          taskName: task.name,
          message: '所有账号执行失败'
        });
        message.error(`任务 "${task.name}" 执行失败 (${successCount}/${results.length})`);
      }
    } catch (error: any) {
      executionStatusText.value = '执行失败';
      
      // 记录失败历史
      const endTime = new Date().toISOString();
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      const duration = endDate.getTime() - startDate.getTime();
      
      historyStore.addRecord({
        taskId: task.id,
        taskName: task.name,
        templateId: task.templateId,
        triggerType: triggerType,
        status: 'failed',
        startTime: startTime,
        endTime: endTime,
        duration: duration,
        totalAccounts: task.associatedAccounts?.length || 0,
        successCount: 0,
        failedCount: task.associatedAccounts?.length || 0,
        error: error.message,
        results: []
      });
      
      // 触发失败通知
      notificationStore.triggerNotification('task_failed', {
        taskId: task.id,
        taskName: task.name,
        message: error.message
      });
      
      message.error(`任务执行失败: ${error.message}`);
    }
  };

  // 立即执行（来自下个执行区域）
  const handleImmediateExecute = async (task: ScheduledTask) => {
    await handleExecute(task);
  };

  // 在详情页执行任务
  const executeTaskNow = async (task: ScheduledTask) => {
    await handleExecute(task);
  };

  // 暂停任务
  const handlePause = (task: ScheduledTask) => {
    taskStore.pauseTask(task.id);
    message.success(`任务 "${task.name}" 已暂停`);
  };

  // 启动任务
  const handleStart = (task: ScheduledTask) => {
    taskStore.startTask(task.id);
    message.success(`任务 "${task.name}" 已启动`);
  };

  // 编辑任务
  const handleEdit = (task: ScheduledTask) => {
    editingTask.value = task;
    showTaskModal.value = true;
  };

  // 删除任务
  const handleDelete = (task: ScheduledTask) => {
    dialog.warning({
      title: '删除任务',
      content: `确定要删除任务 "${task.name}" 吗？`,
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: async () => {
        await taskStore.deleteTask(task.id);
        message.success('任务已删除');
      }
    });
  };

  // 查看详情
  const handleViewDetail = (task: ScheduledTask) => {
    viewingTask.value = task;
    showDetailModal.value = true;
  };

  // 保存任务
  const handleSaveTask = (data: TaskFormData, taskId?: string) => {
    if (taskId) {
      taskStore.updateTask(taskId, data);
    } else {
      taskStore.createTask(data);
    }
    editingTask.value = null;
  };

  // 处理历史记录选择
  const handleHistorySelect = (record: TaskExecutionRecord) => {
    // 打开执行历史抽屉并定位到该记录
    showHistoryDrawer.value = true;
    message.info(`已选择历史记录: ${record.taskName}`);
  };

  // 检查到期任务
  const checkDueTasks = async () => {
    const now = new Date();
    const dueTasks = taskStore.tasks.filter((task: ScheduledTask) => {
      if (task.status !== 'running') return false;
      if (!task.nextRunTime) return false;
      return new Date(task.nextRunTime) <= now;
    });

    for (const task of dueTasks) {
      executor.addLog({
        time: new Date().toLocaleTimeString(),
        message: `定时执行任务: ${task.name}`,
        type: 'info'
      });
      await handleExecute(task, 'scheduled');
    }
  };

  // 监听弹窗关闭，清除编辑状态
  watch(showTaskModal, (show) => {
    if (!show) {
      editingTask.value = null;
    }
  });

  // 自动刷新
  watch(autoRefresh, (enabled) => {
    if (enabled) {
      refreshTimer = setInterval(() => {
        taskStore.updateNextRunTimes();
        checkDueTasks();
      }, 30000); // 每30秒刷新一次
    } else {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }
  });

  // 初始化
  onMounted(() => {
    taskStore.initialize();
    historyStore.initialize();
    notificationStore.initialize();
    checkMobile();
    window.addEventListener('resize', checkMobile);
  });

  // 清理
  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    window.removeEventListener('resize', checkMobile);
  });

  return {
    // Store
    taskStore,
    historyStore,
    notificationStore,
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
    checkDueTasks,
    handleHistorySelect
  };
}
