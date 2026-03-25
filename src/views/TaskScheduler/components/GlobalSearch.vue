<template>
  <div class="global-search">
    <n-input
      v-model:value="searchQuery"
      placeholder="搜索任务、历史记录..."
      clearable
      @focus="showResults = true"
      @keyup.enter="handleSearch"
    >
      <template #prefix>
        <n-icon :component="SearchOutline" />
      </template>
      <template #suffix>
        <n-tag v-if="searchQuery" size="small" type="info">
          按 Enter 搜索
        </n-tag>
      </template>
    </n-input>
    
    <!-- 搜索结果下拉 -->
    <n-dropdown
      :show="showResults && hasResults"
      :options="searchResults"
      placement="bottom-start"
      @select="handleSelect"
      @clickoutside="showResults = false"
    >
      <div></div>
    </n-dropdown>
    
    <!-- 搜索结果弹窗 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      title="搜索结果"
      style="width: 90%; max-width: 800px; max-height: 80vh"
    >
      <n-tabs v-model:value="activeTab" type="line">
        <n-tab-pane name="tasks" tab="任务">
          <n-list v-if="taskResults.length > 0">
            <n-list-item
              v-for="task in taskResults"
              :key="task.id"
              @click="handleTaskClick(task)"
            >
              <n-thing :title="task.name">
                <template #description>
                  <n-space>
                    <n-tag size="small" :type="getStatusType(task.status)">
                      {{ getStatusText(task.status) }}
                    </n-tag>
                    <n-text depth="3">{{ task.cronExpression }}</n-text>
                  </n-space>
                </template>
                <template #header-extra>
                  <n-button text size="small" @click.stop="handleExecute(task)">
                    <template #icon>
                      <n-icon :component="PlayOutline" />
                    </template>
                    执行
                  </n-button>
                </template>
              </n-thing>
            </n-list-item>
          </n-list>
          <n-empty v-else description="未找到相关任务" />
        </n-tab-pane>
        
        <n-tab-pane name="history" tab="执行历史">
          <n-list v-if="historyResults.length > 0">
            <n-list-item
              v-for="record in historyResults"
              :key="record.id"
              @click="handleHistoryClick(record)"
            >
              <n-thing :title="record.taskName">
                <template #description>
                  <n-space>
                    <n-tag size="small" :type="getExecutionType(record.status)">
                      {{ getExecutionText(record.status) }}
                    </n-tag>
                    <n-text depth="3">{{ formatTime(record.startTime) }}</n-text>
                  </n-space>
                </template>
                <template #header-extra>
                  <n-text depth="3">
                    {{ record.successCount }}/{{ record.totalAccounts }} 成功
                  </n-text>
                </template>
              </n-thing>
            </n-list-item>
          </n-list>
          <n-empty v-else description="未找到相关历史记录" />
        </n-tab-pane>
      </n-tabs>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { SearchOutline, PlayOutline } from '@vicons/ionicons5';
import { useScheduledTaskStore } from '@/stores/scheduledTaskStore';
import { useTaskHistoryStore } from '@/stores/taskHistoryStore';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:visible', 'select-task', 'select-history', 'execute-task']);

const taskStore = useScheduledTaskStore();
const historyStore = useTaskHistoryStore();

const searchQuery = ref('');
const showResults = ref(false);
const showModal = ref(false);
const activeTab = ref('tasks');

// 任务搜索结果
const taskResults = computed(() => {
  if (!searchQuery.value.trim()) return [];
  
  const query = searchQuery.value.toLowerCase();
  return taskStore.tasks.filter(task => 
    task.name.toLowerCase().includes(query) ||
    task.description?.toLowerCase().includes(query) ||
    task.cronExpression.includes(query)
  );
});

// 历史记录搜索结果
const historyResults = computed(() => {
  if (!searchQuery.value.trim()) return [];
  
  const query = searchQuery.value.toLowerCase();
  return historyStore.records.filter(record => 
    record.taskName.toLowerCase().includes(query) ||
    record.status.includes(query)
  ).slice(0, 20);
});

// 是否有结果
const hasResults = computed(() => 
  taskResults.value.length > 0 || historyResults.value.length > 0
);

// 下拉选项
const searchResults = computed(() => {
  const options = [];
  
  if (taskResults.value.length > 0) {
    options.push({
      type: 'group',
      label: '任务',
      key: 'task-group',
      children: taskResults.value.slice(0, 5).map(task => ({
        label: task.name,
        key: `task-${task.id}`,
        icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) })
      }))
    });
  }
  
  if (historyResults.value.length > 0) {
    options.push({
      type: 'group',
      label: '历史记录',
      key: 'history-group',
      children: historyResults.value.slice(0, 5).map(record => ({
        label: record.taskName,
        key: `history-${record.id}`,
        icon: () => h(NIcon, null, { default: () => h(TimeOutline) })
      }))
    });
  }
  
  if (hasResults.value) {
    options.push({
      label: '查看全部结果',
      key: 'view-all',
      icon: () => h(NIcon, null, { default: () => h(SearchOutline) })
    });
  }
  
  return options;
});

// 状态映射
const getStatusType = (status) => {
  const map = { running: 'success', paused: 'warning', error: 'error', completed: 'info' };
  return map[status] || 'default';
};

const getStatusText = (status) => {
  const map = { running: '运行中', paused: '已暂停', error: '异常', completed: '已完成' };
  return map[status] || status;
};

const getExecutionType = (status) => {
  const map = { success: 'success', failed: 'error', partial: 'warning' };
  return map[status] || 'default';
};

const getExecutionText = (status) => {
  const map = { success: '成功', failed: '失败', partial: '部分成功' };
  return map[status] || status;
};

// 格式化时间
const formatTime = (timeStr) => {
  return new Date(timeStr).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 处理搜索
const handleSearch = () => {
  if (searchQuery.value.trim()) {
    showModal.value = true;
    showResults.value = false;
  }
};

// 处理选择
const handleSelect = (key) => {
  if (key === 'view-all') {
    showModal.value = true;
  } else if (key.startsWith('task-')) {
    const taskId = key.replace('task-', '');
    const task = taskStore.tasks.find(t => t.id === taskId);
    if (task) handleTaskClick(task);
  } else if (key.startsWith('history-')) {
    const recordId = key.replace('history-', '');
    const record = historyStore.records.find(r => r.id === recordId);
    if (record) handleHistoryClick(record);
  }
  showResults.value = false;
};

// 点击任务
const handleTaskClick = (task) => {
  emit('select-task', task);
  showModal.value = false;
};

// 点击历史记录
const handleHistoryClick = (record) => {
  emit('select-history', record);
  showModal.value = false;
};

// 执行任务
const handleExecute = (task) => {
  emit('execute-task', task);
  showModal.value = false;
};

// 监听 visible 变化
watch(() => props.visible, (val) => {
  if (val) {
    showModal.value = true;
  }
});

watch(showModal, (val) => {
  emit('update:visible', val);
});
</script>

<style scoped lang="scss">
.global-search {
  position: relative;
  width: 300px;
  
  @media (max-width: 768px) {
    width: 200px;
  }
}
</style>
