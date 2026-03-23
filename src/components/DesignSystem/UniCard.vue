<template>
  <div
    class="uni-card"
    :class="[
      `uni-card--${variant}`,
      `uni-card--${size}`,
      {
        'uni-card--hoverable': hoverable,
        'uni-card--selected': selected,
        'uni-card--disabled': disabled,
        'uni-card--loading': loading
      }
    ]"
    @click="handleClick"
  >
    <!-- 加载状态 -->
    <div v-if="loading" class="uni-card__loading">
      <n-spin size="medium" />
    </div>

    <!-- 卡片头部 -->
    <div v-if="$slots.header || title" class="uni-card__header">
      <div class="uni-card__header-content">
        <!-- 图标 -->
        <div v-if="icon" class="uni-card__icon">
          <n-icon :size="iconSize" :color="iconColor">
            <component :is="icon" />
          </n-icon>
        </div>
        
        <!-- 标题区域 -->
        <div class="uni-card__title-wrapper">
          <div v-if="title" class="uni-card__title">{{ title }}</div>
          <div v-if="subtitle" class="uni-card__subtitle">{{ subtitle }}</div>
        </div>
      </div>
      
      <!-- 头部右侧操作区 -->
      <div v-if="$slots['header-extra']" class="uni-card__header-extra">
        <slot name="header-extra" />
      </div>
    </div>

    <!-- 卡片封面 -->
    <div v-if="$slots.cover" class="uni-card__cover">
      <slot name="cover" />
    </div>

    <!-- 卡片内容 -->
    <div class="uni-card__body" :style="bodyStyle">
      <slot />
    </div>

    <!-- 卡片底部 -->
    <div v-if="$slots.footer" class="uni-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  // 基础属性
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  icon: {
    type: Object,
    default: null
  },
  iconSize: {
    type: Number,
    default: 24
  },
  iconColor: {
    type: String,
    default: ''
  },
  
  // 样式变体
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'outlined', 'filled', 'elevated'].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  
  // 状态
  hoverable: {
    type: Boolean,
    default: false
  },
  selected: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  
  // 内容区域样式
  bodyStyle: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['click']);

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<style scoped lang="scss">
.uni-card {
  position: relative;
  background: var(--bg-primary);
  border-radius: var(--radius-xl);
  transition: all var(--transition-normal);
  overflow: hidden;
  
  // 变体样式
  &--default {
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-sm);
  }
  
  &--outlined {
    border: 1px solid var(--border-color);
    box-shadow: none;
  }
  
  &--filled {
    border: none;
    background: var(--bg-secondary);
    box-shadow: none;
  }
  
  &--elevated {
    border: none;
    box-shadow: var(--shadow-md);
  }
  
  // 尺寸
  &--sm {
    .uni-card__header {
      padding: var(--space-3) var(--space-4);
    }
    .uni-card__body {
      padding: var(--space-4);
    }
    .uni-card__footer {
      padding: var(--space-3) var(--space-4);
    }
  }
  
  &--md {
    .uni-card__header {
      padding: var(--space-4) var(--space-5);
    }
    .uni-card__body {
      padding: var(--space-5);
    }
    .uni-card__footer {
      padding: var(--space-4) var(--space-5);
    }
  }
  
  &--lg {
    .uni-card__header {
      padding: var(--space-5) var(--space-6);
    }
    .uni-card__body {
      padding: var(--space-6);
    }
    .uni-card__footer {
      padding: var(--space-5) var(--space-6);
    }
  }
  
  // 悬停效果
  &--hoverable:not(&--disabled):not(&--loading) {
    cursor: pointer;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
      border-color: var(--primary-200);
    }
    
    &:active {
      transform: translateY(0);
      box-shadow: var(--shadow-md);
    }
  }
  
  // 选中状态
  &--selected {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 2px var(--primary-100), var(--shadow-md);
  }
  
  // 禁用状态
  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.4);
      pointer-events: none;
    }
  }
  
  // 加载状态
  &--loading {
    .uni-card__body {
      opacity: 0.5;
    }
  }
  
  &__loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    background: rgba(255, 255, 255, 0.8);
  }
  
  // 头部
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-light);
  }
  
  &__header-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
  }
  
  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: var(--primary-50);
    color: var(--primary-600);
  }
  
  &__title-wrapper {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  &__title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    line-height: var(--line-height-tight);
  }
  
  &__subtitle {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }
  
  &__header-extra {
    margin-left: var(--space-3);
  }
  
  // 封面
  &__cover {
    width: 100%;
    overflow: hidden;
    
    img, video {
      width: 100%;
      height: auto;
      display: block;
    }
  }
  
  // 内容区
  &__body {
    color: var(--text-primary);
  }
  
  // 底部
  &__footer {
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }
}

// 深色模式适配
[data-theme="dark"] {
  .uni-card {
    &__icon {
      background: var(--primary-900);
      color: var(--primary-300);
    }
    
    &--loading {
      .uni-card__loading {
        background: rgba(0, 0, 0, 0.6);
      }
    }
    
    &--disabled::after {
      background: rgba(0, 0, 0, 0.4);
    }
  }
}

// 移动端适配
@media (max-width: 768px) {
  .uni-card {
    &--md, &--lg {
      .uni-card__header {
        padding: var(--space-3) var(--space-4);
      }
      .uni-card__body {
        padding: var(--space-4);
      }
      .uni-card__footer {
        padding: var(--space-3) var(--space-4);
      }
    }
    
    &__title {
      font-size: var(--font-size-base);
    }
    
    &__subtitle {
      font-size: var(--font-size-xs);
    }
  }
}
</style>
