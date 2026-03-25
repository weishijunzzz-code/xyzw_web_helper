<template>
  <div class="empty-state" :class="{ [`size-${size}`]: true }">
    <div class="empty-icon">
      <slot name="icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M12 11v6M9 14h6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.5"
          />
        </svg>
      </slot>
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p class="empty-description">{{ description }}</p>
    <div v-if="$slots.action || actionText" class="empty-action">
      <slot name="action">
        <n-button v-if="actionText" type="primary" @click="$emit('action')">
          {{ actionText }}
        </n-button>
      </slot>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: {
    type: String,
    default: '暂无数据'
  },
  description: {
    type: String,
    default: '当前列表为空，点击按钮添加新任务'
  },
  actionText: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'default',
    validator: (value) => ['small', 'default', 'large'].includes(value)
  }
})

defineEmits(['action'])
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;

  .empty-icon {
    color: var(--ts-text-tertiary);
    margin-bottom: 24px;
    transition: transform var(--ts-duration-normal) var(--ts-ease-out-back);

    svg {
      width: 100%;
      height: 100%;
    }
  }

  &:hover .empty-icon {
    transform: scale(1.05);
  }

  .empty-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--ts-text-primary);
    margin: 0 0 8px;
  }

  .empty-description {
    font-size: 14px;
    color: var(--ts-text-secondary);
    margin: 0 0 24px;
    max-width: 300px;
    line-height: 1.6;
  }

  .empty-action {
    :deep(.n-button) {
      padding: 0 24px;
      height: 40px;
      font-weight: 500;
    }
  }

  // 尺寸变体
  &.size-small {
    padding: 40px 16px;

    .empty-icon {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 16px;
    }

    .empty-description {
      font-size: 13px;
      margin-bottom: 16px;
    }
  }

  &.size-default {
    .empty-icon {
      width: 120px;
      height: 120px;
    }
  }

  &.size-large {
    padding: 80px 20px;

    .empty-icon {
      width: 160px;
      height: 160px;
      margin-bottom: 32px;
    }

    .empty-title {
      font-size: 24px;
      margin-bottom: 12px;
    }

    .empty-description {
      font-size: 16px;
      max-width: 400px;
      margin-bottom: 32px;
    }
  }
}

// 暗色模式适配
[data-theme="dark"] {
  .empty-state {
    .empty-icon {
      opacity: 0.6;
    }
  }
}
</style>
