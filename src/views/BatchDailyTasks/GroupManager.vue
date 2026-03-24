<template>
  <div class="group-manager">
    <!-- 现有分组列表 -->
    <div class="groups-list">
      <div
        v-for="group in tokenGroups"
        :key="group.id"
        class="group-item"
      >
        <div class="group-info">
          <div
            class="color-dot"
            :style="{ backgroundColor: group.color }"
          />
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">({{ getValidGroupTokenIds(group.id).length }})</span>
        </div>
        <div class="group-actions">
          <n-button size="tiny" text @click="startEdit(group)">
            编辑
          </n-button>
          <n-button size="tiny" text type="error" @click="deleteGroup(group.id)">
            删除
          </n-button>
        </div>
      </div>
    </div>

    <!-- 添加/编辑分组 -->
    <div class="group-form">
      <n-divider />
      <h4>{{ editingGroupId ? '编辑分组' : '新建分组' }}</h4>
      <n-space vertical>
        <n-input
          v-model:value="formName"
          placeholder="分组名称"
        />
        <div class="color-picker">
          <span>选择颜色:</span>
          <div class="color-options">
            <div
              v-for="color in groupColors"
              :key="color"
              class="color-option"
              :class="{ selected: formColor === color }"
              :style="{ backgroundColor: color }"
              @click="formColor = color"
            />
          </div>
        </div>
        <n-space>
          <n-button type="primary" @click="saveGroup">
            {{ editingGroupId ? '保存' : '添加' }}
          </n-button>
          <n-button v-if="editingGroupId" @click="cancelEdit">
            取消
          </n-button>
        </n-space>
      </n-space>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useMessage } from 'naive-ui';
import { useTokenStore, tokenGroups, gameTokens } from '@/stores/tokenStore';

const tokenStore = useTokenStore();
const message = useMessage();

const groupColors = [
  '#1677ff', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#13c2c2', '#eb2f96', '#fa541c',
];

const editingGroupId = ref(null);
const formName = ref('');
const formColor = ref(groupColors[0]);

const getValidGroupTokenIds = (groupId) => {
  const group = tokenGroups.value.find((g) => g.id === groupId);
  if (!group) return [];
  const validTokenIds = gameTokens.value.map((t) => t.id);
  return group.tokenIds.filter((id) => validTokenIds.includes(id));
};

const startEdit = (group) => {
  editingGroupId.value = group.id;
  formName.value = group.name;
  formColor.value = group.color;
};

const cancelEdit = () => {
  editingGroupId.value = null;
  formName.value = '';
  formColor.value = groupColors[0];
};

const saveGroup = () => {
  if (!formName.value.trim()) {
    message.error('请输入分组名称');
    return;
  }

  if (editingGroupId.value) {
    tokenStore.updateTokenGroup(editingGroupId.value, {
      name: formName.value.trim(),
      color: formColor.value,
    });
    message.success('分组已更新');
  } else {
    tokenStore.createTokenGroup(formName.value.trim(), formColor.value);
    message.success('分组已创建');
  }

  cancelEdit();
};

const deleteGroup = (groupId) => {
  const group = tokenGroups.value.find(g => g.id === groupId);
  if (!group) return;

  if (confirm(`确定要删除分组 "${group.name}" 吗？`)) {
    tokenStore.deleteTokenGroup(groupId);
    message.success('分组已删除');
  }
};
</script>

<style scoped lang="scss">
.group-manager {
  .groups-list {
    max-height: 300px;
    overflow-y: auto;

    .group-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .group-info {
        display: flex;
        align-items: center;
        gap: 8px;

        .color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .group-name {
          font-weight: 500;
        }

        .group-count {
          color: #999;
          font-size: 12px;
        }
      }

      .group-actions {
        display: flex;
        gap: 8px;
      }
    }
  }

  .group-form {
    margin-top: 16px;

    h4 {
      margin-bottom: 12px;
    }

    .color-picker {
      display: flex;
      align-items: center;
      gap: 12px;

      .color-options {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;

        .color-option {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          transition: transform 0.2s;

          &:hover {
            transform: scale(1.1);
          }

          &.selected {
            box-shadow: 0 0 0 2px white, 0 0 0 4px currentColor;
          }
        }
      }
    }
  }
}
</style>
