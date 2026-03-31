import { ref, onMounted, onUnmounted } from 'vue'

export interface PWAStatus {
  isInstalled: boolean
  isOffline: boolean
  updateAvailable: boolean
  serviceWorkerState: 'unknown' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant'
}

const status = ref<PWAStatus>({
  isInstalled: false,
  isOffline: false,
  updateAvailable: false,
  serviceWorkerState: 'unknown'
})

let registration: ServiceWorkerRegistration | null = null
let updateCheckInterval: number | null = null

export function usePWA() {
  // 注册 Service Worker
  const register = async () => {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] 浏览器不支持 Service Worker')
      return false
    }

    try {
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })

      console.log('[PWA] Service Worker 注册成功:', registration.scope)

      // 监听状态变化
      registration.addEventListener('updatefound', () => {
        const newWorker = registration?.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            status.value.serviceWorkerState = newWorker.state as any
            
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本可用
              status.value.updateAvailable = true
              console.log('[PWA] 发现新版本')
            }
          })
        }
      })

      // 检查是否已安装
      checkInstalled()

      // 定期检查更新
      startUpdateCheck()

      // 监听消息
      navigator.serviceWorker.addEventListener('message', handleSWMessage)

      return true
    } catch (error) {
      console.error('[PWA] Service Worker 注册失败:', error)
      return false
    }
  }

  // 检查是否已安装
  const checkInstalled = () => {
    // 检查是否以独立模式运行（已安装）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
    
    status.value.isInstalled = isStandalone
    return isStandalone
  }

  // 监听离线状态
  const handleOnline = () => {
    status.value.isOffline = false
    console.log('[PWA] 网络已连接')
  }

  const handleOffline = () => {
    status.value.isOffline = true
    console.log('[PWA] 网络已断开')
  }

  // 处理 Service Worker 消息
  const handleSWMessage = (event: MessageEvent) => {
    const { type, data } = event.data
    
    switch (type) {
      case 'CACHE_STATUS':
        console.log('[PWA] 缓存状态:', data)
        break
      case 'CHECK_SCHEDULED_TASKS':
        // 触发任务检查
        window.dispatchEvent(new CustomEvent('check-scheduled-tasks'))
        break
    }
  }

  // 更新应用
  const updateApp = async () => {
    if (!registration?.waiting) {
      return false
    }

    // 发送消息让新的 Service Worker 立即激活
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    
    // 等待新的 Service Worker 激活后刷新页面
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    return true
  }

  // 检查更新
  const checkUpdate = async () => {
    if (!registration) return false
    
    try {
      await registration.update()
      return true
    } catch (error) {
      console.error('[PWA] 检查更新失败:', error)
      return false
    }
  }

  // 开始定期检查更新
  const startUpdateCheck = () => {
    if (updateCheckInterval) return
    
    // 每30分钟检查一次更新
    updateCheckInterval = window.setInterval(() => {
      checkUpdate()
    }, 30 * 60 * 1000)
  }

  // 停止更新检查
  const stopUpdateCheck = () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval)
      updateCheckInterval = null
    }
  }

  // 请求通知权限
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      console.log('[PWA] 浏览器不支持通知')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    } catch (error) {
      console.error('[PWA] 请求通知权限失败:', error)
      return false
    }
  }

  // 显示本地通知
  const showNotification = (title: string, options?: NotificationOptions) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return false
    }

    try {
      new Notification(title, {
        icon: '/icons/xiaoyugan.png',
        badge: '/icons/xiaoyugan.png',
        ...options
      })
      return true
    } catch (error) {
      console.error('[PWA] 显示通知失败:', error)
      return false
    }
  }

  // 后台同步
  const sync = async (tag: string) => {
    if (!('sync' in registration!)) {
      console.log('[PWA] 浏览器不支持后台同步')
      return false
    }

    try {
      await (registration as any).sync.register(tag)
      return true
    } catch (error) {
      console.error('[PWA] 注册后台同步失败:', error)
      return false
    }
  }

  // 添加到主屏幕提示
  const installPrompt = ref<any>(null)

  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault()
    installPrompt.value = e
    console.log('[PWA] 可以添加到主屏幕')
  }

  const promptInstall = async () => {
    if (!installPrompt.value) {
      return false
    }

    installPrompt.value.prompt()
    const result = await installPrompt.value.userChoice
    
    if (result.outcome === 'accepted') {
      console.log('[PWA] 用户接受安装')
      status.value.isInstalled = true
    } else {
      console.log('[PWA] 用户拒绝安装')
    }

    installPrompt.value = null
    return result.outcome === 'accepted'
  }

  // 清理缓存
  const clearCache = async () => {
    if (!registration?.active) return false

    try {
      registration.active.postMessage({ type: 'CLEAR_CACHE' })
      return true
    } catch (error) {
      console.error('[PWA] 清理缓存失败:', error)
      return false
    }
  }

  // 获取缓存状态
  const getCacheStatus = async () => {
    if (!registration?.active) return null

    try {
      return new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = (event) => {
          resolve(event.data)
        }
        registration!.active!.postMessage(
          { type: 'GET_CACHE_STATUS' },
          [channel.port2]
        )
      })
    } catch (error) {
      console.error('[PWA] 获取缓存状态失败:', error)
      return null
    }
  }

  onMounted(() => {
    // 监听网络状态
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // 监听安装提示
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    
    // 初始网络状态
    status.value.isOffline = !navigator.onLine
    
    // 注册 Service Worker
    register()
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    stopUpdateCheck()
  })

  return {
    status,
    installPrompt,
    register,
    updateApp,
    checkUpdate,
    requestNotificationPermission,
    showNotification,
    sync,
    promptInstall,
    clearCache,
    getCacheStatus
  }
}

export default usePWA
