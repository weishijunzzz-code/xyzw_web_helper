import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { isNativePlatform } from './capacitor'

/**
 * 检查并应用热更新
 */
export async function checkForUpdates(): Promise<void> {
  if (!isNativePlatform()) {
    return
  }

  try {
    console.log('[UpdateChecker] 检查更新...')
    
    // 检查是否有可用更新
    const result = await CapacitorUpdater.download({
      url: 'https://api.capgo.app/updates',
    })

    if (result) {
      console.log('[UpdateChecker] 发现新版本:', result)
      
      // 设置更新
      await CapacitorUpdater.set({ id: result.id })
      
      console.log('[UpdateChecker] 更新已应用，下次启动生效')
    } else {
      console.log('[UpdateChecker] 当前已是最新版本')
    }
  } catch (error) {
    console.error('[UpdateChecker] 检查更新失败:', error)
  }
}

/**
 * 立即应用更新（需要重启应用）
 */
export async function applyUpdate(): Promise<void> {
  if (!isNativePlatform()) {
    return
  }

  try {
    await CapacitorUpdater.reload()
  } catch (error) {
    console.error('[UpdateChecker] 应用更新失败:', error)
  }
}

/**
 * 在应用启动时检查更新
 */
export function initUpdateChecker(): void {
  if (!isNativePlatform()) {
    return
  }

  // 应用启动时检查更新
  checkForUpdates()

  // 每 30 分钟检查一次更新
  setInterval(() => {
    checkForUpdates()
  }, 30 * 60 * 1000)
}
