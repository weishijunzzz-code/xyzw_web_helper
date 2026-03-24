import { ref, computed } from 'vue';
import { useTokenStore, gameTokens, tokenGroups } from '@/stores/tokenStore';

/**
 * 批量任务状态管理
 */
export function useBatchTasks() {
  const tokenStore = useTokenStore();

  // 核心状态
  const selectedTokens = ref([]);
  const tokenStatus = ref({}); // { tokenId: 'waiting' | 'running' | 'completed' | 'failed' }
  const isRunning = ref(false);
  const shouldStop = ref(false);
  const executionLogs = ref([]);

  // 计算属性
  const completedCount = computed(() => {
    return Object.values(tokenStatus.value).filter(s => s === 'completed').length;
  });

  const failedCount = computed(() => {
    return Object.values(tokenStatus.value).filter(s => s === 'failed').length;
  });

  const progress = computed(() => {
    if (selectedTokens.value.length === 0) return 0;
    return Math.round((completedCount.value + failedCount.value) / selectedTokens.value.length * 100);
  });

  // 方法
  const startBatch = async (taskConfigs) => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;
    tokenStatus.value = {};
    executionLogs.value = [];

    for (const tokenId of selectedTokens.value) {
      if (shouldStop.value) break;

      tokenStatus.value[tokenId] = 'running';

      try {
        // 执行任务逻辑
        await executeTasksForToken(tokenId, taskConfigs);
        tokenStatus.value[tokenId] = 'completed';
      } catch (error) {
        tokenStatus.value[tokenId] = 'failed';
        executionLogs.value.push({
          tokenId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    isRunning.value = false;
  };

  const stopBatch = () => {
    shouldStop.value = true;
  };

  const executeTasksForToken = async (tokenId, taskConfigs) => {
    // 实际任务执行逻辑
    // 这里需要根据具体任务类型实现
    console.log(`Executing tasks for token ${tokenId}`, taskConfigs);
  };

  const resetStatus = () => {
    tokenStatus.value = {};
    executionLogs.value = [];
    isRunning.value = false;
    shouldStop.value = false;
  };

  return {
    selectedTokens,
    tokenStatus,
    isRunning,
    shouldStop,
    executionLogs,
    completedCount,
    failedCount,
    progress,
    startBatch,
    stopBatch,
    resetStatus,
  };
}

/**
 * Token排序管理
 */
export function useTokenSort() {
  const savedSortConfig = localStorage.getItem('tokenSortConfig');
  const sortConfig = ref(
    savedSortConfig
      ? JSON.parse(savedSortConfig)
      : {
          field: 'createdAt',
          direction: 'asc',
        }
  );

  const toggleSort = (field) => {
    if (sortConfig.value.field === field) {
      sortConfig.value.direction = sortConfig.value.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortConfig.value.field = field;
      sortConfig.value.direction = 'asc';
    }
    localStorage.setItem('tokenSortConfig', JSON.stringify(sortConfig.value));
  };

  const getSortIcon = (field) => {
    if (sortConfig.value.field !== field) return null;
    return sortConfig.value.direction === 'asc' ? '↑' : '↓';
  };

  const sortedTokens = computed(() => {
    return [...gameTokens.value].sort((tokenA, tokenB) => {
      let valueA, valueB;

      switch (sortConfig.value.field) {
        case 'name':
          valueA = tokenA.name?.toLowerCase() || '';
          valueB = tokenB.name?.toLowerCase() || '';
          break;
        case 'server':
          valueA = tokenA.server?.toLowerCase() || '';
          valueB = tokenB.server?.toLowerCase() || '';
          break;
        case 'createdAt':
          valueA = new Date(tokenA.createdAt || 0).getTime();
          valueB = new Date(tokenB.createdAt || 0).getTime();
          break;
        case 'lastUsed':
          valueA = new Date(tokenA.lastUsed || 0).getTime();
          valueB = new Date(tokenB.lastUsed || 0).getTime();
          break;
        default:
          valueA = tokenA.name?.toLowerCase() || '';
          valueB = tokenB.name?.toLowerCase() || '';
      }

      if (valueA < valueB) {
        return sortConfig.value.direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortConfig.value.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  });

  return {
    sortConfig,
    sortedTokens,
    toggleSort,
    getSortIcon,
  };
}

/**
 * Token分组选择管理
 */
export function useTokenGroups() {
  const tokenStore = useTokenStore();
  const selectedGroups = ref([]);

  const isGroupSelected = (groupId) => {
    return selectedGroups.value.includes(groupId);
  };

  const toggleGroupSelection = (groupId) => {
    const index = selectedGroups.value.indexOf(groupId);
    if (index > -1) {
      selectedGroups.value.splice(index, 1);
    } else {
      selectedGroups.value.push(groupId);
    }
  };

  const clearAllGroupSelection = () => {
    selectedGroups.value = [];
  };

  const getValidGroupTokenIds = (groupId) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (!group) return [];
    const validTokenIds = gameTokens.value.map((t) => t.id);
    return group.tokenIds.filter((id) => validTokenIds.includes(id));
  };

  const selectedTokensFromGroups = computed(() => {
    const tokenIds = new Set();
    selectedGroups.value.forEach((groupId) => {
      const ids = getValidGroupTokenIds(groupId);
      ids.forEach((id) => tokenIds.add(id));
    });
    return Array.from(tokenIds);
  });

  return {
    selectedGroups,
    isGroupSelected,
    toggleGroupSelection,
    clearAllGroupSelection,
    getValidGroupTokenIds,
    selectedTokensFromGroups,
  };
}
