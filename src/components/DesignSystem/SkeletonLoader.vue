<template>
  <div class="skeleton-loader" :class="{ 'animate': animate, 'rounded': rounded }" :style="styles">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  width: {
    type: [String, Number],
    default: '100%'
  },
  height: {
    type: [String, Number],
    default: '1rem'
  },
  animate: {
    type: Boolean,
    default: true
  },
  rounded: {
    type: Boolean,
    default: true
  }
})

const styles = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height
}))
</script>

<style scoped lang="scss">
.skeleton-loader {
  background: linear-gradient(
    90deg,
    var(--skeleton-bg-start, #f0f0f0) 25%,
    var(--skeleton-bg-middle, #e0e0e0) 50%,
    var(--skeleton-bg-start, #f0f0f0) 75%
  );
  background-size: 200% 100%;

  &.rounded {
    border-radius: 4px;
  }

  &.animate {
    animation: shimmer 1.5s infinite;
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

// 深色主题
.dark .skeleton-loader {
  --skeleton-bg-start: #2a2a2a;
  --skeleton-bg-middle: #3a3a3a;
}
</style>
