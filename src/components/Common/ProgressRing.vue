<template>
  <div class="progress-ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg
      class="progress-ring-svg"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
    >
      <!-- 背景圆环 -->
      <circle
        class="progress-ring-bg"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        fill="none"
      />
      <!-- 进度圆环 -->
      <circle
        class="progress-ring-fill"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        fill="none"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
        :stroke="color"
        stroke-linecap="round"
        :style="{ transition: `stroke-dashoffset ${duration}ms ease-out` }"
      />
    </svg>
    <div class="progress-ring-content">
      <slot>
        <span class="progress-text" :style="{ fontSize: textSize + 'px' }">
          {{ displayPercentage }}%
        </span>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';

const props = defineProps({
  percentage: {
    type: Number,
    default: 0
  },
  size: {
    type: Number,
    default: 80
  },
  strokeWidth: {
    type: Number,
    default: 6
  },
  color: {
    type: String,
    default: 'var(--primary-color)'
  },
  duration: {
    type: Number,
    default: 1000
  },
  textSize: {
    type: Number,
    default: 16
  },
  animated: {
    type: Boolean,
    default: true
  }
});

const animatedPercentage = ref(0);

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const strokeDashoffset = computed(() => {
  const percent = props.animated ? animatedPercentage.value : props.percentage;
  return circumference.value - (percent / 100) * circumference.value;
});
const displayPercentage = computed(() => Math.round(props.animated ? animatedPercentage.value : props.percentage));

// 动画效果
onMounted(() => {
  if (props.animated) {
    animateProgress();
  }
});

watch(() => props.percentage, () => {
  if (props.animated) {
    animateProgress();
  }
});

const animateProgress = () => {
  const start = animatedPercentage.value;
  const end = Math.max(0, Math.min(100, props.percentage));
  const duration = props.duration;
  const startTime = performance.now();

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用 easeOutQuart 缓动函数
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    
    animatedPercentage.value = start + (end - start) * easeOutQuart;
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
};
</script>

<style scoped lang="scss">
.progress-ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.progress-ring-svg {
  transform: rotate(-90deg);
}

.progress-ring-bg {
  stroke: var(--bg-tertiary);
}

.progress-ring-fill {
  transition: stroke-dashoffset 0.3s ease;
}

.progress-ring-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.progress-text {
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}
</style>
