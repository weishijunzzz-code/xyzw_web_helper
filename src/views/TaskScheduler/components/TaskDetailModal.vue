<template>
  <n-modal
    :show="show"
    preset="card"
    title="任务详情"
    style="width: 90%; max-width: 500px"
    @update:show="$emit('update:show', $event)"
  >
    <template v-if="task">
      <n-descriptions bordered :column="1">
        <n-descriptions-item label="任务名称">
          {{ task.name }}
        </n-descriptions-item>
        <n-descriptions-item label="任务描述">
          {{ task.description || '无' }}
        </n-descriptions-item>
        <n-descriptions-item label="执行时间">
          <n-tag type="info">{{ task.cronExpression }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item label="当前状态">
          <n-tag :type="getStatusType(task.status)">
            {{ getStatusText(task.status) }}
          </n-tag>
        </n-descriptions-item>
        <n-descriptions-item label="关联账号">
          {{ task.associatedAccounts?.length || 0 }} 个账号
        </n-descriptions-item>
        <n-descriptions-item label="下次执行">
          {{ task.nextRunTime ? new Date(task.nextRunTime).toLocaleString('zh-CN') : '未设置' }}
        </n-descriptions-item>
        <n-descriptions-item label="上次执行">
          {{ task.lastRunTime ? new Date(task.lastRunTime).toLocaleString('zh-CN') : '从未执行' }}
        </n-descriptions-item>
        <n-descriptions-item label="总执行次数">
          {{ task.runCount?.total || 0 }} 次
        </n-descriptions-item>
        <n-descriptions-item label="今日成功">
          {{ task.runCount?.todaySuccess || 0 }} 次
        </n-descriptions-item>
        <n-descriptions-item label="今日失败">
          {{ task.runCount?.todayFailed || 0 }} 次
        </n-descriptions-item>
        <n-descriptions-item label="创建时间">
          {{ new Date(task.createdAt).toLocaleString('zh-CN') }}
        </n-descriptions-item>
      </n-descriptions>
      
      <n-divider />
      
      <n-space justify="center">
        <n-button 
          type="primary" 
          :loading="isExecuting"
          @click="$emit('execute', task)"
        >
          <template #icon>
            <n-icon :component="PlayOutline" />
          </template>
          立即执行
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
import { PlayOutline } from '@vicons/ionicons5';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  task: {
    type: Object,
    default: null
  },
  isExecuting: {
    type: Boolean,
    default: false
  }
});

defineEmits(['update:show', 'execute']);

const getStatusType = (status) => {
  const map = {
    running: 'success',
    paused: 'warning',
    error: 'error',
    completed: 'info'
  };
  return map[status] || 'default';
};

const getStatusText = (status) => {
  const map = {
    running: '运行中',
    paused: '已暂停',
    error: '异常',
    completed: '已完成'
  };
  return map[status] || status;
};
</script>
