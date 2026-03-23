import { ref, onMounted, onUnmounted } from 'vue'

export function useGesture(options = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onTap,
    onLongPress,
    onPinch,
    threshold = 50,
    longPressDelay = 500
  } = options

  const elementRef = ref(null)
  const isGesturing = ref(false)
  const gestureType = ref(null)

  let startX = 0
  let startY = 0
  let startTime = 0
  let longPressTimer = null
  let isLongPress = false

  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    startTime = Date.now()
    isGesturing.value = true
    isLongPress = false

    // 长按检测
    longPressTimer = setTimeout(() => {
      isLongPress = true
      onLongPress?.({
        x: startX,
        y: startY,
        originalEvent: e
      })
    }, longPressDelay)
  }

  const handleTouchMove = (e) => {
    if (!isGesturing.value) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY

    // 如果移动超过10px，取消长按
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearTimeout(longPressTimer)
    }
  }

  const handleTouchEnd = (e) => {
    if (!isGesturing.value) return

    clearTimeout(longPressTimer)

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    const deltaTime = Date.now() - startTime

    // 判断手势类型
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX > threshold || absY > threshold) {
      if (absX > absY) {
        // 水平滑动
        if (deltaX > 0) {
          gestureType.value = 'swipeRight'
          onSwipeRight?.({
            distance: deltaX,
            duration: deltaTime,
            originalEvent: e
          })
        } else {
          gestureType.value = 'swipeLeft'
          onSwipeLeft?.({
            distance: Math.abs(deltaX),
            duration: deltaTime,
            originalEvent: e
          })
        }
      } else {
        // 垂直滑动
        if (deltaY > 0) {
          gestureType.value = 'swipeDown'
          onSwipeDown?.({
            distance: deltaY,
            duration: deltaTime,
            originalEvent: e
          })
        } else {
          gestureType.value = 'swipeUp'
          onSwipeUp?.({
            distance: Math.abs(deltaY),
            duration: deltaTime,
            originalEvent: e
          })
        }
      }
    } else if (!isLongPress && deltaTime < 200) {
      // 点击
      gestureType.value = 'tap'
      onTap?.({
        x: touch.clientX,
        y: touch.clientY,
        originalEvent: e
      })
    }

    isGesturing.value = false

    // 重置手势类型
    setTimeout(() => {
      gestureType.value = null
    }, 100)
  }

  const bindEvents = (element) => {
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
  }

  const unbindEvents = (element) => {
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)
  }

  return {
    elementRef,
    isGesturing,
    gestureType,
    bindEvents,
    unbindEvents
  }
}

// 列表项滑动手势
export function useSwipeableItem(options = {}) {
  const {
    onSwipeOpen,
    onSwipeClose,
    onActionClick,
    threshold = 80
  } = options

  const itemRef = ref(null)
  const isOpen = ref(false)
  const translateX = ref(0)
  const isDragging = ref(false)

  let startX = 0
  let currentX = 0

  const handleTouchStart = (e) => {
    startX = e.touches[0].clientX
    currentX = translateX.value
    isDragging.value = true
  }

  const handleTouchMove = (e) => {
    if (!isDragging.value) return

    const deltaX = e.touches[0].clientX - startX
    let newX = currentX + deltaX

    // 限制滑动范围
    if (newX > 0) newX = 0
    if (newX < -threshold * 2) newX = -threshold * 2

    translateX.value = newX
  }

  const handleTouchEnd = () => {
    if (!isDragging.value) return

    isDragging.value = false

    // 判断是否打开或关闭
    if (translateX.value < -threshold / 2) {
      translateX.value = -threshold
      isOpen.value = true
      onSwipeOpen?.()
    } else {
      translateX.value = 0
      isOpen.value = false
      onSwipeClose?.()
    }
  }

  const close = () => {
    translateX.value = 0
    isOpen.value = false
  }

  const bindEvents = (element) => {
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
  }

  const unbindEvents = (element) => {
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)
  }

  return {
    itemRef,
    isOpen,
    translateX,
    isDragging,
    close,
    bindEvents,
    unbindEvents
  }
}
