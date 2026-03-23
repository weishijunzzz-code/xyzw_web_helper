import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * 增强版 WebSocket 组合式函数
 * 支持自动重连、心跳检测、多标签同步
 */
export function useWebSocketEnhanced(url, options = {}) {
  const {
    protocols = [],
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    heartbeatInterval = 30000,
    heartbeatMessage = 'ping',
    onOpen = null,
    onMessage = null,
    onClose = null,
    onError = null,
    onReconnect = null
  } = options

  // 状态
  const ws = ref(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const reconnectAttempts = ref(0)
  const lastMessage = ref(null)
  const lastError = ref(null)

  // 定时器
  let reconnectTimer = null
  let heartbeatTimer = null
  let heartbeatTimeout = null

  // 计算属性
  const canReconnect = computed(() => {
    return autoReconnect && reconnectAttempts.value < maxReconnectAttempts
  })

  const connectionStatus = computed(() => {
    if (isConnected.value) return 'connected'
    if (isConnecting.value) return 'connecting'
    if (reconnectAttempts.value > 0) return 'reconnecting'
    return 'disconnected'
  })

  // 连接
  const connect = () => {
    if (isConnecting.value || isConnected.value) return

    isConnecting.value = true
    lastError.value = null

    try {
      ws.value = new WebSocket(url, protocols)

      ws.value.onopen = (event) => {
        isConnected.value = true
        isConnecting.value = false
        reconnectAttempts.value = 0
        
        // 开始心跳
        startHeartbeat()
        
        // 广播连接状态（多标签同步）
        broadcastStatus('connected')
        
        onOpen?.(event)
      }

      ws.value.onmessage = (event) => {
        // 处理心跳响应
        if (event.data === 'pong' || event.data === heartbeatMessage) {
          clearTimeout(heartbeatTimeout)
          return
        }

        lastMessage.value = event.data
        onMessage?.(event)
      }

      ws.value.onclose = (event) => {
        isConnected.value = false
        isConnecting.value = false
        
        // 停止心跳
        stopHeartbeat()
        
        // 广播连接状态
        broadcastStatus('disconnected')
        
        onClose?.(event)

        // 自动重连
        if (autoReconnect && !event.wasClean) {
          scheduleReconnect()
        }
      }

      ws.value.onerror = (error) => {
        lastError.value = error
        isConnecting.value = false
        onError?.(error)
      }
    } catch (error) {
      lastError.value = error
      isConnecting.value = false
      onError?.(error)
      
      if (autoReconnect) {
        scheduleReconnect()
      }
    }
  }

  // 断开连接
  const disconnect = () => {
    // 停止重连
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    
    // 停止心跳
    stopHeartbeat()
    
    // 关闭连接
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    
    isConnected.value = false
    isConnecting.value = false
  }

  // 发送消息
  const send = (data) => {
    if (!isConnected.value || !ws.value) {
      console.warn('WebSocket 未连接')
      return false
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      ws.value.send(message)
      return true
    } catch (error) {
      console.error('发送消息失败:', error)
      return false
    }
  }

  // 安排重连
  const scheduleReconnect = () => {
    if (reconnectTimer) return

    reconnectAttempts.value++
    
    if (reconnectAttempts.value > maxReconnectAttempts) {
      console.warn('达到最大重连次数')
      return
    }

    onReconnect?.(reconnectAttempts.value)

    // 指数退避
    const delay = Math.min(reconnectInterval * Math.pow(1.5, reconnectAttempts.value - 1), 30000)
    
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  // 开始心跳
  const startHeartbeat = () => {
    if (heartbeatTimer) return

    heartbeatTimer = setInterval(() => {
      if (!isConnected.value) return

      // 发送心跳
      send(heartbeatMessage)

      // 设置超时
      heartbeatTimeout = setTimeout(() => {
        console.warn('心跳超时，重新连接')
        disconnect()
        connect()
      }, 10000)
    }, heartbeatInterval)
  }

  // 停止心跳
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout)
      heartbeatTimeout = null
    }
  }

  // 广播状态（多标签同步）
  const broadcastStatus = (status) => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('websocket_status')
      channel.postMessage({
        status,
        url,
        timestamp: Date.now()
      })
      channel.close()
    }
  }

  // 监听其他标签页的状态
  const setupBroadcastListener = () => {
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('websocket_status')
    
    channel.onmessage = (event) => {
      const { status, url: messageUrl } = event.data
      
      // 只处理相同 URL 的消息
      if (messageUrl !== url) return

      if (status === 'connected' && !isConnected.value) {
        // 其他标签已连接，尝试连接
        connect()
      } else if (status === 'disconnected' && isConnected.value) {
        // 其他标签断开，保持连接（可选）
      }
    }

    return () => channel.close()
  }

  // 生命周期
  onMounted(() => {
    const cleanup = setupBroadcastListener()
    
    onUnmounted(() => {
      disconnect()
      cleanup?.()
    })
  })

  return {
    // 状态
    ws,
    isConnected,
    isConnecting,
    reconnectAttempts,
    lastMessage,
    lastError,
    connectionStatus,
    canReconnect,
    
    // 方法
    connect,
    disconnect,
    send
  }
}

/**
 * WebSocket 连接池
 * 管理多个 WebSocket 连接
 */
export function useWebSocketPool() {
  const connections = ref(new Map())

  const create = (id, url, options = {}) => {
    if (connections.value.has(id)) {
      console.warn(`WebSocket ${id} 已存在`)
      return connections.value.get(id)
    }

    const ws = useWebSocketEnhanced(url, options)
    connections.value.set(id, ws)
    
    // 自动连接
    ws.connect()
    
    return ws
  }

  const get = (id) => {
    return connections.value.get(id)
  }

  const remove = (id) => {
    const ws = connections.value.get(id)
    if (ws) {
      ws.disconnect()
      connections.value.delete(id)
    }
  }

  const removeAll = () => {
    connections.value.forEach(ws => ws.disconnect())
    connections.value.clear()
  }

  const getAll = () => {
    return Array.from(connections.value.entries()).map(([id, ws]) => ({
      id,
      ...ws
    }))
  }

  const getConnectedCount = () => {
    return Array.from(connections.value.values()).filter(ws => ws.isConnected.value).length
  }

  onUnmounted(() => {
    removeAll()
  })

  return {
    connections,
    create,
    get,
    remove,
    removeAll,
    getAll,
    getConnectedCount
  }
}
