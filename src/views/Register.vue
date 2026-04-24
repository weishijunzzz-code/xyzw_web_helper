<template>
  <div class="register-container">
    <n-card class="register-card" title="用户注册">
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        @submit.prevent="handleRegister"
      >
        <n-form-item label="用户名" path="username">
          <n-input
            v-model:value="formData.username"
            placeholder="请输入用户名（3-20个字符）"
            @keyup.enter="handleRegister"
          />
        </n-form-item>

        <n-form-item label="密码" path="password">
          <n-input
            v-model:value="formData.password"
            type="password"
            placeholder="请输入密码（至少6位）"
            show-password-on="mousedown"
            @keyup.enter="handleRegister"
          />
        </n-form-item>

        <n-form-item label="确认密码" path="confirmPassword">
          <n-input
            v-model:value="formData.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            show-password-on="mousedown"
            @keyup.enter="handleRegister"
          />
        </n-form-item>

        <n-form-item>
          <n-alert type="info" :show-icon="false">
            注册成功后需要管理员授权才能使用系统
          </n-alert>
        </n-form-item>

        <n-form-item>
          <n-button
            type="primary"
            size="large"
            :loading="authStore.isLoading"
            :disabled="!formData.username || !formData.password || !formData.confirmPassword"
            block
            @click="handleRegister"
          >
            注册
          </n-button>
        </n-form-item>

        <n-form-item>
          <n-button
            quaternary
            block
            @click="goToLogin"
          >
            已有账号？立即登录
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
  password: '',
  confirmPassword: ''
});

const validateConfirmPassword = (rule, value) => {
  return value === formData.password;
};

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度应在3-20个字符之间', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirmPassword, message: '两次输入的密码不一致', trigger: 'blur' }
  ]
};

const handleRegister = async () => {
  try {
    await formRef.value?.validate();

    const result = await authStore.register({
      username: formData.username,
      password: formData.password
    });

    if (result.success) {
      message.success(result.message || '注册成功');
      router.push('/login');
    } else {
      message.error(result.message || '注册失败');
    }
  } catch (error) {
    console.error('注册错误:', error);
    message.error(error.message || '注册失败');
  }
};

const goToLogin = () => {
  router.push('/login');
};
</script>

<style scoped lang="scss">
.register-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--n-color-embedded);
  padding: 20px;
}

.register-card {
  width: 100%;
  max-width: 400px;
}
</style>
