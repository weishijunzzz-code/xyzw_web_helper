<template>
  <div class="skeleton-card" :class="{ 'hover': hover }">
    <!-- 头部 -->
    <div v-if="showHeader" class="skeleton-card__header">
      <SkeletonLoader v-if="showAvatar" width="40px" height="40px" rounded />
      <div class="skeleton-card__header-content">
        <SkeletonLoader v-if="showTitle" width="60%" height="16px" />
        <SkeletonLoader v-if="showSubtitle" width="40%" height="12px" style="margin-top: 8px" />
      </div>
    </div>
    
    <!-- 内容 -->
    <div class="skeleton-card__content">
      <SkeletonLoader 
        v-for="i in lines" 
        :key="i"
        :width="i === lines ? '60%' : '100%'" 
        height="12px" 
        style="margin-bottom: 8px"
      />
    </div>
    
    <!-- 底部 -->
    <div v-if="showFooter" class="skeleton-card__footer">
      <SkeletonLoader width="80px" height="32px" />
      <SkeletonLoader width="80px" height="32px" />
    </div>
  </div>
</template>

<script setup>
import SkeletonLoader from './SkeletonLoader.vue'

const props = defineProps({
  lines: {
    type: Number,
    default: 3
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  showAvatar: {
    type: Boolean,
    default: true
  },
  showTitle: {
    type: Boolean,
    default: true
  },
  showSubtitle: {
    type: Boolean,
    default: true
  },
  showFooter: {
    type: Boolean,
    default: false
  },
  hover: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped lang="scss">
.skeleton-card {
  background: var(--color-bg-primary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  
  &.hover:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  
  &__header-content {
    flex: 1;
  }
  
  &__content {
    margin-bottom: 16px;
  }
  
  &__footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding-top: 12px;
    border-top: 1px solid var(--color-border-light);
  }
}

.dark .skeleton-card {
  border-color: var(--color-border-dark);
  
  &__footer {
    border-color: var(--color-border-dark);
  }
}
</style>
