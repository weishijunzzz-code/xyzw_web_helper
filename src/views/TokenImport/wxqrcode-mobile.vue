<template>
  <div class="wx-qrcode-import-mobile">
    <!-- 顶部标题 -->
    <div class="mobile-header">
      <n-button text @click="$emit('cancel')" class="back-btn">
        <template #icon>
          <n-icon><ChevronBack /></n-icon>
        </template>
      </n-button>
      <h3 class="header-title">微信扫码登录</h3>
      <div class="header-spacer"></div>
    </div>

    <!-- 主要内容区域 -->
    <div class="mobile-content">
      <!-- 二维码显示区域 -->
      <div class="qrcode-section">
        <div v-if="!qrcodeUrl" class="qr-placeholder" @click="generateQRCode">
          <n-icon size="64" color="var(--primary-color)">
            <Scan />
          </n-icon>
          <p class="qr-hint">点击获取二维码</p>
        </div>
        <div v-else class="qr-image-wrapper">
          <img :src="qrcodeUrl" alt="微信登录二维码" class="qr-image" />
          <div class="qr-refresh" @click="generateQRCode">
            <n-icon size="20"><Refresh /></n-icon>
            <span>刷新</span>
          </div>
        </div>

        <!-- 状态信息 -->
        <div class="qr-status" :class="statusType">
          <n-icon size="16" v-if="statusType === 'success'"><CheckmarkCircle /></n-icon>
          <n-icon size="16" v-else-if="statusType === 'error'"><CloseCircle /></n-icon>
          <n-icon size="16" v-else><InformationCircle /></n-icon>
          <span>{{ statusMessage }}</span>
        </div>
      </div>

      <!-- 流程说明 -->
      <div class="flow-info">
        <div class="flow-step">
          <span class="step-num">1</span>
          <span class="step-text">点击上方获取二维码</span>
        </div>
        <div class="flow-step">
          <span class="step-num">2</span>
          <span class="step-text">使用微信扫码并确认</span>
        </div>
        <div class="flow-step">
          <span class="step-num">3</span>
          <span class="step-text">系统将获取该微信下所有角色</span>
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
            <n-button text type="error" size="small" @click="removeRole(index)">
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
import { ref, onMounted, onUnmounted } from "vue";
import {
  Scan,
  Refresh,
  CheckmarkCircle,
  CloseCircle,
  InformationCircle,
  ChevronBack,
  Trash,
} from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { getTokenId, transformToken, getServerList } from "@/utils/token";
import useIndexedDB from "@/hooks/useIndexedDB";
import { g_utils } from "@/utils/bonProtocol";
import { useTokenStore } from "@/stores/tokenStore";

// 加载游戏加密模块（与网页端保持一致）
import "@/xyzw/game-defines.js";
import "@/xyzw/cocos2d-js-min.js";
import "@/xyzw/index.js";

const tokenStore = useTokenStore();
const { storeArrayBuffer } = useIndexedDB();
const message = useMessage();

const emit = defineEmits(["cancel", "ok"]);

// 响应式数据
const qrcodeUrl = ref(null);
const qrcodeUUID = ref(null);
const isProcessing = ref(false);
const isImporting = ref(false);
const statusMessage = ref("点击获取二维码");
const statusType = ref("info");
const isScanning = ref(false);
const scanInterval = ref(null);
const timeout = 120000;
const startTime = ref(null);
const serverListData = ref([]);
const originalBinData = ref(null);
const currentCombUser = ref(null);
const roleList = ref([]);

// 格式化战力
const formatPower = (power) => {
  if (!power) return "0";
  if (power >= 100000000) return (power / 100000000).toFixed(1) + "亿";
  if (power >= 10000) return (power / 10000).toFixed(1) + "万";
  return power.toString();
};

// 生成二维码
const generateQRCode = async () => {
  try {
    isProcessing.value = true;
    updateStatus("正在获取二维码...", "info");
    resetQRCode();

    const success = await tryGetWeixinQR();
    if (!success) {
      throw new Error("二维码获取失败");
    }
  } catch (error) {
    updateStatus("二维码获取失败：" + error.message, "error");
    console.error("获取二维码失败:", error);
  } finally {
    isProcessing.value = false;
  }
};

