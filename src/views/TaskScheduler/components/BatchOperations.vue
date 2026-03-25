<template>
  <div class="batch-operations">
    <!-- 批量操作工具栏 -->
    <div v-if="selectedTasks.length > 0" class="batch-toolbar">
      <n-space align="center">
        <n-text>已选择 {{ selectedTasks.length }} 个任务</n-text>
        <n-divider vertical />
        <n-button size="small" @click="selectAll">
          {{ isAllSelected ? '取消全选' : '全选' }}
        </n-button>
        <n-button size="small" type="primary" @click="batchExecute">
          <template #icon>
            <n-icon :component="PlayOutline" />
          </template>
          批量执行
        </n-button>
        <n-button size="small" type="warning" @click="batchPause">
          <template #icon>
            <n-icon :component="PauseOutline" />
          </template>
          批量暂停
        </n-button>
        <n-button size="small" type="success" @click="batchStart">
          <template #icon>
            <n-icon :component="PlayCircleOutline" />
          </template>
          批量启动
        </n-button>
        <n-button size="small" type="error" @click="batchDelete">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          批量删除
        </n-button>
        <n-button size="small" @click="clearSelection">
          取消选择
        </n-button>
      </n-space>
    </div>
    
    <!-- 任务列表（带复选框） -->
    <div class="task-list-with-selection">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ selected: isSelected(task.id) }"
        @click="toggleSelection(task)"
      >
        <n-checkbox
          :checked="isSelected(task.id)"
          @click.stop
          @update:checked="(val) => toggleSelection(task, val)"
        />
        <div class="task-content">
          <div class="task-header">
            <span class="task-name">{{ task.name }}</span>
            <n-tag size="small" :type="getStatusType(task.status)">
              {{ getStatusText(task.status) }}
            </n-tag>
          </div>
          <div class="task-meta">
            <n-text depth="3" size="small">{{ task.cronExpression }}</n-text>
            <n-text depth="3" size="small">{{ task.associatedAccounts?.length || 0 }} 个账号</n-text>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 批量执行进度弹窗 -->
    <n-modal
      v-model:show="showProgressModal"
      preset="card"
      title="批量执行中"
      style="width: 90%; max-width: 500px"
      :closable="false"
      :mask-closable="false"
    >
      <div class="batch-progress">
        <n-progress
          type="line"
          :percentage="batchProgress"
          :indicator-placement="'inside'"
        />
        <p class="progress-text">
          正在执行 {{ currentTaskIndex }}/{{ selectedTasks.length }}: {{ currentTaskName }}
        </p>
        <n-list v-if="batchResults.length > 0" class="results-list">
          <n-list-item v-for="(result, index) in batchResults" :key="index">
            <n-thing :title="result.taskName">
              <template #description>
                <n-tag :type="result.success ? 'success' : 'error'" size="small">
                  {{ result.success ? '成功' : '失败' }}
                </n-tag>
                <n-text v-if="!result.success" depth="3">{{ result.error }}</n-text>
              </template>
            </n-thing>
          </n-list-item>
        </n-list>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useMessage, useDialog } from 'naive-ui';
import {
  PlayOutline,
  PauseOutline,
  PlayCircleOutline,
  TrashOutline
} from '@vicons/ionicons5';
import { useScheduledTaskStore } from '@/stores/scheduledTaskStore';
import { useTaskExecutor } from '../composables/useTaskExecutor';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['refresh']);

const message = useMessage();
const dialog = useDialog();
const taskStore = useScheduledTaskStore();
const executor = useTaskExecutor();

// 选中的任务
const selectedTasks = ref([]);
const showProgressModal = ref(false);
const batchProgress = ref(0);
const currentTaskIndex = ref(0);
const currentTaskName = ref('');
const batchResults = ref([]);

// 是否全选
const isAllSelected = computed(() => {
  return props.tasks.length > 0 && selectedTasks.value.length === props.tasks.length;
});

// 判断是否选中
const isSelected = (taskId) => {
  return selectedTasks.value.some(t => t.id === taskId);
};

// 切换选中状态
const toggleSelection = (task, val) => {
  if (val !== undefined) {
    if (val) {
      if (!isSelected(task.id)) {
        selectedTasks.value.push(task);
      }
    } else {
      selectedTasks.value = selectedTasks.value.filter(t => t.id !== task.id);
    }
  } else {
    if (isSelected(task.id)) {
      selectedTasks.value = selectedTasks.value.filter(t => t.id !== task.id);
    } else {
      selectedTasks.value.push(task);
    }
  }
};

