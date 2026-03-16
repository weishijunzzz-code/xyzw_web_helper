<template>
  <div class="wechat-token-to-bin">
    <n-alert type="info" class="mb-4">
      在此输入微信扫码获取的token信息，生成标准bin文件
    </n-alert>

    <!-- Token信息输入表单 -->
    <n-form :model="formData" label-placement="left" label-width="120px">
      <n-form-item label="UID" required>
        <n-input 
          v-model:value="formData.uid" 
          placeholder="请输入微信用户ID"
        />
      </n-form-item>
      
      <n-form-item label="角色名称" required>
        <n-input 
          v-model:value="formData.name" 
          placeholder="请输入角色名称"
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
      
      <n-form-item label="微信Token">
        <n-input 
          v-model:value="formData.token" 
          type="textarea"
          :rows="3"
          placeholder="请输入微信token（可选）"
        />
      </n-form-item>
      
      <n-form-item label="OpenID">
        <n-input 
          v-model:value="formData.openid" 
          placeholder="请输入微信openid（可选）"
        />
      </n-form-item>
      
      <n-form-item label="UnionID">
        <n-input 
          v-model:value="formData.unionid" 
          placeholder="请输入微信unionid（可选）"
        />
      </n-form-item>
      
      <n-form-item label="头像URL">
        <n-input 
          v-model:value="formData.avatar" 
          placeholder="请输入头像URL（可选）"
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
import { reactive, ref, computed } from 'vue';
import { DocumentText, Download } from '@vicons/ionicons5';
import { 
  tokenToBinComplete, 
  downloadBinFile 
} from '@/utils/tokenToBin';
import { 
  validateBinFile, 
  formatBinInfo 
} from '@/utils/binValidator';
import { useMessage } from 'naive-ui';

const message = useMessage();

const formData = reactive({
  uid: '',
  name: '',
  serverId: null,
  token: '',
  openid: '',
  unionid: '',
  avatar: '',
});

const isGenerating = ref(false);
const binData = ref(null);
const binFilename = ref('');
const validationResult = ref(null);

// 表单验证
const isFormValid = computed(() => {
  return formData.uid && formData.name && formData.serverId;
});

// 生成Bin文件
const generateBin = async () => {
  if (!isFormValid.value) {
    message.error('请填写必填项：UID、角色名称、服务器ID');
    return;
  }

  try {
    isGenerating.value = true;
    validationResult.value = null;

    // 构建combUser对象（微信token信息）
    const combUser = {
      uid: formData.uid,
      name: formData.name,
      token: formData.token || undefined,
      openid: formData.openid || undefined,
      unionid: formData.unionid || undefined,
      avatar: formData.avatar || undefined,
      // 添加微信标识
      platform: 'wechat',
    };

    // 生成设备唯一ID
    const deviceUniqueId = `DID-${crypto.randomUUID()}`;

    // 调用tokenToBinComplete生成bin文件
    const result = await tokenToBinComplete(
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

    binData.value = result.binData;
    binFilename.value = result.filename;

    message.success('Bin文件生成成功！');

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