// 尝试获取微信二维码
const tryGetWeixinQR = async () => {
  try {
    const qrPageUrl =
      "/api/weixin/connect/app/qrconnect" +
      "?appid=wxfb0d5667e5cb1c44" +
      "&bundleid=com.hortor.games.xyzw" +
      "&scope=snsapi_base,snsapi_userinfo,snsapi_friend,snsapi_message" +
      "&state=weixin";

    const response = await fetch(qrPageUrl, {
      headers: { Accept: "text/html" },
    });

    if (!response.ok) {
      throw new Error("HTTP 状态码：" + response.status);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    let qrUrl = doc.querySelector("img.auth_qrcode")?.src;

    if (!qrUrl) {
      const m = html.match(/https:\/\/[^"']*qrcode[^"']*/i);
      if (m) qrUrl = m[0];
    }

    if (!qrUrl) {
      throw new Error("未找到二维码图片地址");
    }

    qrcodeUUID.value = qrUrl.split("/").pop().split("?")[0];
    qrcodeUrl.value = qrUrl;

    updateStatus("请使用微信扫码登录", "success");
    startScanMonitoring();
    return true;
  } catch (err) {
    console.error("二维码解析失败:", err);
    updateStatus("二维码获取失败：" + err.message, "error");
    return false;
  }
};

// 开始轮询扫码状态
const startScanMonitoring = () => {
  if (isScanning.value) return;

  isScanning.value = true;
  startTime.value = Date.now();

  scanInterval.value = setInterval(() => {
    checkScanStatus();
  }, 1000);
};

// 检查扫码状态
const checkScanStatus = async () => {
  try {
    if (!qrcodeUUID.value) return;

    const elapsed = Date.now() - startTime.value;
    if (elapsed > timeout) {
      updateStatus("二维码已超时，请重新获取", "error");
      stopScanMonitoring();
      resetQRCode();
      return;
    }

    const url = `/api/weixin/connect/l/qrconnect?uuid=${qrcodeUUID.value}&f=url&_=${Date.now()}`;
    console.log('[checkScanStatus] Checking:', url);

    const res = await fetch(url);
    if (!res.ok) {
      console.log('[checkScanStatus] Fetch failed:', res.status);
      return;
    }

    const text = await res.text();
    console.log('[checkScanStatus] Response text preview:', text.substring(0, 200));

    if (text.includes("window.wx_errcode=405")) {
      console.log('[checkScanStatus] Got 405 - scan success');
      const codeMatch = text.match(/wx_redirecturl='[^']*code=([a-zA-Z0-9]+)/);
      const nicknameMatch = text.match(/window\.wx_nickname\s*=\s*['"]([^'"]+)['"]/);

      if (codeMatch) {
        const code = codeMatch[1];
        const nickname = nicknameMatch ? nicknameMatch[1] : "";
        console.log('[checkScanStatus] Code found:', code.substring(0, 10) + '...');
        stopScanMonitoring();
        updateStatus(`扫码成功，正在登录...`, "success");
        await handleScanSuccess(code, nickname);
      } else {
        console.error('[checkScanStatus] 405 but no code found');
      }
    } else if (text.includes("window.wx_errcode=408")) {
      console.log('[checkScanStatus] Got 408 - QR expired');
      updateStatus("二维码已过期，请重新生成", "error");
      stopScanMonitoring();
      resetQRCode();
    } else if (text.includes("window.wx_errcode=")) {
      const errMatch = text.match(/window\.wx_errcode=(\d+)/);
      console.log('[checkScanStatus] Got error code:', errMatch ? errMatch[1] : 'unknown');
    } else {
      console.log('[checkScanStatus] Waiting for scan...');
    }
  } catch (err) {
    console.error("[checkScanStatus] Error:", err);
  }
};

// 停止扫码监控
const stopScanMonitoring = () => {
  isScanning.value = false;
  if (scanInterval.value) {
    clearInterval(scanInterval.value);
    scanInterval.value = null;
  }
};

// 处理扫码成功
const handleScanSuccess = async (code, nickname = "") => {
  console.log('[handleScanSuccess] Starting with code:', code?.substring(0, 10) + '...');
  try {
    isProcessing.value = true;
    console.log('[handleScanSuccess] Calling getEncryptedData...');
    const encrypted = await getEncryptedData(code);
    console.log('[handleScanSuccess] getEncryptedData returned:', encrypted ? 'success' : 'null/undefined');
    if (encrypted) {
      console.log('[handleScanSuccess] Calling saveAccount...');
      await saveAccount(encrypted.buffer, nickname);
    } else {
      console.error('[handleScanSuccess] getEncryptedData returned falsy value');
      updateStatus("获取加密数据失败", "error");
    }
  } catch (err) {
    console.error('[handleScanSuccess] Error:', err);
    updateStatus("处理失败：" + err.message, "error");
    console.error("扫码处理失败:", err);
  } finally {
    isProcessing.value = false;
  }
};

// 获取加密数据
const getEncryptedData = async (code) => {
  console.log('[getEncryptedData] Starting...');
  const payload = {
    gameId: "xyzwapp",
    code,
    gameTp: "app",
    sysInfo: '{"system":"Android","hortorSDKVersion":"4.0.6-cn","model":"22081212C","brand":"Redmi"}',
    channel: "android",
    appFrom: "com.tencent.mm",
    noLogin: "2",
    distinctId: "DID-" + crypto.randomUUID(),
    state: "hortor",
    packageName: "com.hortor.games.xyzw",
    tp: "app-we",
    signPrint: "E6:F7:FE:A9:EC:8E:24:D0:4F:2A:32:50:28:78:E1:C5:5E:70:81:13",
  };

  const loginUrl = `/api/hortor/comb-login-server/api/v1/login?gameId=xyzwapp&timestamp=${Date.now()}&version=android-4.2.1-cn-release&cryptVersion=1.1.0&gameTp=app&system=android&deviceUniqueId=DID-${crypto.randomUUID()}&packageName=com.hortorgames.xyzw`;

  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("HTTP 状态码：" + res.status);
  }

  const json = await res.json();
  if (json.meta?.errCode !== 0) {
    throw new Error("登录失败：" + json.meta?.errMsg);
  }

  const combUser = json.data?.combUser;
  if (!combUser) {
    throw new Error("登录响应结构异常");
  }

  currentCombUser.value = combUser;

  // 使用与网页端相同的加密方式（通过 __require("13") 获取游戏加密模块）
  console.log('[getEncryptedData] Getting encryption module...');
  
  // 通过 __require("13") 获取游戏加密模块
  const dm = window.__require?.("13");
  console.log('[getEncryptedData] __require("13"):', typeof dm);
  console.log('[getEncryptedData] dm.encMsg:', typeof dm?.encMsg);
  console.log('[getEncryptedData] dm.lz4XorEncode:', typeof dm?.lz4XorEncode);
  
  let encryptedBuffer;
  
  if (dm?.encMsg && dm?.lz4XorEncode) {
    console.log('[getEncryptedData] Using __require("13").encMsg');
    encryptedBuffer = dm.encMsg(
      {
        platform: "hortor",
        platformExt: "mix",
        info: combUser,
        serverId: null,
        scene: 0,
        referrerInfo: "",
      },
      { decrypt: dm.lz4XorDecode, encrypt: dm.lz4XorEncode },
    );
  } else {
    console.error('[getEncryptedData] 游戏加密模块未加载');
    throw new Error("游戏加密模块未加载，不能生成 bin");
  }

  const binData = new Uint8Array(encryptedBuffer);
  console.log('[getEncryptedData] Encrypted length:', binData.length);
  console.log('[getEncryptedData] First 10 bytes:', Array.from(binData.slice(0, 10)));
  console.log('[getEncryptedData] First 2 chars:', String.fromCharCode(binData[0], binData[1]));

  return binData;
};

// 保存账号
const saveAccount = async (arrBuf, nickname = "") => {
  // 检查 window.o4e 是否可用
  console.log('[saveAccount] window.o4e:', typeof window.o4e);
  console.log('[saveAccount] window.__require:', typeof window.__require);
  
  const bin = new Uint8Array(arrBuf);
  
  // 调试：检查传入的 bin 数据
  console.log('[saveAccount] Bin length:', bin.length);
  console.log('[saveAccount] Bin first 10 bytes:', Array.from(bin.slice(0, 10)));
  console.log('[saveAccount] Bin first 2 chars:', String.fromCharCode(bin[0], bin[1]));
  
  // 尝试解析 bin 数据
  try {
    const parsed = g_utils.parse(bin.buffer, 'auto');
    console.log('[saveAccount] Bin parsed:', parsed);
    console.log('[saveAccount] Bin getData:', parsed.getData());
  } catch (e) {
    console.error('[saveAccount] Failed to parse bin:', e);
  }

  try {
    const listStr = await getServerList(bin.buffer);
    const parsedList = JSON.parse(listStr);
    if (parsedList && typeof parsedList === "object") {
      serverListData.value = Object.values(parsedList).sort((a, b) => b.power - a.power);
      updateStatus(`获取到 ${serverListData.value.length} 个角色`, "success");
    } else {
      serverListData.value = [];
    }
  } catch (err) {
    console.error("Failed to get server list", err);
    serverListData.value = [];
  }

  try {
    const binMsg = g_utils.parse(bin.buffer);
    let binData = binMsg.getData();
    if (!binData && binMsg._raw) {
      binData = { ...binMsg._raw };
    }
    originalBinData.value = binData;
  } catch (err) {
    console.error("Bin文件解析失败", err);
  }
};

// 添加选中角色
const addSelectedRole = async (roleInfo) => {
  if (!originalBinData.value) {
    message.error("Bin数据丢失，请重新扫码");
    return;
  }

  try {
    const newData = { ...originalBinData.value };
    newData.serverId = roleInfo.serverId;
    
    // 使用与网页端相同的加密方式（通过 __require("13") 获取游戏加密模块）
    const dm = window.__require?.("13");
    let newBinBuffer;
    
    if (dm?.encMsg && dm?.lz4XorEncode) {
      newBinBuffer = dm.encMsg(
        newData,
        { decrypt: dm.lz4XorDecode, encrypt: dm.lz4XorEncode },
      );
    } else {
      throw new Error("游戏加密模块未加载");
    }
    
    const tokenId = getTokenId(newBinBuffer);
    const roleToken = await transformToken(newBinBuffer);
    const roleName = roleInfo.name || `角色_${roleInfo.roleId}`;

    storeArrayBuffer(tokenId, newBinBuffer);

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

    const finalName = `${roleName}-${roleIndex}-${roleInfo.roleId}`;

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
      importMethod: "wxQrcode",
    });

    message.success(`已添加角色: ${finalName}`);
  } catch (e) {
    console.error("添加角色失败", e);
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
    emit("ok");
  } catch (e) {
    message.error("导入失败: " + e.message);
  } finally {
    isImporting.value = false;
  }
};

