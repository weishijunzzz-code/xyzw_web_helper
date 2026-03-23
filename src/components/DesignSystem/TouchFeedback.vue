<template>
  <div
    class="touch-feedback"
    :class="{ 'touch-feedback--active': isActive }"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <slot />
    <div v-if="showRipple" class="touch-feedback__ripple" :style="rippleStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  },
  ripple: {
    type: Boolean,
    default: true
  }
});

const isActive = ref(false);
const showRipple = ref(false);
const ripplePosition = ref({ x: 0, y: 0 });

const rippleStyle = computed(() => ({
  left: `${ripplePosition.value.x}px`,
  top: `${ripplePosition.value.y}px`
}));

const handleTouchStart = (e) => {
  if (props.disabled) return;
  isActive.value = true;
  
  if (props.ripple) {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    ripplePosition.value = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
    showRipple.value = true;
    setTimeout(() => {
      showRipple.value = false;
    }, 400);
  }
};

const handleTouchEnd = () => {
  isActive.value = false;
};

const handleMouseDown = (e) => {
  if (props.disabled) return;
  isActive.value = true;
  
  if (props.ripple) {
    const rect = e.currentTarget.getBoundingClientRect();
    ripplePosition.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    showRipple.value = true;
    setTimeout(() => {
      showRipple.value = false;
    }, 400);
  }
};

const handleMouseUp = () => {
  isActive.value = false;
};

const handleMouseLeave = () => {
  isActive.value = false;
};
</script>

<style scoped lang="scss">
.touch-feedback {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s ease;
  
  &--active {
    transform: scale(0.98);
  }
  
  &__ripple {
    position: absolute;
    width: 100px;
    height: 100px;
    margin-left: -50px;
    margin-top: -50px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    pointer-events: none;
    animation: ripple-animation 0.4s ease-out forwards;
  }
}

@keyframes ripple-animation {
  0% {
    transform: scale(0);
    opacity: 0.5;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

[data-theme="dark"] {
  .touch-feedback__ripple {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
