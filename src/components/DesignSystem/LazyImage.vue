<template>
  <div class="lazy-image-wrapper" :style="wrapperStyle">
    <img
      v-if="loaded"
      :src="src"
      :alt="alt"
      class="lazy-image"
      :class="{ 'lazy-image--loaded': loaded }"
      @load="handleLoad"
      @error="handleError"
    />
    <div v-else class="lazy-image__placeholder">
      <n-spin v-if="!error" size="small" />
      <n-icon v-else size="24" :depth="3">
        <ImageOutline />
      </n-icon>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { ImageOutline } from '@vicons/ionicons5';

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  alt: {
    type: String,
    default: ''
  },
  width: {
    type: [String, Number],
    default: '100%'
  },
  height: {
    type: [String, Number],
    default: 'auto'
  },
  threshold: {
    type: Number,
    default: 0.1
  }
});

const loaded = ref(false);
const error = ref(false);
const observer = ref(null);

const wrapperStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height
}));

onMounted(() => {
  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage();
          observer.value?.unobserve(entry.target);
        }
      });
    },
    { threshold: props.threshold }
  );

  const wrapper = document.querySelector('.lazy-image-wrapper');
  if (wrapper) {
    observer.value.observe(wrapper);
  }
});

onUnmounted(() => {
  observer.value?.disconnect();
});

const loadImage = () => {
  const img = new Image();
  img.onload = () => {
    loaded.value = true;
  };
  img.onerror = () => {
    error.value = true;
  };
  img.src = props.src;
};

const handleLoad = () => {
  loaded.value = true;
};

const handleError = () => {
  error.value = true;
};
</script>

<style scoped lang="scss">
.lazy-image-wrapper {
  position: relative;
  overflow: hidden;
  background: var(--bg-tertiary);
  border-radius: var(--radius-lg);
}

.lazy-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--transition-normal);

  &--loaded {
    opacity: 1;
  }
}

.lazy-image__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}
</style>