// 更新状态
const updateStatus = (msg, type = "info") => {
  statusMessage.value = msg;
  statusType.value = type;
};

// 重置二维码
const resetQRCode = () => {
  stopScanMonitoring();
  qrcodeUUID.value = null;
  qrcodeUrl.value = null;
  updateStatus("点击获取二维码", "info");
};

// 获取服务器列表 - 使用从 @/utils/token 导入的 getServerList

// 生命周期
onMounted(() => {});

onUnmounted(() => {
  stopScanMonitoring();
});
</script>

<style scoped lang="scss">
.wx-qrcode-import-mobile {
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

.qrcode-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 180px;
  border: 2px dashed var(--border-light);
  border-radius: 12px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all 0.3s ease;

  &:active {
    transform: scale(0.98);
    border-color: var(--primary-color);
  }
}

.qr-hint {
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.qr-image-wrapper {
  position: relative;
  width: 180px;
  height: 180px;
}

.qr-image {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  border: 2px solid var(--border-light);
}

.qr-refresh {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.qr-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 32px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;

  &.info {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }

  &.success {
    color: var(--success-color);
    background: rgba(16, 185, 129, 0.1);
  }

  &.error {
    color: var(--error-color);
    background: rgba(239, 68, 68, 0.1);
  }
}

.flow-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--primary-color);
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
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
