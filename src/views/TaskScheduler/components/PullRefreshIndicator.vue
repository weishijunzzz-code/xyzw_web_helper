<template>
  <div 
    class="pull-refresh-indicator"
    :style="{ transform: `translateY(${distance}px)` }"
  >
    <n-spin v-if="refreshing" size="small" />
    <n-icon v-else :component="distance > 60 ? ArrowDownOutline : ArrowUpOutline" />
    <span>{{ distance > 60 ? '释放刷新' : '下拉刷新' }}</span>
  </div>
</template>

<script setup>
import { ArrowUpOutline, ArrowDownOutline } from '@vicons/ionicons5';

const props = defineProps({
  distance: {
    type: Number,
    default: 0
  },
  refreshing: {
    type: Boolean,
    default: false
  }
});
</script>

<style scoped lang="scss">
.pull-refresh-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  z-index: 99;
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
  transition: transform 0.2s ease;
  
  .n-icon {
    font-size: 20px;
  }
}

[data-theme="dark"] {
  .pull-refresh-indicator {
    background: rgba(31, 41, 55, 0.95);
    color: var(--text-secondary, #9ca3af);
  }
}
</style>
