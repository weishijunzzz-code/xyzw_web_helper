<template>
  <div class="game-login-import">
    <n-alert type="info" class="mb-4">
      通过游戏账号直接登录，无需抓包生成bin文件
    </n-alert>

    <n-form :model="formData" label-placement="left" label-width="120px">
      <!-- 账号信息 -->
      <n-form-item label="用户ID (UID)" required>
        <n-input-number
          v-model:value="formData.uid"
          placeholder="请输入游戏用户ID"
          style="width: 100%"
        />
      </n-form-item>

      <n-form-item label="角色名称" required>
        <n-input
          v-model:value="formData.name"
          placeholder="请输入角色名称"
        />
      </n-form-item>

      <n-form-item label="Token" required>
        <n-input
          v-model:value="formData.token"
          type="textarea"
          :rows="3"
          placeholder="请输入游戏Token（从微信扫码或其他方式获取）"
        />
      </n-form-item>

      <n-form-item label="OpenID">
        <n-input
          v-model:value="formData.openid"
          placeholder="可选，微信OpenID"
        />
      </n-form-item>

      <n-form-item label="UnionID">
        <n-input
          v-model:value="formData.unionid"
          placeholder="可选，微信UnionID"
        />
      </n-form-item>

      <n-form-item label="头像URL">
        <n-input
          v-model:value="formData.avatar"
          placeholder="可选，头像链接"
        />
      </n-form-item>

      <n-divider />

      <!-- 加密选项 -->
      <n-form-item label="使用PKCS12加密">
        <n-switch v-model:value="formData.usePkcs12" />
      </n-form-item>

      <n-form-item v-if="formData.usePkcs12" label="加密密码">
        <n-input
          v-model:value="formData.pkcs12Password"
          type="password"
          placeholder="请输入PKCS12加密密码"
          show-password-on="mousedown"
        />
      </n-form-item>

      <n-form-item label="设备唯一ID">
        <n-input
          v-model:value="formData.deviceUniqueId"
          placeholder="可选，自动生成"
        />
      </n-form-item>
    </n-form>

    <!-- 操作按钮 -->
    <n-space class="mt-4">
      <n-button
        type="primary"
        @click="performLogin"
        :loading="isLoggingIn"
        :disabled="!isFormValid"
      >
        <template #icon>
          <n-icon><LogIn /></n-icon>
        </template>
        登录并生成Bin
      </n-button>

      <n-button @click="resetForm">
        重置
      </n-button>
    </n-space>

    <!-- 登录结果 -->
    <n-card v-if="loginResult" title="登录结果" class="mt-4">
      <n-alert :type="loginResult.success ? 'success' : 'error'">
        {{ loginResult.message }}
      </n-alert>

      <template v-if="loginResult.success">
        <n-descriptions :column="1" bordered class="mt-4">
          <n-descriptions-item label="Role ID">{{ loginResult.authResponse?.roleId }}</n-descriptions-item>
          <n-descriptions-item label="Session ID">{{ loginResult.authResponse?.sessId }}</n-descriptions-item>
          <n-descriptions-item label="Connection ID">{{ loginResult.authResponse?.connId }}</n-descriptions-item>
          <n-descriptions-item label="Token长度">{{ loginResult.tokenJson?.length }} 字符</n-descriptions-item>
          <n-descriptions-item label="Bin文件大小">{{ loginResult.binFile?.length }} 字节</n-descriptions-item>
        </n-descriptions>

        <n-space class="mt-4">
          <n-button type="info" @click="downloadBinFile">
            <template #icon>
              <n-icon><Download /></n-icon>
            </template>
            下载Bin文件
          </n-button>

          <n-button type="success" @click="importToSystem">
            <template #icon>
              <n-icon><Add /></n-icon>
            </template>
            导入到系统
          </n-button>

          <n-button @click="copyTokenJson">
            <template #icon>
              <n-icon><Copy /></n-icon>
            </template>
            复制Token JSON
          </n-button>
        </n-space>
      </template>
    </n-card>

    <!-- 使用说明 -->
    <n-card title="使用说明" class="mt-4">
      <n-steps vertical :current="3">
        <n-step title="获取基础Token">
          <template #description>
            通过微信扫码登录游戏，从浏览器开发者工具中获取基础Token（不包含sessId和connId）
          </template>
        </n-step>
        <n-step title="填写账号信息">
          <template #description>
            输入用户ID、角色名称和基础Token
          </template>
        </n-step>
        <n-step title="登录生成">
          <template #description>
            点击"登录并生成Bin"按钮，系统会自动向游戏服务器发送认证请求，获取完整的会话信息
          </template>
        </n-step>
      </n-steps>

      <n-alert type="warning" class="mt-4">
        <strong>注意事项：</strong>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>此方法需要能够访问游戏认证服务器（可能需要处理跨域问题）</li>
          <li>生成的bin文件包含服务器颁发的会话ID，有效期通常为24小时</li>
          <li>如果登录失败，请检查Token是否过期或网络连接是否正常</li>
        </ul>
      </n-alert>
    </n-card>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { LogIn, Download, Add, Copy } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { performGameLogin, validateBinFile } from '@/utils/gameAuth';
