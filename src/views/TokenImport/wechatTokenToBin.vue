<template>
  <div class="wechat-token-to-bin">
    <n-alert type="info" class="mb-4">
      在此输入微信扫码获取的token JSON信息，生成标准bin文件
    </n-alert>

    <!-- JSON输入区域 -->
    <n-form :model="formData" label-placement="left" label-width="120px">
      <n-form-item label="Token JSON" required>
        <n-input
          v-model:value="formData.jsonInput"
          type="textarea"
          :rows="10"
          placeholder='请输入JSON格式的token信息，例如：
{
  "roleToken": "GTO7HtmZE4QoJ6hrtb6nUySlp1NAOTwzDilGou2C/qHU/E0AAlbXVn9+ntPJue/2Yn9qrDGzP68jRSoQ2mE4EhLg3oun4F9KzQbSbMqYIhrgGnWn5as4bNA8F28IIbnQe0Yj/ytau0LGWyeCy4c64Epjj4Ad127CZU3w2g9qVeY=",
  "roleId": 62644056,
  "sessId": 177363175154518,
  "connId": 1773631751553,
  "isRestore": 0
}'
        />
      </n-form-item>

      <n-form-item label="服务器ID" required>
        <n-input-number
          v-model:value="formData.serverId"
          placeholder="请输入服务器ID"
          :min="1"
          style="width: 100%"
        />
      </n-form-item>

      <n-form-item label="角色名称">
        <n-input
          v-model:value="formData.name"
          placeholder="角色名称（可选，默认从JSON解析）"
        />
      </n-form-item>

      <!-- PKCS12加密选项 -->
      <n-form-item label="使用PKCS12加密">
        <n-switch v-model:value="formData.usePkcs12" />
      </n-form-item>

      <n-form-item v-if="formData.usePkcs12" label="加密密码">
        <n-input
          v-model:value="formData.pkcs12Password"
          type="password"
          placeholder="请输入PKCS12加密密码（可选）"
          show-password-on="mousedown"
        />
      </n-form-item>
    </n-form>

    <!-- 操作按钮 -->
    <n-space class="mt-4">
      <n-button
        type="primary"
        @click="generateBin"
        :loading="isGenerating"
        :disabled="!isFormValid"
      >
        <template #icon>
          <n-icon><DocumentText /></n-icon>
        </template>
        生成Bin文件
      </n-button>

      <n-button
        v-if="binData"
        type="info"
        @click="downloadBin"
      >
        <template #icon>
          <n-icon><Download /></n-icon>
        </template>
        下载Bin文件
      </n-button>

      <n-button
        v-if="binData"
        @click="validateBin"
      >
        验证Bin文件
      </n-button>
    </n-space>

    <!-- 解析预览 -->
    <n-card v-if="parsedData" title="解析预览" class="mt-4">
      <n-descriptions :column="1" bordered>
        <n-descriptions-item label="Role ID">{{ parsedData.roleId }}</n-descriptions-item>
        <n-descriptions-item label="Role Token">{{ parsedData.roleToken?.substring(0, 50) }}...</n-descriptions-item>
        <n-descriptions-item label="Session ID">{{ parsedData.sessId }}</n-descriptions-item>
        <n-descriptions-item label="Connection ID">{{ parsedData.connId }}</n-descriptions-item>
        <n-descriptions-item label="Is Restore">{{ parsedData.isRestore }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <!-- 验证结果 -->
    <n-card v-if="validationResult" title="验证结果" class="mt-4">
      <n-alert :type="validationResult.valid ? 'success' : 'error'">
        <pre style="margin: 0; white-space: pre-wrap;">{{ validationResult.message }}</pre>
      </n-alert>
    </n-card>

    <!-- 生成的文件名 -->
    <n-card v-if="binFilename" title="生成信息" class="mt-4">
      <p><strong>文件名：</strong>{{ binFilename }}</p>
      <p><strong>文件大小：</strong>{{ binData?.length }} 字节</p>
    </n-card>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { DocumentText, Download } from '@vicons/ionicons5';
import {
  tokenToBinComplete,
  downloadBinFile,
  generateBinWithPkcs12Crypto
} from '@/utils/tokenToBin';
import {
  validateBinFile,
  formatBinInfo
} from '@/utils/binValidator';
import { useMessage } from 'naive-ui';

const message = useMessage();

const formData = reactive({
  jsonInput: '',
  serverId: null,
  name: '',
  usePkcs12: false,
  pkcs12Password: '',
});

const isGenerating = ref(false);
const binData = ref(null);
const binFilename = ref('');
const validationResult = ref(null);
const parsedData = ref(null);

// 表单验证
const isFormValid = computed(() => {
  return formData.jsonInput && formData.serverId && parsedData.value;
});

// 监听JSON输入变化，实时解析
watch(() => formData.jsonInput, (newVal) => {
  if (!newVal) {
    parsedData.value = null;
    return;
  }
  try {
    const data = JSON.parse(newVal);
    parsedData.value = data;
    // 如果用户没有输入角色名称，尝试从JSON中解析
    if (!formData.name && data.roleId) {
      formData.name = `角色_${data.roleId}`;
    }
  } catch (e) {
    parsedData.value = null;
  }
});

// 生成Bin文件
const generateBin = async () => {
  if (!isFormValid.value) {
    message.error('请填写必填项：Token JSON、服务器ID');
    return;
  }

  try {
    isGenerating.value = true;
    validationResult.value = null;

    // 解析JSON
    let tokenData;
    try {
      tokenData = JSON.parse(formData.jsonInput);
    } catch (e) {
      message.error('JSON格式错误，请检查输入');
      return;
    }

    // 构建combUser对象
    const combUser = {
      uid: tokenData.roleId,
      name: formData.name || `角色_${tokenData.roleId}`,
      roleToken: tokenData.roleToken,
      sessId: tokenData.sessId,
      connId: tokenData.connId,
      isRestore: tokenData.isRestore,
      platform: 'wechat',
    };

    // 生成设备唯一ID
    const deviceUniqueId = `DID-${crypto.randomUUID()}`;

    let result;

    if (formData.usePkcs12) {
      // 使用PKCS12加密
      const binDataResult = generateBinWithPkcs12Crypto(
        combUser,
        deviceUniqueId,
        formData.pkcs12Password || 'default_password',
        {
          platform: 'hortor',
          platformExt: 'mix',
          serverId: formData.serverId,
          scene: 0,
          referrerInfo: '',
        }
      );

      const timestamp = Date.now();
      const roleId = combUser.uid || 'unknown';
      const roleName = combUser.name || 'unknown';
      const serverId = formData.serverId || 'default';
      const filename = `bin-${serverId}-0-${roleId}-${roleName}.bin`;

      result = {
        binData: binDataResult,
        filename: filename,
      };

      message.success('Bin文件生成成功（PKCS12加密）！');
    } else {
      // 使用游戏加密模块
      result = await tokenToBinComplete(
        combUser,
        deviceUniqueId,
        {
          platform: 'hortor',
          platformExt: 'mix',
          serverId: formData.serverId,
          scene: 0,
          referrerInfo: '',
        }
      );

      message.success('Bin文件生成成功！');
    }

    binData.value = result.binData;
    binFilename.value = result.filename;

    // 自动验证
    await validateBin();

  } catch (error) {
    console.error('生成Bin文件失败:', error);
    message.error(`生成失败: ${error.message}`);
  } finally {
    isGenerating.value = false;
  }
};

// 下载Bin文件
const downloadBin = () => {
  if (!binData.value || !binFilename.value) return;

  downloadBinFile(binData.value, binFilename.value);
  message.success(`已开始下载: ${binFilename.value}`);
};

// 验证Bin文件
const validateBin = () => {
  if (!binData.value) return;

  const validation = validateBinFile(binData.value);

  validationResult.value = {
    valid: validation.valid,
    message: validation.valid
      ? `✅ 验证通过！\n\n${formatBinInfo(binData.value)}`
      : `❌ 验证失败: ${validation.error}`,
  };
};
</script>

<style scoped>
.wechat-token-to-bin {
  padding: 16px;
}
.mb-4 {
  margin-bottom: 16px;
}
.mt-4 {
  margin-top: 16px;
}
</style>
