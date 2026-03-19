<template>
  <div class="token-to-bin-container">
    <n-card title="Token转Bin文件" class="main-card">
      <n-alert type="info" class="info-alert">
        <template #icon>
          <n-icon><InformationCircleOutline /></n-icon>
        </template>
        将微信扫码获取的Token JSON数据转换为游戏客户端可用的Bin文件格式。
        <br />
        支持两种格式：
        <n-ul>
          <n-li>标准格式：包含 info（与抓包文件格式一致）</n-li>
          <n-li>完整格式：包含 info + sign + timestamp</n-li>
        </n-ul>
      </n-alert>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-width="100"
        class="token-form"
      >
        <n-form-item label="Token JSON" path="tokenJson">
          <n-input
            v-model:value="formData.tokenJson"
            type="textarea"
            :rows="8"
            placeholder="请粘贴微信扫码获取的Token JSON数据...
示例格式：
{
  &quot;roleToken&quot;: &quot;xxx&quot;,
  &quot;roleId&quot;: 123456,
  &quot;name&quot;: &quot;角色名&quot;,
  &quot;sessId&quot;: 123,
  &quot;connId&quot;: 456,
  &quot;openid&quot;: &quot;xxx&quot;,
  &quot;unionid&quot;: &quot;xxx&quot;
}"
            class="json-input"
          />
        </n-form-item>

        <n-form-item label="服务器ID" path="serverId">
          <n-input-number
            v-model:value="formData.serverId"
            :min="0"
            placeholder="请输入服务器ID（如：5600）"
            class="server-input"
          />
        </n-form-item>

        <n-form-item label="Bin格式" path="binFormat">
          <n-radio-group v-model:value="formData.binFormat">
            <n-radio-button value="standard">标准格式（抓包格式）</n-radio-button>
            <n-radio-button value="full">完整格式（含sign）</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <n-form-item>
          <n-space>
            <n-button
              type="primary"
              @click="handleGenerateBin"
              :loading="isGenerating"
              :disabled="!isFormValid"
            >
              <template #icon>
                <n-icon><CreateOutline /></n-icon>
              </template>
              生成Bin文件
            </n-button>
            <n-button @click="handleClear">
              <template #icon>
                <n-icon><TrashOutline /></n-icon>
              </template>
              清空
            </n-button>
          </n-space>
        </n-form-item>
      </n-form>

      <!-- 解析预览 -->
      <n-divider v-if="parsedData" title-placement="left">数据预览</n-divider>
      <n-descriptions
        v-if="parsedData"
        :column="2"
        bordered
        size="small"
        class="preview-descriptions"
      >
        <n-descriptions-item label="角色ID">{{ parsedData.roleId }}</n-descriptions-item>
        <n-descriptions-item label="角色名">{{ parsedData.name || '未指定' }}</n-descriptions-item>
        <n-descriptions-item label="服务器ID">{{ formData.serverId }}</n-descriptions-item>
        <n-descriptions-item label="Token长度">{{ parsedData.roleToken?.length || 0 }}</n-descriptions-item>
      </n-descriptions>

      <!-- 生成结果 -->
      <n-divider v-if="generateResult" title-placement="left">生成结果</n-divider>
      <n-alert
        v-if="generateResult"
        :type="generateResult.success ? 'success' : 'error'"
        class="result-alert"
      >
        <template #header>
          {{ generateResult.success ? '生成成功' : '生成失败' }}
        </template>
        {{ generateResult.message }}
      </n-alert>

      <!-- 下载按钮 -->
      <n-space v-if="generateResult?.success" class="download-section">
        <n-button type="success" @click="handleDownload">
          <template #icon>
            <n-icon><DownloadOutline /></n-icon>
          </template>
          下载Bin文件
        </n-button>
        <n-text type="info">文件名：{{ generateResult.filename }}</n-text>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NRadioGroup,
  NRadioButton,
  NButton,
  NSpace,
  NAlert,
  NIcon,
  NDivider,
  NDescriptions,
  NDescriptionsItem,
  NText,
  NUl,
  NLi,
  useMessage,
  type FormInst,
  type FormRules
} from 'naive-ui';
import {
  InformationCircleOutline,
  CreateOutline,
  TrashOutline,
  DownloadOutline
} from '@vicons/ionicons5';
import { g_utils } from '@/utils/bonProtocol';

const message = useMessage();
const formRef = ref<FormInst | null>(null);

const formData = reactive({
  tokenJson: '',
  serverId: null as number | null,
  binFormat: 'standard' as 'standard' | 'full'
});

const isGenerating = ref(false);
const generateResult = ref<{
  success: boolean;
  message: string;
  binData?: Uint8Array;
  filename?: string;
} | null>(null);

// 解析Token JSON
const parsedData = computed(() => {
  if (!formData.tokenJson) return null;
  try {
    return JSON.parse(formData.tokenJson);
  } catch {
    return null;
  }
});