import { useTokenStore } from '@/stores/tokenStore';

const message = useMessage();
const tokenStore = useTokenStore();

const formData = reactive({
  uid: null,
  name: '',
  token: '',
  openid: '',
  unionid: '',
  avatar: '',
  usePkcs12: false,
  pkcs12Password: '',
  deviceUniqueId: '',
});

const isLoggingIn = ref(false);
const loginResult = ref(null);

// 表单验证
const isFormValid = computed(() => {
  return formData.uid && formData.name && formData.token;
});

// 执行登录
const performLogin = async () => {
  if (!isFormValid.value) {
    message.error('请填写必填项：用户ID、角色名称、Token');
    return;
  }

  try {
    isLoggingIn.value = true;
    loginResult.value = null;

    // 生成设备ID
    const deviceUniqueId = formData.deviceUniqueId || `DID-${crypto.randomUUID()}`;

    // 调用登录流程
    const result = await performGameLogin(
      {
        uid: formData.uid,
        name: formData.name,
        token: formData.token,
        openid: formData.openid,
        unionid: formData.unionid,
        avatar: formData.avatar,
      },
      {
        usePkcs12: formData.usePkcs12,
        pkcs12Password: formData.pkcs12Password,
        deviceUniqueId,
      }
    );

    // 验证生成的bin文件
    const validation = validateBinFile(result.binFile);

    loginResult.value = {
      success: true,
      message: '登录成功！已生成完整的bin文件和Token信息。',
      authResponse: result.authResponse,
      binFile: result.binFile,
      tokenJson: result.tokenJson,
      validation,
    };

    message.success('登录成功！');

  } catch (error) {
    console.error('登录失败:', error);
    loginResult.value = {
      success: false,
      message: `登录失败: ${error.message}`,
    };
    message.error(`登录失败: ${error.message}`);
  } finally {
    isLoggingIn.value = false;
  }
};

// 下载bin文件
const downloadBinFile = () => {
  if (!loginResult.value?.binFile) return;

  const blob = new Blob([loginResult.value.binFile], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bin-default-0-${loginResult.value.authResponse.roleId}-${formData.name}.bin`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  message.success('Bin文件下载成功');
};

// 导入到系统
const importToSystem = async () => {
  if (!loginResult.value?.tokenJson) return;

  try {
    const tokenData = JSON.parse(loginResult.value.tokenJson);

    // 导入到tokenStore
    const result = tokenStore.importBase64Token(
      formData.name,
      loginResult.value.tokenJson,
      {
        server: 'default',
        importMethod: 'manual',
      }
    );

    if (result.success) {
      message.success(`Token "${result.tokenName}" 已成功导入系统`);
      // 触发父组件关闭
      emit('ok');
    } else {
      message.error(result.message || '导入失败');
    }
  } catch (error) {
    message.error(`导入失败: ${error.message}`);
  }
};

// 复制Token JSON
const copyTokenJson = async () => {
  if (!loginResult.value?.tokenJson) return;

  try {
    await navigator.clipboard.writeText(loginResult.value.tokenJson);
    message.success('Token JSON已复制到剪贴板');
  } catch (error) {
    message.error('复制失败');
  }
};

// 重置表单
const resetForm = () => {
  formData.uid = null;
  formData.name = '';
  formData.token = '';
  formData.openid = '';
  formData.unionid = '';
  formData.avatar = '';
  formData.usePkcs12 = false;
  formData.pkcs12Password = '';
  formData.deviceUniqueId = '';
  loginResult.value = null;
};

const emit = defineEmits(['ok', 'cancel']);
</script>

<style scoped>
.game-login-import {
  padding: 16px;
}

.mb-4 {
  margin-bottom: 16px;
}

.mt-4 {
  margin-top: 16px;
}
</style>
