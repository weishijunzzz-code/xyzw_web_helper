<template>
  <div class="token-selector">
    <!-- 分组选择 -->
    <div v-if="tokenGroups.length > 0" class="group-section">
      <div class="section-header">
        <label>分组选择</label>
        <n-button size="small" type="error" text @click="clearAllGroupSelection">
          清除全部
        </n-button>
      </div>
      <div class="group-tags">
        <div
          v-for="group in tokenGroups"
          :key="group.id"
          class="group-tag"
          :class="{ selected: isGroupSelected(group.id) }"
          :style="getGroupStyle(group)"
          @click="toggleGroupSelection(group.id)"
        >
          {{ group.name }} ({{ getValidGroupTokenIds(group.id).length }})
        </div>
      </div>
    </div>

    <!-- 排序按钮 -->
    <div class="sort-section">
      <n-button-group size="small">
        <n-button
          @click="toggleSort('name')"
          :type="sortConfig.field === 'name' ? 'primary' : 'default'"
        >
          名称 {{ getSortIcon('name') }}
        </n-button>
        <n-button
          @click="toggleSort('server')"
          :type="sortConfig.field === 'server' ? 'primary' : 'default'"
        >
          服务器 {{ getSortIcon('server') }}
        </n-button>
        <n-button
          @click="toggleSort('createdAt')"
          :type="sortConfig.field === 'createdAt' ? 'primary' : 'default'"
        >
          创建时间 {{ getSortIcon('createdAt') }}
        </n-button>
      </n-button-group>

      <n-button size="small" @click="showGroupManageModal = true">
        管理分组
      </n-button>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <n-checkbox
        :checked="isAllSelected"
        :indeterminate="isIndeterminate"
        @update:checked="toggleSelectAll"
      >
        全选 ({{ selectedTokens.length }}/{{ sortedTokens.length }})
      </n-checkbox>
      <n-text type="info" v-if="selectedGroups.length > 0">
        已选 {{ selectedGroups.length }} 个分组
      </n-text>
    </div>

    <!-- Token 列表 - 桌面端表格 -->
    <template v-if="!isMobile">
      <n-data-table
        :columns="columns"
        :data="sortedTokens"
        :row-key="rowKey"
        :checked-row-keys="selectedTokens"
        @update:checked-row-keys="updateSelection"
        size="small"
        max-height="400"
      />
    </template>

    <!-- Token 列表 - 移动端卡片 -->
    <template v-else>
      <div class="token-cards">
        <div
          v-for="token in sortedTokens"
          :key="token.id"
          class="token-card"
          :class="{ selected: isSelected(token.id) }"
          @click="toggleToken(token.id)"
        >
          <div class="card-header">
            <n-checkbox :checked="isSelected(token.id)" />
            <n-avatar
              :src="token.avatar || '/icons/xiaoyugan.png'"
              size="small"
              fallback-src="/icons/xiaoyugan.png"
            />
            <span class="token-name">{{ token.name }}</span>
          </div>
          <div class="card-meta">
            <n-tag size="tiny" :bordered="false">{{ token.server || '未知' }}</n-tag>
            <span v-if="token.level" class="token-level">Lv.{{ token.level }}</span>
          </div>
          <div v-if="tokenStatus[token.id]" class="card-status">
            <n-tag
              :type="getStatusType(tokenStatus[token.id])"
              size="tiny"
            >
              {{ getStatusText(tokenStatus[token.id]) }}
            </n-tag>
          </div>
        </div>
      </div>
    </template>

    <!-- 分组管理弹窗 -->
    <n-modal
      v-model:show="showGroupManageModal"
      title="管理分组"
      preset="card"
      style="width: 90vw; max-width: 600px"
    >
      <GroupManager />
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h } from 'vue';
import {
  NButton,
  NButtonGroup,
  NCheckbox,
  NDataTable,
  NAvatar,
  NTag,
  NText,
  NModal,
} from 'naive-ui';
import { useTokenStore, gameTokens, tokenGroups } from '@/stores/tokenStore';
import { useMobile } from '@/composables/useMobile';
import GroupManager from './GroupManager.vue';

const props = defineProps({
  selectedTokens: {
    type: Array,
    default: () => [],
  },
  tokenStatus: {
    type: Object,
    default: () => ({}),
  },
  sortConfig: {
    type: Object,
    required: true,
  },
  selectedGroups: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  'update:selectedTokens',
  'toggleSort',
  'toggleGroup',
  'clearGroups',
]);

const tokenStore = useTokenStore();
const { isMobile } = useMobile();

// 分组管理弹窗
const showGroupManageModal = ref(false);

