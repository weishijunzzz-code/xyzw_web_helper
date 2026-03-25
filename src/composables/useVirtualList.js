import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

/**
 * 虚拟滚动列表组合式函数
 * @param {Ref<Array>} items - 数据列表
 * @param {Object} options - 配置选项
 * @returns {Object} 虚拟滚动相关状态和方法
 */
export function useVirtualList(items, options = {}) {
  const {
    itemHeight = 60,        // 每项高度（像素）
    overscan = 5,           // 上下缓冲区域数量
    containerHeight = 400   // 容器高度（像素）
  } = options

  // 容器引用
  const containerRef = ref(null)
  
  // 滚动状态
  const scrollTop = ref(0)
  const containerHeightRef = ref(containerHeight)
  
  // 计算可见区域
  const visibleCount = computed(() => {
    return Math.ceil(containerHeightRef.value / itemHeight) + overscan * 2
  })
  
  // 起始索引
  const startIndex = computed(() => {
    const start = Math.floor(scrollTop.value / itemHeight) - overscan
    return Math.max(0, start)
  })
  
  // 结束索引
  const endIndex = computed(() => {
    const end = startIndex.value + visibleCount.value
    return Math.min(items.value.length, end)
  })
  
  // 可见数据
  const visibleItems = computed(() => {
    return items.value.slice(startIndex.value, endIndex.value).map((item, index) => ({
      item,
      index: startIndex.value + index,
      style: {
        position: 'absolute',
        top: `${(startIndex.value + index) * itemHeight}px`,
        height: `${itemHeight}px`,
        left: 0,
        right: 0
      }
    }))
  })
  
  // 总高度
  const totalHeight = computed(() => {
    return items.value.length * itemHeight
  })
  
  // 偏移量
  const offsetStyle = computed(() => ({
    paddingTop: `${startIndex.value * itemHeight}px`,
    paddingBottom: `${(items.value.length - endIndex.value) * itemHeight}px`
  }))
  
  // 滚动处理
  const handleScroll = (e) => {
    scrollTop.value = e.target.scrollTop
  }
  
  // 滚动到指定索引
  const scrollToIndex = (index) => {
    if (containerRef.value) {
      containerRef.value.scrollTop = index * itemHeight
    }
  }
  
  // 滚动到顶部
  const scrollToTop = () => {
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
    }
  }
  
  // 滚动到底部
  const scrollToBottom = () => {
    if (containerRef.value) {
      containerRef.value.scrollTop = totalHeight.value
    }
  }
  
  // 监听容器尺寸变化
  const updateContainerHeight = () => {
    if (containerRef.value) {
      containerHeightRef.value = containerRef.value.clientHeight
    }
  }
  
  onMounted(() => {
    updateContainerHeight()
    window.addEventListener('resize', updateContainerHeight)
  })
  
  onUnmounted(() => {
    window.removeEventListener('resize', updateContainerHeight)
  })
  
  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetStyle,
    startIndex,
    endIndex,
    scrollTop,
    handleScroll,
    scrollToIndex,
    scrollToTop,
    scrollToBottom
  }
}
