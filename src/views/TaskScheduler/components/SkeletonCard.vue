<template>
  <div class="skeleton-card" :class="{ [`variant-${variant}`]: true }">
    <!-- 头部骨架 -->
    <div class="skeleton-header">
      <div class="skeleton-avatar" v-if="showAvatar"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line" :style="{ width: titleWidth }"></div>
        <div class="skeleton-line" :style="{ width: subtitleWidth }"></div>
      </div>
    </div>
    
    <!-- 内容骨架 -->
    <div class="skeleton-body" v-if="lines > 0">
      <div 
        v-for="i in lines" 
        :key="i"
        class="skeleton-line"
        :style="{ width: i === lines ? lastLineWidth : '100%' }"
      ></div>
    </div>
    
    <!-- 底部骨架 -->
    <div class="skeleton-footer" v-if="showFooter">
      <div class="skeleton-button" v-for="i in footerButtons" :key="i"></div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'compact', 'detailed'].includes(value)
  },
  showAvatar: {
    type: Boolean,
    default: true
  },
  lines: {
    type: Number,
    default: 2
  },
  showFooter: {
    type: Boolean,
    default: false
  },
  footerButtons: {
    type: Number,
    default: 2
  },
  titleWidth: {
    type: String,
    default: '70%'
  },
  subtitleWidth: {
    type: String,
    default: '50%'
  },
  lastLineWidth: {
    type: String,
    default: '80%'
  }
})
</script>

<style scoped lang="scss">
.skeleton-card {
  background: var(--ts-bg-card);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--ts-border-default);

  .skeleton-header {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;

    .skeleton-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(
        90deg,
        var(--ts-bg-hover) 25%,
        var(--ts-border-default) 50%,
        var(--ts-bg-hover) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
      flex-shrink: 0;
    }

    .skeleton-lines {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      justify-content: center;
    }
  }

  .skeleton-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .skeleton-line {
    height: 14px;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--ts-bg-hover) 25%,
      var(--ts-border-default) 50%,
      var(--ts-bg-hover) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s infinite;
  }

  .skeleton-footer {
    display: flex;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--ts-border-default);

    .skeleton-button {
      flex: 1;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(
        90deg,
        var(--ts-bg-hover) 25%,
        var(--ts-border-default) 50%,
        var(--ts-bg-hover) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
    }
  }

  // 变体样式
  &.variant-compact {
    padding: 16px;

    .skeleton-header {
      margin-bottom: 12px;

      .skeleton-avatar {
        width: 40px;
        height: 40px;
      }

      .skeleton-lines {
        gap: 8px;
      }
    }

    .skeleton-line {
      height: 12px;
    }
  }

  &.variant-detailed {
    padding: 24px;

    .skeleton-header {
      margin-bottom: 20px;

      .skeleton-avatar {
        width: 56px;
        height: 56px;
      }

      .skeleton-lines {
        gap: 12px;
      }
    }

    .skeleton-body {
      gap: 10px;
      margin-bottom: 20px;
    }

    .skeleton-line {
      height: 16px;
    }
  }
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

// 暗色模式适配
[data-theme="dark"] {
  .skeleton-card {
    .skeleton-avatar,
    .skeleton-line,
    .skeleton-button {
      background: linear-gradient(
        90deg,
        var(--ts-bg-hover) 25%,
        rgba(255, 255, 255, 0.1) 50%,
        var(--ts-bg-hover) 75%
      );
      background-size: 200% 100%;
    }
  }
}
</style>
