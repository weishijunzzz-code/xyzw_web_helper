<template>
  <div class="unauthorized-container">
    <n-result
      status="403"
      title="等待授权"
      description="您的账号正在等待管理员授权，授权后即可使用系统"
    >
      <template #icon>
        <n-icon :size="100" :component="LockClosed" />
      </template>
      <template #footer>
        <n-space vertical align="center">
          <n-text depth="3">
            用户名: {{ authStore.user?.username || '未知' }}
          </n-text>
          <n-text depth="3" v-if="authStore.user?.createdAt">
            注册时间: {{ formatDate(authStore.user.createdAt) }}
          </n-text>
          <n-space>
            <n-button @click="checkStatus">
              刷新状态
            </n-button>
            <n-button type="primary" @click="logout">
              退出登录
            </n-button>
          </n-space>
        </n-space>
      </template>
    </n-result>
  </div>
</template>

<script setup>
import { LockClosed } from '@vicons/ionicons5';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const message = useMessage();
const authStore = useAuthStore();

const formatDate = (dateStr) => {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

const checkStatus = async () => {
  try {
    const response = await authStore.checkAuthorization();
    if (response) {
      message.success('授权已生效，正在跳转...');
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } else {
      message.info('仍在等待管理员授权');
    }
  } catch (error) {
    message.error('检查授权状态失败');
  }
};

const logout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<style scoped lang="scss">
.unauthorized-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--n-color-embedded);
  padding: 20px;
}
</style>
