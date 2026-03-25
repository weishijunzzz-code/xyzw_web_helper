import { ref, onErrorCaptured, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'

/**
 * 错误处理组合式函数
 * 提供全局错误捕获、重试机制、错误上报等功能
 */
export function useErrorHandler() {
  const message = useMessage()
  const dialog = useDialog()
  
  // 错误历史
  const errorHistory = ref([])
  const maxHistorySize = 50
  
  // 添加错误到历史
  const addError = (error, context = {}) => {
    const errorInfo = {
      id: Date.now().toString(36),
      message: error.message || '未知错误',
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      resolved: false
    }
    
    errorHistory.value.unshift(errorInfo)
    
    // 限制历史记录数量
    if (errorHistory.value.length > maxHistorySize) {
      errorHistory.value = errorHistory.value.slice(0, maxHistorySize)
    }
    
    return errorInfo
  }
  
  // 显示错误提示
  const showError = (error, options = {}) => {
    const { 
      silent = false, 
      duration = 5000,
      closable = true 
    } = options
    
    if (!silent) {
      message.error(error.message || '操作失败', { duration, closable })
    }
    
    // 记录到控制台
    console.error('[ErrorHandler]', error)
    
    // 添加到历史
    addError(error, options.context)
  }
  
  // 带重试的异步操作
  const withRetry = async (fn, options = {}) => {
    const {
      retries = 3,
      delay = 1000,
      backoff = 2,        // 退避倍数
      onRetry = null,     // 重试回调
      context = {}        // 错误上下文
    } = options
    
    let lastError
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        
        // 最后一次尝试，抛出错误
        if (attempt === retries) {
          throw error
        }
        
        // 计算延迟时间（指数退避）
        const waitTime = delay * Math.pow(backoff, attempt)
        
        // 调用重试回调
        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxRetries: retries,
            error,
            nextRetryDelay: waitTime
          })
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    throw lastError
  }
  
  // 带超时的异步操作
  const withTimeout = async (promise, timeout = 5000, context = {}) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`操作超时 (${timeout}ms)`))
      }, timeout)
    })
    
    try {
      return await Promise.race([promise, timeoutPromise])
    } catch (error) {
      addError(error, context)
      throw error
    }
  }
  
  // 确认对话框（带错误处理）
  const confirm = async (options) => {
    const {
      title = '确认操作',
      content = '确定要执行此操作吗？',
      positiveText = '确定',
      negativeText = '取消',
      type = 'warning'
    } = options
    
    return new Promise((resolve) => {
      dialog[type]({
        title,
        content,
        positiveText,
        negativeText,
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false)
      })
    })
  }
  
  // 安全执行（自动捕获错误）
  const safeExecute = async (fn, options = {}) => {
    const {
      errorMessage = '操作失败',
      showError: shouldShowError = true,
      context = {}
    } = options
    
    try {
      return await fn()
    } catch (error) {
      const enhancedError = new Error(error.message || errorMessage)
      enhancedError.originalError = error
      enhancedError.context = context
      
      if (shouldShowError) {
        showError(enhancedError, { context })
      }
      
      throw enhancedError
    }
  }
  
  // 批量操作（带进度和错误处理）
  const batchExecute = async (items, fn, options = {}) => {
    const {
      onProgress = null,
      continueOnError = true,
      errorCollector = []
    } = options
    
    const results = []
    const total = items.length
    
    for (let i = 0; i < total; i++) {
      try {
        const result = await fn(items[i], i)
        results.push({ success: true, data: result, index: i })
      } catch (error) {
        const errorInfo = { success: false, error, index: i, item: items[i] }
        errorCollector.push(errorInfo)
        results.push(errorInfo)
        
        if (!continueOnError) {
          throw error
        }
      }
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          percentage: Math.round(((i + 1) / total) * 100)
        })
      }
    }
    
    return {
      results,
      successCount: results.filter(r => r.success).length,
      failCount: results.filter(r => !r.success).length,
      errors: errorCollector
    }
  }
  
  // 清理错误历史
  const clearHistory = () => {
    errorHistory.value = []
  }
  
  // 标记错误为已解决
  const resolveError = (errorId) => {
    const error = errorHistory.value.find(e => e.id === errorId)
    if (error) {
      error.resolved = true
    }
  }
  
  // 全局错误捕获
  const setupGlobalErrorHandler = () => {
    const handleError = (event) => {
      addError(event.error || new Error(event.message), {
        type: 'global',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      })
    }
    
    const handleUnhandledRejection = (event) => {
      addError(event.reason || new Error('未处理的 Promise 拒绝'), {
        type: 'unhandledrejection'
      })
    }
    
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    // 返回清理函数
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }
  
  // Vue 错误捕获
  onErrorCaptured((error, instance, info) => {
    addError(error, {
      type: 'vue',
      component: instance?.$options?.name || 'Unknown',
      info
    })
    return false // 阻止错误继续传播
  })
  
  // 设置全局错误处理
  let cleanupGlobalHandler
  onMounted(() => {
    cleanupGlobalHandler = setupGlobalErrorHandler()
  })
  
  onUnmounted(() => {
    if (cleanupGlobalHandler) {
      cleanupGlobalHandler()
    }
  })
  
  return {
    errorHistory,
    showError,
    withRetry,
    withTimeout,
    confirm,
    safeExecute,
    batchExecute,
    clearHistory,
    resolveError
  }
}
