<template>
  <span class="task-countdown" :class="{ 'urgent': isUrgent }">
    {{ formatted }}
  </span>
</template>

<script setup>
import { useCountdown } from '../../composables/useCountdown';
import { computed } from 'vue';

const props = defineProps({
  targetTime: {
    type: [Date, String],
    default: null
  }
});

const { formatted, isOverdue, remaining } = useCountdown(props.targetTime);

const isUrgent = computed(() => {
  return isOverdue.value || remaining.value < 60000; // 小于1分钟显示紧急状态
});
</script>

<style scoped lang="scss">
.task-countdown {
  font-size: 13px;
  color: #3b82f6;
  font-weight: 500;
  
  &.urgent {
    color: #ef4444;
    animation: pulse 1.5s infinite;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

// 深色模式适配
[data-theme="dark"] {
  .task-countdown {
    color: #60a5fa;
    
    &.urgent {
      color: #f87171;
    }
  }
}
</style>
