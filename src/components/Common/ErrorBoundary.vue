<template>
  <div class="error-boundary">
    <slot v-if="!hasError" />
    <div v-else class="error-fallback">
      <div class="error-content">
        <div class="error-icon">
          <n-icon size="64">
            <AlertCircle />
          </n-icon>
        </div>
        <h3 class="error-title">出错了</h3>
        <p class="error-message">{{ errorMessage }}</p>
        <div class="error-actions">
          <n-button type="primary" @click="handleRetry">
            <template #icon>
              <n-icon><Refresh /></n-icon>
            </template>
            重试
          </n-button>
          <n-button @click="handleReset">
            <template #icon>
              <n-icon><Home /></n-icon>
            </template>
            返回首页
          </n-button>
        </div>
        <n-collapse v-if="errorDetails" class="error-details">
          <n-collapse-item title="错误详情">
            <pre class="error-stack">{{ errorDetails }}</pre>
          </n-collapse-item>
        </n-collapse>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { AlertCircle, Refresh, Home } from '@vicons/ionicons5'

const router = useRouter()
const message = useMessage()

const hasError = ref(false)
const errorMessage = ref('')
const errorDetails = ref('')

// 处理错误
const handleError = (error, instance, info) => {
  hasError.value = true
  errorMessage.value = error.message || '发生未知错误'
  errorDetails.value = `${error.stack}\n\n组件信息: ${info}`
  
  // 上报错误（可以接入 Sentry 等错误监控服务）
  console.error('Error Boundary caught:', error, instance, info)
  
  // 显示错误提示
  message.error(`错误: ${errorMessage.value}`)
  
  return false // 阻止错误继续传播
}

// 重试
const handleRetry = () => {
  hasError.value = false
  errorMessage.value = ''
  errorDetails.value = ''
}

// 返回首页
const handleReset = () => {
  hasError.value = false
  errorMessage.value = ''
  errorDetails.value = ''
  router.push('/')
}

// 全局错误监听
const handleGlobalError = (event) => {
  console.error('Global error:', event.error)
  message.error(`全局错误: ${event.error?.message || '未知错误'}`)
}

const handleUnhandledRejection = (event) => {
  console.error('Unhandled rejection:', event.reason)
  message.error(`未处理的 Promise: ${event.reason?.message || '未知错误'}`)
}

onErrorCaptured(handleError)

onMounted(() => {
  window.addEventListener('error', handleGlobalError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
})

onUnmounted(() => {
  window.removeEventListener('error', handleGlobalError)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
})
</script>

<style scoped lang="scss">
.error-boundary {
  width: 100%;
  height: 100%;
}

.error-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: var(--spacing-xl);
}

.error-content {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  color: var(--error-color);
  margin-bottom: var(--spacing-lg);
}

.error-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.error-message {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xl);
}

.error-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
  margin-bottom: var(--spacing-xl);
}

.error-details {
  text-align: left;
  
  .error-stack {
    background: var(--bg-secondary);
    padding: var(--spacing-md);
    border-radius: var(--border-radius-medium);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
  }
}

// 深色模式适配
:global(.dark) .error-stack,
:global([data-theme="dark"]) .error-stack {
  background: var(--bg-tertiary);
}
</style>
