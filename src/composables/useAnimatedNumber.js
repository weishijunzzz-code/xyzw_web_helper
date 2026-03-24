import { ref, watch, onMounted } from 'vue'

/**
 * 数字动画组合式函数
 * @param {Ref<number>} source - 源数据
 * @param {Object} options - 配置选项
 * @returns {Ref<number>} 动画后的数字
 */
export function useAnimatedNumber(source, options = {}) {
  const {
    duration = 1000,
    easing = 'easeOutExpo',
    decimals = 0,
    separator = ',',
    prefix = '',
    suffix = ''
  } = options

  const displayValue = ref(0)
  const currentValue = ref(0)
  let animationId = null
  let startTime = null
  let startValue = 0
  let targetValue = 0

  // 缓动函数
  const easings = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeOutBack: t => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
    },
    easeOutElastic: t => {
      const c4 = (2 * Math.PI) / 3
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
    }
  }

  const easingFn = easings[easing] || easings.easeOutExpo

  const formatNumber = (num) => {
    const fixed = num.toFixed(decimals)
    const parts = fixed.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    return prefix + parts.join('.') + suffix
  }

  const animate = (timestamp) => {
    if (!startTime) startTime = timestamp
    const elapsed = timestamp - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easedProgress = easingFn(progress)

    currentValue.value = startValue + (targetValue - startValue) * easedProgress
    displayValue.value = formatNumber(currentValue.value)

    if (progress < 1) {
      animationId = requestAnimationFrame(animate)
    } else {
      displayValue.value = formatNumber(targetValue)
    }
  }

  const startAnimation = (newValue) => {
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
    startTime = null
    startValue = currentValue.value
    targetValue = newValue
    animationId = requestAnimationFrame(animate)
  }

  watch(source, (newValue) => {
    startAnimation(newValue)
  }, { immediate: true })

  onMounted(() => {
    startAnimation(source.value)
  })

  return displayValue
}

/**
 * 计数动画组件用的组合式函数
 * @param {number} target - 目标值
 * @param {Object} options - 配置选项
 * @returns {Object} { count, start, reset }
 */
export function useCountAnimation(target, options = {}) {
  const {
    duration = 2000,
    startOnMount = true,
    easing = 'easeOutExpo'
  } = options

  const count = ref(0)
  let animationId = null

  const easings = {
    linear: t => t,
    easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeOutBack: t => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
    }
  }

  const easingFn = easings[easing] || easings.easeOutExpo

  const start = () => {
    if (animationId) cancelAnimationFrame(animationId)
    
    const startTime = performance.now()
    const startValue = 0

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easingFn(progress)

      count.value = Math.round(startValue + (target - startValue) * easedProgress)

      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      } else {
        count.value = target
      }
    }

    animationId = requestAnimationFrame(animate)
  }

  const reset = () => {
    if (animationId) cancelAnimationFrame(animationId)
    count.value = 0
  }

  if (startOnMount) {
    onMounted(start)
  }

  return {
    count,
    start,
    reset
  }
}
