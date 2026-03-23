<template>
  <button
    class="ripple-button"
    :class="{ 'ripple-disabled': disabled }"
    @click="handleClick"
    @touchstart="handleTouchStart"
    :disabled="disabled"
  >
    <span class="ripple-content">
      <slot />
    </span>
    <span
      v-for="ripple in ripples"
      :key="ripple.id"
      class="ripple-effect"
      :style="{
        left: ripple.x + 'px',
        top: ripple.y + 'px'
      }"
      @animationend="removeRipple(ripple.id)"
    ></span>
  </button>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['click']);

const ripples = ref([]);
let rippleId = 0;

const createRipple = (x, y) => {
  const id = rippleId++;
  ripples.value.push({ id, x, y });
};

const removeRipple = (id) => {
  const index = ripples.value.findIndex(r => r.id === id);
  if (index > -1) {
    ripples.value.splice(index, 1);
  }
};

const handleClick = (event) => {
  if (props.disabled) return;
  
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  createRipple(x, y);
  emit('click', event);
};

const handleTouchStart = (event) => {
  if (props.disabled) return;
  
  const touch = event.touches[0];
  const rect = event.currentTarget.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  
  createRipple(x, y);
};
</script>

<style scoped lang="scss">
.ripple-button {
  position: relative;
  overflow: hidden;
  border: none;
  background: var(--primary-color);
  color: white;
  padding: 8px 16px;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  transition: all 0.2s ease;
  min-height: 44px; // 触摸区域最小高度
  
  &:hover:not(:disabled) {
    background: var(--primary-color-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.ripple-content {
  position: relative;
  z-index: 1;
}

.ripple-effect {
  position: absolute;
  width: 100px;
  height: 100px;
  margin-left: -50px;
  margin-top: -50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  pointer-events: none;
  animation: ripple-animation 0.6s ease-out forwards;
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

// 移动端适配
@media (max-width: 768px) {
  .ripple-button {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 20px;
  }
}
</style>
