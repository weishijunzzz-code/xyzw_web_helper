<template>
  <div class="empty-state" :class="`empty-${type}`">
    <div class="empty-icon">
      <slot name="icon">
        <n-icon :size="iconSize" :color="iconColor">
          <component :is="iconComponent" />
        </n-icon>
      </slot>
    </div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-description">{{ description }}</div>
    <div v-if="showAction" class="empty-action">
      <slot name="action">
        <n-button :type="actionType" @click="handleAction">
          {{ actionText }}
        </n-button>
      </slot>
    </div>
    <div v-if="showGuide && guideSteps.length > 0" class="empty-guide">
      <div class="guide-title">操作指南：</div>
      <div class="guide-steps">
        <div 
          v-for="(step, index) in guideSteps" 
          :key="index"
          class="guide-step"
        >
          <span class="step-number">{{ index + 1 }}</span>
          <span class="step-text">{{ step }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { 
  FileTrayFullOutline as InboxOutline,
  SearchOutline,
  FileTrayOutline,
  AlertCircleOutline,
  AddCircleOutline,
  PersonAddOutline,
  CubeOutline,
  HelpCircleOutline
} from '@vicons/ionicons5';

const props = defineProps({
  type: {
    type: String,
    default: 'default',
    validator: (value) => [
      'default', 'search', 'data', 'error', 'token', 
      'club', 'task', 'feature'
    ].includes(value)
  },
  title: {
    type: String,
    default: '暂无数据'
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: null
  },
  iconSize: {
    type: Number,
    default: 64
  },
  showAction: {
    type: Boolean,
    default: false
  },
  actionText: {
    type: String,
    default: '立即添加'
  },
  actionType: {
    type: String,
    default: 'primary'
  },
  showGuide: {
    type: Boolean,
    default: false
  },
  guideSteps: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['action']);

const iconMap = {
  default: InboxOutline,
  search: SearchOutline,
  data: FileTrayOutline,
  error: AlertCircleOutline,
  token: AddCircleOutline,
  club: PersonAddOutline,
  task: CubeOutline,
  feature: HelpCircleOutline
};

const iconComponent = computed(() => {
  return props.icon ? iconMap[props.icon] || InboxOutline : iconMap[props.type];
});

const iconColor = computed(() => {
  const colors = {
    default: 'var(--text-tertiary)',
    search: 'var(--info-color)',
    data: 'var(--text-tertiary)',
    error: 'var(--error-color)',
    token: 'var(--primary-color)',
    club: 'var(--success-color)',
    task: 'var(--warning-color)',
    feature: 'var(--secondary-color)'
  };
  return colors[props.type] || colors.default;
});

const handleAction = () => {
  emit('action');
};
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
  text-align: center;
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
  opacity: 0.8;
  animation: float 3s ease-in-out infinite;
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.empty-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
  max-width: 400px;
  line-height: 1.6;
}

.empty-action {
  margin-bottom: var(--spacing-lg);
}

.empty-guide {
  background: var(--bg-secondary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  max-width: 400px;
  width: 100%;
}

.guide-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: var(--spacing-md);
}

.guide-steps {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.guide-step {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  text-align: left;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--primary-color);
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}

.step-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  padding-top: 2px;
}

// 不同类型空状态的特定样式
.empty-token {
  .empty-icon {
    color: var(--primary-color);
  }
}

.empty-club {
  .empty-icon {
    color: var(--success-color);
  }
}

.empty-error {
  .empty-icon {
    color: var(--error-color);
    animation: shake 0.5s ease-in-out;
  }
}

// 动画
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

// 移动端适配
@media (max-width: 768px) {
  .empty-state {
    padding: var(--spacing-xl);
  }
  
  .empty-icon {
    :deep(.n-icon) {
      font-size: 48px !important;
    }
  }
  
  .empty-title {
    font-size: var(--font-size-md);
  }
  
  .empty-guide {
    padding: var(--spacing-md);
  }
}
</style>
