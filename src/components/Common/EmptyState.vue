<template>
  <div class="empty-state" :class="`empty-${type}`">
    <!-- 插画区域 -->
    <div class="empty-illustration-wrapper">
      <slot name="illustration">
        <EmptyStateIllustration :type="illustrationType" />
      </slot>
    </div>
    
    <!-- 标题 -->
    <div class="empty-title">{{ displayTitle }}</div>
    
    <!-- 描述 -->
    <div v-if="displayDescription" class="empty-description">
      {{ displayDescription }}
    </div>
    
    <!-- 引导提示 -->
    <div v-if="showTip && tipText" class="empty-tip">
      <n-icon size="16" :component="BulbOutline" />
      <span>{{ tipText }}</span>
    </div>
    
    <!-- 操作按钮 -->
    <div v-if="showAction" class="empty-action">
      <slot name="action">
        <n-button 
          :type="actionType" 
          size="large"
          class="action-button"
          @click="handleAction"
        >
          <template #icon>
            <n-icon :component="actionIcon" />
          </template>
          {{ actionText }}
        </n-button>
      </slot>
    </div>
    
    <!-- 操作指南 -->
    <div v-if="showGuide && guideSteps.length > 0" class="empty-guide">
      <div class="guide-header">
        <n-icon size="18" :component="HelpCircleOutline" />
        <span>操作指南</span>
      </div>
      <div class="guide-steps">
        <div 
          v-for="(step, index) in guideSteps" 
          :key="index"
          class="guide-step"
          :class="{ 'is-active': currentStep === index }"
          @mouseenter="currentStep = index"
        >
          <div class="step-indicator">
            <span class="step-number">{{ index + 1 }}</span>
            <div v-if="index < guideSteps.length - 1" class="step-line"></div>
          </div>
          <div class="step-content">
            <span class="step-text">{{ step }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 额外链接 -->
    <div v-if="extraLinkText" class="empty-extra">
      <n-button text @click="handleExtraClick">
        {{ extraLinkText }}
        <template #icon>
          <n-icon :component="ChevronForwardOutline" />
        </template>
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { 
  AddCircleOutline,
  SearchOutline,
  RefreshOutline,
  HelpCircleOutline,
  BulbOutline,
  ChevronForwardOutline,
  ArrowForwardOutline
} from '@vicons/ionicons5';
import EmptyStateIllustration from './EmptyStateIllustration.vue';

const props = defineProps({
  type: {
    type: String,
    default: 'default',
    validator: (value) => [
      'default', 'search', 'data', 'error', 'token', 
      'club', 'task', 'feature', 'network'
    ].includes(value)
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  showAction: {
    type: Boolean,
    default: false
  },
  actionText: {
    type: String,
    default: ''
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
  },
  showTip: {
    type: Boolean,
    default: true
  },
  tipText: {
    type: String,
    default: ''
  },
  extraLinkText: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['action', 'extraClick']);

const currentStep = ref(0);

// 预设配置
const presetConfigs = {
  default: {
    title: '暂无数据',
    description: '这里还没有任何内容',
    actionText: '立即添加',
    tipText: '开始添加您的第一个项目吧',
    illustration: 'default'
  },
  search: {
    title: '没有找到结果',
    description: '尝试使用其他关键词搜索',
    actionText: '清除搜索',
    tipText: '可以使用更简单的关键词试试',
    illustration: 'search'
  },
  data: {
    title: '数据为空',
    description: '暂无相关数据展示',
    actionText: '刷新数据',
    tipText: '数据可能需要一些时间加载',
    illustration: 'data'
  },
  error: {
    title: '出错了',
    description: '加载过程中发生了错误',
    actionText: '重新加载',
    tipText: '请检查网络连接后重试',
    illustration: 'error'
  },
  token: {
    title: '还没有添加Token',
    description: '添加Token后即可开始使用游戏功能',
    actionText: '添加Token',
    tipText: 'Token是连接游戏的必要凭证',
    illustration: 'token'
  },
  club: {
    title: '暂无俱乐部信息',
    description: '加入俱乐部后可以查看更多内容',
    actionText: '查找俱乐部',
    tipText: '俱乐部功能需要达到一定等级解锁',
    illustration: 'default'
  },
  task: {
    title: '暂无任务',
    description: '当前没有可执行的任务',
    actionText: '创建任务',
    tipText: '定期完成任务可以获得奖励',
    illustration: 'default'
  },
  feature: {
    title: '功能即将上线',
    description: '该功能正在开发中，敬请期待',
    actionText: '查看其他功能',
    tipText: '关注更新获取最新动态',
    illustration: 'default'
  },
  network: {
    title: '网络连接失败',
    description: '无法连接到服务器，请检查网络',
    actionText: '重试连接',
    tipText: '请确保网络连接正常',
    illustration: 'error'
  }
};

const config = computed(() => presetConfigs[props.type] || presetConfigs.default);

const displayTitle = computed(() => props.title || config.value.title);
const displayDescription = computed(() => props.description || config.value.description);
const illustrationType = computed(() => config.value.illustration);

const actionIcon = computed(() => {
  const icons = {
    search: RefreshOutline,
    error: RefreshOutline,
    network: RefreshOutline,
    token: AddCircleOutline,
    default: ArrowForwardOutline
  };
  return icons[props.type] || icons.default;
});

const handleAction = () => {
  emit('action');
};

const handleExtraClick = () => {
  emit('extraClick');
};
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  min-height: 400px;
}

.empty-illustration-wrapper {
  margin-bottom: var(--spacing-xl);
  animation: fadeInUp 0.6s ease-out;
}

.empty-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
  animation: fadeInUp 0.6s ease-out 0.1s both;
}

.empty-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
  max-width: 360px;
  line-height: 1.6;
  animation: fadeInUp 0.6s ease-out 0.2s both;
}

