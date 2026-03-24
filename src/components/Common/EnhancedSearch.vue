<template>
  <div class="enhanced-search" :class="{ 'is-focused': isFocused, 'has-value': searchValue }">
    <div class="search-input-wrapper">
      <n-icon class="search-icon" :size="20">
        <SearchOutline />
      </n-icon>
      <input
        ref="inputRef"
        v-model="searchValue"
        type="text"
        class="search-input"
        :placeholder="placeholder"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <transition name="fade">
        <n-button
          v-if="searchValue"
          quaternary
          circle
          size="small"
          class="clear-btn"
          @click="clearSearch"
        >
          <template #icon>
            <n-icon><CloseOutline /></n-icon>
          </template>
        </n-button>
      </transition>
      <n-button
        v-if="showShortcut"
        quaternary
        size="tiny"
        class="shortcut-hint"
        @click="focusInput"
      >
        Ctrl K
      </n-button>
    </div>

    <!-- 搜索建议下拉框 -->
    <transition name="slide-down">
      <div
        v-if="showSuggestions && (filteredSuggestions.length > 0 || recentSearches.length > 0)"
        class="search-dropdown"
      >
        <!-- 最近搜索 -->
        <div v-if="recentSearches.length > 0 && !searchValue" class="dropdown-section">
          <div class="section-header">
            <span class="section-title">最近搜索</span>
            <n-button text size="tiny" @click="clearRecentSearches">
              清空
            </n-button>
          </div>
          <div class="suggestion-list">
            <div
              v-for="(item, index) in recentSearches"
              :key="`recent-${index}`"
              class="suggestion-item"
              :class="{ active: selectedIndex === index }"
              @click="selectSuggestion(item)"
              @mouseenter="selectedIndex = index"
            >
              <n-icon class="suggestion-icon" :size="16">
                <TimeOutline />
              </n-icon>
              <span class="suggestion-text" v-html="highlightText(item)"></span>
              <n-button
                quaternary
                circle
                size="tiny"
                class="remove-btn"
                @click.stop="removeRecentSearch(item)"
              >
                <template #icon>
                  <n-icon><CloseOutline /></n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </div>

        <!-- 搜索建议 -->
        <div v-if="filteredSuggestions.length > 0" class="dropdown-section">
          <div class="section-header">
            <span class="section-title">搜索建议</span>
          </div>
          <div class="suggestion-list">
            <div
              v-for="(item, index) in filteredSuggestions"
              :key="`suggest-${index}`"
              class="suggestion-item"
              :class="{ active: selectedIndex === index + recentSearches.length }"
              @click="selectSuggestion(item)"
              @mouseenter="selectedIndex = index + recentSearches.length"
            >
              <n-icon class="suggestion-icon" :size="16">
                <SearchOutline />
              </n-icon>
              <span class="suggestion-text" v-html="highlightText(item)"></span>
            </div>
          </div>
        </div>

        <!-- 无结果提示 -->
        <div v-if="searchValue && filteredSuggestions.length === 0" class="no-results">
          <n-icon :size="32" class="no-results-icon">
            <SearchOutline />
          </n-icon>
          <p class="no-results-text">未找到 "{{ searchValue }}" 的相关结果</p>
          <p class="no-results-hint">请尝试其他关键词</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { SearchOutline, CloseOutline, TimeOutline } from '@vicons/ionicons5'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '搜索...'
  },
  suggestions: {
    type: Array,
    default: () => []
  },
  maxRecentSearches: {
    type: Number,
    default: 5
  },
  showShortcut: {
    type: Boolean,
    default: true
  },
  storageKey: {
    type: String,
    default: 'search-history'
  }
})

const emit = defineEmits(['update:modelValue', 'search', 'select'])

const inputRef = ref(null)
const searchValue = ref(props.modelValue)
const isFocused = ref(false)
const showSuggestions = ref(false)
const selectedIndex = ref(-1)
const recentSearches = ref([])

// 过滤后的建议
const filteredSuggestions = computed(() => {
  if (!searchValue.value) return props.suggestions.slice(0, 5)
  const query = searchValue.value.toLowerCase()
  return props.suggestions
    .filter(item => item.toLowerCase().includes(query))
    .slice(0, 5)
})

// 总选项数
const totalItems = computed(() => {
  return recentSearches.value.length + filteredSuggestions.value.length
})

// 监听外部值变化
watch(() => props.modelValue, (val) => {
  searchValue.value = val
})

// 监听内部值变化
watch(searchValue, (val) => {
  emit('update:modelValue', val)
  selectedIndex.value = -1
})

