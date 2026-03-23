<template>
  <div v-if="visible" class="success-animation" :class="{ 'is-visible': show }">
    <div class="success-circle">
      <svg class="checkmark" viewBox="0 0 52 52">
        <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
      </svg>
    </div>
    <div class="success-text">{{ message }}</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: '操作成功'
  },
  duration: {
    type: Number,
    default: 1500
  }
})

const emit = defineEmits(['complete'])

const show = ref(false)

watch(() => props.visible, (val) => {
  if (val) {
    show.value = true
    setTimeout(() => {
      show.value = false
      setTimeout(() => {
        emit('complete')
      }, 300)
    }, props.duration)
  }
})
</script>

<style scoped lang="scss">
.success-animation {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;

  &.is-visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.success-circle {
  width: 80px;
  height: 80px;
  background: var(--success-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
}

.checkmark {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: block;
  stroke-width: 3;
  stroke: #fff;
  stroke-miterlimit: 10;
  animation: fill 0.4s ease-in-out 0.4s forwards, scale 0.3s ease-in-out 0.9s both;
}

.checkmark-circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  stroke-width: 3;
  stroke-miterlimit: 10;
  stroke: #fff;
  fill: none;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.checkmark-check {
  transform-origin: 50% 50%;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
}

.success-text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  background: var(--bg-primary);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-large);
  box-shadow: var(--shadow-medium);
}

@keyframes stroke {
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes scale {
  0%, 100% {
    transform: none;
  }
  50% {
    transform: scale3d(1.1, 1.1, 1);
  }
}

@keyframes fill {
  100% {
    box-shadow: inset 0px 0px 0px 30px var(--success-color);
  }
}
</style>
