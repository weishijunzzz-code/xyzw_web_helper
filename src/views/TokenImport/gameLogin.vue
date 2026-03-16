<template>
  <div class="game-login-import">
    <n-alert type="info" class="mb-4">
      直接粘贴微信扫码生成的JSON数据，快速登录并生成bin文件
    </n-alert>

    <n-form :model="formData" label-placement="left" label-width="120px">
      <!-- JSON输入区域 -->
      <n-form-item label="Token JSON" required>
        <n-input
          v-model:value="formData.jsonInput"
          type="textarea"
          :rows="8"
          placeholder='请粘贴微信扫码生成的JSON，例如：
{"roleToken":"GTO7HtmZE4QoJ6hrtb6nUySlp1NAOTwz...","roleId":62644056,"sessId":177363175154518,"connId":1773631751553,"isRestore":0}'
        />
      </n-form-item>

      <!-- 解析后的信息展示 -->
      <n-card v-if="parsedData" title="解析结果" size="small" class="mb-4">
        <n-descriptions :column="2" size="small">
          <n-descriptions-item label="角色ID">{{ parsedData.roleId }}</n-descriptions-item>
          <n-descriptions-item label="会话ID">{{ parsedData.sessId }}</n-descriptions-item>
          <n-descriptions-item label="连接ID">{{ parsedData.connId }}</n-descriptions-item>
          <n-descriptions-item label="Token长度">{{ parsedData.roleToken?.length }} 字符</n-descriptions-item>
        </n-descriptions>
      </n-card>

      <n-divider />

      <!-- 可选配置 -->
      <n-form-item label="角色名称">
        <n-input
          v-model:value="formData.name"
          placeholder="可选，默认使用角色ID"
        />
      </n-form-item>

      <n-form-item label="使用PKCS12加密">
        <n-switch v-model:value="formData.usePkcs12" />
      </n-form-item>

      <n-form-item v-if="formData.usePkcs12" label="加密密码">
        <n-input
          v-model:value="formData.pkcs12Password"
          type="password"
          placeholder="可选，默认使用内置密码"
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
          <n-icon><Download /></n-icon>
        </template>
        生成Bin文件
      </n-button>

      <n-button @click="resetForm">
        重置
      </n-button>
    </n-space>

    <!-- 生成结果 -->
    <n-card v-if="generateResult" title="生成结果" class="mt-4">
      <n-alert :type="generateResult.success ? 'success' : 'error'">
        {{ generateResult.message }}
      </n-alert>

      <template v-if="generateResult.success">
        <n-descriptions :column="1" bordered class="mt-4">
          <n-descriptions-item label="文件名">{{ generateResult.filename }}</n-descriptions-item>
          <n-descriptions-item label="文件大小">{{ generateResult.binData?.length }} 字节</n-descriptions-item>
          <n-descriptions-item label="验证结果">
            <n-tag :type="generateResult.validation?.valid ? 'success' : 'error'">
              {{ generateResult.validation?.valid ? '格式正确' : '格式异常' }}
            </n-tag>
          </n-descriptions-item>
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
        </n-space>
      </template>
    </n-card>

    <!-- 使用说明 -->
    <n-card title="使用说明" class="mt-4" size="small">
      <n-steps vertical :current="2">
        <n-step title="微信扫码登录">
          <template #description>
            使用微信扫码登录游戏，在浏览器开发者工具中找到登录请求的响应数据
          </template>
        </n-step>
        <n-step title="复制JSON数据">
          <template #description>
            复制包含 roleToken、roleId、sessId、connId 的JSON数据
          </template>
        </n-step>
        <n-step title="粘贴生成">
          <template #description>
            将JSON粘贴到上方输入框，点击"生成Bin文件"按钮即可
          </template>
        </n-step>
      </n-steps>

      <n-alert type="warning" class="mt-4">
        <strong>注意事项：</strong>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>JSON数据包含敏感信息，请勿分享给他人</li>
          <li>生成的bin文件有效期通常为24小时</li>
          <li>如果生成失败，请检查JSON格式是否正确</li>
        </ul>
      </n-alert>
    </n-card>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { Download, Add } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { buildBinFileFromData, generateSign } from '@/utils/tokenToBin';
import { validateBinFile } from '@/utils/gameAuth';
import { useTokenStore } from '@/stores/tokenStore';
import { MD5, enc } from 'crypto-js';
import { encryptGameData } from '@/utils/gameCrypto';

const message = useMessage();
const tokenStore = useTokenStore();

const formData = reactive({
  jsonInput: '',
  name: '',
  usePkcs12: false,
  pkcs12Password: '',
});

const isGenerating = ref(false);
const generateResult = ref(null);
const parsedData = ref(null);

// 监听JSON输入，自动解析
watch(() => formData.jsonInput, (newValue) => {
  if (!newValue) {
    parsedData.value = null;
    return;
  }

  try {
    const data = JSON.parse(newValue);
    parsedData.value = data;

    // 自动填充角色名称（如果没有手动填写）
    if (!formData.name && data.roleId) {
      formData.name = `角色_${data.roleId}`;
    }
  } catch (e) {
    parsedData.value = null;
  }
}, { immediate: true });

