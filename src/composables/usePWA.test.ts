import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePWA } from './usePWA'

// Mock window and navigator
declare global {
  interface Window {
    matchMedia: any
  }
}

describe('usePWA', () => {
  let pwa: ReturnType<typeof usePWA>

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Mock online status
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    if (pwa) {
      pwa.stopUpdateCheck()
    }
  })

  describe('status', () => {
    it('应该初始化状态', () => {
      pwa = usePWA()
      
      expect(pwa.status.value).toEqual({
        isInstalled: false,
        isOffline: false,
        updateAvailable: false,
        serviceWorkerState: 'unknown'
      })
    })

    it('应该检测离线状态', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true
      })
      
      pwa = usePWA()
      
      expect(pwa.status.value.isOffline).toBe(true)
    })
  })

  describe('register', () => {
    it('应该注册 Service Worker', async () => {
      pwa = usePWA()
      const result = await pwa.register()

      expect(result).toBe(true)
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    })

    it('应该在浏览器不支持时返回 false', async () => {
      const originalSW = navigator.serviceWorker
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        writable: true,
        configurable: true
      })

      pwa = usePWA()
      const result = await pwa.register()

      expect(result).toBe(false)

      // Restore
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalSW,
        writable: true,
        configurable: true
      })
    })
  })

  describe('requestNotificationPermission', () => {
    it('应该请求通知权限', async () => {
      pwa = usePWA()
      const result = await pwa.requestNotificationPermission()

      expect(result).toBe(true)
      expect(Notification.requestPermission).toHaveBeenCalled()
    })
  })

  describe('showNotification', () => {
    it('应该在权限允许时显示通知', () => {
      Object.defineProperty(window.Notification, 'permission', {
        value: 'granted',
        writable: true,
        configurable: true
      })

      pwa = usePWA()
      const result = pwa.showNotification('测试标题', { body: '测试内容' })

      expect(result).toBe(true)
      expect(Notification).toHaveBeenCalledWith('测试标题', expect.objectContaining({
        body: '测试内容',
        icon: '/icons/xiaoyugan.png'
      }))
    })

    it('应该在权限不允许时返回 false', () => {
      Object.defineProperty(window.Notification, 'permission', {
        value: 'denied',
        writable: true,
        configurable: true
      })

      pwa = usePWA()
      const result = pwa.showNotification('测试标题')

      expect(result).toBe(false)
    })
  })

  describe('checkInstalled', () => {
    it('应该检测是否已安装', () => {
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true })
      Object.defineProperty(window, 'matchMedia', {
        value: matchMediaMock,
        writable: true,
        configurable: true
      })

      pwa = usePWA()
      const result = pwa.checkInstalled()

      expect(result).toBe(true)
      expect(matchMediaMock).toHaveBeenCalledWith('(display-mode: standalone)')
    })
  })
})
