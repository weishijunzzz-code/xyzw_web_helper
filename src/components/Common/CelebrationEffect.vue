<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="show" class="celebration-overlay" @click="hide">
        <!-- Confetti Canvas -->
        <canvas
          v-if="type === 'success'"
          ref="canvasRef"
          class="confetti-canvas"
        />
        
        <!-- 内容区域 -->
        <div class="celebration-content" :class="type">
          <!-- 成功动画 -->
          <div v-if="type === 'success'" class="success-animation">
            <div class="checkmark-circle">
              <svg class="checkmark" viewBox="0 0 52 52">
                <circle class="checkmark-circle-bg" cx="26" cy="26" r="25" fill="none"/>
                <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
            </div>
          </div>
          
          <!-- 错误动画 -->
          <div v-else-if="type === 'error'" class="error-animation">
            <div class="error-circle">
              <svg class="error-x" viewBox="0 0 52 52">
                <circle class="error-circle-bg" cx="26" cy="26" r="25" fill="none"/>
                <path class="error-x-line" fill="none" d="M16 16l20 20M36 16L16 36"/>
              </svg>
            </div>
          </div>
          
          <!-- 警告动画 -->
          <div v-else-if="type === 'warning'" class="warning-animation">
            <div class="warning-triangle">
              <svg class="warning-icon" viewBox="0 0 52 52">
                <path class="warning-triangle-bg" fill="none" d="M26 6L6 46h40L26 6z"/>
                <path class="warning-exclamation" fill="none" d="M26 20v12M26 38v4"/>
              </svg>
            </div>
          </div>
          
          <!-- 信息动画 -->
          <div v-else-if="type === 'info'" class="info-animation">
            <div class="info-circle">
              <svg class="info-icon" viewBox="0 0 52 52">
                <circle class="info-circle-bg" cx="26" cy="26" r="25" fill="none"/>
                <path class="info-i" fill="none" d="M26 14v4M26 24v14"/>
              </svg>
            </div>
          </div>
          
          <!-- 文字内容 -->
          <h3 class="celebration-title">{{ title }}</h3>
          <p v-if="message" class="celebration-message">{{ message }}</p>
          
          <!-- 按钮 -->
          <div v-if="showButton" class="celebration-actions">
            <button class="btn-primary-enhanced" @click="handleAction">
              {{ buttonText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'success',
    validator: (value) => ['success', 'error', 'warning', 'info'].includes(value)
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 3000
  },
  showButton: {
    type: Boolean,
    default: false
  },
  buttonText: {
    type: String,
    default: '确定'
  },
  autoHide: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'action', 'hide'])

const show = ref(props.modelValue)
const canvasRef = ref(null)
let hideTimer = null
let confettiAnimation = null

// 监听显示状态
watch(() => props.modelValue, (val) => {
  show.value = val
  if (val) {
    nextTick(() => {
      if (props.type === 'success') {
        initConfetti()
      }
      if (props.autoHide) {
        hideTimer = setTimeout(() => {
          hide()
        }, props.duration)
      }
    })
  }
})

// 彩纸效果
const initConfetti = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  
  const particles = []
  const colors = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899']
  
  // 创建粒子
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20 - 10,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.3,
      drag: 0.99
    })
  }
  
  let frameCount = 0
  const animate = () => {
    if (!show.value) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    particles.forEach((p, index) => {
      // 物理更新
      p.vx *= p.drag
      p.vy *= p.drag
      p.vy += p.gravity
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotationSpeed
      
      // 绘制
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
      ctx.restore()
      
      // 移除超出屏幕的粒子
      if (p.y > canvas.height + 50) {
        particles.splice(index, 1)
      }
    })
    
    frameCount++
    if (particles.length > 0 && frameCount < 300) {
      confettiAnimation = requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// 隐藏
const hide = () => {
  show.value = false
  emit('update:modelValue', false)
  emit('hide')
  
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  
  if (confettiAnimation) {
    cancelAnimationFrame(confettiAnimation)
    confettiAnimation = null
  }
}

// 处理按钮点击
const handleAction = () => {
  emit('action')
  hide()
}

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  if (confettiAnimation) cancelAnimationFrame(confettiAnimation)
})

// 暴露方法
defineExpose({
  show: () => { show.value = true },
  hide
})
</script>

<style scoped lang="scss">
.celebration-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.confetti-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.celebration-content {
  position: relative;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  padding: 40px 48px;
  text-align: center;
  box-shadow: var(--shadow-2xl);
  max-width: 400px;
  width: 90%;
  animation: contentPop 0.5s var(--ease-out-back);
}

@keyframes contentPop {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 成功动画 */
.success-animation {
  margin-bottom: 24px;
}

.checkmark-circle {
  width: 80px;
  height: 80px;
  margin: 0 auto;
}

.checkmark {
  width: 100%;
  height: 100%;
}

.checkmark-circle-bg {
  stroke: var(--color-success-500);
  stroke-width: 3;
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.checkmark-check {
  stroke: var(--color-success-500);
  stroke-width: 3;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
}

@keyframes stroke {
  100% {
    stroke-dashoffset: 0;
  }
}

/* 错误动画 */
.error-animation {
  margin-bottom: 24px;
}

.error-circle {
  width: 80px;
  height: 80px;
  margin: 0 auto;
}

.error-x {
  width: 100%;
  height: 100%;
}

.error-circle-bg {
  stroke: var(--color-error-500);
  stroke-width: 3;
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.error-x-line {
  stroke: var(--color-error-500);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
}

/* 警告动画 */
.warning-animation {
  margin-bottom: 24px;
}

.warning-triangle {
  width: 80px;
  height: 80px;
  margin: 0 auto;
}

.warning-icon {
  width: 100%;
  height: 100%;
}

.warning-triangle-bg {
  stroke: var(--color-warning-500);
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.warning-exclamation {
  stroke: var(--color-warning-500);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
}

/* 信息动画 */
.info-animation {
  margin-bottom: 24px;
}

.info-circle {
  width: 80px;
  height: 80px;
  margin: 0 auto;
}

.info-icon {
  width: 100%;
  height: 100%;
}

.info-circle-bg {
  stroke: var(--color-info-500);
  stroke-width: 3;
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.info-i {
  stroke: var(--color-info-500);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
}

/* 文字样式 */
.celebration-title {
  font: var(--text-heading-2);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.celebration-content.success .celebration-title {
  color: var(--color-success-600);
}

.celebration-content.error .celebration-title {
  color: var(--color-error-600);
}

.celebration-content.warning .celebration-title {
  color: var(--color-warning-600);
}

.celebration-content.info .celebration-title {
  color: var(--color-info-600);
}

.celebration-message {
  font: var(--text-body-small);
  color: var(--color-text-secondary);
  margin-bottom: 24px;
}

.celebration-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
