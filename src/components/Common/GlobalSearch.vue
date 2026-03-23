<template>
  <div>
    <!-- 搜索触发按钮 -->
    <div class="search-trigger" @click="openSearch">
      <n-icon size="18"><Search /></n-icon>
      <span class="search-text">搜索</span>
      <kbd class="search-shortcut">Ctrl K</kbd>
    </div>

    <!-- 搜索模态框 -->
    <n-modal
      v-model:show="showSearch"
      :mask-closable="true"
      :closable="false"
      preset="card"
      style="width: 600px; max-width: 90vw"
      class="search-modal"
    >
      <div class="search-container">
        <!-- 搜索输入框 -->
        <div class="search-input-wrapper">
          <n-icon size="20" class="search-icon"><Search /></n-icon>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索页面、功能、Token..."
            @keydown.down.prevent="navigateDown"
            @keydown.up.prevent="navigateUp"
            @keydown.enter.prevent="selectCurrent"
            @keydown.esc="closeSearch"
          />
          <n-button text size="small" class="esc-button" @click="closeSearch">
            ESC
          </n-button>
        </div>

        <!-- 搜索结果 -->
        <div v-if="filteredResults.length > 0" class="search-results">
          <div class="results-section">
            <div class="section-title">{{ activeCategoryLabel }}</div>
            <div
              v-for="(item, index) in filteredResults"
              :key="item.id"
              class="result-item"
              :class="{ active: selectedIndex === index }"
              @click="selectItem(item)"
              @mouseenter="selectedIndex = index"
            >
              <n-icon size="18" class="result-icon">
                <component :is="item.icon" />
              </n-icon>
              <div class="result-content">
                <div class="result-title">{{ item.title }}</div>
                <div class="result-description">{{ item.description }}</div>
              </div>
              <n-tag v-if="item.tag" size="small" :type="item.tagType" class="result-tag">
                {{ item.tag }}
              </n-tag>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="searchQuery" class="search-empty">
          <n-empty description="未找到相关结果" size="small">
            <template #icon>
              <n-icon size="48"><SearchOutline /></n-icon>
            </template>
          </n-empty>
        </div>

        <!-- 快捷提示 -->
        <div class="search-footer">
          <div class="footer-hints">
            <span class="hint"><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
            <span class="hint"><kbd>Enter</kbd> 确认</span>
            <span class="hint"><kbd>ESC</kbd> 关闭</span>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  Search,
  SearchOutline,
  Home,
  Cube,
  PersonCircle,
  Layers,
  ChatbubbleEllipsesSharp,
  LockOpen,
  Settings,
  GameController,
  Fish,
  CubeOutline,
  Trophy,
  Calendar,
  Mail,
  BarChart
} from '@vicons/ionicons5'
import { useTokenStore, gameTokens } from '@/stores/tokenStore'

const router = useRouter()
const message = useMessage()
const tokenStore = useTokenStore()

const showSearch = ref(false)
const searchQuery = ref('')
const selectedIndex = ref(0)
const searchInput = ref(null)

// 搜索项目定义
const searchItems = computed(() => [
  // 页面
  { id: 'dashboard', title: '控制台', description: '查看游戏状态和数据', icon: Home, path: '/admin/dashboard', category: 'page', tag: '首页', tagType: 'primary' },
  { id: 'game-features', title: '游戏功能', description: '宝箱助手、钓鱼助手等功能', icon: Cube, path: '/admin/game-features', category: 'page', tag: '功能', tagType: 'success' },
  { id: 'tokens', title: 'Token管理', description: '管理游戏Token', icon: PersonCircle, path: '/tokens', category: 'page', tag: '管理', tagType: 'warning' },
  { id: 'batch-tasks', title: '批量日常', description: '批量执行日常任务', icon: Layers, path: '/admin/batch-daily-tasks', category: 'page', tag: '批量', tagType: 'info' },
  { id: 'message-test', title: '消息测试', description: '测试WebSocket消息', icon: ChatbubbleEllipsesSharp, path: '/admin/message-test', category: 'page', tag: '测试', tagType: 'default' },
  { id: 'legion-war', title: '实时盐场', description: '查看盐场战斗数据', icon: LockOpen, path: '/admin/legion-war', category: 'page', tag: '战斗', tagType: 'error' },
  { id: 'profile', title: '个人设置', description: '修改个人配置', icon: Settings, path: '/admin/profile', category: 'page', tag: '设置', tagType: 'default' },

  // 功能
  { id: 'box-helper', title: '宝箱助手', description: '自动领取宝箱奖励', icon: CubeOutline, path: '/admin/game-features?tab=box', category: 'feature', tag: '助手', tagType: 'success' },
  { id: 'fish-helper', title: '钓鱼助手', description: '自动钓鱼功能', icon: Fish, path: '/admin/game-features?tab=fish', category: 'feature', tag: '助手', tagType: 'success' },
  { id: 'dream-helper', title: '梦境助手', description: '自动完成梦境任务', icon: GameController, path: '/admin/game-features?tab=dream', category: 'feature', tag: '助手', tagType: 'success' },
  { id: 'fight-helper', title: '战斗助手', description: '自动战斗功能', icon: Trophy, path: '/admin/game-features?tab=fight', category: 'feature', tag: '助手', tagType: 'success' },

  // 数据
  { id: 'daily-tasks', title: '日常任务', description: '查看日常任务进度', icon: Calendar, path: '/admin/daily-tasks', category: 'data', tag: '任务', tagType: 'info' },
  { id: 'game-roles', title: '游戏角色', description: '查看角色信息', icon: PersonCircle, path: '/admin/game-roles', category: 'data', tag: '角色', tagType: 'info' },

  // Token列表（动态）
  ...gameTokens.value.map(token => ({
    id: `token-${token.id}`,
    title: token.name,
    description: `服务器: ${token.server || '未知'}`,
    icon: PersonCircle,
    path: '/admin/dashboard',
    category: 'token',
    tag: token.isOnline ? '在线' : '离线',
    tagType: token.isOnline ? 'success' : 'default',
    action: () => {
      tokenStore.selectToken?.(token.id)
      message.success(`已切换到: ${token.name}`)
    }
  }))
])

