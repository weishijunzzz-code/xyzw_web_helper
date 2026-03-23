import { ref, onMounted, onUnmounted } from 'vue'

export function useDraggable(options = {}) {
  const {
    onDragStart,
    onDragMove,
    onDragEnd,
    onDrop,
    handle = null,
    axis = 'both' // 'x', 'y', 'both'
  } = options

  const isDragging = ref(false)
  const dragPosition = ref({ x: 0, y: 0 })
  const dragOffset = ref({ x: 0, y: 0 })
  const draggedElement = ref(null)

  let startX = 0
  let startY = 0
  let initialX = 0
  let initialY = 0

  const handleMouseDown = (e) => {
    // 检查是否点击了拖拽手柄
    if (handle && !e.target.closest(handle)) {
      return
    }

    const element = e.currentTarget
    draggedElement.value = element
    isDragging.value = true

    // 获取元素当前位置
    const rect = element.getBoundingClientRect()
    initialX = rect.left
    initialY = rect.top

    // 计算鼠标偏移
    startX = e.clientX
    startY = e.clientY

    dragOffset.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }

    // 添加拖拽样式
    element.style.position = 'fixed'
    element.style.zIndex = '9999'
    element.style.cursor = 'grabbing'
    element.classList.add('is-dragging')

    onDragStart?.({
      element,
      x: initialX,
      y: initialY,
      event: e
    })

    // 绑定全局事件
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e) => {
    if (!isDragging.value || !draggedElement.value) return

    e.preventDefault()

    let newX = initialX + (e.clientX - startX)
    let newY = initialY + (e.clientY - startY)

    // 限制轴向
    if (axis === 'x') newY = initialY
    if (axis === 'y') newX = initialX

    dragPosition.value = { x: newX, y: newY }

    draggedElement.value.style.left = `${newX}px`
    draggedElement.value.style.top = `${newY}px`

    onDragMove?.({
      element: draggedElement.value,
      x: newX,
      y: newY,
      deltaX: e.clientX - startX,
      deltaY: e.clientY - startY,
      event: e
    })
  }

  const handleMouseUp = (e) => {
    if (!isDragging.value || !draggedElement.value) return

    const element = draggedElement.value

    // 移除拖拽样式
    element.style.position = ''
    element.style.zIndex = ''
    element.style.cursor = ''
    element.style.left = ''
    element.style.top = ''
    element.classList.remove('is-dragging')

    onDragEnd?.({
      element,
      x: dragPosition.value.x,
      y: dragPosition.value.y,
      event: e
    })

    // 触发放置事件
    onDrop?.({
      element,
      x: e.clientX,
      y: e.clientY,
      event: e
    })

    isDragging.value = false
    draggedElement.value = null

    // 移除全局事件
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // 触摸事件支持
  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    handleMouseDown({
      ...e,
      clientX: touch.clientX,
      clientY: touch.clientY,
      currentTarget: e.currentTarget,
      target: e.target
    })
  }

  const handleTouchMove = (e) => {
    const touch = e.touches[0]
    handleMouseMove({
      ...e,
      clientX: touch.clientX,
      clientY: touch.clientY,
      preventDefault: () => e.preventDefault()
    })
  }

  const handleTouchEnd = (e) => {
    const touch = e.changedTouches[0]
    handleMouseUp({
      ...e,
      clientX: touch.clientX,
      clientY: touch.clientY
    })
  }

  const bindEvents = (element) => {
    element.addEventListener('mousedown', handleMouseDown)
    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)
  }

  const unbindEvents = (element) => {
    element.removeEventListener('mousedown', handleMouseDown)
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)
  }

  return {
    isDragging,
    dragPosition,
    dragOffset,
    draggedElement,
    bindEvents,
    unbindEvents
  }
}

// 列表拖拽排序组合式函数
export function useSortableList(options = {}) {
  const {
    onSort,
    animationDuration = 200
  } = options

  const draggedItem = ref(null)
  const draggedIndex = ref(-1)
  const placeholder = ref(null)

  const createPlaceholder = (element) => {
    const rect = element.getBoundingClientRect()
    const el = element.cloneNode(true)
    el.style.height = `${rect.height}px`
    el.style.opacity = '0.3'
    el.classList.add('sortable-placeholder')
    return el
  }

  const handleDragStart = (index, element) => {
    draggedItem.value = element
    draggedIndex.value = index
    placeholder.value = createPlaceholder(element)

    element.parentNode.insertBefore(placeholder.value, element.nextSibling)
    element.classList.add('is-dragging')
  }

  const handleDragMove = (newIndex) => {
    if (draggedIndex.value === newIndex) return

    const list = placeholder.value.parentNode
    const items = Array.from(list.children).filter(
      child => !child.classList.contains('is-dragging')
    )

    if (newIndex >= items.length) {
      list.appendChild(placeholder.value)
    } else {
      list.insertBefore(placeholder.value, items[newIndex])
    }

    draggedIndex.value = newIndex
  }

  const handleDragEnd = () => {
    if (!draggedItem.value || !placeholder.value) return

    const fromIndex = draggedIndex.value
    const toIndex = Array.from(placeholder.value.parentNode.children).indexOf(placeholder.value)

    // 移除占位符
    placeholder.value.remove()
    draggedItem.value.classList.remove('is-dragging')

    onSort?.({ fromIndex, toIndex })

    draggedItem.value = null
    draggedIndex.value = -1
    placeholder.value = null
  }

  return {
    draggedItem,
    draggedIndex,
    handleDragStart,
    handleDragMove,
    handleDragEnd
  }
}
