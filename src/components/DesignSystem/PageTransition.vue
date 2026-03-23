<template>
  <transition
    :name="transitionName"
    :mode="mode"
    @before-enter="onBeforeEnter"
    @after-enter="onAfterEnter"
    @before-leave="onBeforeLeave"
    @after-leave="onAfterLeave"
  >
    <slot />
  </transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    default: 'fade-slide',
    validator: (value) => [
      'fade',
      'fade-slide',
      'fade-scale',
      'slide-left',
      'slide-right',
      'slide-up',
      'slide-down',
      'zoom',
      'flip'
    ].includes(value)
  },
  mode: {
    type: String,
    default: 'out-in'
  },
  duration: {
    type: Number,
    default: 300
  }
})

const emit = defineEmits(['before-enter', 'after-enter', 'before-leave', 'after-leave'])

const transitionName = computed(() => props.name)

const onBeforeEnter = (el) => {
  el.style.animationDuration = `${props.duration}ms`
  emit('before-enter', el)
}

const onAfterEnter = (el) => {
  el.style.animationDuration = ''
  emit('after-enter', el)
}

const onBeforeLeave = (el) => {
  el.style.animationDuration = `${props.duration}ms`
  emit('before-leave', el)
}

const onAfterLeave = (el) => {
  el.style.animationDuration = ''
  emit('after-leave', el)
}
</script>

<style scoped>
/* 淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 淡入 + 滑动 */
.fade-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 淡入 + 缩放 */
.fade-scale-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-scale-leave-active {
  transition: all 0.2s ease;
}

.fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.fade-scale-leave-to {
  opacity: 0;
  transform: scale(1.02);
}

/* 左滑入 */
.slide-left-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-leave-active {
  transition: all 0.25s ease-in;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 右滑入 */
.slide-right-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-right-leave-active {
  transition: all 0.25s ease-in;
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* 上滑入 */
.slide-up-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* 下滑入 */
.slide-down-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-30px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 缩放 */
.zoom-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.zoom-leave-active {
  transition: all 0.2s ease;
}

.zoom-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.zoom-leave-to {
  opacity: 0;
  transform: scale(1.1);
}

/* 翻转 */
.flip-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.flip-leave-active {
  transition: all 0.3s ease;
}

.flip-enter-from {
  opacity: 0;
  transform: perspective(400px) rotateY(-15deg);
}

.flip-leave-to {
  opacity: 0;
  transform: perspective(400px) rotateY(15deg);
}
</style>
