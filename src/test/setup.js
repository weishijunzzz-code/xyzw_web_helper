import { config } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { vi } from 'vitest'

// 全局配置
config.global.plugins = [createPinia()]

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock IntersectionObserver
class IntersectionObserverMock {
  constructor(callback) {
    this.callback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  value: IntersectionObserverMock
})

// Mock ResizeObserver
class ResizeObserverMock {
  constructor(callback) {
    this.callback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverMock
})

// Mock Notification
Object.defineProperty(window, 'Notification', {
  value: vi.fn().mockImplementation(() => ({
    close: vi.fn()
  }))
})
Object.defineProperty(window.Notification, 'permission', {
  value: 'default',
  writable: true
})
Object.defineProperty(window.Notification, 'requestPermission', {
  value: vi.fn().mockResolvedValue('granted')
})

// Mock navigator.serviceWorker
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn().mockResolvedValue({
      scope: '/',
      active: null,
      installing: null,
      waiting: null,
      addEventListener: vi.fn()
    }),
    ready: Promise.resolve({
      active: {}
    }),
    controller: null,
    addEventListener: vi.fn()
  }
})

// Mock console methods in test environment
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}
