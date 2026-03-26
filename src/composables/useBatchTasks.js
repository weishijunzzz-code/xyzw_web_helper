import { ref, computed } from 'vue'
import { useTokenStore } from '@/stores/tokenStore'

/**
 * 批量任务核心逻辑
 * 管理任务执行状态、Token选择、任务调度
 */
export function useBatchTasks() {
  const tokenStore = useTokenStore()
  
  // 核心状态
  const selectedTokens = ref([])
  const tokenStatus = ref({}) // { tokenId: 'waiting' | 'running' | 'completed' | 'failed' }
  const isRunning = ref(false)
  const shouldStop = ref(false)
  
  // 计算属性
  const tokens = computed(() => tokenStore.gameTokens)
  
  const sortedTokens = computed(() => {
    const tokenList = tokens.value || []
    return [...tokenList].sort((a, b) => {
      // 排序逻辑...
      return 0
    })
  })
  
  // 方法
  const startBatch = async (taskFunction) => {
    if (selectedTokens.value.length === 0) return
    
    isRunning.value = true
    shouldStop.value = false
    
    // 重置状态
    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = 'waiting'
    })
    
    try {
      await taskFunction()
    } finally {
      isRunning.value = false
    }
  }
  
  const stopBatch = () => {
    shouldStop.value = true
  }
  
  const resetStatus = () => {
    tokenStatus.value = {}
    isRunning.value = false
    shouldStop.value = false
  }
  
  const updateTokenStatus = (tokenId, status) => {
    tokenStatus.value[tokenId] = status
  }
  
  return {
    // 状态
    selectedTokens,
    tokenStatus,
    isRunning,
    shouldStop,
    tokens,
    sortedTokens,
    // 方法
    startBatch,
    stopBatch,
    resetStatus,
    updateTokenStatus,
  }
}

export default useBatchTasks
