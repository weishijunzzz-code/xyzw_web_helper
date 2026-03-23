<template>
  <span class="animated-number">{{ displayValue }}</span>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';

const props = defineProps({
  value: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 1000
  },
  decimals: {
    type: Number,
    default: 0
  },
  separator: {
    type: String,
    default: ','
  },
  prefix: {
    type: String,
    default: ''
  },
  suffix: {
    type: String,
    default: ''
  },
  animated: {
    type: Boolean,
    default: true
  }
});

const animatedValue = ref(0);

const displayValue = computed(() => {
  const num = props.animated ? animatedValue.value : props.value;
  const fixed = num.toFixed(props.decimals);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, props.separator);
  return props.prefix + parts.join('.') + props.suffix;
});

const animate = () => {
  const start = animatedValue.value;
  const end = props.value;
  const duration = props.duration;
  const startTime = performance.now();

  const step = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // easeOutExpo 缓动函数
    const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    
    animatedValue.value = start + (end - start) * easeOutExpo;
    
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
};

onMounted(() => {
  if (props.animated) {
    animate();
  }
});

watch(() => props.value, () => {
  if (props.animated) {
    animate();
  }
});
</script>

<style scoped lang="scss">
.animated-number {
  font-variant-numeric: tabular-nums;
}
</style>
