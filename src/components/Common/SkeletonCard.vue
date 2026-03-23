<template>
  <div class="skeleton-card" :class="{ 'skeleton-active': active }">
    <div v-if="showHeader" class="skeleton-header">
      <div class="skeleton-avatar" v-if="showAvatar"></div>
      <div class="skeleton-title-wrapper">
        <div class="skeleton-title"></div>
        <div class="skeleton-subtitle" v-if="showSubtitle"></div>
      </div>
    </div>
    <div class="skeleton-content">
      <div 
        v-for="i in rows" 
        :key="i" 
        class="skeleton-row"
        :style="{ width: getRowWidth(i) }"
      ></div>
    </div>
    <div v-if="showActions" class="skeleton-actions">
      <div v-for="i in actionCount" :key="i" class="skeleton-button"></div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  rows: {
    type: Number,
    default: 3
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  showAvatar: {
    type: Boolean,
    default: false
  },
  showSubtitle: {
    type: Boolean,
    default: false
  },
  showActions: {
    type: Boolean,
    default: false
  },
  actionCount: {
    type: Number,
    default: 2
  },
  active: {
    type: Boolean,
    default: true
  }
});

const getRowWidth = (index) => {
  // 随机宽度，让骨架屏看起来更自然
  const widths = ['100%', '95%', '90%', '85%', '80%', '75%', '60%'];
  return widths[(index - 1) % widths.length];
};
</script>

<style scoped lang="scss">
.skeleton-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-light);
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-tertiary);
}

.skeleton-title-wrapper {
  flex: 1;
}

.skeleton-title {
  height: 20px;
  width: 60%;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
  margin-bottom: var(--spacing-xs);
}

.skeleton-subtitle {
  height: 14px;
  width: 40%;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.skeleton-row {
  height: 16px;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
}

.skeleton-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  justify-content: flex-end;
}

.skeleton-button {
  height: 32px;
  width: 80px;
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
}

// 动画效果
.skeleton-active {
  .skeleton-avatar,
  .skeleton-title,
  .skeleton-subtitle,
  .skeleton-row,
  .skeleton-button {
    background: linear-gradient(
      90deg,
      var(--bg-tertiary) 25%,
      var(--bg-secondary) 50%,
      var(--bg-tertiary) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
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
</style>
