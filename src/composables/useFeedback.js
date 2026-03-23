import { useMessage, useNotification, useDialog } from 'naive-ui'

// 全局反馈组合式函数
export function useFeedback() {
  const message = useMessage()
  const notification = useNotification()
  const dialog = useDialog()

  // 成功提示
  const success = (content, options = {}) => {
    const { duration = 2000, closable = true } = options
    return message.success(content, { duration, closable })
  }

  // 错误提示
  const error = (content, options = {}) => {
    const { duration = 3000, closable = true } = options
    return message.error(content, { duration, closable })
  }

  // 警告提示
  const warning = (content, options = {}) => {
    const { duration = 2500, closable = true } = options
    return message.warning(content, { duration, closable })
  }

  // 信息提示
  const info = (content, options = {}) => {
    const { duration = 2000, closable = true } = options
    return message.info(content, { duration, closable })
  }

  // 加载提示
  const loading = (content = '加载中...') => {
    return message.loading(content, { duration: 0 })
  }

  // 通知
  const notify = (type, options) => {
    const { title, content, duration = 4500, placement = 'top-right' } = options
    return notification[type]({
      title,
      content,
      duration,
      placement
    })
  }

  // 确认对话框
  const confirm = (options) => {
    const {
      title = '确认',
      content,
      positiveText = '确认',
      negativeText = '取消',
      onPositiveClick,
      onNegativeClick
    } = options

    return dialog.warning({
      title,
      content,
      positiveText,
      negativeText,
      onPositiveClick,
      onNegativeClick
    })
  }

  // 成功操作反馈（带动画）
  const operationSuccess = (messageText, description) => {
    if (description) {
      notify('success', {
        title: messageText,
        content: description
      })
    } else {
      success(messageText)
    }
  }

  // 复制成功反馈
  const copySuccess = (text = '内容') => {
    success(`${text}已复制到剪贴板`)
  }

  // 保存成功反馈
  const saveSuccess = () => {
    success('保存成功')
  }

  // 删除确认
  const deleteConfirm = (itemName = '该项', onConfirm) => {
    return confirm({
      title: '确认删除',
      content: `确定要删除${itemName}吗？此操作不可撤销。`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: () => {
        onConfirm?.()
        success('删除成功')
      }
    })
  }

  // 批量操作反馈
  const batchOperation = async (items, operationFn, operationName = '操作') => {
    const loadingMsg = loading(`正在${operationName}...`)
    
    try {
      const results = await Promise.allSettled(items.map(operationFn))
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      
      loadingMsg.destroy()
      
      if (failed === 0) {
        success(`${operationName}成功，共 ${succeeded} 项`)
      } else if (succeeded === 0) {
        error(`${operationName}失败，共 ${failed} 项`)
      } else {
        warning(`${operationName}完成，成功 ${succeeded} 项，失败 ${failed} 项`)
      }
      
      return results
    } catch (err) {
      loadingMsg.destroy()
      error(`${operationName}失败: ${err.message}`)
      throw err
    }
  }

  return {
    success,
    error,
    warning,
    info,
    loading,
    notify,
    confirm,
    operationSuccess,
    copySuccess,
    saveSuccess,
    deleteConfirm,
    batchOperation
  }
}
