import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { historyDB } from '@/utils/indexedDB';

// 执行记录状态类型
export type ExecutionStatus = 'success' | 'failed' | 'running' | 'cancelled';

// 单个账号执行结果
export interface AccountExecutionResult {
  tokenId: string;
  tokenName: string;
  server?: string;
  status: ExecutionStatus;
  message: string;
  startTime: string;
  endTime?: string;
  duration?: number; // 执行耗时（毫秒）
}

// 任务执行记录
export interface TaskExecutionRecord {
  id: string;
  taskId: string;
  taskName: string;
  templateId: string;
  templateName?: string;
  cronExpression?: string;
  triggerType: 'manual' | 'scheduled' | 'auto'; // 手动触发、定时触发、自动触发
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  totalAccounts: number;
  successCount: number;
  failedCount: number;
  results: AccountExecutionResult[];
  errorMessage?: string;
  screenshot?: string; // 截图数据（可选）
}

// 历史记录统计
export interface HistoryStatistics {
  totalExecutions: number;
  todayExecutions: number;
  successRate: number;
  averageDuration: number;
  totalAccounts: number;
  successAccounts: number;
}

// 查询参数
export interface HistoryQueryParams {
  taskId?: string;
  status?: ExecutionStatus;
  triggerType?: 'manual' | 'scheduled' | 'auto';
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const useTaskHistoryStore = defineStore('taskHistory', () => {
  // State
  const records = ref<TaskExecutionRecord[]>([]);
  const isLoading = ref(false);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const totalCount = ref(0);
  const currentRecord = ref<TaskExecutionRecord | null>(null);

  // Getters
  const statistics = computed<HistoryStatistics>(() => {
    const today = new Date().toDateString();
    const todayRecords = records.value.filter(r => 
      new Date(r.startTime).toDateString() === today
    );
    
    const totalExecutions = records.value.length;
    const todayExecutions = todayRecords.length;
    
    const successRecords = records.value.filter(r => r.status === 'success');
    const successRate = totalExecutions > 0 
      ? Math.round((successRecords.length / totalExecutions) * 100) 
      : 0;
    
    const avgDuration = records.value.length > 0
      ? Math.round(records.value.reduce((sum, r) => sum + (r.duration || 0), 0) / records.value.length)
      : 0;
    
    const totalAccounts = records.value.reduce((sum, r) => sum + r.totalAccounts, 0);
    const successAccounts = records.value.reduce((sum, r) => sum + r.successCount, 0);
    
    return {
      totalExecutions,
      todayExecutions,
      successRate,
      averageDuration: avgDuration,
      totalAccounts,
      successAccounts
    };
  });

  // 按任务分组的统计
  const taskStatistics = computed(() => {
    const stats = new Map<string, {
      taskId: string;
      taskName: string;
      totalExecutions: number;
      successCount: number;
      failedCount: number;
      lastExecutionTime?: string;
    }>();
    
    records.value.forEach(record => {
      const existing = stats.get(record.taskId);
      if (existing) {
        existing.totalExecutions++;
        if (record.status === 'success') existing.successCount++;
        if (record.status === 'failed') existing.failedCount++;
        if (!existing.lastExecutionTime || new Date(record.startTime) > new Date(existing.lastExecutionTime)) {
          existing.lastExecutionTime = record.startTime;
        }
      } else {
        stats.set(record.taskId, {
          taskId: record.taskId,
          taskName: record.taskName,
          totalExecutions: 1,
          successCount: record.status === 'success' ? 1 : 0,
          failedCount: record.status === 'failed' ? 1 : 0,
          lastExecutionTime: record.startTime
        });
      }
    });
    
    return Array.from(stats.values());
  });

  // Actions

  // 加载历史记录
  const loadRecords = async (params?: HistoryQueryParams) => {
    try {
      isLoading.value = true;
      // 从 IndexedDB 加载
      let allRecords = await historyDB.getAll();
      
      // 如果 IndexedDB 没有数据，尝试从 localStorage 迁移
      if (allRecords.length === 0) {
        const saved = localStorage.getItem('taskExecutionHistory');
        if (saved) {
          const parsed: TaskExecutionRecord[] = JSON.parse(saved);
          if (parsed.length > 0) {
            allRecords = parsed;
            await historyDB.saveAll(parsed);
            console.log(`[HistoryStore] 从 localStorage 迁移了 ${parsed.length} 条历史记录`);
          }
        }
      }
      
      // 应用筛选条件
      let filtered = allRecords;
      
      if (params?.taskId) {
        filtered = filtered.filter(r => r.taskId === params.taskId);
      }
      
      if (params?.status) {
        filtered = filtered.filter(r => r.status === params.status);
      }
      
      if (params?.triggerType) {
        filtered = filtered.filter(r => r.triggerType === params.triggerType);
      }
      
      if (params?.startDate) {
        filtered = filtered.filter(r => new Date(r.startTime) >= new Date(params.startDate!));
      }
      
      if (params?.endDate) {
        filtered = filtered.filter(r => new Date(r.startTime) <= new Date(params.endDate!));
      }
      
      if (params?.keyword) {
        const keyword = params.keyword.toLowerCase();
        filtered = filtered.filter(r => 
          r.taskName.toLowerCase().includes(keyword) ||
          r.templateName?.toLowerCase().includes(keyword) ||
          r.results.some(res => res.tokenName.toLowerCase().includes(keyword))
        );
      }
      
      // 按时间倒序排列
      filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      
      // 分页
      totalCount.value = filtered.length;
      const page = params?.page || 1;
      const size = params?.pageSize || pageSize.value;
      const start = (page - 1) * size;
      const end = start + size;
      records.value = filtered.slice(start, end);
    } catch (error) {
      console.error('加载任务执行历史失败:', error);
    } finally {
      isLoading.value = false;
    }
  };

  // 添加执行记录
  const addRecord = async (record: Omit<TaskExecutionRecord, 'id'>): Promise<TaskExecutionRecord> => {
    const newRecord: TaskExecutionRecord = {
      ...record,
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    try {
      // 保存到 IndexedDB
      await historyDB.save(newRecord);
      
      // 同时备份到 localStorage
      const saved = localStorage.getItem('taskExecutionHistory');
      const allRecords: TaskExecutionRecord[] = saved ? JSON.parse(saved) : [];
      allRecords.unshift(newRecord);
      if (allRecords.length > 1000) {
        allRecords.splice(1000);
      }
      localStorage.setItem('taskExecutionHistory', JSON.stringify(allRecords));
      
      // 如果当前在第一页，更新显示
      if (currentPage.value === 1) {
        records.value.unshift(newRecord);
        if (records.value.length > pageSize.value) {
          records.value.pop();
        }
      }
      
      totalCount.value++;
    } catch (error) {
      console.error('保存任务执行历史失败:', error);
    }
    
    return newRecord;
  };

  // 更新执行记录
  const updateRecord = (id: string, updates: Partial<TaskExecutionRecord>) => {
    try {
      const saved = localStorage.getItem('taskExecutionHistory');
      if (saved) {
        const allRecords: TaskExecutionRecord[] = JSON.parse(saved);
        const index = allRecords.findIndex(r => r.id === id);
        if (index !== -1) {
          allRecords[index] = { ...allRecords[index], ...updates };
          localStorage.setItem('taskExecutionHistory', JSON.stringify(allRecords));
          
          // 更新当前显示的记录
          const displayIndex = records.value.findIndex(r => r.id === id);
          if (displayIndex !== -1) {
            records.value[displayIndex] = { ...records.value[displayIndex], ...updates };
          }
          
          // 更新当前查看的详情
          if (currentRecord.value?.id === id) {
            currentRecord.value = { ...currentRecord.value, ...updates };
          }
        }
      }
    } catch (error) {
      console.error('更新任务执行历史失败:', error);
    }
  };

  // 删除执行记录
  const deleteRecord = (id: string) => {
    try {
      const saved = localStorage.getItem('taskExecutionHistory');
      if (saved) {
        const allRecords: TaskExecutionRecord[] = JSON.parse(saved);
        const filtered = allRecords.filter(r => r.id !== id);
        localStorage.setItem('taskExecutionHistory', JSON.stringify(filtered));
        
        records.value = records.value.filter(r => r.id !== id);
        totalCount.value--;
      }
    } catch (error) {
      console.error('删除任务执行历史失败:', error);
    }
  };

  // 清空历史记录
  const clearRecords = () => {
    try {
      localStorage.removeItem('taskExecutionHistory');
      records.value = [];
      totalCount.value = 0;
    } catch (error) {
      console.error('清空任务执行历史失败:', error);
    }
  };

  // 获取单条记录详情
  const getRecordById = (id: string): TaskExecutionRecord | null => {
    try {
      const saved = localStorage.getItem('taskExecutionHistory');
      if (saved) {
        const allRecords: TaskExecutionRecord[] = JSON.parse(saved);
        return allRecords.find(r => r.id === id) || null;
      }
    } catch (error) {
      console.error('获取任务执行历史详情失败:', error);
    }
    return null;
  };

  // 设置当前查看的记录
  const setCurrentRecord = (record: TaskExecutionRecord | null) => {
    currentRecord.value = record;
  };

  // 导出历史记录
  const exportRecords = (format: 'json' | 'csv' = 'json') => {
    try {
      const saved = localStorage.getItem('taskExecutionHistory');
      if (!saved) return null;
      
      const allRecords: TaskExecutionRecord[] = JSON.parse(saved);
      
      if (format === 'json') {
        return JSON.stringify(allRecords, null, 2);
      } else {
        // CSV 格式
        const headers = ['任务名称', '执行时间', '状态', '触发方式', '账号数', '成功数', '失败数', '耗时(秒)'];
        const rows = allRecords.map(r => [
          r.taskName,
          new Date(r.startTime).toLocaleString('zh-CN'),
          r.status === 'success' ? '成功' : r.status === 'failed' ? '失败' : r.status,
          r.triggerType === 'manual' ? '手动' : r.triggerType === 'scheduled' ? '定时' : '自动',
          r.totalAccounts,
          r.successCount,
          r.failedCount,
          r.duration ? Math.round(r.duration / 1000) : 0
        ]);
        
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      }
    } catch (error) {
      console.error('导出任务执行历史失败:', error);
      return null;
    }
  };

  // 获取任务的最近执行记录
  const getRecentRecordsByTaskId = (taskId: string, limit: number = 5): TaskExecutionRecord[] => {
    try {
      const saved = localStorage.getItem('taskExecutionHistory');
      if (saved) {
        const allRecords: TaskExecutionRecord[] = JSON.parse(saved);
        return allRecords
          .filter(r => r.taskId === taskId)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          .slice(0, limit);
      }
    } catch (error) {
      console.error('获取任务最近执行记录失败:', error);
    }
    return [];
  };

  // 初始化
  const initialize = async () => {
    await loadRecords();
  };

  return {
    // State
    records,
    isLoading,
    currentPage,
    pageSize,
    totalCount,
    currentRecord,
    
    // Getters
    statistics,
    taskStatistics,
    
    // Actions
    initialize,
    loadRecords,
    addRecord,
    updateRecord,
    deleteRecord,
    clearRecords,
    getRecordById,
    setCurrentRecord,
    exportRecords,
    getRecentRecordsByTaskId
  };
});
