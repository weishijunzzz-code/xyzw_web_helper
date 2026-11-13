<template>
  <div class="card-view">
    <!-- 加载状态 -->
    <div v-if="loading" class="skeleton-grid">
      <SkeletonCard 
        v-for="i in 6" 
        :key="i"
        variant="compact"
        :show-footer="true"
        :footer-buttons="3"
      />
    </div>
    
    <!-- 空状态 -->
    <EmptyState
      v-else-if="tasks.length === 0"
      title="暂无定时任务"
      description="您还没有创建任何定时任务，点击按钮添加第一个任务"
      action-text="添加任务"
      @action="$emit('add')"
    >
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </template>
    </EmptyState>
    
    <!-- 任务列表 -->
    <div v-else class="task-cards-grid">
      <div 
        v-for="task in tasks" 
        :key="task.id"
        class="task-card"
        :class="[task.status, { 'is-mobile': isMobile }]"
        @touchstart="handleTouchStart($event, task)"
        @touchend="handleTouchEnd($event, task)"
        @touchmove="handleTouchMove($event)"
      >
        <div class="card-header">
          <div class="task-title">
            <n-icon :component="TimeOutline" class="task-icon" />
            <span class="name">{{ task.name }}</span>
          </div>
          <n-tag 
            :type="getStatusType(task.status)" 
            size="small"
            round
          >
            {{ getStatusText(task.status) }}
          </n-tag>
        </div>
        
        <div class="card-body">
          <div class="info-row">
            <div class="info-item">
              <span class="label">执行:</span>
              <n-tag size="small" type="info">{{ task.cronExpression }}</n-tag>
            </div>
            <div class="info-item">
              <span class="label">账号:</span>
              <span class="value">{{ task.associatedAccounts?.length || 0 }} 个</span>
            </div>
          </div>
          
          <div class="info-item next-run">
            <span class="label">下次:</span>
            <div class="time-info">
              <TaskCountdown :target-time="task.nextRunTime" />
            </div>
          </div>
          
          <div class="stats-row">
            <n-tag size="small" type="success">
              成功 {{ task.runCount?.todaySuccess || 0 }}
            </n-tag>
            <n-tag 
              v-if="task.runCount?.todayFailed > 0" 
              size="small" 
              type="error"
            >
              失败 {{ task.runCount.todayFailed }}
            </n-tag>
          </div>
        </div>
        
        <div class="card-footer">
          <template v-if="task.status === 'running'">
            <n-button 
              size="small" 
              type="warning"
              @click="$emit('pause', task)"
            >
              <template #icon>
                <n-icon :component="PauseOutline" />
              </template>
              <span v-if="!isMobile">暂停</span>
            </n-button>
          </template>
          <template v-else>
            <n-button 
              size="small" 
              type="success"
              @click="$emit('start', task)"
            >
              <template #icon>
                <n-icon :component="PlayOutline" />
              </template>
              <span v-if="!isMobile">执行</span>
            </n-button>
          </template>
          
          <n-button 
            size="small"
            @click="$emit('edit', task)"
          >
            <template #icon>
              <n-icon :component="CreateOutline" />
            </template>
            <span v-if="!isMobile">编辑</span>
          </n-button>
          
          <n-popconfirm
            @positive-click="$emit('delete', task)"
            positive-text="确定"
            negative-text="取消"
          >
            <template #trigger>
              <n-button size="small" type="error">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
                <span v-if="!isMobile">删除</span>
              </n-button>
            </template>
            确定删除任务 "{{ task.name }}" 吗？
          </n-popconfirm>
        </div>
        
        <!-- 移动端滑动提示 -->
        <div v-if="isMobile && showSwipeHint" class="swipe-hint">
          <n-icon :component="ChevronForwardOutline" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { 
  TimeOutline, 
  PlayOutline, 
  PauseOutline, 
  CreateOutline, 
  TrashOutline,
  CalendarOutline,
  ChevronForwardOutline
} from '@vicons/ionicons5';
import TaskCountdown from './TaskCountdown.vue';
import EmptyState from '../EmptyState.vue';
import SkeletonCard from '../SkeletonCard.vue';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  isMobile: {
    type: Boolean,
    default: false
  }
});

defineEmits(['execute', 'pause', 'start', 'edit', 'delete', 'add']);

const showSwipeHint = ref(true);
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;

const handleTouchStart = (e, task) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
};

