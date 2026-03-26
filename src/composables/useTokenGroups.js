import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'

/**
 * Token 分组管理
 * 管理 Token 分组的增删改查
 */
export function useTokenGroups() {
  const message = useMessage()
  
  // 状态
  const showGroupManageModal = ref(false)
  const showGroupSelectModal = ref(false)
  const selectedGroups = ref([])
  const newGroupName = ref('')
  const newGroupColor = ref('#1677ff')
  const newGroupSelectedTokens = ref([])
  const editingGroupId = ref(null)
  const editingGroupName = ref('')
  const editingGroupColor = ref('')
  
  // 预定义分组颜色
  const groupColors = [
    '#1677ff', '#52c41a', '#faad14', '#f5222d', 
    '#722ed1', '#13c2c2', '#eb2f96', '#fa541c'
  ]
  
  // 从 localStorage 加载分组
  const loadGroups = () => {
    const saved = localStorage.getItem('tokenGroups')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('加载分组失败:', e)
      }
    }
    return []
  }
  
  const groups = ref(loadGroups())
  
  // 计算属性
  const groupsWithCount = computed(() => {
    return groups.value.map(group => ({
      ...group,
      count: group.tokenIds?.length || 0
    }))
  })
  
  // 方法
  const saveGroups = () => {
    localStorage.setItem('tokenGroups', JSON.stringify(groups.value))
  }
  
  const createGroup = () => {
    if (!newGroupName.value.trim()) {
      message.warning('请输入分组名称')
      return false
    }
    
    const newGroup = {
      id: Date.now().toString(),
      name: newGroupName.value.trim(),
      color: newGroupColor.value,
      tokenIds: [...newGroupSelectedTokens.value],
      createdAt: new Date().toISOString(),
    }
    
    groups.value.push(newGroup)
    saveGroups()
    
    // 重置表单
    newGroupName.value = ''
    newGroupColor.value = '#1677ff'
    newGroupSelectedTokens.value = []
    
    message.success('分组创建成功')
    return true
  }
  
  const updateGroup = () => {
    if (!editingGroupName.value.trim()) {
      message.warning('请输入分组名称')
      return false
    }
    
    const group = groups.value.find(g => g.id === editingGroupId.value)
    if (group) {
      group.name = editingGroupName.value.trim()
      group.color = editingGroupColor.value
      saveGroups()
      message.success('分组更新成功')
      return true
    }
    return false
  }
  
  const deleteGroup = (groupId) => {
    const index = groups.value.findIndex(g => g.id === groupId)
    if (index > -1) {
      groups.value.splice(index, 1)
      saveGroups()
      message.success('分组删除成功')
    }
  }
  
  const addTokensToGroup = (groupId, tokenIds) => {
    const group = groups.value.find(g => g.id === groupId)
    if (group) {
      const newTokenIds = tokenIds.filter(id => !group.tokenIds.includes(id))
      group.tokenIds.push(...newTokenIds)
      saveGroups()
    }
  }
  
  const removeTokensFromGroup = (groupId, tokenIds) => {
    const group = groups.value.find(g => g.id === groupId)
    if (group) {
      group.tokenIds = group.tokenIds.filter(id => !tokenIds.includes(id))
      saveGroups()
    }
  }
  
  const getGroupById = (groupId) => {
    return groups.value.find(g => g.id === groupId)
  }
  
  const getGroupsByTokenId = (tokenId) => {
    return groups.value.filter(g => g.tokenIds.includes(tokenId))
  }
  
  const openEditModal = (group) => {
    editingGroupId.value = group.id
    editingGroupName.value = group.name
    editingGroupColor.value = group.color
    showGroupManageModal.value = true
  }
  
  return {
    // 状态
    groups,
    showGroupManageModal,
    showGroupSelectModal,
    selectedGroups,
    newGroupName,
    newGroupColor,
    newGroupSelectedTokens,
    editingGroupId,
    editingGroupName,
    editingGroupColor,
    groupColors,
    // 计算属性
    groupsWithCount,
    // 方法
    saveGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addTokensToGroup,
    removeTokensFromGroup,
    getGroupById,
    getGroupsByTokenId,
    openEditModal,
  }
}

export default useTokenGroups
