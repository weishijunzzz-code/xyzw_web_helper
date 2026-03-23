<template>
  <button
    class="uni-button"
    :class="[
      `uni-button--${type}`,
      `uni-button--${size}`,
      {
        'uni-button--disabled': disabled,
        'uni-button--loading': loading,
        'uni-button--block': block,
        'uni-button--round': round,
        'uni-button--ghost': ghost,
        'uni-button--text': text
      }
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <!-- 加载状态 -->
    <span v-if="loading" class="uni-button__loading">
      <n-spin :size="loadingSize" />
    </span>
    
    <!-- 图标 - 左侧 -->
    <span v-if="icon && iconPosition === 'left' && !loading" class="uni-button__icon uni-button__icon--left">
      <n-icon :size="iconSize">
        <component :is="icon" />
      </n-icon>
    </span>
    
    <!-- 内容 -->
    <span class="uni-button__content">
      <slot />
    </span>
    
    <!-- 图标 - 右侧 -->
    <span v-if="icon && iconPosition === 'right'" class="uni-button__icon uni-button__icon--right">
      <n-icon :size="iconSize">
        <component :is="icon" />
      </n-icon>
    </span>
  </button>
</template>

<script setup>
const props = defineProps({
  // 按钮类型
  type: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'success', 'warning', 'error', 'info', 'default'].includes(value)
  },
  // 按钮尺寸
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(value)
  },
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false
  },
  // 是否加载中
  loading: {
    type: Boolean,
    default: false
  },
  // 是否块级元素
  block: {
    type: Boolean,
    default: false
  },
  // 是否圆角
  round: {
    type: Boolean,
    default: false
  },
  // 是否幽灵按钮
  ghost: {
    type: Boolean,
    default: false
  },
  // 是否文本按钮
  text: {
    type: Boolean,
    default: false
  },
  // 图标
  icon: {
    type: Object,
    default: null
  },
  // 图标位置
  iconPosition: {
    type: String,
    default: 'left',
    validator: (value) => ['left', 'right'].includes(value)
  },
  // 图标大小
  iconSize: {
    type: Number,
    default: 16
  }
});

const emit = defineEmits(['click']);

// 根据尺寸计算加载图标大小
const loadingSize = computed(() => {
  const sizeMap = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20
  };
  return sizeMap[props.size] || 16;
});

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<script>
import { computed } from 'vue';
export default {
  name: 'UniButton'
}
</script>

