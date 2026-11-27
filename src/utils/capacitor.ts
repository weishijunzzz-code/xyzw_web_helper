import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'
import { Preferences } from '@capacitor/preferences'
import { Toast } from '@capacitor/toast'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Network } from '@capacitor/network'
import { Device } from '@capacitor/device'

// 检查是否在原生应用中运行
export const isNativePlatform = () => Capacitor.isNativePlatform()

// 检查平台
export const getPlatform = () => Capacitor.getPlatform() // 'ios' | 'android' | 'web'

// 检查是否在线
export const isOnline = async () => {
  const status = await Network.getStatus()
  return status.connected
}

// 初始化 Capacitor
export const initCapacitor = async () => {
  if (!isNativePlatform()) {
    console.log('[Capacitor] Running in web mode')
    return
  }

  console.log('[Capacitor] Running in native mode:', getPlatform())

  try {
    if (getPlatform() === 'ios') {
      await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
    }

    // 隐藏启动屏（延迟一点确保页面渲染完成）
    setTimeout(() => {
      SplashScreen.hide()
    }, 1500)

    // 监听应用状态
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App state changed. Is active?', isActive)
    })

    // 监听网络状态
    Network.addListener('networkStatusChange', (status) => {
      console.log('[Capacitor] Network status changed:', status.connected ? 'online' : 'offline')
    })

    console.log('[Capacitor] Initialization completed')
  } catch (error) {
    console.error('[Capacitor] Initialization error:', error)
  }
}

// 原生存储（替代 localStorage）
export const nativeStorage = {
  async get<T = any>(key: string): Promise<T | null> {
    if (isNativePlatform()) {
      const { value } = await Preferences.get({ key })
      return value ? JSON.parse(value) : null
    }
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  },

  async set(key: string, value: any): Promise<void> {
    if (isNativePlatform()) {
      await Preferences.set({ key, value: JSON.stringify(value) })
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  },

  async remove(key: string): Promise<void> {
    if (isNativePlatform()) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  },

  async clear(): Promise<void> {
    if (isNativePlatform()) {
      await Preferences.clear()
    } else {
      localStorage.clear()
    }
  },
}

// 显示原生 Toast
export const showToast = async (message: string, duration: 'short' | 'long' = 'short') => {
  if (isNativePlatform()) {
    await Toast.show({ text: message, duration })
  } else {
    // Web 端使用 console 或自定义 toast
    console.log('[Toast]', message)
  }
}

// 触觉反馈
export const hapticFeedback = async (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (isNativePlatform()) {
    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }
    await Haptics.impact({ style: styleMap[type] })
  }
}

// 振动
export const vibrate = async (duration: number = 300) => {
  if (isNativePlatform()) {
    await Haptics.vibrate({ duration })
  }
}

// 获取设备信息
export const getDeviceInfo = async () => {
  if (isNativePlatform()) {
    return await Device.getInfo()
  }
  return {
    platform: 'web',
    model: 'browser',
    osVersion: 'unknown',
    appVersion: 'web',
  }
}

// 退出应用
export const exitApp = async () => {
  if (isNativePlatform() && getPlatform() === 'android') {
    await App.exitApp()
  }
}

// 最小化应用
export const minimizeApp = async () => {
  if (isNativePlatform()) {
    await App.minimizeApp()
  }
}