.empty-tip {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--primary-color-light, color-mix(in srgb, var(--primary-color) 10%, transparent));
  border-radius: var(--border-radius-large);
  color: var(--primary-color);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-lg);
  animation: fadeInUp 0.6s ease-out 0.3s both;
}

.empty-action {
  margin-bottom: var(--spacing-lg);
  animation: fadeInUp 0.6s ease-out 0.4s both;
  
  .action-button {
    min-width: 160px;
    height: 44px;
    font-size: var(--font-size-base);
    border-radius: var(--border-radius-large);
    transition: all 0.3s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-light);
    }
    
    &:active {
      transform: translateY(0);
    }
  }
}

.empty-guide {
  background: var(--bg-secondary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-lg);
  max-width: 400px;
  width: 100%;
  animation: fadeInUp 0.6s ease-out 0.5s both;
}

.guide-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.guide-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.guide-step {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    .step-text {
      color: var(--text-primary);
    }
  }
  
  &.is-active {
    .step-number {
      background: var(--primary-color);
      color: white;
      transform: scale(1.1);
    }
    
    .step-text {
      color: var(--text-primary);
      font-weight: var(--font-weight-medium);
    }
  }
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 50%;
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  transition: all 0.3s ease;
}

.step-line {
  width: 2px;
  height: 24px;
  background: var(--border-color);
  margin-top: 4px;
}

.step-content {
  flex: 1;
  padding-top: 4px;
}

.step-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  transition: color 0.3s ease;
}

.empty-extra {
  margin-top: var(--spacing-md);
  animation: fadeInUp 0.6s ease-out 0.6s both;
}

// 不同类型空状态的特定样式
.empty-error {
  .empty-title {
    color: var(--error-color);
  }
  
  .empty-tip {
    background: var(--error-color-light, rgba(255, 107, 107, 0.1));
    color: var(--error-color);
  }
}

.empty-token {
  .action-button {
    background: var(--primary-color);
    border: none;
  }
}

// 动画
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 移动端适配
@media (max-width: 768px) {
  .empty-state {
    padding: var(--spacing-xl) var(--spacing-lg);
    min-height: 300px;
  }
  
  .empty-illustration-wrapper {
    transform: scale(0.85);
  }
  
  .empty-title {
    font-size: var(--font-size-lg);
  }
  
  .empty-description {
    font-size: var(--font-size-sm);
  }
  
  .empty-guide {
    padding: var(--spacing-md);
  }
  
  .action-button {
    min-width: 140px;
    height: 40px;
  }
}
</style>
