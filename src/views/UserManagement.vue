<template>
  <div class="user-management">
    <n-card title="用户管理">
      <n-space vertical :size="16">
        <!-- 统计信息 -->
        <n-row :gutter="16">
          <n-col :span="6">
            <n-statistic label="总用户数" :value="stats.total" />
          </n-col>
          <n-col :span="6">
            <n-statistic label="活跃用户" :value="stats.active" />
          </n-col>
          <n-col :span="6">
            <n-statistic label="已授权用户" :value="stats.authorized" />
          </n-col>
          <n-col :span="6">
            <n-statistic label="管理员" :value="stats.admins" />
          </n-col>
        </n-row>

        <n-divider />

        <!-- 用户列表 -->
        <n-data-table
          :columns="columns"
          :data="users"
          :loading="loading"
          :pagination="pagination"
          @update:page="handlePageChange"
        />
      </n-space>
    </n-card>

    <!-- 授权对话框 -->
    <n-modal
      v-model:show="showAuthorizeModal"
      title="授权用户"
      preset="dialog"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleAuthorize"
    >
      <n-form :model="authorizeForm">
        <n-form-item label="授权方式">
          <n-radio-group v-model:value="authorizeForm.type">
            <n-radio value="days">按天数</n-radio>
            <n-radio value="date">按日期</n-radio>
          </n-radio-group>
        </n-form-item>
        <n-form-item v-if="authorizeForm.type === 'days'" label="授权天数">
          <n-input-number v-model:value="authorizeForm.days" :min="1" :max="365" />
        </n-form-item>
        <n-form-item v-else label="到期日期">
          <n-date-picker v-model:value="authorizeForm.date" type="datetime" />
        </n-form-item>
      </n-form>
    </n-modal>

    <!-- Token上限对话框 -->
    <n-modal
      v-model:show="showMaxTokensModal"
      title="设置Token上限"
      preset="dialog"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleUpdateMaxTokens"
    >
      <n-form>
        <n-form-item label="Token数量上限">
          <n-input-number v-model:value="maxTokensForm.maxTokens" :min="1" :max="100" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue';
import { useMessage, NButton, NSpace, NTag, NSwitch } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';
import api from '@/api';

const message = useMessage();
const authStore = useAuthStore();

const users = ref([]);
const loading = ref(false);
const stats = ref({ total: 0, active: 0, authorized: 0, admins: 0 });
const pagination = ref({ page: 1, pageSize: 20, itemCount: 0 });

const showAuthorizeModal = ref(false);
const showMaxTokensModal = ref(false);
const currentUser = ref(null);

const authorizeForm = ref({
  type: 'days',
  days: 30,
  date: null
});

const maxTokensForm = ref({
  maxTokens: 3
});

const columns = [
  { title: '用户名', key: 'username' },
  {
    title: '管理员',
    key: 'isAdmin',
    render(row) {
      return h(NTag, { type: row.isAdmin ? 'success' : 'default' }, {
        default: () => row.isAdmin ? '是' : '否'
      });
    }
  },
  {
    title: '状态',
    key: 'isActive',
    render(row) {
      return h(NTag, { type: row.isActive ? 'success' : 'error' }, {
        default: () => row.isActive ? '正常' : '禁用'
      });
    }
  },
  {
    title: '授权状态',
    key: 'isAuthorized',
    render(row) {
      if (row.isAdmin) {
        return h(NTag, { type: 'success' }, { default: () => '永久授权' });
      }
      return h(NTag, { type: row.isAuthorized ? 'success' : 'warning' }, {
        default: () => row.isAuthorized ? '已授权' : '未授权'
      });
    }
  },
  {
    title: 'Token上限',
    key: 'maxTokens',
    render(row) {
      return h('span', row.maxTokens || 3);
    }
  },
  {
    title: '注册时间',
    key: 'createdAt',
    render(row) {
      return row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '-';
    }
  },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      return h(NSpace, null, {
        default: () => [
          !row.isAdmin && h(NButton, {
            size: 'small',
            type: row.isAuthorized ? 'default' : 'primary',
            onClick: () => openAuthorizeModal(row)
          }, { default: () => row.isAuthorized ? '重新授权' : '授权' }),
          !row.isAdmin && h(NButton, {
            size: 'small',
            onClick: () => openMaxTokensModal(row)
          }, { default: () => 'Token上限' }),
          !row.isAdmin && h(NButton, {
            size: 'small',
            type: row.isActive ? 'warning' : 'success',
            onClick: () => toggleUserActive(row)
          }, { default: () => row.isActive ? '禁用' : '启用' }),
          !row.isAdmin && h(NButton, {
            size: 'small',
            type: 'error',
            onClick: () => deleteUser(row)
          }, { default: () => '删除' })
        ]
      });
    }
  }
];

const loadData = async () => {
  loading.value = true;
  try {
    const [usersRes, statsRes] = await Promise.all([
      api.admin.getUsers({ page: pagination.value.page, per_page: pagination.value.pageSize }),
      api.admin.getStats()
    ]);

    if (usersRes.success) {
      users.value = usersRes.data.users;
      pagination.value.itemCount = usersRes.data.total;
    }

    if (statsRes.success) {
      stats.value = {
        total: statsRes.data.users.total,
        active: statsRes.data.users.active,
        authorized: statsRes.data.users.authorized,
        admins: statsRes.data.users.admins
      };
    }
  } catch (error) {
    message.error('加载数据失败');
  } finally {
    loading.value = false;
  }
};

const handlePageChange = (page) => {
  pagination.value.page = page;
  loadData();
};

const openAuthorizeModal = (user) => {
  currentUser.value = user;
  authorizeForm.value = { type: 'days', days: 30, date: null };
  showAuthorizeModal.value = true;
};

const handleAuthorize = async () => {
  try {
    let res;
    if (authorizeForm.value.type === 'days') {
      res = await api.admin.authorizeUser(currentUser.value.id, authorizeForm.value.days);
    } else {
      const dateStr = new Date(authorizeForm.value.date).toISOString();
      res = await api.admin.authorizeUserUntil(currentUser.value.id, dateStr);
    }

    if (res.success) {
      message.success('授权成功');
      loadData();
    } else {
      message.error(res.message || '授权失败');
    }
  } catch (error) {
    message.error('授权失败');
  }
};

const openMaxTokensModal = (user) => {
  currentUser.value = user;
  maxTokensForm.value.maxTokens = user.maxTokens || 3;
  showMaxTokensModal.value = true;
};

const handleUpdateMaxTokens = async () => {
  try {
    const res = await api.admin.updateUserMaxTokens(currentUser.value.id, maxTokensForm.value.maxTokens);
    if (res.success) {
      message.success('Token上限已更新');
      loadData();
    } else {
      message.error(res.message || '更新失败');
    }
  } catch (error) {
    message.error('更新失败');
  }
};

const toggleUserActive = async (user) => {
  try {
    const res = await api.admin.toggleUserActive(user.id);
    if (res.success) {
      message.success(user.isActive ? '用户已禁用' : '用户已启用');
      loadData();
    } else {
      message.error(res.message || '操作失败');
    }
  } catch (error) {
    message.error('操作失败');
  }
};

const deleteUser = async (user) => {
  if (!confirm(`确定要删除用户 "${user.username}" 吗？此操作不可恢复。`)) {
    return;
  }

  try {
    const res = await api.admin.deleteUser(user.id);
    if (res.success) {
      message.success('用户已删除');
      loadData();
    } else {
      message.error(res.message || '删除失败');
    }
  } catch (error) {
    message.error('删除失败');
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped lang="scss">
.user-management {
  padding: 20px;
}
</style>
