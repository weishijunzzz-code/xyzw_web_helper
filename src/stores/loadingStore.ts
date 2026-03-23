import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface LoadingTask {
  id: string
  message: string
  progress?: number
  startTime: number
}

export const useLoadingStore = defineStore('loading', () => {
  // State
  const isGlobalLoading = ref(false)
  const globalMessage = ref('加载中...')
  const globalProgress = ref<number | undefined>(undefined)
  const loadingTasks = ref<Map<string, LoadingTask>>(new Map())
  const loadingHistory = ref<Array<{ message: string; duration: number; timestamp: number }>>([])

  // Getters
  const hasActiveTasks = computed(() => loadingTasks.value.size > 0)
  const activeTaskCount = computed(() => loadingTasks.value.size)
  const currentTask = computed(() => {
    const tasks = Array.from(loadingTasks.value.values())
    return tasks[tasks.length - 1]
  })
  const overallProgress = computed(() => {
    if (loadingTasks.value.size === 0) return undefined
    const tasks = Array.from(loadingTasks.value.values())
    const tasksWithProgress = tasks.filter(t => t.progress !== undefined)
    if (tasksWithProgress.length === 0) return undefined
    const totalProgress = tasksWithProgress.reduce((sum, t) => sum + (t.progress || 0), 0)
    return Math.round(totalProgress / tasksWithProgress.length)
  })

  // Actions
  const startLoading = (message: string = '加载中...') => {
    isGlobalLoading.value = true
    globalMessage.value = message
    globalProgress.value = undefined
  }

  const stopLoading = () => {
    isGlobalLoading.value = false
    globalMessage.value = '加载中...'
    globalProgress.value = undefined
  }

  const updateProgress = (progress: number) => {
    globalProgress.value = Math.max(0, Math.min(100, progress))
  }

  const updateMessage = (message: string) => {
    globalMessage.value = message
  }

  const addTask = (id: string, message: string): LoadingTask => {
    const task: LoadingTask = {
      id,
      message,
      startTime: Date.now()
    }
    loadingTasks.value.set(id, task)
    return task
  }

  const updateTaskProgress = (id: string, progress: number) => {
    const task = loadingTasks.value.get(id)
    if (task) {
      task.progress = Math.max(0, Math.min(100, progress))
      loadingTasks.value.set(id, task)
    }
  }

  const updateTaskMessage = (id: string, message: string) => {
    const task = loadingTasks.value.get(id)
    if (task) {
      task.message = message
      loadingTasks.value.set(id, task)
    }
  }

  const removeTask = (id: string) => {
    const task = loadingTasks.value.get(id)
    if (task) {
      const duration = Date.now() - task.startTime
      loadingHistory.value.unshift({
        message: task.message,
        duration,
        timestamp: Date.now()
      })
      // 只保留最近20条历史
      if (loadingHistory.value.length > 20) {
        loadingHistory.value = loadingHistory.value.slice(0, 20)
      }
      loadingTasks.value.delete(id)
    }
  }

  const clearAllTasks = () => {
    loadingTasks.value.clear()
  }

  const clearHistory = () => {
    loadingHistory.value = []
  }

  // 便捷方法：带自动清理的任务
  const runTask = async <T>(
    id: string,
    message: string,
    taskFn: (updateProgress: (p: number) => void, updateMessage: (m: string) => void) => Promise<T>
  ): Promise<T> => {
    addTask(id, message)
    try {
      const result = await taskFn(
        (p) => updateTaskProgress(id, p),
        (m) => updateTaskMessage(id, m)
      )
      return result
    } finally {
      removeTask(id)
    }
  }

  return {
    // State
    isGlobalLoading,
    globalMessage,
    globalProgress,
    loadingTasks,
    loadingHistory,
    // Getters
    hasActiveTasks,
    activeTaskCount,
    currentTask,
    overallProgress,
    // Actions
    startLoading,
    stopLoading,
    updateProgress,
    updateMessage,
    addTask,
    updateTaskProgress,
    updateTaskMessage,
    removeTask,
    clearAllTasks,
    clearHistory,
    runTask
  }
})
