import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNotificationStore } from '@/stores/notificationStore'

export interface AnomalyConfig {
  tokenExpiryThreshold: number // Token过期预警阈值（小时）
  connectionTimeout: number // 连接超时阈值（毫秒）
  taskFailureThreshold: number // 任务失败阈值（连续次数）
  performanceThreshold: number // 性能阈值（毫秒）
}

export interface AnomalyEvent {
  id: string
  type: 'token_expiry' | 'connection_lost' | 'task_failure' | 'performance_degradation' | 'resource_shortage'
  severity: 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
  data?: any
  resolved: boolean
}

export interface Recommendation {
  id: string
  type: 'task' | 'token' | 'performance' | 'resource'
  title: string
  description: string
  action: string
  priority: 'low' | 'medium' | 'high'
  timestamp: string
}

const defaultConfig: AnomalyConfig = {
  tokenExpiryThreshold: 24,
  connectionTimeout: 10000,
  taskFailureThreshold: 3,
  performanceThreshold: 5000
}

export function useSmartAssistant(config: Partial<AnomalyConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config }
  const notificationStore = useNotificationStore()
  
  // 异常事件列表
  const anomalies = ref<AnomalyEvent[]>([])
  
  // 推荐列表
  const recommendations = ref<Recommendation[]>([])
  
  // 检测状态
  const isMonitoring = ref(false)
  let monitorInterval: number | null = null
  
  // 未解决的异常
  const unresolvedAnomalies = computed(() => 
    anomalies.value.filter(a => !a.resolved)
  )
  
  // 严重异常
  const criticalAnomalies = computed(() => 
    anomalies.value.filter(a => a.severity === 'critical' && !a.resolved)
  )
  
  // 生成唯一ID
  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // 添加异常事件
  const addAnomaly = (event: Omit<AnomalyEvent, 'id' | 'timestamp' | 'resolved'>) => {
    const anomaly: AnomalyEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date().toISOString(),
      resolved: false
    }
    
    anomalies.value.unshift(anomaly)
    
    // 限制历史记录数量
    if (anomalies.value.length > 100) {
      anomalies.value = anomalies.value.slice(0, 100)
    }
    
    // 发送通知
    if (event.severity === 'critical') {
      notificationStore.triggerNotification('task_failed', {
        taskId: anomaly.id,
        taskName: event.type,
        message: event.message
      })
    }
    
    return anomaly
  }
  
  // 解决异常
  const resolveAnomaly = (id: string) => {
    const anomaly = anomalies.value.find(a => a.id === id)
    if (anomaly) {
      anomaly.resolved = true
    }
  }
  
  // 添加推荐
  const addRecommendation = (rec: Omit<Recommendation, 'id' | 'timestamp'>) => {
    const recommendation: Recommendation = {
      ...rec,
      id: generateId(),
      timestamp: new Date().toISOString()
    }
    
    recommendations.value.unshift(recommendation)
    
    // 限制数量
    if (recommendations.value.length > 50) {
      recommendations.value = recommendations.value.slice(0, 50)
    }
    
    return recommendation
  }
  
  // 移除推荐
  const removeRecommendation = (id: string) => {
    const index = recommendations.value.findIndex(r => r.id === id)
    if (index > -1) {
      recommendations.value.splice(index, 1)
    }
  }
  
  // 检测Token过期风险
  const checkTokenExpiry = (tokens: Array<{ id: string; name: string; lastUsed?: string; importMethod?: string }>) => {
    const now = new Date()
    const threshold = finalConfig.tokenExpiryThreshold * 60 * 60 * 1000 // 转换为毫秒
    
    tokens.forEach(token => {
      // URL和bin导入的Token不会过期
      if (token.importMethod === 'url' || token.importMethod === 'bin' || token.importMethod === 'wxQrcode') {
        return
      }
      
      const lastUsed = token.lastUsed ? new Date(token.lastUsed) : now
      const timeSinceLastUsed = now.getTime() - lastUsed.getTime()
      
      if (timeSinceLastUsed > threshold) {
        const hoursRemaining = Math.max(0, 24 - (timeSinceLastUsed / (60 * 60 * 1000)))
        
        addAnomaly({
          type: 'token_expiry',
          severity: hoursRemaining < 2 ? 'critical' : 'warning',
          message: `Token "${token.name}" 即将过期，建议及时刷新`,
          data: { tokenId: token.id, hoursRemaining }
        })
        
        addRecommendation({
          type: 'token',
          title: 'Token即将过期',
          description: `Token "${token.name}" 已接近24小时使用期限，建议刷新以保持连接`,
          action: '前往Token管理页面刷新',
          priority: hoursRemaining < 2 ? 'high' : 'medium'
        })
      }
    })
  }
  
  // 检测连接异常
  const checkConnectionHealth = (connections: Record<string, { status: string; lastError?: { timestamp: string } }>) => {
    Object.entries(connections).forEach(([tokenId, conn]) => {
      if (conn.status === 'error' && conn.lastError) {
        const errorTime = new Date(conn.lastError.timestamp)
        const timeSinceError = Date.now() - errorTime.getTime()
        
        // 如果错误发生在最近5分钟内
        if (timeSinceError < 5 * 60 * 1000) {
          addAnomaly({
            type: 'connection_lost',
            severity: 'warning',
            message: `Token连接异常，可能需要刷新Token`,
            data: { tokenId, error: conn.lastError }
          })
        }
      }
    })
  }
  
  // 检测任务执行异常
  const checkTaskHealth = (tasks: Array<{ id: string; name: string; status: string; runCount?: { todayFailed?: number } }>) => {
    tasks.forEach(task => {
      const failureCount = task.runCount?.todayFailed || 0
      
      if (failureCount >= finalConfig.taskFailureThreshold) {
        addAnomaly({
          type: 'task_failure',
          severity: 'critical',
          message: `任务 "${task.name}" 连续失败${failureCount}次，建议检查配置`,
          data: { taskId: task.id, failureCount }
        })
        
        addRecommendation({
          type: 'task',
          title: '任务执行异常',
          description: `任务 "${task.name}" 连续多次执行失败，可能需要检查关联Token或任务配置`,
          action: '查看任务详情',
          priority: 'high'
        })
      }
    })
  }
  
  // 生成智能推荐
  const generateRecommendations = (context: {
    tokensCount: number
    activeTasksCount: number
    completedTasksToday: number
    failedTasksToday: number
  }) => {
    const newRecommendations: Omit<Recommendation, 'id' | 'timestamp'>[] = []
    
    // 根据失败率推荐
    const totalTasks = context.completedTasksToday + context.failedTasksToday
    if (totalTasks > 0) {
      const failureRate = context.failedTasksToday / totalTasks
      if (failureRate > 0.3) {
        newRecommendations.push({
          type: 'performance',
          title: '任务失败率较高',
          description: `今日任务失败率达到 ${(failureRate * 100).toFixed(1)}%，建议检查网络连接或Token状态`,
          action: '查看执行日志',
          priority: 'high'
        })
      }
    }
    
    // 根据Token数量推荐
    if (context.tokensCount === 0) {
      newRecommendations.push({
        type: 'token',
        title: '添加游戏Token',
        description: '您还没有添加任何Token，添加Token后即可开始使用各项功能',
        action: '前往Token管理',
        priority: 'high'
      })
    }
    
    // 根据任务数量推荐
    if (context.activeTasksCount === 0 && context.tokensCount > 0) {
      newRecommendations.push({
        type: 'task',
        title: '创建定时任务',
        description: '您可以创建定时任务来自动执行日常操作，节省手动操作时间',
        action: '创建定时任务',
        priority: 'medium'
      })
    }
    
    // 添加推荐
    newRecommendations.forEach(rec => addRecommendation(rec))
    
    return newRecommendations
  }
  
  // 开始监控
  const startMonitoring = (getState: () => {
    tokens: any[]
    connections: any
    tasks: any[]
    stats: any
  }) => {
    if (isMonitoring.value) return
    
    isMonitoring.value = true
    
    // 立即执行一次检测
    const state = getState()
    checkTokenExpiry(state.tokens)
    checkConnectionHealth(state.connections)
    checkTaskHealth(state.tasks)
    generateRecommendations(state.stats)
    
    // 定期检测
    monitorInterval = window.setInterval(() => {
      const currentState = getState()
      checkTokenExpiry(currentState.tokens)
      checkConnectionHealth(currentState.connections)
      checkTaskHealth(currentState.tasks)
    }, 60000) // 每分钟检测一次
    
    console.log('[SmartAssistant] 智能监控已启动')
  }
  
  // 停止监控
  const stopMonitoring = () => {
    if (monitorInterval) {
      clearInterval(monitorInterval)
      monitorInterval = null
    }
    isMonitoring.value = false
    console.log('[SmartAssistant] 智能监控已停止')
  }
  
  // 清理历史记录
  const clearHistory = () => {
    anomalies.value = []
    recommendations.value = []
  }
  
  onUnmounted(() => {
    stopMonitoring()
  })
  
  return {
    anomalies,
    recommendations,
    unresolvedAnomalies,
    criticalAnomalies,
    isMonitoring,
    addAnomaly,
    resolveAnomaly,
    addRecommendation,
    removeRecommendation,
    checkTokenExpiry,
    checkConnectionHealth,
    checkTaskHealth,
    generateRecommendations,
    startMonitoring,
    stopMonitoring,
    clearHistory
  }
}

export default useSmartAssistant