// 过滤结果
const filteredResults = computed(() => {
  if (!searchQuery.value.trim()) {
    return searchItems.value.slice(0, 8)
  }

  const query = searchQuery.value.toLowerCase()
  return searchItems.value.filter(item =>
    item.title.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query) ||
    item.tag?.toLowerCase().includes(query)
  )
})

// 当前分类标签
const activeCategoryLabel = computed(() => {
  if (!searchQuery.value) return '推荐'
  return `搜索结果 (${filteredResults.value.length})`
})

// 打开搜索
const openSearch = () => {
  showSearch.value = true
  searchQuery.value = ''
  selectedIndex.value = 0
  nextTick(() => {
    searchInput.value?.focus()
  })
}

// 关闭搜索
const closeSearch = () => {
  showSearch.value = false
}

// 导航选择
const navigateDown = () => {
  selectedIndex.value = (selectedIndex.value + 1) % filteredResults.value.length
}

const navigateUp = () => {
  selectedIndex.value = (selectedIndex.value - 1 + filteredResults.value.length) % filteredResults.value.length
}

// 选择当前项
const selectCurrent = () => {
  const item = filteredResults.value[selectedIndex.value]
  if (item) {
    selectItem(item)
  }
}

// 选择项目
const selectItem = (item) => {
  closeSearch()
  if (item.action) {
    item.action()
  }
  if (item.path) {
    router.push(item.path)
  }
}

// 监听搜索结果变化，重置选中索引
watch(filteredResults, () => {
  selectedIndex.value = 0
})

// 监听打开状态
watch(showSearch, (val) => {
  if (val) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// 暴露打开方法
defineExpose({
  openSearch
})
</script>

<style scoped lang="scss">
.search-trigger {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-secondary);

  &:hover {
    border-color: var(--primary-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .search-text {
    font-size: var(--font-size-sm);
  }

  .search-shortcut {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    border-radius: var(--border-radius-small);
    color: var(--text-tertiary);
  }
}

.search-modal {
  :deep(.n-card__content) {
    padding: 0;
  }
}

.search-container {
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-light);

  .search-icon {
    color: var(--text-tertiary);
  }

  .search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: var(--font-size-lg);
    background: transparent;
    color: var(--text-primary);

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  .esc-button {
    color: var(--text-tertiary);
  }
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}

.results-section {
  .section-title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--spacing-sm) var(--spacing-md);
  }
}

.result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover,
  &.active {
    background: var(--primary-color-light);
  }

  .result-icon {
    color: var(--primary-color);
  }

  .result-content {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  .result-description {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .result-tag {
    flex-shrink: 0;
  }
}

.search-empty {
  padding: var(--spacing-xl);
}

.search-footer {
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--border-light);
  background: var(--bg-secondary);

  .footer-hints {
    display: flex;
    gap: var(--spacing-lg);
    justify-content: center;

    .hint {
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);

      kbd {
        font-family: inherit;
        padding: 2px 6px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-small);
        font-size: 10px;
      }
    }
  }
}

// 深色模式适配
:global(.dark) .search-trigger .search-shortcut,
:global([data-theme="dark"]) .search-trigger .search-shortcut {
  background: var(--bg-tertiary);
  border-color: var(--border-light);
}

:global(.dark) .search-footer,
:global([data-theme="dark"]) .search-footer {
  background: var(--bg-secondary);
}

// 移动端适配
@media (max-width: 768px) {
  .search-trigger {
    .search-text,
    .search-shortcut {
      display: none;
    }
  }
}
</style>