// 加载最近搜索
const loadRecentSearches = () => {
  try {
    const stored = localStorage.getItem(props.storageKey)
    if (stored) {
      recentSearches.value = JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load search history:', e)
  }
}

// 保存最近搜索
const saveRecentSearches = () => {
  try {
    localStorage.setItem(props.storageKey, JSON.stringify(recentSearches.value))
  } catch (e) {
    console.error('Failed to save search history:', e)
  }
}

// 添加到最近搜索
const addToRecentSearches = (value) => {
  if (!value) return
  const index = recentSearches.value.indexOf(value)
  if (index > -1) {
    recentSearches.value.splice(index, 1)
  }
  recentSearches.value.unshift(value)
  if (recentSearches.value.length > props.maxRecentSearches) {
    recentSearches.value = recentSearches.value.slice(0, props.maxRecentSearches)
  }
  saveRecentSearches()
}

// 移除最近搜索
const removeRecentSearch = (value) => {
  const index = recentSearches.value.indexOf(value)
  if (index > -1) {
    recentSearches.value.splice(index, 1)
    saveRecentSearches()
  }
}

// 清空最近搜索
const clearRecentSearches = () => {
  recentSearches.value = []
  saveRecentSearches()
}

// 高亮匹配文本
const highlightText = (text) => {
  if (!searchValue.value) return text
  const query = searchValue.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${query})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

// 处理输入
const handleInput = () => {
  showSuggestions.value = true
}

// 处理聚焦
const handleFocus = () => {
  isFocused.value = true
  showSuggestions.value = true
  loadRecentSearches()
}

// 处理失焦
const handleBlur = () => {
  setTimeout(() => {
    isFocused.value = false
    showSuggestions.value = false
    selectedIndex.value = -1
  }, 200)
}

// 处理键盘事件
const handleKeydown = (e) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % totalItems.value
      break
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = selectedIndex.value <= 0 
        ? totalItems.value - 1 
        : selectedIndex.value - 1
      break
    case 'Enter':
      e.preventDefault()
      if (selectedIndex.value >= 0) {
        const recentLength = recentSearches.value.length
        if (selectedIndex.value < recentLength) {
          selectSuggestion(recentSearches.value[selectedIndex.value])
        } else {
          selectSuggestion(filteredSuggestions.value[selectedIndex.value - recentLength])
        }
      } else {
        performSearch()
      }
      break
    case 'Escape':
      showSuggestions.value = false
      inputRef.value?.blur()
      break
  }
}

// 选择建议
const selectSuggestion = (value) => {
  searchValue.value = value
  showSuggestions.value = false
  addToRecentSearches(value)
  emit('select', value)
  emit('search', value)
  inputRef.value?.blur()
}

// 执行搜索
const performSearch = () => {
  if (searchValue.value) {
    addToRecentSearches(searchValue.value)
    emit('search', searchValue.value)
  }
  showSuggestions.value = false
}

// 清空搜索
const clearSearch = () => {
  searchValue.value = ''
  selectedIndex.value = -1
  inputRef.value?.focus()
}

// 聚焦输入框
const focusInput = () => {
  inputRef.value?.focus()
}

// 全局快捷键
const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    focusInput()
  }
}

onMounted(() => {
  loadRecentSearches()
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})

// 暴露方法
defineExpose({
  focus: focusInput,
  clear: clearSearch
})
</script>

<style scoped lang="scss">
.enhanced-search {
  position: relative;
  width: 100%;
  max-width: 400px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: 0 12px;
  height: 40px;
  transition: all var(--duration-normal) var(--ease-out);

  &:hover {
    border-color: var(--color-border-hover);
  }
}

.enhanced-search.is-focused .search-input-wrapper {
  border-color: var(--color-primary-500);
  box-shadow: var(--shadow-glow-primary);
  background: var(--color-bg-primary);
}

.search-icon {
  color: var(--color-text-tertiary);
  margin-right: 8px;
  transition: color var(--duration-fast) var(--ease-out);
}

.enhanced-search.is-focused .search-icon {
  color: var(--color-primary-500);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font: var(--text-body);
  color: var(--color-text-primary);
  outline: none;

  &::placeholder {
    color: var(--color-text-tertiary);
  }
}

.clear-btn {
  margin-left: 8px;
  opacity: 0.7;
  transition: opacity var(--duration-fast) var(--ease-out);

  &:hover {
    opacity: 1;
  }
}

.shortcut-hint {
  margin-left: 8px;
  padding: 2px 6px;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-default);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);

  &:hover {
    background: var(--color-bg-secondary);
    border-color: var(--color-border-hover);
  }
}

.enhanced-search.is-focused .shortcut-hint,
.enhanced-search.has-value .shortcut-hint {
  display: none;
}

/* 下拉框 */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
  max-height: 320px;
  overflow-y: auto;
}

.dropdown-section {
  padding: 8px 0;

  &:not(:last-child) {
    border-bottom: 1px solid var(--color-border-subtle);
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 8px;
}

.section-title {
  font: var(--text-caption);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.suggestion-list {
  padding: 0 8px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);

  &:hover,
  &.active {
    background: var(--color-bg-secondary);
  }
}

.suggestion-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.suggestion-text {
  flex: 1;
  font: var(--text-body-small);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  :deep(mark) {
    background: transparent;
    color: var(--color-primary-500);
    font-weight: var(--font-semibold);
  }
}

.remove-btn {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.suggestion-item:hover .remove-btn {
  opacity: 1;
}

/* 无结果 */
.no-results {
  padding: 24px;
  text-align: center;
}

.no-results-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}

.no-results-text {
  font: var(--text-body-small);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.no-results-hint {
  font: var(--text-caption);
  color: var(--color-text-tertiary);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-fast) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all var(--duration-normal) var(--ease-out-back);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
