<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    style="width: 600px; max-width: 90vw"
    :closable="false"
    class="command-palette"
  >
    <div class="command-container">
      <!-- 输入框 -->
      <div class="command-input-wrapper">
        <n-icon size="20" class="command-icon">
          <Terminal />
        </n-icon>
        <input
          ref="inputRef"
          v-model="commandInput"
          type="text"
          class="command-input"
          placeholder="输入命令或搜索..."
          @keydown.down.prevent="navigateDown"
          @keydown.up.prevent="navigateUp"
          @keydown.enter.prevent="executeCommand"
          @keydown.esc="close"
        />
        <n-button text size="small" class="esc-button" @click="close">
          ESC
        </n-button>
      </div>

      <!-- 命令列表 -->
      <div v-if="filteredCommands.length > 0" class="command-list">
        <div
          v-for="(cmd, index) in filteredCommands"
          :key="cmd.id"
          class="command-item"
          :class="{ active: selectedIndex === index }"
          @click="executeCommandByIndex(index)"
          @mouseenter="selectedIndex = index"
        >
          <n-icon size="18" class="command-item-icon">
            <component :is="cmd.icon" />
          </n-icon>
          <div class="command-content">
            <div class="command-name">{{ cmd.name }}</div>
            <div class="command-description">{{ cmd.description }}</div>
          </div>
          <div class="command-shortcut">
            <kbd v-for="key in cmd.shortcut" :key="key">{{ key }}</kbd>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="commandInput" class="command-empty">
        <n-empty description="未找到命令" size="small" />
      </div>

      <!-- 提示 -->
      <div class="command-footer">
        <div class="footer-hints">
          <span class="hint"><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
          <span class="hint"><kbd>Enter</kbd> 执行</span>
          <span class="hint"><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  Terminal,
  Home,
  Settings,
  Moon,
  Sunny,
  Refresh,
  LogOut,
  Search,
  GameController,
  Fish,
  Cube,
  Trophy,
  Mail,
  PersonCircle,
  Layers
} from '@vicons/ionicons5'
import { useTheme } from '@/composables/useTheme'
import { useTokenStore } from '@/stores/tokenStore'

const router = useRouter()
const message = useMessage()
const { isDark, toggleTheme } = useTheme()
const tokenStore = useTokenStore()

const visible = ref(false)
const commandInput = ref('')
const selectedIndex = ref(0)
const inputRef = ref(null)

// 命令定义
const commands = [
  {
    id: 'go-home',
    name: '返回首页',
    description: '跳转到控制台首页',
    icon: Home,
    shortcut: ['G', 'H'],
    action: () => router.push('/admin/dashboard')
  },
  {
    id: 'toggle-theme',
    name: '切换主题',
    description: '切换浅色/深色模式',
    icon: isDark.value ? Sunny : Moon,
    shortcut: ['Ctrl', 'Shift', 'L'],
    action: () => {
      toggleTheme()
      message.success(`已切换到${isDark.value ? '深色' : '浅色'}模式`)
    }
  },
  {
    id: 'refresh-data',
    name: '刷新数据',
    description: '刷新当前页面数据',
    icon: Refresh,
    shortcut: ['Ctrl', 'R'],
    action: () => {
      window.location.reload()
    }
  },
  {
    id: 'go-tokens',
    name: 'Token管理',
    description: '管理游戏Token',
    icon: PersonCircle,
    shortcut: ['G', 'T'],
    action: () => router.push('/tokens')
  },
  {
    id: 'go-game-features',
    name: '游戏功能',
    description: '宝箱、钓鱼等助手功能',
    icon: GameController,
    shortcut: ['G', 'F'],
    action: () => router.push('/admin/game-features')
  },
  {
    id: 'go-batch',
    name: '批量日常',
    description: '批量执行日常任务',
    icon: Layers,
    shortcut: ['G', 'B'],
    action: () => router.push('/admin/batch-daily-tasks')
  },
  {
    id: 'go-messages',
    name: '消息测试',
    description: '测试WebSocket消息',
    icon: Mail,
    shortcut: ['G', 'M'],
    action: () => router.push('/admin/message-test')
  },
  {
    id: 'go-settings',
    name: '个人设置',
    description: '修改个人配置',
    icon: Settings,
    shortcut: ['G', 'S'],
    action: () => router.push('/admin/profile')
  },
  {
    id: 'clear-tokens',
    name: '清除所有Token',
    description: '清除所有Token并退出',
    icon: LogOut,
    shortcut: ['Ctrl', 'Shift', 'C'],
    action: async () => {
      await tokenStore.clearAllTokens()
      message.success('已清除所有Token')
      router.push('/tokens')
    }
  }
]

// 过滤命令
const filteredCommands = computed(() => {
  if (!commandInput.value.trim()) {
    return commands
  }

  const query = commandInput.value.toLowerCase()
  return commands.filter(cmd =>
    cmd.name.toLowerCase().includes(query) ||
    cmd.description.toLowerCase().includes(query) ||
    cmd.id.toLowerCase().includes(query)
  )
})

// 导航
const navigateDown = () => {
  selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length
}

const navigateUp = () => {
  selectedIndex.value = (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
}

// 执行命令
const executeCommand = () => {
  const cmd = filteredCommands.value[selectedIndex.value]
  if (cmd) {
    executeCommandByIndex(selectedIndex.value)
  }
}

const executeCommandByIndex = (index) => {
  const cmd = filteredCommands.value[index]
  if (cmd) {
    close()
    setTimeout(() => {
      cmd.action()
    }, 100)
  }
}

// 打开/关闭
const open = () => {
  visible.value = true
  commandInput.value = ''
  selectedIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const close = () => {
  visible.value = false
}

// 监听过滤结果变化
watch(filteredCommands, () => {
  selectedIndex.value = 0
})

// 暴露方法
defineExpose({
  open,
  close
})
</script>

<style scoped lang="scss">
.command-palette {
  :deep(.n-card__content) {
    padding: 0;
  }
}

.command-container {
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

.command-input-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-light);

  .command-icon {
    color: var(--primary-color);
  }

  .command-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: var(--font-size-lg);
    background: transparent;
    color: var(--text-primary);
    font-family: 'SF Mono', Monaco, monospace;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  .esc-button {
    color: var(--text-tertiary);
  }
}

.command-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs);
}

.command-item {
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

  .command-item-icon {
    color: var(--primary-color);
  }

  .command-content {
    flex: 1;
    min-width: 0;
  }

  .command-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  .command-description {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .command-shortcut {
    display: flex;
    gap: var(--spacing-xs);

    kbd {
      font-family: inherit;
      font-size: 10px;
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-light);
      border-radius: var(--border-radius-small);
      color: var(--text-tertiary);
    }
  }
}

.command-empty {
  padding: var(--spacing-xl);
}

.command-footer {
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
</style>
