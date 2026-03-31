import { ref, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog, useNotification } from 'naive-ui'
import type { ComponentInternalInstance } from 'vue'

export interface ErrorInfo {
  id: string
  message: string
  stack?: string
  context?: Record<string, any>
  timestamp: string
  type: 'vue' | 'js' | 'promise' | 'api' | 'websocket'
  resolved: boolean
  component?: string
}

export interface ErrorHandlerOptions {
  maxHistory?: number
  reportUrl?: string
  silent?: boolean
  onError?: (error: ErrorInfo) => void
}

const errorHistory = ref<ErrorInfo[]>([])
const isInitialized = ref(false)

export function useGlobalErrorHandler(options: ErrorHandlerOptions = {}) {
  const { maxHistory = 50, silent = false, onError } = options
  
  const message = useMessage()
  const dialog = useDialog()
  const notification = useNotification()

  // 生成唯一ID
  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // 添加错误到历史
  const addError = (error: Error | string, type: ErrorInfo['type'] = 'js', context?: Record<string, any>) => {
    const errorInfo: ErrorInfo = {
      id: generateId(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
      type,
      resolved: false,
      component: context?.component
    }

    errorHistory.value.unshift(errorInfo)
    
    // 限制历史记录数量
    if (errorHistory.value.length > maxHistory) {
      errorHistory.value = errorHistory.value.slice(0, maxHistory)
    }

    // 调用回调
    onError?.(errorInfo)

    return errorInfo
  }

  // 显示错误通知
  const showError = (error: Error | string, options: { 
    type?: 'message' | 'notification' | 'dialog'
    duration?: number 
    title?: string
  } = {}) => {
    if (silent) return

    const { type = 'message', duration = 5000, title = '错误' } = options
    const messageText = error instanceof Error ? error.message : String(error)

    switch (type) {
      case 'notification':
        notification.error({
          title,
          content: messageText,
          duration
        })
        break
      case 'dialog':
        dialog.error({
          title,
          content: messageText,
          positiveText: '确定'
        })
        break
      default:
        message.error(messageText, { duration })
    }
  }

  // 带重试的异步操作
  const withRetry = async <T>(
    fn: () => Promise<T>,
    options: {
      retries?: number
      delay?: number
      backoff?: number
      onRetry?: (attempt: number, error: Error) => void
    } = {}
  ): Promise<T> => {
    const { retries = 3, delay = 1000, backoff = 2, onRetry } = options
    let lastError: Error

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === retries) {
          throw lastError
        }

        const waitTime = delay * Math.pow(backoff, attempt)
        onRetry?.(attempt + 1, lastError)
        
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    throw lastError!
  }

  // 带超时的异步操作
  const withTimeout = async <T>(
    promise: Promise<T>,
    timeout: number = 5000,
    timeoutMessage: string = '操作超时'
  ): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeout)
    })

    return Promise.race([promise, timeoutPromise])
  }

  // 安全执行函数
  const safeExecute = async <T>(
    fn: () => Promise<T>,
    options: {
      errorMessage?: string
      showError?: boolean
      context?: Record<string, any>
    } = {}
  ): Promise<T | undefined> => {
    const { errorMessage = '操作失败', showError: shouldShowError = true, context } = options

    try {
      return await fn()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const enhancedError = new Error(`${errorMessage}: ${err.message}`)
      
      addError(enhancedError, 'js', context)
      
      if (shouldShowError) {
        showError(enhancedError)
      }
      
      return undefined
    }
  }

  // 批量执行
  const batchExecute = async <T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    options: {
      continueOnError?: boolean
      onProgress?: (progress: { current: number; total: number; percentage: number }) => void
    } = {}
  ): Promise<{ results: (R | undefined)[]; errors: Array<{ index: number; error: Error }> }> => {
    const { continueOnError = true, onProgress } = options
    const results: (R | undefined)[] = []
    const errors: Array<{ index: number; error: Error }> = []

    for (let i = 0; i < items.length; i++) {
      try {
        const result = await fn(items[i], i)
        results.push(result)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        errors.push({ index: i, error: err })
        results.push(undefined)
        
        if (!continueOnError) {
          throw err
        }
      }

      onProgress?.({
        current: i + 1,
        total: items.length,
        percentage: Math.round(((i + 1) / items.length) * 100)
      })
    }

    return { results, errors }
  }

  // Vue 错误处理
  const onErrorCaptured = (err: unknown, instance: ComponentInternalInstance | null, info: string) => {
    const error = err instanceof Error ? err : new Error(String(err))
    addError(error, 'vue', {
      component: instance?.type?.name || 'Unknown',
      info,
      props: instance?.props
    })
    
    console.error('[Vue Error]', err, info)
    return false
  }

  // 全局错误处理
  const handleGlobalError = (event: ErrorEvent) => {
    addError(event.error || new Error(event.message), 'js', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
    
    console.error('[Global Error]', event)
  }

  // Promise 错误处理
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason))
    
    addError(error, 'promise', {
      reason: event.reason
    })
    
    console.error('[Unhandled Promise Rejection]', event.reason)
  }

  // 清理错误历史
  const clearHistory = () => {
    errorHistory.value = []
  }

  // 标记错误为已解决
  const resolveError = (errorId: string) => {
    const error = errorHistory.value.find(e => e.id === errorId)
    if (error) {
      error.resolved = true
    }
  }

  // 获取未解决的错误
  const getUnresolvedErrors = () => {
    return errorHistory.value.filter(e => !e.resolved)
  }

  // 初始化全局错误处理
  const init = () => {
    if (isInitialized.value) return
    
    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    isInitialized.value = true
    console.log('[GlobalErrorHandler] 已初始化')
  }

  // 清理
  const destroy = () => {
    window.removeEventListener('error', handleGlobalError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    isInitialized.value = false
  }

  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    destroy()
  })

  return {
    errorHistory,
    addError,
    showError,
    withRetry,
    withTimeout,
    safeExecute,
    batchExecute,
    onErrorCaptured,
    clearHistory,
    resolveError,
    getUnresolvedErrors,
    init,
    destroy
  }
}

// 全局错误处理实例（用于非组件环境）
let globalInstance: ReturnType<typeof useGlobalErrorHandler> | null = null

export const getGlobalErrorHandler = () => {
  if (!globalInstance) {
    globalInstance = useGlobalErrorHandler()
    globalInstance.init()
  }
  return globalInstance
}

export default useGlobalErrorHandler