// 表单验证规则
const rules: FormRules = {
  tokenJson: [
    { required: true, message: '请输入Token JSON', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        if (!value) return true;
        try {
          const data = JSON.parse(value);
          if (!data.roleToken) return new Error('JSON中缺少roleToken字段');
          if (!data.roleId) return new Error('JSON中缺少roleId字段');
          return true;
        } catch {
          return new Error('请输入有效的JSON格式');
        }
      },
      trigger: 'blur'
    }
  ],
  serverId: [
    { required: true, message: '请输入服务器ID', trigger: 'blur', type: 'number' }
  ]
};

// 表单是否有效
const isFormValid = computed(() => {
  if (!formData.tokenJson || formData.serverId === null) return false;
  try {
    const data = JSON.parse(formData.tokenJson);
    return data.roleToken && data.roleId;
  } catch {
    return false;
  }
});

// SHA-256哈希函数（浏览器不支持MD5，使用SHA-256代替）
const sha256 = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 生成Bin文件
const handleGenerateBin = async () => {
  if (!isFormValid.value) {
    message.error('请填写完整的Token信息');
    return;
  }

  try {
    isGenerating.value = true;
    generateResult.value = null;

    const tokenData = JSON.parse(formData.tokenJson);
    const deviceUniqueId = `DID-${crypto.randomUUID()}`;

    // 构建用户数据结构
    const userData = {
      uid: tokenData.roleId,
      name: tokenData.name || `角色_${tokenData.roleId}`,
      token: tokenData.roleToken,
      openid: tokenData.openid || '',
      unionid: tokenData.unionid || '',
      avatar: tokenData.avatar || '',
      sessId: tokenData.sessId || 0,
      connId: tokenData.connId || 0,
      isRestore: tokenData.isRestore || 0,
    };

    // 加密用户数据
    const userDataJson = JSON.stringify(userData);
    const userDataBytes = new TextEncoder().encode(userDataJson);
    const enc = g_utils.getEnc('x');
    const encryptedInfo = enc.encrypt(userDataBytes);
    const encryptCombUser = btoa(String.fromCharCode(...encryptedInfo));

    // 生成sign和timestamp（与参考文件格式一致）
    const timestamp = Math.floor(Date.now() / 1000);
    const signText = `${encryptCombUser}${timestamp}`;
    const sign = await sha256(signText);

    // 构建info字符串（与抓包文件格式一致）
    // 注意：info是JSON字符串，包含encryptCombUser、sign、timestamp
    const infoStr = JSON.stringify({
      encryptCombUser: encryptCombUser,
      sign: sign,
      timestamp: timestamp
    });

    let mainObj: any;

    if (formData.binFormat === 'standard') {
      // 标准格式（抓包格式）
      mainObj = {
        platform: "hortor",
        platformExt: "mix",
        info: infoStr,
        serverId: formData.serverId,
        scene: 0,
        referrerInfo: "",
        deviceUniqueId: deviceUniqueId,
      };
    } else {
      // 完整格式（含sign和timestamp，且info为对象）
      mainObj = {
        platform: "hortor",
        platformExt: "mix",
        info: infoStr,
        serverId: formData.serverId,
        scene: 0,
        referrerInfo: "",
        deviceUniqueId: deviceUniqueId,
      };
    }

    // 使用g_utils.encode生成bin文件
    // 注意：使用 'lx' 而不是 'x'，因为抓包文件使用 LX加密 (LZ4+XOR)，输出以 'pl' 开头
    const binBuffer = g_utils.encode(mainObj, 'lx');
    const binData = new Uint8Array(binBuffer);

    // 生成文件名
    const roleId = tokenData.roleId || 'unknown';
    const roleName = tokenData.name || `角色_${roleId}`;
    const filename = `bin-${formData.serverId}-0-${roleId}-${roleName}.bin`;

    generateResult.value = {
      success: true,
      message: 'Bin文件生成成功！',
      binData,
      filename
    };

    message.success('Bin文件生成成功！');
  } catch (error: any) {
    console.error('生成Bin文件失败:', error);
    generateResult.value = {
      success: false,
      message: `生成失败: ${error.message}`
    };
    message.error(`生成失败: ${error.message}`);
  } finally {
    isGenerating.value = false;
  }
};

// 清空表单
const handleClear = () => {
  formData.tokenJson = '';
  formData.serverId = null;
  formData.binFormat = 'standard';
  generateResult.value = null;
  message.info('已清空');
};

// 下载Bin文件
const handleDownload = () => {
  if (!generateResult.value?.binData || !generateResult.value?.filename) return;

  const blob = new Blob([generateResult.value.binData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = generateResult.value.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  message.success(`已下载: ${generateResult.value.filename}`);
};
</script>

<style scoped>
.token-to-bin-container {
  padding: 16px;
}

.main-card {
  max-width: 800px;
  margin: 0 auto;
}

.info-alert {
  margin-bottom: 20px;
}

.token-form {
  margin-top: 20px;
}

.json-input {
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.server-input {
  width: 200px;
}

.preview-descriptions {
  margin-top: 16px;
}

.result-alert {
  margin-top: 16px;
}

.download-section {
  margin-top: 16px;
  align-items: center;
}
</style>