// 全选/取消全选
const selectAll = () => {
  if (isAllSelected.value) {
    selectedTasks.value = [];
  } else {
    selectedTasks.value = [...props.tasks];
  }
};

// 清空选择
const clearSelection = () => {
  selectedTasks.value = [];
};

// 批量执行
const batchExecute = async () => {
  if (selectedTasks.value.length === 0) {
    message.warning('请先选择任务');
    return;
  }

  showProgressModal.value = true;
  batchProgress.value = 0;
  currentTaskIndex.value = 0;
  batchResults.value = [];

  for (let i = 0; i < selectedTasks.value.length; i++) {
    const task = selectedTasks.value[i];
    currentTaskIndex.value = i + 1;
    currentTaskName.value = task.name;
    batchProgress.value = Math.round((i / selectedTasks.value.length) * 100);

    try {
      const results = await executor.executeTaskTemplate(task);
      const successCount = results.filter(r => r.success).length;
      batchResults.value.push({
        taskName: task.name,
        success: successCount === results.length,
        error: successCount < results.length ? `部分失败 (${successCount}/${results.length})` : null
      });

      // 更新任务统计
      taskStore.updateTask(task.id, {
        lastRunTime: new Date().toISOString(),
        runCount: {
          ...task.runCount,
          total: (task.runCount?.total || 0) + 1,
          today: (task.runCount?.today || 0) + 1,
          todaySuccess: (task.runCount?.todaySuccess || 0) + successCount,
          todayFailed: (task.runCount?.todayFailed || 0) + (results.length - successCount)
        }
      });
    } catch (error) {
      batchResults.value.push({
        taskName: task.name,
        success: false,
        error: error.message
      });
    }
  }

  batchProgress.value = 100;
  message.success('批量执行完成');
  emit('refresh');

  // 延迟关闭弹窗
  setTimeout(() => {
    showProgressModal.value = false;
  }, 2000);
};

// 批量暂停
const batchPause = () => {
  dialog.warning({
    title: '批量暂停',
    content: `确定要暂停选中的 ${selectedTasks.value.length} 个任务吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      selectedTasks.value.forEach(task => {
        taskStore.pauseTask(task.id);
      });
      message.success(`已暂停 ${selectedTasks.value.length} 个任务`);
      clearSelection();
      emit('refresh');
    }
  });
};

// 批量启动
const batchStart = () => {
  selectedTasks.value.forEach(task => {
    taskStore.startTask(task.id);
  });
  message.success(`已启动 ${selectedTasks.value.length} 个任务`);
  clearSelection();
  emit('refresh');
};

// 批量删除
const batchDelete = () => {
  dialog.error({
    title: '批量删除',
    content: `确定要删除选中的 ${selectedTasks.value.length} 个任务吗？此操作不可恢复！`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: () => {
      selectedTasks.value.forEach(task => {
        taskStore.deleteTask(task.id);
      });
      message.success(`已删除 ${selectedTasks.value.length} 个任务`);
      clearSelection();
      emit('refresh');
    }
  });
};

// 状态映射
const getStatusType = (status) => {
  const map = { running: 'success', paused: 'warning', error: 'error', completed: 'info' };
  return map[status] || 'default';
};

const getStatusText = (status) => {
  const map = { running: '运行中', paused: '已暂停', error: '异常', completed: '已完成' };
  return map[status] || status;
};
</script>

<style scoped lang="scss">
.batch-operations {
  width: 100%;
}

.batch-toolbar {
  background: var(--bg-secondary, #f3f4f6);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.task-list-with-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-primary, white);
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-secondary, #f9fafb);
  }

  &.selected {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  }
}

.task-content {
  flex: 1;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.task-name {
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.task-meta {
  display: flex;
  gap: 16px;
}

.batch-progress {
  padding: 20px 0;
}

.progress-text {
  text-align: center;
  margin-top: 12px;
  color: var(--text-secondary, #6b7280);
}

.results-list {
  max-height: 300px;
  overflow-y: auto;
  margin-top: 16px;
}

[data-theme="dark"] {
  .batch-toolbar {
    background: var(--bg-secondary, #374151);
  }

  .task-item {
    background: var(--bg-primary, #1f2937);

    &:hover {
      background: var(--bg-secondary, #374151);
    }

    &.selected {
      background: rgba(59, 130, 246, 0.1);
    }
  }

  .task-name {
    color: var(--text-primary, #e5e7eb);
  }
}
</style>