// 表单验证
const isFormValid = computed(() => {
  if (!formData.jsonInput) return false;

  try {
    const data = JSON.parse(formData.jsonInput);
    return data.roleToken && data.roleId && data.sessId && data.connId !== undefined;
  } catch (e) {
    return false;
  }
});

// 生成Bin文件
const generateBin = async () => {
  if (!isFormValid.value) {
    message.error('请粘贴有效的Token JSON数据');
    return;
  }

  try {
    isGenerating.value = true;
    generateResult.value = null;

    // 解析JSON
    const tokenData = JSON.parse(formData.jsonInput);

    // 生成设备唯一ID
    const deviceUniqueId = `DID-${crypto.randomUUID()}`;

    // 构建用户数据结构（与游戏客户端发送的格式一致）
    const userData = {
      uid: tokenData.roleId,
      name: formData.name || `角色_${tokenData.roleId}`,
      token: tokenData.roleToken,
      openid: tokenData.openid || '',
      unionid: tokenData.unionid || '',
      avatar: tokenData.avatar || '',
      sessId: tokenData.sessId,
      connId: tokenData.connId,
      isRestore: tokenData.isRestore || 0,
    };

    // 将用户数据转为JSON字符串，然后使用游戏加密算法加密
    const userDataJson = JSON.stringify(userData);
    const encryptedInfo = encryptGameData(userDataJson);

    // 构建bin文件数据
    const timestamp = Math.floor(Date.now() / 1000);

    // 构建JSON内容（不包含sign，与参考文件格式一致）
    const jsonContent = {
      info: encryptedInfo,
      timestamp: timestamp,
    };

    const jsonStr = JSON.stringify(jsonContent);
    const jsonBytes = new TextEncoder().encode(jsonStr);

    // 构建BON尾部
    const bonTail = buildBonTail(deviceUniqueId);

    // 合并数据
    const binData = new Uint8Array(jsonBytes.length + bonTail.length);
    binData.set(jsonBytes, 0);
    binData.set(bonTail, jsonBytes.length);

    // 验证bin文件
    const validation = validateBinFile(binData);

    // 生成文件名
    const roleId = tokenData.roleId || 'unknown';
    const roleName = formData.name || `角色_${roleId}`;
    const filename = `bin-default-0-${roleId}-${roleName}.bin`;

    generateResult.value = {
      success: true,
      message: 'Bin文件生成成功！',
      binData,
      filename,
      validation,
      tokenData,
    };

    message.success('Bin文件生成成功！');

  } catch (error) {
    console.error('生成Bin文件失败:', error);
    generateResult.value = {
      success: false,
      message: `生成失败: ${error.message}`,
    };
    message.error(`生成失败: ${error.message}`);
  } finally {
    isGenerating.value = false;
  }
};

// 构建BON尾部
const buildBonTail = (deviceUniqueId) => {
  const writer = [];

  // serverId（NULL值）
  writer.push(0x05, 0x08);
  writer.push(...new TextEncoder().encode('serverId'));
  writer.push(0x00);

  // scene（int32，值为0）
  writer.push(0x05, 0x05);
  writer.push(...new TextEncoder().encode('scene'));
  writer.push(0x01, 0x00, 0x00, 0x00, 0x00);

  // referrerInfo（空字符串）
  writer.push(0x05, 0x0c);
  writer.push(...new TextEncoder().encode('referrerInfo'));
  writer.push(0x05, 0x00);

  // deviceUniqueId（字符串）
  writer.push(0x05, 0x0e);
  writer.push(...new TextEncoder().encode('deviceUniqueId'));
  writer.push(0x05, deviceUniqueId.length);
  writer.push(...new TextEncoder().encode(deviceUniqueId));

  return new Uint8Array(writer);
};

// 下载bin文件
const downloadBinFile = () => {
  if (!generateResult.value?.binData) return;

  const blob = new Blob([generateResult.value.binData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = generateResult.value.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  message.success('Bin文件下载成功');
};

// 导入到系统
const importToSystem = async () => {
  if (!generateResult.value?.tokenData) return;

  try {
    const tokenData = generateResult.value.tokenData;

    // 构建完整的token JSON
    const fullTokenJson = JSON.stringify({
      roleToken: tokenData.roleToken,
      roleId: tokenData.roleId,
      sessId: tokenData.sessId,
      connId: tokenData.connId,
      isRestore: tokenData.isRestore || 0,
    });

    // 导入到tokenStore
    const result = tokenStore.importBase64Token(
      formData.name || `角色_${tokenData.roleId}`,
      fullTokenJson,
      {
        server: 'default',
        importMethod: 'gameLogin',
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

// 重置表单
const resetForm = () => {
  formData.jsonInput = '';
  formData.name = '';
  formData.usePkcs12 = false;
  formData.pkcs12Password = '';
  generateResult.value = null;
  parsedData.value = null;
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
