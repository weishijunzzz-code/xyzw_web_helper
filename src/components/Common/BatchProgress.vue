<template>
  <div class="batch-progress-overlay" v-if="visible">
    <div class="batch-progress-modal">
      <div class="progress-header">
        <h3 class="progress-title">{{ title }}</h3>
        <span class="progress-count">{{ current }}/{{ total }}</span>
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            :style="{ width: `${percentage}%` }"
            :class="{ 'has-error': hasErrors }"
          >
            <div class="progress-shimmer"></div>
          </div>
        </div>
        <span class="progress-percentage">{{ percentage }}%</span>
      </div>

      <div class="progress-stats">
        <div class="stat-item success">
          <span class="stat-icon">✓</span>
          <span class="stat-label">成功</span>
          <span class="stat-value">{{ successCount }}</span>
        </div>
        <div class="stat-item error" v-if="errorCount > 0">
          <span class="stat-icon">✕</span>
          <span class="stat-label">失败</span>
          <span class="stat-value">{{ errorCount }}</span>
        </div>
        <div class="stat-item pending">
          <span class="stat-icon">○</span>
          <span class="stat-label">待处理</span>
          <span class="stat-value">{{ pendingCount }}</span>
        </div>
      </div>

      <div class="progress-current" v-if="currentItem">
        <span class="current-label">正在处理:</span>
        <span class="current-value">{{ currentItem }}</span>
      </div>

      <div class="progress-eta" v-if="eta > 0">
        <span class="eta-label">预计剩余时间:</span>
        <span class="eta-value">{{ formattedETA }}</span>
      </div>

      <div class="progress-actions">
        <n-button
          v-if="!isComplete"
          type="error"
          size="small"
          @click="handleCancel"
          :loading="isCancelling"
        >
          取消
        </n-button>
        <n-button
          v-else
          type="primary"
          size="small"
          @click="handleClose"
        >
          完成
        </n-button>
        <n-button
          v-if="errorCount > 0 && isComplete"
          type="warning"
          size="small"
          @click="showErrorDetails"
        >
          查看错误
        </n-button>
      </div>
    </div>

    <!-- 错误详情弹窗 -->
    <n-modal
      v-model:show="showErrors"
      title="错误详情"
      preset="card"
      style="width: 600px; max-width: 90vw"
    >
      <div class="error-list">
        <div
          v-for="(error, index) in errorList"
          :key="index"
          class="error-item"
        >
          <div class="error-header">
            <span class="error-index">#{{ index + 1 }}</span>
            <span class="error-name">{{ error.name }}</span>
          </div>
          <div class="error-message">{{ error.message }}</div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { NButton, NModal } from 'naive-ui';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '批量处理中',
  },
  total: {
    type: Number,
    default: 0,
  },
  current: {
    type: Number,
    default: 0,
  },
  successCount: {
    type: Number,
    default: 0,
  },
  errorCount: {
    type: Number,
    default: 0,
  },
  currentItem: {
    type: String,
    default: '',
  },
  startTime: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['cancel', 'close']);

const isCancelling = ref(false);
const showErrors = ref(false);

const percentage = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.current / props.total) * 100);
});

const pendingCount = computed(() => {
  return props.total - props.current;
});

const isComplete = computed(() => {
  return props.current >= props.total;
});

const hasErrors = computed(() => {
  return props.errorCount > 0;
});

// 计算预计剩余时间
const eta = computed(() => {
  if (props.current === 0 || !props.startTime) return 0;
  const elapsed = Date.now() - props.startTime;
  const avgTimePerItem = elapsed / props.current;
  const remaining = props.total - props.current;
  return Math.round(avgTimePerItem * remaining / 1000);
});

const formattedETA = computed(() => {
  const seconds = eta.value;
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}分${remainingSeconds}秒`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分`;
});

// 错误列表（需要从父组件传入）
const errorList = ref([]);

const handleCancel = async () => {
  isCancelling.value = true;
  emit('cancel');
};

const handleClose = () => {
  emit('close');
};

const showErrorDetails = () => {
  showErrors.value = true;
};

// 暴露方法给父组件
const addError = (name, message) => {
  errorList.value.push({ name, message });
};

const reset = () => {
  errorList.value = [];
  isCancelling.value = false;
  showErrors.value = false;
};

defineExpose({
  addError,
  reset,
});
</script>

<style scoped lang="scss">
.batch-progress-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  animation: fadeIn 0.2s ease-out;
}

.batch-progress-modal {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  padding: var(--space-6);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-xl);
  animation: slideUp 0.3s ease-out;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.progress-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.progress-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.progress-bar-bg {
  flex: 1;
  height: 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400));
  border-radius: var(--radius-full);
  transition: width 0.3s ease-out;
  position: relative;
  overflow: hidden;

  &.has-error {
    background: linear-gradient(90deg, var(--color-error-500), var(--color-warning-500));
  }

  .progress-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.4),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }
}

.progress-percentage {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  min-width: 40px;
  text-align: right;
}

.progress-stats {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);

  &.success {
    color: var(--color-success-600);
  }

  &.error {
    color: var(--color-error-600);
  }

  &.pending {
    color: var(--color-text-tertiary);
  }

  .stat-icon {
    font-weight: var(--font-weight-bold);
  }

  .stat-label {
    color: var(--color-text-secondary);
  }

  .stat-value {
    font-weight: var(--font-weight-semibold);
    margin-left: auto;
  }
}

.progress-current {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--font-size-sm);

  .current-label {
    color: var(--color-text-secondary);
  }

  .current-value {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.progress-eta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  font-size: var(--font-size-sm);

  .eta-label {
    color: var(--color-text-secondary);
  }

  .eta-value {
    color: var(--color-primary-600);
    font-weight: var(--font-weight-medium);
  }
}

.progress-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

// 错误列表
.error-list {
  max-height: 400px;
  overflow-y: auto;
}

.error-item {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border-default);

  &:last-child {
    border-bottom: none;
  }
}

.error-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.error-index {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-medium);
}

.error-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.error-message {
  font-size: var(--font-size-sm);
  color: var(--color-error-600);
  padding-left: var(--space-6);
}

// 动画
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

// 深色模式适配
.dark {
  .batch-progress-modal {
    background: var(--color-bg-secondary);
  }

  .progress-stats {
    background: var(--color-bg-tertiary);
  }
}
</style>
