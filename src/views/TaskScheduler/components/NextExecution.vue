<template>
  <div class="next-execution-section">
    <div class="section-header">
      <h3 class="section-title">下个执行</h3>
      <div class="view-toggle">
        <n-radio-group v-model:value="viewMode" size="small">
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
    
    <div v-if="nextTask" class="next-task-container" :class="viewMode">
      <template v-if="viewMode === 'list'">
        <div class="task-header-row">
          <span class="header-cell task-name-header">任务名称</span>
          <span class="header-cell">执行时间</span>
          <span class="header-cell">关联账号</span>
          <span class="header-cell">下次执行</span>
          <span class="header-cell">操作</span>
        </div>
        <div class="task-row">
          <div class="task-cell task-name">
            <n-icon :component="TimeOutline" class="task-icon" />
            <span class="name-text">{{ nextTask.name }}</span>
          </div>
          <div class="task-cell">
            <n-tag size="small" type="info">{{ nextTask.cronExpression }}</n-tag>
          </div>
          <div class="task-cell">
            <span class="account-count">{{ nextTask.associatedAccounts?.length || 0 }} 个</span>
          </div>
          <div class="task-cell next-run">
            <span class="time-text">{{ formatNextRunTime(nextTask.nextRunTime) }}</span>
            <span class="countdown" :class="{ 'urgent': countdown.isOverdue.value || countdown.remaining.value < 60000 }">
              {{ countdown.formatted.value }}
            </span>
          </div>
          <div class="task-cell actions">
            <n-button 
              type="primary" 
              size="small"
              :loading="isExecuting"
              @click="handleExecute"
            >
              <template #icon>
                <n-icon :component="PlayOutline" />
              </template>
              执行
            </n-button>
            <n-button size="small" @click="handleDetail">详情</n-button>
          </div>
        </div>
      </template>
      
      <template v-else>
        <div class="next-task-card">
          <div class="card-header">
            <div class="task-title">
              <n-icon :component="TimeOutline" class="task-icon" />
              <span>{{ nextTask.name }}</span>
            </div>
            <n-tag size="small" :type="getStatusType(nextTask.status)">
              {{ getStatusText(nextTask.status) }}
            </n-tag>
          </div>
          <div class="card-body">
            <div class="info-row">
              <span class="label">执行时间:</span>
              <n-tag size="small" type="info">{{ nextTask.cronExpression }}</n-tag>
            </div>
            <div class="info-row">
              <span class="label">关联账号:</span>
              <span class="value">{{ nextTask.associatedAccounts?.length || 0 }} 个账号</span>
            </div>
            <div class="info-row">
              <span class="label">下次执行:</span>
              <div class="time-info">
                <span class="time-text">{{ formatNextRunTime(nextTask.nextRunTime) }}</span>
                <span class="countdown" :class="{ 'urgent': countdown.isOverdue.value || countdown.remaining.value < 60000 }">
                  {{ countdown.formatted.value }}
                </span>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <n-button 
              type="primary" 
              size="small"
              :loading="isExecuting"
              @click="handleExecute"
            >
              <template #icon>
                <n-icon :component="PlayOutline" />
              </template>
              立即执行
            </n-button>
            <n-button size="small" @click="handleDetail">查看详情</n-button>
          </div>
        </div>
      </template>
    </div>
    
    <div v-else class="empty-state">
      <n-empty description="暂无即将执行的任务">
        <template #icon>
          <n-icon :component="CalendarOutline" />
        </template>
      </n-empty>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { 
  TimeOutline, 
  PlayOutline, 
  GridOutline, 
  ListOutline,
  CalendarOutline
} from '@vicons/ionicons5';
import { useCountdown, formatNextRunTime } from '../composables/useCountdown';

const props = defineProps({
  nextTask: {
    type: Object,
    default: null
  },
  isExecuting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['execute', 'detail']);

const viewMode = ref('list');

const countdown = useCountdown(props.nextTask?.nextRunTime);

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

const handleExecute = () => {
  if (props.nextTask) {
    emit('execute', props.nextTask);
  }
};

const handleDetail = () => {
  if (props.nextTask) {
    emit('detail', props.nextTask);
  }
};
</script>

<style scoped lang="scss">
.next-execution-section {
  background: var(--bg-primary, white);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-light);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin: 0;
}

.view-toggle {
  display: flex;
  gap: 8px;
}

// 列表视图样式
.task-header-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 1.5fr;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f3f4f6);
  border-radius: 8px 8px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.task-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 1.5fr;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  align-items: center;
  transition: background 0.2s;
  
  &:hover {
    background: var(--bg-secondary, #f9fafb);
  }
  
  &:last-child {
    border-bottom: none;
    border-radius: 0 0 8px 8px;
  }
}

.task-cell {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--text-primary, #374151);
}

.task-name {
  gap: 8px;
  
  .task-icon {
    color: #3b82f6;
    font-size: 16px;
  }
  
  .name-text {
    font-weight: 500;
  }
}

.next-run {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  
  .time-text {
    color: var(--text-secondary, #6b7280);
    font-size: 12px;
  }
  
  .countdown {
    font-size: 12px;
    color: #3b82f6;
    font-weight: 500;
    
    &.urgent {
      color: #ef4444;
      animation: pulse 1.5s infinite;
    }
  }
}

.actions {
  gap: 8px;
}

// 卡片视图样式
.next-task-card {
  background: var(--bg-secondary, #f9fafb);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-light, #e5e7eb);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  
  .task-icon {
    color: #3b82f6;
    font-size: 20px;
  }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .label {
    font-size: 14px;
    color: var(--text-secondary, #6b7280);
    min-width: 70px;
  }
  
  .value {
    font-size: 14px;
    color: var(--text-primary, #374151);
  }
}

.time-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  .time-text {
    font-size: 14px;
    color: var(--text-primary, #374151);
  }
  
  .countdown {
    font-size: 12px;
    color: #3b82f6;
    font-weight: 500;
    
    &.urgent {
      color: #ef4444;
      animation: pulse 1.5s infinite;
    }
  }
}

.card-footer {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light, #e5e7eb);
}

.empty-state {
  padding: 40px 0;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

// 深色模式适配
[data-theme="dark"] {
  .next-execution-section {
    background: var(--bg-primary, #1f2937);
    box-shadow: var(--shadow-light);
  }
  
  .section-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .task-header-row {
    background: var(--bg-tertiary, #374151);
    color: var(--text-secondary, #9ca3af);
  }
  
  .task-row {
    border-color: var(--border-light, #4b5563);
    
    &:hover {
      background: var(--bg-tertiary, #374151);
    }
  }
  
  .task-cell {
    color: var(--text-primary, #e5e7eb);
  }
  
  .next-task-card {
    background: var(--bg-secondary, #374151);
    border-color: var(--border-light, #4b5563);
  }
  
  .task-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .info-row .label {
    color: var(--text-secondary, #9ca3af);
  }
  
  .info-row .value,
  .time-info .time-text {
    color: var(--text-primary, #e5e7eb);
  }
  
  .card-footer {
    border-color: var(--border-light, #4b5563);
  }
}

// 响应式
@media (max-width: 1024px) {
  .task-header-row,
  .task-row {
    grid-template-columns: 1.5fr 1fr 1fr 1.5fr;
    
    .header-cell:nth-child(3),
    .task-cell:nth-child(3) {
      display: none;
    }
  }
}

@media (max-width: 768px) {
  .task-header-row,
  .task-row {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    
    .header-cell:nth-child(2),
    .task-cell:nth-child(2) {
      display: none;
    }
  }
}
</style>
