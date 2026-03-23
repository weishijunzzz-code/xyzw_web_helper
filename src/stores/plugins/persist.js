// Pinia 持久化插件
export function createPersistPlugin(options = {}) {
  const {
    key = 'pinia',
    paths = null, // 指定要持久化的 store
    beforeRestore = null,
    afterRestore = null
  } = options

  return ({ store }) => {
    const storeKey = `${key}_${store.$id}`

    // 恢复状态
    const restoreState = () => {
      try {
        const saved = localStorage.getItem(storeKey)
        if (saved) {
          const state = JSON.parse(saved)
          
          if (beforeRestore) {
            beforeRestore(store, state)
          }
          
          store.$patch(state)
          
          if (afterRestore) {
            afterRestore(store, state)
          }
        }
      } catch (error) {
        console.error(`恢复 store "${store.$id}" 失败:`, error)
      }
    }

    // 保存状态
    const saveState = () => {
      try {
        const state = store.$state
        localStorage.setItem(storeKey, JSON.stringify(state))
      } catch (error) {
        console.error(`保存 store "${store.$id}" 失败:`, error)
      }
    }

    // 初始化恢复
    restoreState()

    // 订阅状态变化
    store.$subscribe((mutation, state) => {
      saveState()
    })
  }
}

// 选择性持久化
export function createSelectivePersist(options = {}) {
  const {
    key = 'pinia',
    include = [], // 包含的 store
    exclude = [], // 排除的 store
    pick = {}, // 每个 store 选择特定字段 { storeId: ['field1', 'field2'] }
    beforeRestore = null,
    afterRestore = null
  } = options

  return ({ store }) => {
    // 检查是否应该持久化这个 store
    const shouldPersist = () => {
      if (include.length > 0 && !include.includes(store.$id)) {
        return false
      }
      if (exclude.includes(store.$id)) {
        return false
      }
      return true
    }

    if (!shouldPersist()) return

    const storeKey = `${key}_${store.$id}`

    // 恢复状态
    const restoreState = () => {
      try {
        const saved = localStorage.getItem(storeKey)
        if (saved) {
          let state = JSON.parse(saved)
          
          // 只恢复选定的字段
          if (pick[store.$id]) {
            const pickedState = {}
            pick[store.$id].forEach(field => {
              if (field in state) {
                pickedState[field] = state[field]
              }
            })
            state = pickedState
          }
          
          if (beforeRestore) {
            beforeRestore(store, state)
          }
          
          store.$patch(state)
          
          if (afterRestore) {
            afterRestore(store, state)
          }
        }
      } catch (error) {
        console.error(`恢复 store "${store.$id}" 失败:`, error)
      }
    }

    // 保存状态
    const saveState = () => {
      try {
        let state = store.$state
        
        // 只保存选定的字段
        if (pick[store.$id]) {
          const pickedState = {}
          pick[store.$id].forEach(field => {
            if (field in state) {
              pickedState[field] = state[field]
            }
          })
          state = pickedState
        }
        
        localStorage.setItem(storeKey, JSON.stringify(state))
      } catch (error) {
        console.error(`保存 store "${store.$id}" 失败:`, error)
      }
    }

    // 初始化恢复
    restoreState()

    // 订阅状态变化
    store.$subscribe((mutation, state) => {
      saveState()
    })
  }
}

// 会话级持久化（页面关闭后清除）
export function createSessionPersist(options = {}) {
  const {
    key = 'pinia_session',
    include = []
  } = options

  return ({ store }) => {
    if (include.length > 0 && !include.includes(store.$id)) {
      return
    }

    const storeKey = `${key}_${store.$id}`

    // 恢复状态
    const restoreState = () => {
      try {
        const saved = sessionStorage.getItem(storeKey)
        if (saved) {
          const state = JSON.parse(saved)
          store.$patch(state)
        }
      } catch (error) {
        console.error(`恢复 session store "${store.$id}" 失败:`, error)
      }
    }

    // 保存状态
    const saveState = () => {
      try {
        sessionStorage.setItem(storeKey, JSON.stringify(store.$state))
      } catch (error) {
        console.error(`保存 session store "${store.$id}" 失败:`, error)
      }
    }

    // 初始化恢复
    restoreState()

    // 订阅状态变化
    store.$subscribe((mutation, state) => {
      saveState()
    })
  }
}