// 原生 HTTP 请求（绕过 CORS）
export const nativeHttp = {
  async get(url: string, headers: Record<string, string> = {}) {
    if (isNativePlatform()) {
      try {
        console.log('CapacitorHttp GET:', url)
        const response = await CapacitorHttp.get({
          url,
          headers,
          responseType: 'text',
        })
        console.log('CapacitorHttp GET response:', response.status)
        // 确保返回的数据是字符串
        let data = response.data
        if (typeof data !== 'string') {
          data = JSON.stringify(data)
        }
        return {
          status: response.status,
          data,
        }
      } catch (error: any) {
        console.error('CapacitorHttp GET error:', error)
        throw new Error(error.message || 'HTTP GET failed')
      }
    }
    // Web 端使用 fetch
    const response = await fetch(url, { headers })
    return {
      status: response.status,
      data: await response.text(),
    }
  },

  async post(url: string, data: any, headers: Record<string, string> = {}, responseType: 'text' | 'arraybuffer' = 'text') {
    const isBinaryData = data instanceof Uint8Array || data instanceof ArrayBuffer
    
    if (isNativePlatform()) {
      try {
        console.log('nativeHttp POST:', url, 'responseType:', responseType, 'isBinary:', isBinaryData)
        
        // 对于二进制数据，直接使用 CapacitorHttp 发送
        if (responseType === 'arraybuffer' && isBinaryData) {
          console.log('Using CapacitorHttp for binary data')
          
          // 将 Uint8Array/ArrayBuffer 转换为普通数组，CapacitorHttp 可以处理
          let postData: number[]
          if (data instanceof Uint8Array) {
            postData = Array.from(data)
          } else {
            postData = Array.from(new Uint8Array(data))
          }
          
          console.log('Post data length:', postData.length)
          console.log('First 10 bytes:', postData.slice(0, 10))
          
          const response = await CapacitorHttp.post({
            url,
            data: postData,
            headers: {
              'Content-Type': 'application/octet-stream',
              ...headers
            },
            responseType: 'arraybuffer'
          })
          
          console.log('CapacitorHttp response status:', response.status)
          console.log('CapacitorHttp response data type:', typeof response.data)
          
          // 处理响应数据
          if (response.data) {
            // 如果返回的是 base64 字符串，解码为 ArrayBuffer
            if (typeof response.data === 'string') {
              console.log('Response is base64 string, length:', response.data.length)
              try {
                const binaryString = atob(response.data)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                console.log('Decoded ArrayBuffer length:', bytes.buffer.byteLength)
                console.log('First 10 bytes:', Array.from(bytes.slice(0, 10)))
                return {
                  status: response.status,
                  data: bytes.buffer
                }
              } catch (e) {
                console.error('Base64 decode error:', e)
                throw e
              }
            }
            
            // 如果返回的是 ArrayBuffer
            if (response.data instanceof ArrayBuffer) {
              console.log('Response is ArrayBuffer, length:', response.data.byteLength)
              const u8 = new Uint8Array(response.data)
              console.log('First 10 bytes:', Array.from(u8.slice(0, 10)))
              return {
                status: response.status,
                data: response.data
              }
            }
            
            // 如果返回的是数组
            if (Array.isArray(response.data)) {
              console.log('Response is array, length:', response.data.length)
              const bytes = new Uint8Array(response.data)
              console.log('First 10 bytes:', Array.from(bytes.slice(0, 10)))
              return {
                status: response.status,
                data: bytes.buffer
              }
            }
          }
          
          throw new Error('Unexpected response data type: ' + typeof response.data)
        }
        
        // 对于 text 响应类型，使用 CapacitorHttp
        console.log('Using CapacitorHttp for text response')
        const response = await CapacitorHttp.post({
          url,
          data,
          headers: { 
            'Content-Type': isBinaryData ? 'application/octet-stream' : 'application/json', 
            ...headers 
          },
          responseType: 'text',
        })
        console.log('CapacitorHttp POST response:', response.status)
        
        // 默认返回字符串
        let responseData = response.data
        if (typeof responseData !== 'string') {
          responseData = JSON.stringify(responseData)
        }
        return {
          status: response.status,
          data: responseData,
        }
      } catch (error: any) {
        console.error('CapacitorHttp POST error:', error)
        throw new Error(error.message || 'HTTP POST failed')
      }
    }
    
    // Web 端使用 fetch
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': isBinaryData ? 'application/octet-stream' : 'application/json', 
        ...headers 
      },
      body: isBinaryData ? data : JSON.stringify(data),
    })
    
    if (responseType === 'arraybuffer') {
      return {
        status: response.status,
        data: await response.arrayBuffer(),
      }
    }
    
    return {
      status: response.status,
      data: await response.text(),
    }
  },
}

// 读取本地静态文件（用于 APK 中的资源文件）
export const readLocalFile = async (path: string): Promise<string | null> => {
  if (isNativePlatform()) {
    try {
      // 在原生平台使用 fetch 读取本地文件
      // Capacitor 的 WebView 中本地文件通过 https://localhost/ 访问
      const response = await fetch(`/${path}`)
      if (response.ok) {
        return await response.text()
      }
    } catch (error) {
      console.error('Read local file error:', error)
    }
  }
  return null
}

export default {
  isNativePlatform,
  getPlatform,
  isOnline,
  initCapacitor,
  nativeStorage,
  showToast,
  hapticFeedback,
  vibrate,
  getDeviceInfo,
  exitApp,
  minimizeApp,
  nativeHttp,
  readLocalFile,
}
