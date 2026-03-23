<template>
  <transition name="fade">
    <div
      v-if="visible"
      class="back-to-top"
      :class="{ 'is-visible': visible }"
      @click="scrollToTop"
    >
      <div class="progress-ring" :style="ringStyle">
        <svg viewBox="0 0 100 100">
          <circle
            class="progress-ring-bg"
            cx="50"
            cy="50"
            r="45"
            fill="none"
          />
          <circle
            class="progress-ring-fill"
            cx="50"
            cy="50"
            r="45"
            fill="none"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="strokeDashoffset"
          />
        </svg>
      </div>
      <div class="back-to-top-content">
        <n-icon size="20">
          <ArrowUp />
        </n-icon>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ArrowUp } from '@vicons/ionicons5'

const visible = ref(false)
const scrollProgress = ref(0)

const circumference = 2 * Math.PI * 45

const strokeDashoffset = computed(() => {
  return circumference - (scrollProgress.value / 100) * circumference
})

const ringStyle = computed(() => ({
  '--progress': `${scrollProgress.value}%`
}))

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight
  scrollProgress.value = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0

  // 滚动超过200px显示按钮
  visible.value = scrollTop > 200
}

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped lang="scss">
.back-to-top {
  position: fixed;
  bottom: 100px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-primary);
  box-shadow: var(--shadow-medium);
  cursor: pointer;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-heavy);

    .back-to-top-content {
      background: var(--primary-color);
      color: white;
    }
  }

  &:active {
    transform: translateY(-2px);
  }
}

.progress-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
}

.progress-ring-bg {
  stroke: var(--border-light);
  stroke-width: 3;
}

.progress-ring-fill {
  stroke: var(--primary-color);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.1s ease;
}

.back-to-top-content {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.3s ease;
}

// 移动端适配
@media (max-width: 768px) {
  .back-to-top {
    bottom: 80px;
    right: 16px;
    width: 48px;
    height: 48px;
  }

  .back-to-top-content {
    width: 36px;
    height: 36px;
  }
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
