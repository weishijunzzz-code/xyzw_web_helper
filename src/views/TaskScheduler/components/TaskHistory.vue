<template>
  <div class="task-history-section">
    <div class="section-header">
      <div class="header-left">
        <h3 class="section-title">执行历史</h3>
        <n-tag v-if="historyStore.statistics.totalExecutions > 0" type="info" size="small">
          共 {{ historyStore.statistics.totalExecutions }} 条
        </n-tag>
      </div>
      <div class="header-actions">
        <n-button-group>
          <n-button size="small" @click="showFilter = true">
            <template #icon>
              <n-icon :component="FilterOutline" />
            </template>
            筛选
          </n-button>
          <n-button size="small" @click="handleExport">
            <template #icon>
              <n-icon :component="DownloadOutline" />
            </template>
            导出
          </n-button>
          <n-button size="small" type="error" @click="handleClear">
            <template #icon>
              <n-icon :component="TrashOutline" />
            </template>
            清空
          </n-button>
        </n-button-group>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div v-if="showStatistics" class="history-stats">
      <div class="stat-item">
        <div class="stat-value" :class="getSuccessRateClass(historyStore.statistics.successRate)">
          {{ historyStore.statistics.successRate }}%
        </div>
        <div class="stat-label">成功率</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ historyStore.statistics.todayExecutions }}</div>
        <div class="stat-label">今日执行</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ formatDuration(historyStore.statistics.averageDuration) }}</div>
        <div class="stat-label">平均耗时</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ historyStore.statistics.totalAccounts }}</div>
        <div class="stat-label">总账号数</div>
      </div>
    </div>

    <!-- 历史记录列表 -->
    <div class="history-list">
      <n-empty v-if="historyStore.records.length === 0" description="暂无执行记录">
        <template #icon>
          <n-icon :component="TimeOutline" />
        </template>
      </n-empty>

      <template v-else>
        <div
          v-for="record in historyStore.records"
          :key="record.id"
          class="history-item"
          :class="record.status"
          @click="showRecordDetail(record)"
        >
          <div class="item-main">
            <div class="item-header">
              <div class="task-info">
                <n-icon :component="getStatusIcon(record.status)" class="status-icon" />
                <span class="task-name">{{ record.taskName }}</span>
                <n-tag size="small" :type="getTriggerType(record.triggerType)">
                  {{ getTriggerText(record.triggerType) }}
                </n-tag>
              </div>
              <div class="execute-time">
                {{ formatTime(record.startTime) }}
              </div>
            </div>

            <div class="item-body">
              <div class="result-summary">
                <span class="summary-item">
                  <n-icon :component="PeopleOutline" />
                  {{ record.totalAccounts }} 个账号
                </span>
                <span class="summary-item success">
                  <n-icon :component="CheckmarkCircleOutline" />
                  {{ record.successCount }} 成功
                </span>
                <span v-if="record.failedCount > 0" class="summary-item error">
                  <n-icon :component="CloseCircleOutline" />
                  {{ record.failedCount }} 失败
                </span>
                <span v-if="record.duration" class="summary-item">
                  <n-icon :component="TimeOutline" />
                  {{ formatDuration(record.duration) }}
                </span>
              </div>
            </div>
          </div>

          <div class="item-actions">
            <n-button text size="small" @click.stop="showRecordDetail(record)">
              <template #icon>
                <n-icon :component="EyeOutline" />
              </template>
              详情
            </n-button>
            <n-button text size="small" type="error" @click.stop="handleDelete(record)">
              <template #icon>
                <n-icon :component="TrashOutline" />
              </template>
              删除
            </n-button>
          </div>
        </div>

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <n-pagination
            v-model:page="currentPage"
            :page-count="Math.ceil(historyStore.totalCount / historyStore.pageSize)"
            :page-size="historyStore.pageSize"
            show-size-picker
            :page-sizes="[10, 20, 50, 100]"
            @update:page="handlePageChange"
            @update:page-size="handlePageSizeChange"
          />
        </div>
      </template>
    </div>

    <!-- 筛选弹窗 -->
    <n-modal v-model:show="showFilter" preset="card" title="筛选条件" style="width: 90%; max-width: 500px">
      <n-form label-placement="left" label-width="80px">
        <n-form-item label="任务状态">
          <n-select
            v-model:value="filterParams.status"
            :options="statusOptions"
            placeholder="选择状态"
            clearable
          />
        </n-form-item>
        <n-form-item label="触发方式">
          <n-select
            v-model:value="filterParams.triggerType"
            :options="triggerOptions"
            placeholder="选择触发方式"
            clearable
          />
        </n-form-item>
        <n-form-item label="开始时间">
          <n-date-picker
            v-model:value="filterParams.startDate"
            type="datetime"
            placeholder="选择开始时间"
            clearable
          />
        </n-form-item>
        <n-form-item label="结束时间">
          <n-date-picker
            v-model:value="filterParams.endDate"
            type="datetime"
            placeholder="选择结束时间"
            clearable
          />
        </n-form-item>
        <n-form-item label="关键词">
          <n-input
            v-model:value="filterParams.keyword"
            placeholder="搜索任务名称、模板名称"
            clearable
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="resetFilter">重置</n-button>
          <n-button type="primary" @click="applyFilter">应用</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 详情弹窗 -->
    <n-modal
      v-model:show="showDetail"
      preset="card"
      :title="`执行详情 - ${selectedRecord?.taskName}`"
      style="width: 90%; max-width: 600px"
    >
      <template v-if="selectedRecord">
        <n-descriptions bordered :column="1" size="small">
          <n-descriptions-item label="任务名称">
            {{ selectedRecord.taskName }}
          </n-descriptions-item>
          <n-descriptions-item label="执行状态">
            <n-tag :type="getStatusType(selectedRecord.status)">
              {{ getStatusText(selectedRecord.status) }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="触发方式">
            {{ getTriggerText(selectedRecord.triggerType) }}
          </n-descriptions-item>
          <n-descriptions-item label="开始时间">
            {{ new Date(selectedRecord.startTime).toLocaleString('zh-CN') }}
          </n-descriptions-item>
          <n-descriptions-item v-if="selectedRecord.endTime" label="结束时间">
            {{ new Date(selectedRecord.endTime).toLocaleString('zh-CN') }}
          </n-descriptions-item>
          <n-descriptions-item v-if="selectedRecord.duration" label="执行耗时">
            {{ formatDuration(selectedRecord.duration) }}
          </n-descriptions-item>
          <n-descriptions-item label="执行统计">
            总计 {{ selectedRecord.totalAccounts }} 个账号 |
            <span style="color: var(--color-success-500, #10b981)">成功 {{ selectedRecord.successCount }}</span> |
            <span v-if="selectedRecord.failedCount > 0" style="color: var(--color-error-500, #ef4444)">
              失败 {{ selectedRecord.failedCount }}
            </span>
          </n-descriptions-item>
        </n-descriptions>

        <n-divider title-placement="left">账号执行详情</n-divider>

        <div class="account-results">
          <div
            v-for="result in selectedRecord.results"
            :key="result.tokenId"
            class="account-result-item"
            :class="result.status"
          >
            <div class="account-info">
              <n-icon :component="getStatusIcon(result.status)" />
              <span class="account-name">{{ result.tokenName }}</span>
              <span v-if="result.server" class="account-server">({{ result.server }})</span>
            </div>
            <div class="account-message">{{ result.message }}</div>
            <div v-if="result.duration" class="account-duration">
              耗时: {{ formatDuration(result.duration) }}
            </div>
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  TimeOutline,
  FilterOutline,
  DownloadOutline,
  TrashOutline,
  EyeOutline,
  PeopleOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  PlayCircleOutline,
  StopCircleOutline,
  HelpCircleOutline
} from '@vicons/ionicons5';
import { useTaskHistoryStore } from '@/stores/taskHistoryStore';