const handleTouchMove = (e) => {
  // 防止滚动时触发滑动
  const touchX = e.touches[0].clientX;
  const touchY = e.touches[0].clientY;
  const deltaX = Math.abs(touchX - touchStartX);
  const deltaY = Math.abs(touchY - touchStartY);
  
  if (deltaX > deltaY) {
    e.preventDefault();
  }
};

const handleTouchEnd = (e, task) => {
  touchEndX = e.changedTouches[0].clientX;
  const deltaX = touchEndX - touchStartX;
  const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
  
  // 水平滑动距离大于50px，且垂直滑动距离小于30px（防止误触）
  if (Math.abs(deltaX) > 50 && deltaY < 30) {
    showSwipeHint.value = false;
    
    if (deltaX > 0) {
      // 右滑 - 执行/启动
      if (task.status === 'running') {
        // 已经在运行，可以暂停
      } else {
        // 启动任务
        // 这里可以触发执行
      }
    } else {
      // 左滑 - 可以添加其他操作
    }
  }
};

const getStatusType = (status) => {
  const map = {
    running: 'success',
    paused: 'warning',
    error: 'error',
    completed: 'info'
  };
  return map[status] || 'default';
};

const getStatusText = (status) => {
  const map = {
    running: '运行中',
    paused: '已暂停',
    error: '异常',
    completed: '已完成'
  };
  return map[status] || status;
};
</script>

<style scoped lang="scss">
.card-view {
  min-height: 200px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.task-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.task-card {
  position: relative;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-light, #e5e7eb);
  transition: all 0.2s ease;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-light);
  }
  
  &.running {
    border-left: 4px solid #10b981;
  }
  
  &.paused {
    border-left: 4px solid #f59e0b;
  }
  
  &.error {
    border-left: 4px solid #ef4444;
  }
  
  &.completed {
    border-left: 4px solid #6b7280;
  }
  
  // 移动端优化
  &.is-mobile {
    padding: 12px;
    touch-action: pan-y;
    user-select: none;
    
    &.running,
    &.paused,
    &.error,
    &.completed {
      border-left: none;
      border-top: 3px solid;
    }
    
    &.running { border-top-color: #10b981; }
    &.paused { border-top-color: #f59e0b; }
    &.error { border-top-color: #ef4444; }
    &.completed { border-top-color: #6b7280; }
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .task-icon {
    color: #3b82f6;
    font-size: 16px;
  }
  
  .name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #1f2937);
  }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  
  &.next-run {
    .time-info {
      font-size: 12px;
      color: #3b82f6;
      font-weight: 500;
    }
  }
  
  .label {
    font-size: 12px;
    color: var(--text-secondary, #6b7280);
    flex-shrink: 0;
  }
  
  .value {
    font-size: 12px;
    color: var(--text-primary, #374151);
  }
}

.stats-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.card-footer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light, #e5e7eb);
  
  // 移动端按钮优化
  .is-mobile & {
    gap: 6px;
    
    .n-button {
      flex: 1;
      justify-content: center;
    }
  }
}

// 滑动提示
.swipe-hint {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary, #9ca3af);
  font-size: 20px;
  opacity: 0.5;
  animation: swipeHint 1.5s infinite;
  pointer-events: none;
}

@keyframes swipeHint {
  0%, 100% {
    transform: translateY(-50%) translateX(0);
    opacity: 0.3;
  }
  50% {
    transform: translateY(-50%) translateX(-5px);
    opacity: 0.6;
  }
}

// 深色模式适配
[data-theme="dark"] {
  .task-card {
    background: var(--bg-secondary, #374151);
    border-color: var(--border-light, #4b5563);
    
    &:hover {
      box-shadow: var(--shadow-light);
    }
  }
  
  .task-title .name {
    color: var(--text-primary, #f9fafb);
  }
  
  .info-item .label {
    color: var(--text-secondary, #9ca3af);
  }
  
  .info-item .value,
  .time-info .time-text {
    color: var(--text-primary, #e5e7eb);
  }
  
  .card-footer {
    border-color: var(--border-light, #4b5563);
  }
}

// 响应式
@media (max-width: 640px) {
  .task-cards-grid {
    grid-template-columns: 1fr;
  }
  
  .card-header {
    margin-bottom: 10px;
  }
  
  .task-title .name {
    font-size: 14px;
  }
  
  .card-body {
    gap: 6px;
    margin-bottom: 10px;
  }
  
  .info-row {
    gap: 12px;
  }
}
</style>
