<template>
  <div class="bin-import-mobile">
    <!-- 顶部标题 -->
    <div class="mobile-header">
      <n-button text @click="$emit('cancel')" class="back-btn">
        <template #icon>
          <n-icon><ChevronBack /></n-icon>
        </template>
      </n-button>
      <h3 class="header-title">BIN文件导入</h3>
      <div class="header-spacer"></div>
    </div>

    <!-- 主要内容区域 -->
    <div class="mobile-content">
      <!-- 文件上传区域 -->
      <div class="upload-section">
        <n-upload
          accept=".bin,.dmp"
          :max="1"
          @before-upload="handleBinUpload"
          draggable
        >
          <n-upload-dragger class="upload-dragger">
            <div class="upload-content">
              <div class="upload-icon">
                <n-icon size="48"><ArchiveOutline /></n-icon>
              </div>
              <n-text style="font-size: 16px; font-weight: 500;">点击或拖拽上传BIN文件</n-text>
              <n-p depth="3" style="margin-top: 8px; font-size: 13px;">支持 .bin, .dmp 格式文件</n-p>
            </div>
          </n-upload-dragger>
        </n-upload>
      </div>

      <!-- 角色命名格式 -->
      <div class="name-template-section">
        <div class="section-label">角色命名格式</div>
        <n-input v-model:value="nameTemplate" placeholder="{name}-{index}-{id}" />
        <div class="template-hint">
          支持变量: {name}角色名, {id}角色ID, {index}角色序号, {server}区服
        </div>
      </div>

      <!-- 角色列表 -->
      <div v-if="serverListData.length > 0" class="role-section">
        <div class="section-title">
          <span>选择角色</span>
          <span class="role-count">({{ serverListData.length }})</span>
        </div>
        <div class="role-list">
          <div
            v-for="role in serverListData"
            :key="role.roleId"
            class="role-item"
            @click="addSelectedRole(role)"
          >
            <div class="role-info">
              <div class="role-name">{{ role.name }}</div>
              <div class="role-meta">
                <n-tag size="tiny" :bordered="false">{{ role.serverId }}服</n-tag>
                <span class="role-power">战力: {{ formatPower(role.power) }}</span>
              </div>
            </div>
            <n-button type="primary" size="tiny" :loading="isProcessing">
              添加
            </n-button>
          </div>
        </div>
      </div>

      <!-- 已选角色 -->
      <div v-if="roleList.length > 0" class="selected-section">
        <div class="section-title">
          <span>已选角色</span>
          <span class="role-count">({{ roleList.length }})</span>
        </div>
        <div class="selected-list">
          <div
            v-for="(role, index) in roleList"
            :key="role.id"
            class="selected-item"
          >
            <div class="selected-info">
              <div class="selected-name">{{ role.name }}</div>
              <div class="selected-server">{{ role.server }}</div>
            </div>
            <n-button text type="error" size="small" @click.stop="removeRole(index)">
              <template #icon>
                <n-icon><Trash /></n-icon>
              </template>
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="mobile-footer">
      <n-button
        type="primary"
        block
        size="large"
        :loading="isImporting"
        :disabled="roleList.length === 0"
        @click="handleImport"
      >
        添加 {{ roleList.length > 0 ? `(${roleList.length})` : '' }} 个Token
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import {
  ChevronBack,
  ArchiveOutline,
  Trash,
} from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { getTokenId, transformToken, getServerList } from "@/utils/token";
import useIndexedDB from "@/hooks/useIndexedDB";
import { g_utils } from "@/utils/bonProtocol";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();
const { storeArrayBuffer } = useIndexedDB();
const message = useMessage();

const emit = defineEmits(["cancel", "ok"]);

// 响应式数据
const isProcessing = ref(false);
const isImporting = ref(false);
const nameTemplate = ref("{name}-{index}-{id}");
const serverListData = ref([]);
const originalBinData = ref(null);
const roleList = ref([]);

// 格式化战力
const formatPower = (power) => {
  if (!power) return "0";
  if (power >= 100000000) return (power / 100000000).toFixed(1) + "亿";
  if (power >= 10000) return (power / 10000).toFixed(1) + "万";
  return power.toString();
};