<style scoped lang="scss">
.uni-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: none;
  border-radius: var(--radius-lg);
  font-family: inherit;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  user-select: none;
  position: relative;
  overflow: hidden;
  
  // 尺寸
  &--xs {
    height: var(--btn-height-xs);
    padding: 0 var(--btn-padding-xs);
    font-size: var(--font-size-xs);
  }
  
  &--sm {
    height: var(--btn-height-sm);
    padding: 0 var(--btn-padding-sm);
    font-size: var(--font-size-sm);
  }
  
  &--md {
    height: var(--btn-height-md);
    padding: 0 var(--btn-padding-md);
    font-size: var(--font-size-base);
  }
  
  &--lg {
    height: var(--btn-height-lg);
    padding: 0 var(--btn-padding-lg);
    font-size: var(--font-size-lg);
  }
  
  &--xl {
    height: var(--btn-height-xl);
    padding: 0 var(--btn-padding-xl);
    font-size: var(--font-size-xl);
  }
  
  // 圆角
  &--round {
    border-radius: var(--radius-full);
  }
  
  // 块级
  &--block {
    display: flex;
    width: 100%;
  }
  
  // 类型样式
  &--primary {
    background: var(--primary-500);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--primary-600);
      box-shadow: var(--shadow-primary);
    }
    
    &:active:not(:disabled) {
      background: var(--primary-700);
    }
  }
  
  &--success {
    background: var(--success-500);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--success-600);
      box-shadow: var(--shadow-success);
    }
    
    &:active:not(:disabled) {
      background: var(--success-700);
    }
  }
  
  &--warning {
    background: var(--warning-500);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--warning-600);
      box-shadow: var(--shadow-warning);
    }
    
    &:active:not(:disabled) {
      background: var(--warning-700);
    }
  }
  
  &--error {
    background: var(--error-500);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--error-600);
      box-shadow: var(--shadow-error);
    }
    
    &:active:not(:disabled) {
      background: var(--error-700);
    }
  }
  
  &--info {
    background: var(--info-500);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--info-600);
    }
    
    &:active:not(:disabled) {
      background: var(--info-700);
    }
  }
  
  &--default {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    
    &:hover:not(:disabled) {
      background: var(--bg-secondary);
      border-color: var(--border-color);
    }
    
    &:active:not(:disabled) {
      background: var(--neutral-200);
    }
  }
  
  // 幽灵按钮
  &--ghost {
    background: transparent;
    
    &.uni-button--primary {
      color: var(--primary-500);
      border: 1px solid var(--primary-500);
      
      &:hover:not(:disabled) {
        background: var(--primary-50);
      }
    }
    
    &.uni-button--success {
      color: var(--success-500);
      border: 1px solid var(--success-500);
      
      &:hover:not(:disabled) {
        background: var(--success-50);
      }
    }
    
    &.uni-button--warning {
      color: var(--warning-500);
      border: 1px solid var(--warning-500);
      
      &:hover:not(:disabled) {
        background: var(--warning-50);
      }
    }
    
    &.uni-button--error {
      color: var(--error-500);
      border: 1px solid var(--error-500);
      
      &:hover:not(:disabled) {
        background: var(--error-50);
      }
    }
    
    &.uni-button--default {
      background: transparent;
      border: 1px solid var(--border-color);
      
      &:hover:not(:disabled) {
        background: var(--bg-secondary);
      }
    }
  }
  
  // 文本按钮
  &--text {
    background: transparent;
    border: none;
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    
    &.uni-button--primary {
      color: var(--primary-500);
      
      &:hover:not(:disabled) {
        background: var(--primary-50);
      }
    }
    
    &.uni-button--success {
      color: var(--success-500);
      
      &:hover:not(:disabled) {
        background: var(--success-50);
      }
    }
    
    &.uni-button--warning {
      color: var(--warning-500);
      
      &:hover:not(:disabled) {
        background: var(--warning-50);
      }
    }
    
    &.uni-button--error {
      color: var(--error-500);
      
      &:hover:not(:disabled) {
        background: var(--error-50);
      }
    }
    
    &.uni-button--default {
      color: var(--text-secondary);
      
      &:hover:not(:disabled) {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }
    }
  }
  
  // 禁用状态
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  // 加载状态
  &--loading {
    cursor: not-allowed;
    
    .uni-button__content {
      opacity: 0;
    }
  }
  
  &__loading {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  // 图标
  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    
    &--left {
      margin-right: var(--space-1);
    }
    
    &--right {
      margin-left: var(--space-1);
    }
  }
  
  &__content {
    display: flex;
    align-items: center;
  }
}

// 深色模式适配
[data-theme="dark"] {
  .uni-button {
    &--default {
      background: var(--neutral-700);
      border-color: var(--neutral-600);
      color: var(--text-primary);
      
      &:hover:not(:disabled) {
        background: var(--neutral-600);
        border-color: var(--neutral-500);
      }
    }
    
    &--ghost {
      &.uni-button--primary:hover:not(:disabled) {
        background: var(--primary-900);
      }
      
      &.uni-button--success:hover:not(:disabled) {
        background: var(--success-900);
      }
      
      &.uni-button--warning:hover:not(:disabled) {
        background: var(--warning-900);
      }
      
      &.uni-button--error:hover:not(:disabled) {
        background: var(--error-900);
      }
    }
    
    &--text {
      &.uni-button--primary:hover:not(:disabled) {
        background: var(--primary-900);
      }
      
      &.uni-button--success:hover:not(:disabled) {
        background: var(--success-900);
      }
      
      &.uni-button--warning:hover:not(:disabled) {
        background: var(--warning-900);
      }
      
      &.uni-button--error:hover:not(:disabled) {
        background: var(--error-900);
      }
      
      &.uni-button--default:hover:not(:disabled) {
        background: var(--neutral-700);
      }
    }
  }
}
</style>
