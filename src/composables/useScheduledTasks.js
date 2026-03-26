import { ref, computed, reactive } from 'vue'
import { useMessage } from 'naive-ui'
import { 
  validateCronExpression, 
  calculateNextExecutionTime,
  formatTimeDifference 
} from '@/utils/batch'

/**
 * 定时任务管理
 * 管理定时任务的增删改查、执行调度
 */
export function useScheduledTasks() {
  const message = useMessage()
  
  // 状态
  const scheduledTasks = ref([])
  const showTaskModal = ref(false)
  const showTasksModal = ref(false)
  const editingTask = ref(null)
  const executingTaskIds = ref([])
  
  // 任务表单
  const taskForm = reactive({
    name: '',
    selectedTasks: [],
    selectedTokens: [],
    cronExpression: '',
    enabled: true,
    runType: 'all', // 'all' | 'failed-only'
  })
  
  // 计算属性
  const shortestCountdownTask = computed(() => {
    if (scheduledTasks.value.length === 0) return null
    
    const enabledTasks = scheduledTasks.value.filter(t => t.enabled)
    if (enabledTasks.length === 0) return null
    
    // 找到最近要执行的任务
    let nearestTask = null
    let nearestTime = Infinity
    
    for (const task of enabledTasks) {
      const nextTime = calculateNextExecutionTime(task.cronExpression)
      if (nextTime && nextTime < nearestTime) {
        nearestTime = nextTime
        nearestTask = task
      }
    }
    
    if (!nearestTask) return null
    
    return {
      task: nearestTask,
      countdown: {
        formatted: formatTimeDifference(nearestTime)
      }
    }
  })
  
  // 方法
  const loadScheduledTasks = () => {
    const saved = localStorage.getItem('scheduledTasks')
    if (saved) {
      try {
        scheduledTasks.value = JSON.parse(saved)
      } catch (e) {
        console.error('加载定时任务失败:', e)
      }
    }
  }
  
  const saveScheduledTasks = () => {
    localStorage.setItem('scheduledTasks', JSON.stringify(scheduledTasks.value))
  }
  
  const openTaskModal = (task = null) => {
    if (task) {
      editingTask.value = task
      Object.assign(taskForm, task)
    } else {
      editingTask.value = null
      Object.assign(taskForm, {
        name: '',
        selectedTasks: [],
        selectedTokens: [],
        cronExpression: '',
        enabled: true,
        runType: 'all',
      })
    }
    showTaskModal.value = true
  }
  
  const saveTask = () => {
    if (!taskForm.name || taskForm.selectedTasks.length === 0) {
      message.warning('请填写任务名称并选择至少一个任务')
      return false
    }
    
    if (!validateCronExpression(taskForm.cronExpression)) {
      message.error('Cron 表达式格式不正确')
      return false
    }
    
    const taskData = {
      id: editingTask.value?.id || Date.now().toString(),
      ...taskForm,
      createdAt: editingTask.value?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    if (editingTask.value) {
      const index = scheduledTasks.value.findIndex(t => t.id === taskData.id)
      if (index > -1) {
        scheduledTasks.value[index] = taskData
      }
    } else {
      scheduledTasks.value.push(taskData)
    }
    
    saveScheduledTasks()
    showTaskModal.value = false
    message.success('任务保存成功')
    return true
  }
  
  const deleteTask = (taskId) => {
    const index = scheduledTasks.value.findIndex(t => t.id === taskId)
    if (index > -1) {
      scheduledTasks.value.splice(index, 1)
      saveScheduledTasks()
      message.success('任务删除成功')
    }
  }
  
  const toggleTaskEnabled = (taskId, enabled) => {
    const task = scheduledTasks.value.find(t => t.id === taskId)
    if (task) {
      task.enabled = enabled
      saveScheduledTasks()
    }
  }
  
  const exportConfig = () => {
    const config = {
      tasks: scheduledTasks.value,
      exportTime: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-tasks-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('配置导出成功')
  }
  
  const importConfig = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result)
        if (config.tasks && Array.isArray(config.tasks)) {
          scheduledTasks.value = config.tasks
          saveScheduledTasks()
          message.success('配置导入成功')
        } else {
          message.error('配置文件格式不正确')
        }
      } catch (err) {
        message.error('配置文件解析失败')
      }
    }
    reader.readAsText(file)
  }
  
  return {
    // 状态
    scheduledTasks,
    showTaskModal,
    showTasksModal,
    editingTask,
    executingTaskIds,
    taskForm,
    // 计算属性
    shortestCountdownTask,
    // 方法
    loadScheduledTasks,
    saveScheduledTasks,
    openTaskModal,
    saveTask,
    deleteTask,
    toggleTaskEnabled,
    exportConfig,
    importConfig,
  }
}

export default useScheduledTasks
