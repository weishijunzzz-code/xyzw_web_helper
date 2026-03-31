/**
 * API 配置管理器
 * 统一管理所有 API 的域名和请求头配置
 * 确保网页端和移动端都能正常工作
 */

import { isNativePlatform } from './capacitor'

// API 域名配置
export const API_DOMAINS = {
  // 微信登录相关
  WEIXIN: 'https://open.weixin.qq.com',
  WEIXIN_LONG: 'https://long.open.weixin.qq.com',
  // Hortor 游戏平台
  HORTOR: 'https://comb-platform.hortorgames.com',
}

// 请求头配置
export const API_HEADERS = {
  WEIXIN: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://open.weixin.qq.com/',
  },
  WEIXIN_LONG: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN',
    'Accept': '*/*',
    'Referer': 'https://open.weixin.qq.com/',
  },
  HORTOR: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36',
    'Accept': '*/*',
    'Host': 'comb-platform.hortorgames.com',
    'Connection': 'keep-alive',
    'Content-Type': 'text/plain; charset=utf-8',
    'Origin': 'https://open.weixin.qq.com',
    'Referer': 'https://open.weixin.qq.com/',
  },
}

/**
 * 获取完整的 API URL
 * @param path API 路径
 * @param type API 类型
 * @returns 完整的 URL
 */
export function getApiUrl(path: string, type: 'weixin' | 'weixin-long' | 'hortor' = 'hortor'): string {
  // 网页端使用相对路径（通过代理）
  if (!isNativePlatform()) {
    return path
  }

  // 移动端使用完整域名
  const domain = API_DOMAINS[type.toUpperCase() as keyof typeof API_DOMAINS]
  if (!domain) {
    console.error(`Unknown API type: ${type}`)
    return path
  }

  // 移除路径前缀
  const cleanPath = path.replace(/^\/api\/(weixin|weixin-long|hortor)/, '')
  return `${domain}${cleanPath}`
}

/**
 * 获取 API 请求头
 * @param type API 类型
 * @returns 请求头对象
 */
export function getApiHeaders(type: 'weixin' | 'weixin-long' | 'hortor' = 'hortor'): Record<string, string> {
  // 网页端不需要特殊请求头（代理会添加）
  if (!isNativePlatform()) {
    return {}
  }

  // 移动端使用对应的请求头
  const headers = API_HEADERS[type.toUpperCase() as keyof typeof API_HEADERS]
  if (!headers) {
    console.error(`Unknown API type: ${type}`)
    return {}
  }

  return { ...headers }
}

/**
 * 统一的 HTTP GET 请求
 * @param path API 路径
 * @param type API 类型
 * @returns 响应数据
 */
export async function apiGet(path: string, type: 'weixin' | 'weixin-long' | 'hortor' = 'hortor') {
  const { nativeHttp } = await import('./capacitor')
  
  const url = getApiUrl(path, type)
  const headers = getApiHeaders(type)
  
  console.log(`[API] GET ${type}: ${url}`)
  
  return nativeHttp.get(url, headers)
}

/**
 * 统一的 HTTP POST 请求
 * @param path API 路径
 * @param data 请求数据
 * @param type API 类型
 * @returns 响应数据
 */
export async function apiPost(path: string, data: any, type: 'weixin' | 'weixin-long' | 'hortor' = 'hortor') {
  const { nativeHttp } = await import('./capacitor')
  
  const url = getApiUrl(path, type)
  const headers = getApiHeaders(type)
  
  console.log(`[API] POST ${type}: ${url}`)
  
  return nativeHttp.post(url, data, headers)
}
