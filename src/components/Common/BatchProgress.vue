<template>
  <teleport to="body">
    <div class="batch-progress-overlay" v-if="visible" @click.self="handleOverlayClick">
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
              :class="{ 'has-error': hasErrors, 'is-complete': isComplete }"
            >
              <div class="progress-shimmer" v-if="!isComplete"></div>
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

        <div class="progress-eta" v-if="eta > 0 && !isComplete">
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
            查看错误 ({{ errorCount }})
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
            v-for="(error, index) in localErrorList"
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
  </teleport>
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
  errorList: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['cancel', 'close']);

const isCancelling = ref(false);
const showErrors = ref(false);

// 本地错误列表副本
const localErrorList = ref([]);

// 同步错误列表
watch(() => props.errorList, (newList) => {
  localErrorList.value = [...newList];
}, { immediate: true, deep: true });

const percentage = computed(() => {
  if (props.total === 0) return 0;
  return Math.min(100, Math.round((props.current / props.total) * 100));
});

const pendingCount = computed(() => {
  return Math.max(0, props.total - props.current);
});

const isComplete = computed(() => {
  return props.current >= props.total && props.total > 0;
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

const handleCancel = async () => {
  isCancelling.value = true;
  emit('cancel');
};

const handleClose = () => {
  emit('close');
};

const handleOverlayClick = () => {
  // 点击遮罩层不关闭，防止误操作
  if (isComplete.value) {
    handleClose();
  }
};

const showErrorDetails = () => {
  showErrors.value = true;
};
</script>

<style scoped lang="scss">
.batch-progress-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease-out;
}

.batch-progress-modal {
  background: var(--bg-primary, #ffffff);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-light);
  animation: slideUp 0.3s ease-out;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #333333);
  margin: 0;
}

.progress-count {
  font-size: 14px;
  color: var(--text-secondary, #666666);
  font-weight: 500;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.progress-bar-bg {
  flex: 1;
  height: 12px;
  background: var(--bg-tertiary, #e5e7eb);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary-color);
  border-radius: 9999px;
  transition: width 0.3s ease-out;
  position: relative;
  overflow: hidden;

  &.has-error {
    background: linear-gradient(90deg, #f56565, #ed8936);
  }

  &.is-complete {
    background: linear-gradient(90deg, #48bb78, #38a169);
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
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333333);
  min-width: 40px;
  text-align: right;
}

.progress-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-secondary, #f3f4f6);
  border-radius: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;

  &.success {
    color: #48bb78;
  }

  &.error {
    color: #f56565;
  }

  &.pending {
    color: var(--text-tertiary, #9ca3af);
  }

  .stat-icon {
    font-weight: bold;
  }

  .stat-label {
    color: var(--text-secondary, #666666);
  }

  .stat-value {
    font-weight: 600;
    margin-left: auto;
    padding-left: 4px;
  }
}

.progress-current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;

  .current-label {
    color: var(--text-secondary, #666666);
    flex-shrink: 0;
  }

  .current-value {
    color: var(--text-primary, #333333);
    font-weight: 500;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.progress-eta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;

  .eta-label {
    color: var(--text-secondary, #666666);
  }

  .eta-value {
    color: var(--primary-color);
    font-weight: 500;
  }
}

.progress-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

// 错误列表
.error-list {
  max-height: 400px;
  overflow-y: auto;
}

.error-item {
  padding: 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);

  &:last-child {
    border-bottom: none;
  }
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.error-index {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  font-weight: 500;
}

.error-name {
  font-weight: 600;
  color: var(--text-primary, #333333);
}

.error-message {
  font-size: 14px;
  color: #f56565;
  padding-left: 28px;
  word-break: break-all;
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
.dark,
[data-theme="dark"] {
  .batch-progress-modal {
    background: var(--bg-secondary, #1f2937);
  }

  .progress-stats {
    background: var(--bg-tertiary, #374151);
  }

  .progress-title {
    color: var(--text-primary, #ffffff);
  }

  .progress-count,
  .current-label,
  .eta-label,
  .stat-label {
    color: var(--text-secondary, #d1d5db);
  }

  .current-value,
  .progress-percentage {
    color: var(--text-primary, #ffffff);
  }

  .progress-bar-bg {
    background: var(--bg-tertiary, #374151);
  }

  .error-name {
    color: var(--text-primary, #ffffff);
  }

  .error-item {
    border-color: var(--border-color, #4b5563);
  }
}

// 移动端适配
@media (max-width: 640px) {
  .batch-progress-modal {
    width: 95%;
    padding: 20px;
    margin: 16px;
  }

  .progress-stats {
    flex-wrap: wrap;
    gap: 12px;
  }

  .stat-item {
    font-size: 12px;
  }
}
</style>
