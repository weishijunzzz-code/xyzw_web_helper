import { ref, computed, onMounted, onUnmounted } from 'vue'
import { defineStore } from 'pinia'

// 离线状态管理
export const useOfflineStore = defineStore('offline', () => {
  const isOnline = ref(navigator.onLine)
  const lastSyncTime = ref(null)
  const pendingActions = ref([])
  const isSyncing = ref(false)

  // 监听网络状态
  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  const handleOnline = () => {
    isOnline.value = true
    // 自动同步
    syncPendingActions()
  }

  const handleOffline = () => {
    isOnline.value = false
  }

  // 添加待同步操作
  const addPendingAction = (action) => {
    pendingActions.value.push({
      id: Date.now(),
      ...action,
      timestamp: new Date()
    })
    // 保存到本地存储
    saveToLocalStorage()
  }

  // 同步待处理操作
  const syncPendingActions = async () => {
    if (isSyncing.value || pendingActions.value.length === 0) return

    isSyncing.value = true
    const failed = []

    for (const action of pendingActions.value) {
      try {
        await executeAction(action)
      } catch (error) {
        failed.push(action)
      }
    }

    pendingActions.value = failed
    lastSyncTime.value = new Date()
    isSyncing.value = false
    saveToLocalStorage()
  }

  // 执行操作
  const executeAction = async (action) => {
    // 根据 action 类型执行相应操作
    switch (action.type) {
      case 'api':
        // 调用 API
        break
      case 'update':
        // 更新数据
        break
      default:
        console.log('执行操作:', action)
    }
  }

  // 保存到本地存储
  const saveToLocalStorage = () => {
    localStorage.setItem('offline_pending_actions', JSON.stringify(pendingActions.value))
  }

  // 从本地存储加载
  const loadFromLocalStorage = () => {
    const saved = localStorage.getItem('offline_pending_actions')
    if (saved) {
      pendingActions.value = JSON.parse(saved)
    }
  }

  // 清除所有待处理操作
  const clearPending = () => {
    pendingActions.value = []
    saveToLocalStorage()
  }

  // 待处理数量
  const pendingCount = computed(() => pendingActions.value.length)

  return {
    isOnline,
    lastSyncTime,
    pendingActions,
    isSyncing,
    pendingCount,
    addPendingAction,
    syncPendingActions,
    clearPending,
    loadFromLocalStorage
  }
})

// 离线存储组合式函数
export function useOfflineStorage(key) {
  const data = ref(null)
  const isLoaded = ref(false)

  // 加载数据
  const load = () => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        data.value = JSON.parse(saved)
      }
      isLoaded.value = true
    } catch (error) {
      console.error('加载离线数据失败:', error)
    }
  }

  // 保存数据
  const save = (value) => {
    try {
      data.value = value
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('保存离线数据失败:', error)
    }
  }

  // 更新数据
  const update = (updater) => {
    const newValue = typeof updater === 'function' ? updater(data.value) : updater
    save(newValue)
  }

  // 清除数据
  const clear = () => {
    data.value = null
    localStorage.removeItem(key)
  }

  // 初始化加载
  onMounted(() => {
    load()
  })

  return {
    data,
    isLoaded,
    load,
    save,
    update,
    clear
  }
}