const dialog = useDialog();
const message = useMessage();
const historyStore = useTaskHistoryStore();

// 状态
const showStatistics = ref(true);
const showFilter = ref(false);
const showDetail = ref(false);
const selectedRecord = ref(null);
const currentPage = ref(1);

const filterParams = ref({
  status: null,
  triggerType: null,
  startDate: null,
  endDate: null,
  keyword: ''
});

// 选项
const statusOptions = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '执行中', value: 'running' },
  { label: '已取消', value: 'cancelled' }
];

const triggerOptions = [
  { label: '手动触发', value: 'manual' },
  { label: '定时触发', value: 'scheduled' },
  { label: '自动触发', value: 'auto' }
];

// 获取状态图标
const getStatusIcon = (status) => {
  const map = {
    success: CheckmarkCircleOutline,
    failed: CloseCircleOutline,
    running: PlayCircleOutline,
    cancelled: StopCircleOutline
  };
  return map[status] || HelpCircleOutline;
};

// 获取状态类型
const getStatusType = (status) => {
  const map = {
    success: 'success',
    failed: 'error',
    running: 'info',
    cancelled: 'warning'
  };
  return map[status] || 'default';
};

// 获取状态文本
const getStatusText = (status) => {
  const map = {
    success: '成功',
    failed: '失败',
    running: '执行中',
    cancelled: '已取消'
  };
  return map[status] || status;
};

// 获取触发类型
const getTriggerType = (type) => {
  const map = {
    manual: 'success',
    scheduled: 'info',
    auto: 'warning'
  };
  return map[type] || 'default';
};

// 获取触发文本
const getTriggerText = (type) => {
  const map = {
    manual: '手动',
    scheduled: '定时',
    auto: '自动'
  };
  return map[type] || type;
};

