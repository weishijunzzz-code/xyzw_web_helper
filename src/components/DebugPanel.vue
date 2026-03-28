<template>
  <!-- 调试面板 -->
  <div v-if="showDebug" class="debug-panel">
    <div class="debug-header">
      <span>调试日志</span>
      <div class="debug-actions">
        <n-button text size="tiny" @click="clearLogs">清空</n-button>
        <n-button text size="tiny" @click="showDebug = false">关闭</n-button>
      </div>
    </div>
    <div class="debug-content">
      <div v-for="(log, index) in logs" :key="index" class="debug-line">
        <span class="debug-time">{{ log.time }}</span>
        <span :class="['debug-type', log.type]">{{ log.type }}</span>
        <span class="debug-message">{{ log.message }}</span>
      </div>
    </div>
  </div>

  <!-- 调试按钮 -->
  <n-button
    v-else-if="debugEnabled"
    class="debug-toggle"
    size="small"
    type="default"
    @click="showDebug = true"
  >
    调试
  </n-button>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface LogItem {
  time: string
  type: string
  message: string
}

const showDebug = ref(false)
const logs = ref<LogItem[]>([])
const debugEnabled = ref(false)

// 从 localStorage 读取调试开关状态
const loadDebugState = () => {
  const value = localStorage.getItem('enableDebugPanel')
  console.log('[DebugPanel] Loading debug state:', value)
  debugEnabled.value = value === 'true'
  console.log('[DebugPanel] Debug enabled:', debugEnabled.value)
}

// 捕获 console 日志
onMounted(() => {
  loadDebugState()

  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn

  console.log = (...args: any[]) => {
    addLog('log', args.join(' '))
    originalLog.apply(console, args)
  }

  console.error = (...args: any[]) => {
    addLog('error', args.join(' '))
    originalError.apply(console, args)
  }

  console.warn = (...args: any[]) => {
    addLog('warn', args.join(' '))
    originalWarn.apply(console, args)
  }
})

const addLog = (type: string, message: string) => {
  const now = new Date()
  const time = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`
  logs.value.unshift({ time, type, message })
  // 只保留最近 50 条
  if (logs.value.length > 50) {
    logs.value = logs.value.slice(0, 50)
  }
}

const clearLogs = () => {
  logs.value = []
}
</script>

<style scoped>
.debug-panel {
  position: fixed;
  bottom: 80px;
  left: 10px;
  right: 10px;
  max-height: 50vh;
  background: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #333;
  color: #fff;
  font-size: 14px;
}

.debug-actions {
  display: flex;
  gap: 8px;
}

.debug-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-size: 12px;
  font-family: monospace;
}

.debug-line {
  margin-bottom: 4px;
  word-break: break-all;
}

.debug-time {
  color: #888;
  margin-right: 8px;
}

.debug-type {
  margin-right: 8px;
  padding: 0 4px;
  border-radius: 2px;
  font-size: 10px;
}

.debug-type.log {
  background: #2196f3;
  color: #fff;
}

.debug-type.error {
  background: #f44336;
  color: #fff;
}

.debug-type.warn {
  background: #ff9800;
  color: #fff;
}

.debug-message {
  color: #fff;
}

.debug-toggle {
  position: fixed;
  bottom: 100px;
  right: 10px;
  z-index: 9999;
  opacity: 0.9;
}
</style>
