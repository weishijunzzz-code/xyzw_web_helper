// 消息中心 Store
import { defineStore } from 'pinia'

import { computed, onMounted, ref } from 'vue'

export function useNotification() {
  const isSupported = ref(false)
  const permission = ref('default')
  const notifications = ref([])

  // 检查支持
  onMounted(() => {
    isSupported.value = 'Notification' in window
    if (isSupported.value) {
      permission.value = Notification.permission
    }
  })

  // 请求权限
  const requestPermission = async () => {
    if (!isSupported.value) return false

    try {
      const result = await Notification.requestPermission()
      permission.value = result
      return result === 'granted'
    } catch (error) {
      console.error('请求通知权限失败:', error)
      return false
    }
  }

  // 发送通知
  const send = (options) => {
    if (!isSupported.value || permission.value !== 'granted') {
      console.warn('通知功能未启用')
      return null
    }

    const {
      title,
      body = '',
      icon = '/icons/xiaoyugan.png',
      tag = '',
      data = {},
      onClick = null
    } = options

    const notification = new Notification(title, {
      body,
      icon,
      tag,
      data
    })

    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick(data)
        notification.close()
      }
    }

    // 添加到列表
    const notificationItem = {
      id: Date.now(),
      title,
      body,
      timestamp: new Date(),
      read: false,
      notification
    }
    notifications.value.unshift(notificationItem)

    // 自动移除
    notification.onclose = () => {
      const index = notifications.value.findIndex(n => n.id === notificationItem.id)
      if (index > -1) {
        notifications.value.splice(index, 1)
      }
    }

    return notification
  }

  // 便捷方法
  const success = (title, body) => send({ title, body })
  const error = (title, body) => send({ title, body })
  const warning = (title, body) => send({ title, body })
  const info = (title, body) => send({ title, body })

  // 清除所有
  const clearAll = () => {
    notifications.value.forEach(n => n.notification?.close())
    notifications.value = []
  }

  // 标记已读
  const markAsRead = (id) => {
    const notification = notifications.value.find(n => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  // 未读数量
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  return {
    isSupported,
    permission,
    notifications,
    unreadCount,
    requestPermission,
    send,
    success,
    error,
    warning,
    info,
    clearAll,
    markAsRead
  }
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref([])
  const maxHistory = 100

  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
  const unreadNotifications = computed(() => notifications.value.filter(n => !n.read))
  const allNotifications = computed(() => notifications.value)

  const add = (notification) => {
    const item = {
      id: Date.now() + Math.random(),
      title: notification.title || '',
      content: notification.content || notification.body || '',
      type: notification.type || 'info',
      timestamp: new Date(),
      read: false,
      persistent: notification.persistent || false,
      icon: notification.icon,
      link: notification.link
    }

    notifications.value.unshift(item)

    // 限制历史记录
    if (notifications.value.length > maxHistory) {
      notifications.value = notifications.value.slice(0, maxHistory)
    }

    return item
  }

  const markAsRead = (id) => {
    const notification = notifications.value.find(n => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  const markAllAsRead = () => {
    notifications.value.forEach(n => n.read = true)
  }

  const remove = (id) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  const clear = () => {
    notifications.value = []
  }

  // 快捷方法
  const success = (title, content) => add({ title, content, type: 'success' })
  const error = (title, content) => add({ title, content, type: 'error' })
  const warning = (title, content) => add({ title, content, type: 'warning' })
  const info = (title, content) => add({ title, content, type: 'info' })

  return {
    notifications,
    unreadCount,
    unreadNotifications,
    allNotifications,
    add,
    markAsRead,
    markAllAsRead,
    remove,
    clear,
    success,
    error,
    warning,
    info
  }
})
