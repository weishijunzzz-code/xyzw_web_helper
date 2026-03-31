<template>
  <div class="task-list-section">
    <div class="section-header">
      <h3 class="section-title">任务列表</h3>
      <div class="header-actions">
        <n-button v-if="!isMobile" text size="small" @click="toggleSortMode">
          <template #icon>
            <n-icon :component="isSortMode ? CheckmarkOutline : ReorderFourOutline" />
          </template>
          {{ isSortMode ? '完成排序' : '排序' }}
        </n-button>
        
        <n-button v-if="!isMobile" type="primary" @click="handleAdd">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          新增任务
        </n-button>
        
        <n-radio-group v-if="!isMobile && !isSortMode" v-model:value="viewMode" size="small">
          <n-radio-button value="card">
            <n-icon :component="GridOutline" />
            卡片
          </n-radio-button>
          <n-radio-button value="list">
            <n-icon :component="ListOutline" />
            列表
          </n-radio-button>
        </n-radio-group>
      </div>
    </div>
    
    <!-- 拖拽排序提示 -->
    <n-alert v-if="isSortMode" type="info" closable class="sort-hint">
      拖拽任务卡片可调整顺序，调整完成后点击"完成排序"保存
    </n-alert>
    
    <!-- 拖拽排序视图 -->
    <draggable
      v-if="isSortMode"
      v-model="sortableTasks"
      item-key="id"
      handle=".drag-handle"
      ghost-class="ghost"
      drag-class="dragging"
      class="sortable-list"
      @end="handleDragEnd"
    >
      <template #item="{ element: task, index }">
        <div class="sortable-item">
          <div class="drag-handle">
            <n-icon :component="ReorderTwoOutline" />
          </div>
          <div class="task-info">
            <span class="task-name">{{ task.name }}</span>
            <n-tag size="small" :type="getStatusType(task.status)">
              {{ getStatusText(task.status) }}
            </n-tag>
          </div>
          <span class="task-order">#{{ index + 1 }}</span>
        </div>
      </template>
    </draggable>
    
    <!-- 普通视图 -->
    <component
      v-else
      :is="currentViewMode === 'card' ? CardView : ListView"
      :tasks="filteredTasks"
      :loading="loading"
      :is-mobile="isMobile"
      @execute="handleExecute"
      @pause="handlePause"
      @start="handleStart"
      @edit="handleEdit"
      @delete="handleDelete"
      @add="handleAdd"
    />
    
    <!-- 分页 -->
    <div v-if="showPagination && !isSortMode" class="pagination-wrapper">
      <n-pagination
        v-model:page="currentPage"
        v-model:page-size="pageSize"
        :item-count="tasks.length"
        :page-sizes="[10, 20, 50, 100]"
        show-size-picker
        show-quick-jumper
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { 
  AddOutline, 
  GridOutline, 
  ListOutline,
  ReorderFourOutline,
  ReorderTwoOutline,
  CheckmarkOutline
} from '@vicons/ionicons5';
import draggable from 'vuedraggable';
import CardView from './CardView.vue';
import ListView from './ListView.vue';
import { useScheduledTaskStore } from '@/stores/scheduledTaskStore';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  filter: {
    type: String,
    default: 'all'
  }
});

const emit = defineEmits(['execute', 'pause', 'start', 'edit', 'delete', 'add', 'reorder']);

const taskStore = useScheduledTaskStore();

// 移动端检测
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
};

// 排序模式
const isSortMode = ref(false);
const sortableTasks = ref([]);

// 桌面端默认列表视图，移动端默认卡片视图
const viewMode = ref('list');
const currentPage = ref(1);
const pageSize = ref(10);

// 当前视图模式：移动端强制使用卡片视图
const currentViewMode = computed(() => {
  return isMobile.value ? 'card' : viewMode.value;
});

const filteredTasks = computed(() => {
  let result = [...props.tasks];
  
  // 根据状态筛选
  switch (props.filter) {
    case 'running':
      result = result.filter(t => t.status === 'running');
      break;
    case 'paused':
      result = result.filter(t => t.status === 'paused');
      break;
    case 'error':
      result = result.filter(t => t.status === 'error');
      break;
  }
  
  // 只有在非排序模式下才按下次执行时间排序
  if (!isSortMode.value) {
    result.sort((a, b) => {
      if (!a.nextRunTime) return 1;
      if (!b.nextRunTime) return -1;
      return new Date(a.nextRunTime).getTime() - new Date(b.nextRunTime).getTime();
    });
  }
  
  return result;
});

const showPagination = computed(() => filteredTasks.value.length > 10);

// 切换排序模式
const toggleSortMode = () => {
  if (isSortMode.value) {
    // 保存排序
    taskStore.reorderTasks(sortableTasks.value);
    emit('reorder', sortableTasks.value);
  } else {
    // 进入排序模式，复制当前任务列表
    sortableTasks.value = [...props.tasks];
  }
  isSortMode.value = !isSortMode.value;
};

// 拖拽结束
const handleDragEnd = () => {
  // 拖拽结束后自动保存
  taskStore.reorderTasks(sortableTasks.value);
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

const handleExecute = (task) => emit('execute', task);
const handlePause = (task) => emit('pause', task);
const handleStart = (task) => emit('start', task);
const handleEdit = (task) => emit('edit', task);
const handleDelete = (task) => emit('delete', task);
const handleAdd = () => emit('add');

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});
</script>

<style scoped lang="scss">
.task-list-section {
  background: var(--bg-primary, white);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-hint {
  margin-bottom: 16px;
}

.sortable-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sortable-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
  cursor: move;
  
  &:hover {
    background: var(--bg-hover, #f3f4f6);
    border-color: #3b82f6;
  }
  
  &.ghost {
    opacity: 0.5;
    background: #e0f2fe;
  }
  
  &.dragging {
    background: #dbeafe;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}

.drag-handle {
  cursor: grab;
  color: var(--text-secondary, #6b7280);
  display: flex;
  align-items: center;
  
  &:active {
    cursor: grabbing;
  }
  
  .n-icon {
    font-size: 20px;
  }
}

.task-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-name {
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.task-order {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  font-weight: 600;
}

.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

// 深色模式适配
[data-theme="dark"] {
  .task-list-section {
    background: var(--bg-primary, #1f2937);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .section-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .sortable-item {
    background: var(--bg-secondary, #374151);
    
    &:hover {
      background: var(--bg-hover, #4b5563);
    }
    
    &.ghost {
      background: rgba(59, 130, 246, 0.2);
    }
    
    &.dragging {
      background: rgba(59, 130, 246, 0.3);
    }
  }
  
  .task-name {
    color: var(--text-primary, #e5e7eb);
  }
}

// 响应式
@media (max-width: 768px) {
  .task-list-section {
    padding: 16px;
  }
  
  .section-header {
    margin-bottom: 16px;
  }
  
  .section-title {
    font-size: 16px;
  }
}
</style>
