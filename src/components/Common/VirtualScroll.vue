<template>
  <div 
    ref="containerRef"
    class="virtual-scroll"
    :style="{ height: `${height}px`, overflow: 'auto' }"
    @scroll="handleScroll"
  >
    <div 
      class="virtual-scroll-content"
      :style="{ height: `${totalHeight}px`, position: 'relative' }"
    >
      <div
        class="virtual-scroll-items"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <div
          v-for="item in visibleItems"
          :key="getKey(item)"
          class="virtual-scroll-item"
        >
          <slot :item="item" :index="item.index" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    required: true
  },
  itemHeight: {
    type: Number,
    default: 50
  },
  height: {
    type: Number,
    default: 400
  },
  buffer: {
    type: Number,
    default: 5
  },
  keyField: {
    type: String,
    default: 'id'
  }
})

const emit = defineEmits(['scroll', 'reach-end'])

// Refs
const containerRef = ref(null)
const scrollTop = ref(0)

// 计算总高度
const totalHeight = computed(() => props.items.length * props.itemHeight)

// 可见区域计算
const visibleCount = computed(() => Math.ceil(props.height / props.itemHeight))

const startIndex = computed(() => {
  const start = Math.floor(scrollTop.value / props.itemHeight) - props.buffer
  return Math.max(0, start)
})

const endIndex = computed(() => {
  const end = startIndex.value + visibleCount.value + props.buffer * 2
  return Math.min(props.items.length, end)
})

const offsetY = computed(() => startIndex.value * props.itemHeight)

const visibleItems = computed(() => {
  return props.items.slice(startIndex.value, endIndex.value).map((item, index) => ({
    ...item,
    index: startIndex.value + index
  }))
})

// 获取 key
const getKey = (item) => {
  return typeof item === 'object' ? item[props.keyField] : item
}

// 滚动处理
const handleScroll = () => {
  if (!containerRef.value) return
  
  scrollTop.value = containerRef.value.scrollTop
  emit('scroll', scrollTop.value)
  
  // 检测是否滚动到底部
  const { scrollHeight, clientHeight } = containerRef.value
  if (scrollTop.value + clientHeight >= scrollHeight - 50) {
    emit('reach-end')
  }
}

// 滚动到指定位置
const scrollTo = (index) => {
  if (!containerRef.value) return
  containerRef.value.scrollTop = index * props.itemHeight
}

// 滚动到顶部
const scrollToTop = () => {
  scrollTo(0)
}

// 滚动到底部
const scrollToBottom = () => {
  scrollTo(props.items.length - 1)
}

// 暴露方法
defineExpose({
  scrollTo,
  scrollToTop,
  scrollToBottom
})
</script>

<style scoped lang="scss">
.virtual-scroll {
  position: relative;
}

.virtual-scroll-content {
  width: 100%;
}

.virtual-scroll-items {
  width: 100%;
}

.virtual-scroll-item {
  width: 100%;
  height: v-bind('`${itemHeight}px`');
  overflow: hidden;
}
</style>