// 处理BIN文件上传
const handleBinUpload = async (file) => {
  isProcessing.value = true;
  
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const userToken = e.target?.result;
      if (!userToken) {
        message.error("读取文件失败");
        isProcessing.value = false;
        return;
      }

      try {
        // 获取服务器角色列表
        const listStr = await getServerList(userToken);
        const parsedList = JSON.parse(listStr);
        if (parsedList && typeof parsedList === "object") {
          serverListData.value = Object.values(parsedList).sort((a, b) => b.power - a.power);
          message.success(`获取到 ${serverListData.value.length} 个角色`);
        } else {
          serverListData.value = [];
          message.warning("未找到角色列表");
        }

        // 解析bin文件内容
        const binMsg = g_utils.parse(userToken);
        let binData = binMsg.getData();
        if (!binData && binMsg._raw) {
          binData = { ...binMsg._raw };
        }
        originalBinData.value = binData;
      } catch (err) {
        console.error("处理BIN文件失败:", err);
        message.error("处理BIN文件失败: " + (err.message || "未知错误"));
        serverListData.value = [];
      } finally {
        isProcessing.value = false;
      }
    };
    
    reader.onerror = () => {
      message.error("读取文件失败，请重试");
      isProcessing.value = false;
    };
    
    reader.readAsArrayBuffer(file.file);
  } catch (err) {
    console.error("上传失败:", err);
    message.error("上传失败: " + err.message);
    isProcessing.value = false;
  }
  
  return false; // 阻止自动上传
};

// 添加选中角色
const addSelectedRole = async (roleInfo) => {
  if (!originalBinData.value) {
    message.error("Bin数据丢失，请重新上传");
    return;
  }

  try {
    const newData = { ...originalBinData.value };
    newData.serverId = roleInfo.serverId;
    
    // 使用 g_utils.encode 生成新的bin
    const newBinBuffer = g_utils.encode(newData);
    
    const tokenId = getTokenId(newBinBuffer);
    const roleToken = await transformToken(newBinBuffer);
    const roleName = roleInfo.name || `角色_${roleInfo.roleId}`;

    // 保存到IndexedDB
    await storeArrayBuffer(tokenId, newBinBuffer);

    // 计算服务器编号和角色序号
    let sid = Number(roleInfo.serverId);
    let roleIndex = 0;
    if (sid >= 2000000) {
      roleIndex = 2;
      sid -= 2000000;
    } else if (sid >= 1000000) {
      roleIndex = 1;
      sid -= 1000000;
    }
    const serverNum = sid - 27;

    // 生成角色名称
    const template = nameTemplate.value || "{name}-{index}-{id}";
    const finalName = template
      .replace(/{name}/g, () => roleName)
      .replace(/{index}/g, () => String(roleIndex))
      .replace(/{id}/g, () => String(roleInfo.roleId))
      .replace(/{server}/g, () => String(serverNum) + "服");

    // 检查是否已存在
    const exists = roleList.value.some(
      (r) => r.roleId === roleInfo.roleId && r.name === finalName
    );

    if (exists) {
      message.warning(`角色 ${finalName} 已在待添加列表中`);
      return;
    }

    roleList.value.push({
      id: tokenId,
      roleId: roleInfo.roleId,
      token: roleToken,
      name: finalName,
      server: String(serverNum) + "服",
      roleIndex: roleIndex,
      wsUrl: "",
      importMethod: "bin",
    });

    message.success(`已添加角色: ${finalName}`);
  } catch (e) {
    console.error("添加角色失败:", e);
    message.error("添加角色失败: " + e.message);
  }
};

// 移除角色
const removeRole = (index) => {
  roleList.value.splice(index, 1);
};

// 导入处理
const handleImport = async () => {
  if (roleList.value.length === 0) {
    message.error("请先选择角色！");
    return;
  }

  isImporting.value = true;
  try {
    roleList.value.forEach((role) => {
      const gameToken = tokenStore.gameTokens.find((t) => t.id === role.id);
      if (gameToken) {
        tokenStore.updateToken(gameToken.id, { ...role });
      } else {
        tokenStore.addToken({ ...role });
      }
    });

    message.success(`成功添加 ${roleList.value.length} 个Token`);
    roleList.value = [];
    serverListData.value = [];
    originalBinData.value = null;
    emit("ok");
  } catch (e) {
    message.error("导入失败: " + e.message);
  } finally {
    isImporting.value = false;
  }
};
</script>

<style scoped lang="scss">
.bin-import-mobile {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.header-spacer {
  width: 40px;
}

.mobile-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}

.upload-section {
  margin-bottom: 16px;
}

.upload-dragger {
  border-radius: 12px;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
}

.upload-icon {
  color: var(--primary-color);
  margin-bottom: 12px;
}

.name-template-section {
  margin-bottom: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.template-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.role-section,
.selected-section {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.role-count {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: normal;
}

.role-list,
.selected-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid transparent;
  transition: all 0.2s ease;

  &:active {
    border-color: var(--primary-color);
    background: var(--bg-tertiary);
  }
}

.role-info {
  flex: 1;
  min-width: 0;
}

.role-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-power {
  font-size: 12px;
  color: var(--text-secondary);
}

.selected-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.selected-info {
  flex: 1;
  min-width: 0;
}

.selected-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-server {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.mobile-footer {
  padding: 16px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-light);
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
</style>
