import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * 表单草稿自动保存
 * @param {string} key - 草稿存储key
 * @param {Object} formData - 表单数据对象
 * @param {Object} options - 配置选项
 */
export function useFormDraft(key, formData, options = {}) {
  const {
    debounce = 1000,        // 防抖时间
    maxAge = 7 * 24 * 60 * 60 * 1000,  // 草稿最大保存时间（7天）
    onRestore = null,       // 恢复回调
    onSave = null,          // 保存回调
    excludeFields = []      // 不保存的字段
  } = options

  const hasDraft = ref(false)
  const lastSaved = ref(null)
  const isRestored = ref(false)

  const storageKey = `form_draft_${key}`
  const metaKey = `form_draft_meta_${key}`

  // 过滤字段
  const filterFields = (data) => {
    const filtered = {}
    Object.keys(data).forEach(k => {
      if (!excludeFields.includes(k)) {
        filtered[k] = data[k]
      }
    })
    return filtered
  }

  // 保存草稿
  const saveDraft = useDebounceFn(() => {
    try {
      const data = typeof formData === 'function' ? formData() : formData
      const filtered = filterFields(data)
      
      localStorage.setItem(storageKey, JSON.stringify(filtered))
      localStorage.setItem(metaKey, JSON.stringify({
        timestamp: Date.now(),
        key
      }))
      
      lastSaved.value = new Date()
      hasDraft.value = true
      
      onSave?.(filtered)
    } catch (error) {
      console.error('保存草稿失败:', error)
    }
  }, debounce)

  // 恢复草稿
  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(storageKey)
      const meta = localStorage.getItem(metaKey)
      
      if (!saved || !meta) {
        hasDraft.value = false
        return null
      }

      const metaData = JSON.parse(meta)
      
      // 检查是否过期
      if (Date.now() - metaData.timestamp > maxAge) {
        clearDraft()
        return null
      }

      const draft = JSON.parse(saved)
      hasDraft.value = true
      isRestored.value = true
      
      onRestore?.(draft)
      
      return draft
    } catch (error) {
      console.error('恢复草稿失败:', error)
      return null
    }
  }

  // 清除草稿
  const clearDraft = () => {
    try {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(metaKey)
      hasDraft.value = false
      lastSaved.value = null
    } catch (error) {
      console.error('清除草稿失败:', error)
    }
  }

  // 监听表单变化自动保存
  const stopWatch = watch(
    () => typeof formData === 'function' ? formData() : formData,
    () => {
      if (isRestored.value) {
        saveDraft()
      }
    },
    { deep: true }
  )

  // 页面关闭前保存
  const handleBeforeUnload = () => {
    saveDraft.flush()
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    stopWatch()
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  return {
    hasDraft,
    lastSaved,
    isRestored,
    saveDraft,
    restoreDraft,
    clearDraft
  }
}

/**
 * 多表单草稿管理
 */
export function useMultiFormDraft() {
  const drafts = ref([])

  // 获取所有草稿
  const getAllDrafts = () => {
    const result = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('form_draft_meta_')) {
        try {
          const meta = JSON.parse(localStorage.getItem(key))
          const dataKey = key.replace('_meta_', '_')
          const data = localStorage.getItem(dataKey)
          
          result.push({
            key: meta.key,
            timestamp: meta.timestamp,
            age: Date.now() - meta.timestamp,
            hasData: !!data
          })
        } catch (error) {
          console.error('读取草稿元数据失败:', error)
        }
      }
    }
    drafts.value = result.sort((a, b) => b.timestamp - a.timestamp)
    return drafts.value
  }

  // 清除所有草稿
  const clearAllDrafts = () => {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('form_draft_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    drafts.value = []
  }

  // 清除过期草稿
  const clearExpiredDrafts = (maxAge = 7 * 24 * 60 * 60 * 1000) => {
    const now = Date.now()
    const keysToRemove = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('form_draft_meta_')) {
        try {
          const meta = JSON.parse(localStorage.getItem(key))
          if (now - meta.timestamp > maxAge) {
            keysToRemove.push(key)
            keysToRemove.push(key.replace('_meta_', '_'))
          }
        } catch (error) {
          console.error('检查草稿过期失败:', error)
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
    getAllDrafts()
  }

  return {
    drafts,
    getAllDrafts,
    clearAllDrafts,
    clearExpiredDrafts
  }
}
