<template>
  <div class="list-view">
    <n-data-table
      :columns="columns"
      :data="paginatedTasks"
      :loading="loading"
      :pagination="pagination"
      :row-props="rowProps"
      striped
    />
  </div>
</template>

<script setup>
import { h, computed } from 'vue';
import { NTag, NButton, NSpace, NPopconfirm, NIcon } from 'naive-ui';
import { 
  PlayOutline, 
  PauseOutline, 
  CreateOutline, 
  TrashOutline,
  TimeOutline
} from '@vicons/ionicons5';
import { useCountdown, formatNextRunTime } from '../../composables/useCountdown';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['execute', 'pause', 'start', 'edit', 'delete']);

const pagination = {
  pageSize: 10
};

const paginatedTasks = computed(() => props.tasks);

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

// 倒计时组件
const CountdownCell = {
  props: ['targetTime'],
  setup(props) {
    const { formatted, isOverdue, remaining } = useCountdown(props.targetTime);
    return () => h('span', {
      class: ['countdown-text', { 
        'urgent': isOverdue.value || remaining.value < 60000 
      }]
    }, formatted.value);
  }
};

const columns = [
  {
    title: '任务名称',
    key: 'name',
    width: 200,
    render(row) {
      return h('div', { 
        class: 'task-name-cell',
        style: { display: 'flex', alignItems: 'center', gap: '8px' }
      }, [
        h(NIcon, { 
          component: TimeOutline,
          style: { color: '#3b82f6', fontSize: '18px' }
        }),
        h('span', { style: { fontWeight: 500 } }, row.name)
      ]);
    }
  },
  { 
    title: '状态', 
    key: 'status',
    width: 100,
    render(row) {
      return h(NTag, { 
        type: getStatusType(row.status), 
        size: 'small',
        round: true
      }, () => getStatusText(row.status));
    }
  },
  { 
    title: '执行时间', 
    key: 'cronExpression',
    width: 150,
    render(row) {
      return h(NTag, { 
        type: 'info', 
        size: 'small' 
      }, () => row.cronExpression);
    }
  },
  { 
    title: '关联账号', 
    key: 'associatedAccounts',
    width: 100,
    render(row) {
      return h('span', { 
        style: { color: '#6b7280' }
      }, `${row.associatedAccounts?.length || 0} 个`);
    }
  },
  { 
    title: '下次执行', 
    key: 'nextRunTime',
    width: 200,
    render(row) {
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '4px' }
      }, [
        h('span', { 
          style: { fontSize: '13px', color: '#374151' }
        }, formatNextRunTime(row.nextRunTime)),
        h(CountdownCell, { targetTime: row.nextRunTime })
      ]);
    }
  },
  {
    title: '今日执行',
    key: 'runCount',
    width: 120,
    render(row) {
      const success = row.runCount?.todaySuccess || 0;
      const failed = row.runCount?.todayFailed || 0;
      return h('div', {
        style: { display: 'flex', gap: '8px' }
      }, [
        h(NTag, { 
          type: 'success', 
          size: 'small' 
        }, () => `成功 ${success}`),
        failed > 0 ? h(NTag, { 
          type: 'error', 
          size: 'small' 
        }, () => `失败 ${failed}`) : null
      ]);
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 280,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 'small' }, () => [
        row.status === 'running' 
          ? h(NButton, {
              size: 'small',
              type: 'warning',
              onClick: () => emit('pause', row)
            }, () => [
              h(NIcon, { 
                component: PauseOutline,
                style: { marginRight: '4px' }
              }),
              '暂停'
            ])
          : h(NButton, {
              size: 'small',
              type: 'success',
              onClick: () => emit('start', row)
            }, () => [
              h(NIcon, { 
                component: PlayOutline,
                style: { marginRight: '4px' }
              }),
              '执行'
            ]),
        h(NButton, {
          size: 'small',
          onClick: () => emit('edit', row)
        }, () => [
          h(NIcon, { 
            component: CreateOutline,
            style: { marginRight: '4px' }
          }),
          '编辑'
        ]),
        h(NPopconfirm, {
          onPositiveClick: () => emit('delete', row),
          positiveText: '确定',
          negativeText: '取消'
        }, {
          trigger: () => h(NButton, {
            size: 'small',
            type: 'error'
          }, () => [
            h(NIcon, { 
              component: TrashOutline,
              style: { marginRight: '4px' }
            }),
            '删除'
          ]),
          default: () => `确定删除任务 "${row.name}" 吗？`
        })
      ]);
    }
  }
];

const rowProps = (row) => {
  return {
    style: {
      cursor: 'pointer'
    },
    onClick: () => {
      // 可以添加点击行查看详情的逻辑
    }
  };
};
</script>

<style scoped lang="scss">
.list-view {
  :deep(.n-data-table) {
    .n-data-table-th {
      font-weight: 600;
      background: var(--bg-secondary, #f3f4f6);
    }
    
    .n-data-table-td {
      padding: 12px 16px;
    }
  }
}

.countdown-text {
  font-size: 13px;
  color: #3b82f6;
  font-weight: 500;
  
  &.urgent {
    color: #ef4444;
    animation: pulse 1.5s infinite;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

// 深色模式适配
[data-theme="dark"] {
  .list-view :deep(.n-data-table-th) {
    background: var(--bg-tertiary, #374151);
  }
  
  .countdown-text {
    color: #60a5fa;
    
    &.urgent {
      color: #f87171;
    }
  }
}
</style>