// 表格列定义
const columns = [
  {
    type: 'selection',
    width: 50,
  },
  {
    title: '头像',
    key: 'avatar',
    width: 60,
    render(row) {
      return h(NAvatar, {
        src: row.avatar || '/icons/xiaoyugan.png',
        size: 'small',
        fallbackSrc: '/icons/xiaoyugan.png',
      });
    },
  },
  {
    title: '名称',
    key: 'name',
    sorter: false,
  },
  {
    title: '服务器',
    key: 'server',
    width: 120,
    render(row) {
      return h(NTag, { size: 'small', bordered: false }, () => row.server || '未知');
    },
  },
  {
    title: '等级',
    key: 'level',
    width: 80,
    render(row) {
      return row.level ? `Lv.${row.level}` : '-';
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      const status = props.tokenStatus[row.id];
      if (!status) return '-';
      return h(NTag, {
        type: getStatusType(status),
        size: 'small',
      }, () => getStatusText(status));
    },
  },
];

// 计算属性
const isAllSelected = computed(() => {
  return props.selectedTokens.length === gameTokens.value.length && gameTokens.value.length > 0;
});

const isIndeterminate = computed(() => {
  return props.selectedTokens.length > 0 && props.selectedTokens.length < gameTokens.value.length;
});

// 方法
const rowKey = (row) => row.id;

const isSelected = (tokenId) => {
  return props.selectedTokens.includes(tokenId);
};

const updateSelection = (keys) => {
  emit('update:selectedTokens', keys);
};

const toggleToken = (tokenId) => {
  const index = props.selectedTokens.indexOf(tokenId);
  const newSelection = [...props.selectedTokens];
  if (index > -1) {
    newSelection.splice(index, 1);
  } else {
    newSelection.push(tokenId);
  }
  emit('update:selectedTokens', newSelection);
};

const toggleSelectAll = (checked) => {
  if (checked) {
    emit('update:selectedTokens', gameTokens.value.map(t => t.id));
  } else {
    emit('update:selectedTokens', []);
  }
};

const toggleSort = (field) => {
  emit('toggleSort', field);
};

const getSortIcon = (field) => {
  if (props.sortConfig.field !== field) return '';
  return props.sortConfig.direction === 'asc' ? '↑' : '↓';
};

const isGroupSelected = (groupId) => {
  return props.selectedGroups.includes(groupId);
};

const toggleGroupSelection = (groupId) => {
  emit('toggleGroup', groupId);
};

const clearAllGroupSelection = () => {
  emit('clearGroups');
};

const getValidGroupTokenIds = (groupId) => {
  const group = tokenGroups.value.find((g) => g.id === groupId);
  if (!group) return [];
  const validTokenIds = gameTokens.value.map((t) => t.id);
  return group.tokenIds.filter((id) => validTokenIds.includes(id));
};

const getGroupStyle = (group) => {
  const isSelected = props.selectedGroups.includes(group.id);
  return {
    backgroundColor: isSelected ? group.color : 'transparent',
    borderColor: group.color,
    color: isSelected ? 'white' : group.color,
  };
};

const getStatusType = (status) => {
  const typeMap = {
    waiting: 'default',
    running: 'warning',
    completed: 'success',
    failed: 'error',
  };
  return typeMap[status] || 'default';
};

const getStatusText = (status) => {
  const textMap = {
    waiting: '等待中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
  };
  return textMap[status] || status;
};
</script>

<style scoped lang="scss">
.token-selector {
  .group-section {
    margin-bottom: 16px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      label {
        font-weight: 500;
        color: #333;
      }
    }

    .group-tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      .group-tag {
        padding: 6px 12px;
        border-radius: 6px;
        border: 2px solid;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
        user-select: none;

        &:hover {
          opacity: 0.8;
        }
      }
    }
  }

  .sort-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .stats-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 8px 12px;
    background-color: #f8f9fa;
    border-radius: 6px;
  }

  // 移动端卡片样式
  .token-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 400px;
    overflow-y: auto;

    .token-card {
      padding: 12px;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      background-color: white;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: #1677ff;
      }

      &.selected {
        border-color: #1677ff;
        background-color: #f0f7ff;
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;

        .token-name {
          font-weight: 500;
          flex: 1;
        }
      }

      .card-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #666;
      }

      .card-status {
        margin-top: 8px;
      }
    }
  }
}

// 深色模式适配
:deep(.dark) {
  .token-selector {
    .stats-bar {
      background-color: #2a2a2a;
    }

    .token-cards {
      .token-card {
        background-color: #1a1a1a;
        border-color: #333;

        &.selected {
          background-color: #1a2a4a;
          border-color: #1677ff;
        }

        &:hover {
          border-color: #1677ff;
        }
      }
    }
  }
}
</style>
