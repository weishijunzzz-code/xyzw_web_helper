<template>
  <div class="login-container">
    <n-card class="login-card" title="用户登录">
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        @submit.prevent="handleLogin"
      >
        <n-form-item label="用户名" path="username">
          <n-input
            v-model:value="formData.username"
            placeholder="请输入用户名"
            @keyup.enter="handleLogin"
          />
        </n-form-item>

        <n-form-item label="密码" path="password">
          <n-input
            v-model:value="formData.password"
            type="password"
            placeholder="请输入密码"
            show-password-on="mousedown"
            @keyup.enter="handleLogin"
          />
        </n-form-item>

        <n-form-item>
          <n-button
            type="primary"
            size="large"
            :loading="authStore.isLoading"
            :disabled="!formData.username || !formData.password"
            block
            @click="handleLogin"
          >
            登录
          </n-button>
        </n-form-item>

        <n-form-item>
          <n-button
            quaternary
            block
            @click="goToRegister"
          >
            还没有账号？立即注册
          </n-button>
        </n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const message = useMessage();
const authStore = useAuthStore();

const formRef = ref(null);
const formData = reactive({
  username: '',
  password: ''
});

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度应在3-20个字符之间', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ]
};

const handleLogin = async () => {
  try {
    await formRef.value?.validate();

    const result = await authStore.login({
      username: formData.username,
      password: formData.password
    });

    if (result.success) {
      message.success('登录成功');
      router.push('/');
    } else {
      message.error(result.message || '登录失败');
    }
  } catch (error) {
    console.error('登录错误:', error);
    message.error(error.message || '登录失败');
  }
};

const goToRegister = () => {
  router.push('/register');
};
</script>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--n-color-embedded);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 400px;
}
</style>