// 格式化时间
const formatTime = (time) => {
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  }
  // 小于24小时
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  }
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// 格式化时长
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '-';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分`;
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
};

// 获取成功率样式类
const getSuccessRateClass = (rate) => {
  if (rate >= 90) return 'excellent';
  if (rate >= 70) return 'good';
  if (rate >= 50) return 'fair';
  return 'poor';
};

// 显示记录详情
const showRecordDetail = (record) => {
  selectedRecord.value = record;
  showDetail.value = true;
};

// 删除记录
const handleDelete = (record) => {
  dialog.warning({
    title: '删除记录',
    content: `确定要删除这条执行记录吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      historyStore.deleteRecord(record.id);
      message.success('记录已删除');
    }
  });
};

// 清空记录
const handleClear = () => {
  dialog.warning({
    title: '清空记录',
    content: '确定要清空所有执行记录吗？此操作不可恢复。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      historyStore.clearRecords();
      message.success('记录已清空');
    }
  });
};

// 导出记录
const handleExport = () => {
  const data = historyStore.exportRecords('json');
  if (data) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  }
};

// 分页处理
const handlePageChange = (page) => {
  currentPage.value = page;
  historyStore.loadRecords({ ...filterParams.value, page });
};

const handlePageSizeChange = (size) => {
  historyStore.pageSize = size;
  historyStore.loadRecords({ ...filterParams.value, pageSize: size });
};

// 筛选处理
const applyFilter = () => {
  currentPage.value = 1;
  historyStore.loadRecords({
    ...filterParams.value,
    page: 1
  });
  showFilter.value = false;
};

const resetFilter = () => {
  filterParams.value = {
    status: null,
    triggerType: null,
    startDate: null,
    endDate: null,
    keyword: ''
  };
  applyFilter();
};

// 初始化
onMounted(() => {
  historyStore.initialize();
});
</script>

<style scoped lang="scss">
.task-history-section {
  background: var(--bg-primary, white);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-light);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin: 0;
}

// 统计区域
.history-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  
  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  
  &.excellent { color: #10b981; }
  &.good { color: #22c55e; }
  &.fair { color: #f59e0b; }
  &.poor { color: #ef4444; }
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-top: 4px;
}

// 历史列表
.history-list {
  min-height: 200px;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  transition: background 0.2s;
  cursor: pointer;
  
  &:hover {
    background: var(--bg-secondary, #f9fafb);
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  &.success {
    border-left: 3px solid #10b981;
  }
  
  &.failed {
    border-left: 3px solid #ef4444;
  }
  
  &.running {
    border-left: 3px solid #3b82f6;
  }
  
  &.cancelled {
    border-left: 3px solid #6b7280;
  }
}

.item-main {
  flex: 1;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  font-size: 16px;
  
  .success & { color: #10b981; }
  .failed & { color: #ef4444; }
  .running & { color: #3b82f6; }
  .cancelled & { color: #6b7280; }
}

.task-name {
  font-weight: 500;
  color: var(--text-primary, #1f2937);
}

.execute-time {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.item-body {
  .result-summary {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  
  .summary-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary, #6b7280);
    
    &.success { color: #10b981; }
    &.error { color: #ef4444; }
    
    .n-icon {
      font-size: 14px;
    }
  }
}

.item-actions {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

// 分页
.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

// 账号执行详情
.account-results {
  max-height: 300px;
  overflow-y: auto;
}

.account-result-item {
  padding: 12px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  
  &:last-child {
    border-bottom: none;
  }
  
  &.success {
    background: rgba(16, 185, 129, 0.05);
  }
  
  &.failed {
    background: rgba(239, 68, 68, 0.05);
  }
}

.account-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  
  .n-icon {
    font-size: 16px;
    
    .success & { color: #10b981; }
    .failed & { color: #ef4444; }
  }
}

.account-name {
  font-weight: 500;
}

.account-server {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.account-message {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-left: 24px;
}

.account-duration {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  margin-left: 24px;
  margin-top: 4px;
}

// 深色模式适配
[data-theme="dark"] {
  .task-history-section {
    background: var(--bg-primary, #1f2937);
    box-shadow: var(--shadow-light);
  }
  
  .section-title {
    color: var(--text-primary, #f9fafb);
  }
  
  .history-stats {
    background: var(--bg-secondary, #374151);
  }
  
  .stat-value {
    color: var(--text-primary, #f9fafb);
  }
  
  .history-item {
    border-color: var(--border-light, #4b5563);
    
    &:hover {
      background: var(--bg-secondary, #374151);
    }
  }
  
  .task-name {
    color: var(--text-primary, #f9fafb);
  }
  
  .account-result-item {
    border-color: var(--border-light, #4b5563);
  }
}

// 响应式
@media (max-width: 768px) {
  .task-history-section {
    padding: 16px;
  }
  
  .history-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding: 12px;
  }
  
  .stat-value {
    font-size: 20px;
  }
  
  .history-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .item-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
  
  .item-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
