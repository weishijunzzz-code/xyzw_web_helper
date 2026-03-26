<template>
  <div ref="containerRef" class="virtual-list-container" :style="containerStyle">
    <div class="virtual-list-phantom" :style="phantomStyle"></div>
    <div class="virtual-list-content" :style="contentStyle">
      <div
        v-for="item in visibleItems"
        :key="item.key"
        class="virtual-list-item"
        :style="item.style"
      >
        <slot :item="item.data" :index="item.index"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

interface Props {
  items: any[]
  itemHeight: number
  bufferSize?: number
  containerHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  bufferSize: 5,
  containerHeight: '100%'
})

const containerRef = ref<HTMLElement>()
const scrollTop = ref(0)
const containerHeight = ref(0)

// 容器样式
const containerStyle = computed(() => ({
  height: typeof props.containerHeight === 'number' 
    ? `${props.containerHeight}px` 
    : props.containerHeight
}))

//  phantom 元素样式（用于撑开滚动区域）
const phantomStyle = computed(() => ({
  height: `${props.items.length * props.itemHeight}px`
}))

// 内容区域样式
const contentStyle = computed(() => ({
  transform: `translateY(${startIndex.value * props.itemHeight}px)`
}))

// 计算可见区域的起始索引
const startIndex = computed(() => {
  const index = Math.floor(scrollTop.value / props.itemHeight)
  return Math.max(0, index - props.bufferSize)
})

// 计算可见区域的结束索引
const endIndex = computed(() => {
  if (!containerHeight.value) return props.items.length
  const visibleCount = Math.ceil(containerHeight.value / props.itemHeight)
  const index = Math.floor(scrollTop.value / props.itemHeight) + visibleCount
  return Math.min(props.items.length, index + props.bufferSize)
})

// 可见列表项
const visibleItems = computed(() => {
  const items = []
  for (let i = startIndex.value; i < endIndex.value; i++) {
    items.push({
      key: i,
      index: i,
      data: props.items[i],
      style: {
        height: `${props.itemHeight}px`
      }
    })
  }
  return items
})

// 处理滚动事件
const handleScroll = () => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop
  }
}

// 更新容器高度
const updateContainerHeight = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

// 滚动到指定索引
const scrollToIndex = (index: number) => {
  if (containerRef.value) {
    containerRef.value.scrollTop = index * props.itemHeight
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
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

onMounted(() => {
  updateContainerHeight()
  containerRef.value?.addEventListener('scroll', handleScroll)
  window.addEventListener('resize', updateContainerHeight)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', updateContainerHeight)
})

// 监听 items 变化，重置滚动位置
watch(() => props.items.length, (newVal, oldVal) => {
  if (newVal < oldVal) {
    nextTick(() => {
      updateContainerHeight()
    })
  }
})

defineExpose({
  scrollToIndex,
  scrollToTop,
  scrollToBottom,
  updateContainerHeight
})
</script>

<style scoped lang="scss">
.virtual-list-container {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.virtual-list-phantom {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
}

.virtual-list-content {
  position: relative;
  will-change: transform;
}

.virtual-list-item {
  box-sizing: border-box;
}

/* 滚动条样式 */
.virtual-list-container::-webkit-scrollbar {
  width: 6px;
}

.virtual-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.virtual-list-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.virtual-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 深色主题 */
.dark .virtual-list-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.dark .virtual-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
