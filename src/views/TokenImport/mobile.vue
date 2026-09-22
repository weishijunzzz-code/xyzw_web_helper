<template>
  <div class="mobile-login-import">
    <div class="login-flow-info">
      <h3>手机号验证码登录</h3>
      <ol class="flow-steps">
        <li>输入已绑定游戏账号的手机号并获取验证码</li>
        <li>输入短信验证码后登录</li>
        <li>选择需要添加的游戏角色</li>
      </ol>
      <n-checkbox v-model:checked="saveCombUser">强制下线账号请勾选</n-checkbox>
    </div>

    <n-form :model="mobileForm" label-placement="top" class="login-form">
      <n-form-item label="手机号">
        <n-input
          v-model:value="mobileForm.phone"
          inputmode="numeric"
          maxlength="11"
          placeholder="请输入手机号"
          :disabled="isLoggingIn"
        />
      </n-form-item>
      <n-form-item label="短信验证码">
        <n-input
          v-model:value="mobileForm.code"
          inputmode="numeric"
          maxlength="6"
          placeholder="请输入验证码"
          :disabled="isLoggingIn"
          @keyup.enter="loginWithVerificationCode"
        >
          <template #suffix>
            <n-button
              text
              type="primary"
              :loading="isSendingCode"
              :disabled="isLoggingIn || cooldownSeconds > 0"
              @click="sendVerificationCode"
            >
              <template #icon><n-icon><SendOutline /></n-icon></template>
              {{ cooldownSeconds > 0 ? `${cooldownSeconds}s` : "获取验证码" }}
            </n-button>
          </template>
        </n-input>
      </n-form-item>
    </n-form>

    <div class="form-actions login-actions">
      <n-button
        type="primary"
        block
        :loading="isLoggingIn"
        :disabled="!activeLoginMatchId"
        @click="loginWithVerificationCode"
      >
        <template #icon><n-icon><LogInOutline /></n-icon></template>
        登录并获取角色
      </n-button>
    </div>

    <n-form :model="importForm" label-placement="top" class="name-form">
      <n-form-item label="角色命名格式">
        <n-input v-model:value="importForm.nameTemplate" placeholder="{name}-{index}-{id}" />
        <template #feedback>
          支持变量: {name}角色名, {id}角色ID, {index}角色序号, {server}区服
        </template>
      </n-form-item>
    </n-form>

    <ServerRoleList
      :data="serverListData"
      server-column-title="区服ID"
      max-height="50vh"
      @add="addSelectedRole"
      @download="handleDownload"
    />

    <a-list>
      <a-list-item v-for="(role, index) in roleList" :key="role.id">
        <div class="role-row">
          <div>
            <strong>角色名称:</strong> {{ role.name }}<br />
            <strong>服务器:</strong> {{ role.server }}<br />
            <strong>角色序号:</strong> {{ role.roleIndex }}
          </div>
          <n-button type="error" size="small" @click="removeRole(index)">删除</n-button>
        </div>
      </a-list-item>
    </a-list>

    <div class="form-actions">
      <n-button type="primary" size="large" block :loading="isImporting" @click="handleImport">
        <template #icon><n-icon><CloudUpload /></n-icon></template>
        添加Token
      </n-button>
      <n-button block :disabled="isLoggingIn || isSendingCode" @click="$emit('cancel')">
        <template #icon><n-icon><Close /></n-icon></template>
        取消
      </n-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onUnmounted, reactive, ref } from "vue";
import { Close, CloudUpload, LogInOutline, SendOutline } from "@vicons/ionicons5";
import { NButton, NCheckbox, NForm, NFormItem, NIcon, NInput, useMessage } from "naive-ui";
import { getServerList, getTokenId, transformToken } from "@/utils/token";
import { encodeHortorLoginPayload } from "@/utils/hortorMobileLogin";
import useIndexedDB from "@/hooks/useIndexedDB";
import { g_utils } from "@/utils/bonProtocol";
import {
  buildRoleBin,
  downloadBinFile,
  getRoleBinFileName,
} from "@/utils/binFile";
import { useTokenStore } from "@/stores/tokenStore";

const emit = defineEmits(["cancel", "ok"]);
const message = useMessage();
const tokenStore = useTokenStore();
const { storeArrayBuffer } = useIndexedDB();

const HORTOR_PROXY_PREFIX = "/api/hortor";
const HORTOR_UCENTER_PROXY_PREFIX = "/api/hortor-ucenter";
const GAME_ID = "xyzwapp";
const PACKAGE_NAME = "com.hortor.games.xyzw";
const SIGN_PRINT = "E6:F7:FE:A9:EC:8E:24:D0:4F:2A:32:50:28:78:E1:C5:5E:70:81:13";
const DEVICE_STORAGE_KEY = "xyzw.mobile-login-device.v1";
const systemInfo = JSON.stringify({
  system: "Android 12",
  hortorSDKVersion: "4.2.1-cn-release",
  model: "ALN-AL80",
  brand: "HUAWEI",
});

interface DeviceProfile {
  androidId: string;
  distinctId: string;
}

interface PendingRole {
  id: string;
  name: string;
  roleId: string;
  token: string;
  server: string;
  roleIndex: number;
  wsUrl: string;
  importMethod: "mobile";
  serverId: string | number;
  combUser?: Record<string, unknown>;
}

const mobileForm = reactive({ phone: "", code: "" });
const importForm = reactive({ nameTemplate: "{name}-{index}-{id}", wsUrl: "" });
const isSendingCode = ref(false);
const isLoggingIn = ref(false);
const isImporting = ref(false);
const cooldownSeconds = ref(0);
const serverListData = ref<any[]>([]);
const roleList = ref<PendingRole[]>([]);
const originalBinData = ref<any>(null);
const activeLoginMatchId = ref("");
const currentCombUser = ref<Record<string, unknown> | null>(null);
const saveCombUser = ref(false);
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const createRandomHex = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getDeviceProfile = (): DeviceProfile => {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) || "null");
    if (saved?.androidId && saved?.distinctId) return saved;
  } catch {
    // A malformed old value is replaced below.
  }

  const profile = {
    androidId: createRandomHex(8),
    distinctId: typeof crypto.randomUUID === "function"
      ? `DID-${crypto.randomUUID()}`
      : `DID-${createRandomHex(16)}`,
  };
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
};

const deviceProfile = getDeviceProfile();
const normalizedPhone = () => mobileForm.phone.replace(/\s/g, "");

const requirePhone = () => {
  if (!/^1\d{10}$/.test(normalizedPhone())) {
    message.error("请输入11位手机号");
    return false;
  }
  return true;
};

const clearCooldown = () => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = null;
  cooldownSeconds.value = 0;
};

const startCooldown = (seconds: number) => {
  clearCooldown();
  cooldownSeconds.value = Math.max(1, seconds);
  cooldownTimer = setInterval(() => {
    cooldownSeconds.value -= 1;
    if (cooldownSeconds.value <= 0) clearCooldown();
  }, 1000);
};

const ensureSuccess = (response: any, fallback: string) => {
  if (response?.meta?.errCode !== 0) {
    throw new Error(response?.meta?.errMsg || fallback);
  }
  return response.data;
};

const sendVerificationCode = async () => {
  if (!requirePhone() || cooldownSeconds.value > 0) return;

  isSendingCode.value = true;
  activeLoginMatchId.value = `${Date.now()}_${createRandomHex(16)}`;
  try {
    const response = await fetch(`${HORTOR_UCENTER_PROXY_PREFIX}/ucenter-app-server/api/v1/login/verify/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
      body: JSON.stringify({
        gameId: GAME_ID,
        gameTp: "app",
        accountNum: normalizedPhone(),
        sysInfo: systemInfo,
        activeLoginMatchId: activeLoginMatchId.value,
        channel: "android",
        verifyCodeTp: "login",
        distinctId: deviceProfile.distinctId,
        oaidThirdSdk: "",
        ipv6: "",
        limit: true,
        packageName: PACKAGE_NAME,
        signPrint: SIGN_PRINT,
        androidId: deviceProfile.androidId,
        oaId: "",
        oaid: "",
      }),
    });
    if (!response.ok) throw new Error(`HTTP 状态码：${response.status}`);

    const data = ensureSuccess(await response.json(), "验证码发送失败");
    const waitSecond = Number(data?.waitSecond);
    if (!data?.sendSuccess) {
      if (Number.isFinite(waitSecond) && waitSecond > 0) {
        startCooldown(waitSecond);
      }
      message.warning(data?.msg || "请稍后再试");
      return;
    }

    startCooldown(waitSecond > 0 ? waitSecond : 120);
    message.success(data.msg || "验证码已发送");
  } catch (error: any) {
    activeLoginMatchId.value = "";
    message.error(`获取验证码失败：${error.message || error}`);
  } finally {
    isSendingCode.value = false;
  }
};

const createGameLoginBuffer = (combUser: unknown) => {
  const encryptionModule = (window as any).__require?.("13");
  if (!encryptionModule?.encMsg || !encryptionModule?.lz4XorEncode) {
    throw new Error("游戏加密模块未加载，不能生成登录凭据");
  }
  return new Uint8Array(encryptionModule.encMsg(
    {
      platform: "hortor",
      platformExt: "mix",
      info: combUser,
      serverId: null,
      scene: 0,
      referrerInfo: "",
    },
    { decrypt: encryptionModule.lz4XorDecode, encrypt: encryptionModule.lz4XorEncode },
  ));
};

const loginWithVerificationCode = async () => {
  if (!requirePhone()) return;
  if (!/^\d{4,8}$/.test(mobileForm.code.trim())) {
    message.error("请输入短信验证码");
    return;
  }
  if (!activeLoginMatchId.value) {
    message.error("请先获取验证码");
    return;
  }

  isLoggingIn.value = true;
  try {
    const payload = {
      gameId: GAME_ID,
      sysInfo: systemInfo,
      activeLoginMatchId: activeLoginMatchId.value,
      smsCode: mobileForm.code.trim(),
      mobile: normalizedPhone(),
      channel: "android",
      distinctId: deviceProfile.distinctId,
      oaidThirdSdk: "",
      ipv6: "",
      packageName: PACKAGE_NAME,
      signPrint: SIGN_PRINT,
      tp: "app-mobile",
      androidId: deviceProfile.androidId,
      oaId: "",
      oaid: "",
    };
    const query = new URLSearchParams({
      gameId: GAME_ID,
      timestamp: String(Math.floor(Date.now() / 1000)),
      version: "android-4.2.1-cn-release",
      cryptVersion: "1.1.0",
      gameTp: "app",
      system: "android",
      deviceUniqueId: deviceProfile.distinctId,
      packageName: PACKAGE_NAME,
    });
    const response = await fetch(
      `${HORTOR_PROXY_PREFIX}/comb-login-server/api/v1/login?${query.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8", Accept: "application/json" },
        body: encodeHortorLoginPayload(payload),
      },
    );
    if (!response.ok) throw new Error(`HTTP 状态码：${response.status}`);

    const data = ensureSuccess(await response.json(), "登录失败");
    if (!data?.combUser) throw new Error("登录响应缺少用户凭据");
    currentCombUser.value = data.combUser;
    await loadRoles(createGameLoginBuffer(data.combUser));
    message.success("登录成功，请选择需要添加的角色");
  } catch (error: any) {
    message.error(`登录失败：${error.message || error}`);
  } finally {
    isLoggingIn.value = false;
  }
};

const loadRoles = async (bin: Uint8Array) => {
  try {
    const list = JSON.parse(await getServerList(bin.buffer));
    serverListData.value = list && typeof list === "object"
      ? Object.values(list).sort((left: any, right: any) => right.power - left.power)
      : [];
  } catch (error) {
    console.error("Failed to get server list", error);
    serverListData.value = [];
    message.warning("获取服务器角色列表失败");
  }

  try {
    const parsedMessage = g_utils.parse(bin.buffer);
    const parsedData = parsedMessage.getData() || (parsedMessage as any)._raw;
    originalBinData.value = parsedData ? { ...parsedData } : null;
    if (!originalBinData.value) throw new Error("登录凭据解析为空");
  } catch (error: any) {
    throw new Error(`登录凭据解析失败：${error.message || error}`);
  }
};

const getServerInfo = (serverId: string | number) => {
  let serverNumber = Number(serverId);
  let roleIndex = 0;
  if (serverNumber >= 2000000) {
    roleIndex = 2;
    serverNumber -= 2000000;
  } else if (serverNumber >= 1000000) {
    roleIndex = 1;
    serverNumber -= 1000000;
  }
  return { roleIndex, serverNumber: serverNumber - 27 };
};

const addSelectedRole = async (roleInfo: any) => {
  if (!originalBinData.value) {
    message.error("请先完成手机号登录");
    return;
  }
  try {
    const buffer = buildRoleBin(originalBinData.value, roleInfo.serverId);
    const tokenId = getTokenId(buffer);
    const token = await transformToken(buffer);
    const { roleIndex, serverNumber } = getServerInfo(roleInfo.serverId);
    const roleName = roleInfo.name || `角色_${roleInfo.roleId}`;
    const name = (importForm.nameTemplate || "{name}-{index}-{id}")
      .replace(/{name}/g, roleName)
      .replace(/{index}/g, String(roleIndex))
      .replace(/{id}/g, String(roleInfo.roleId))
      .replace(/{server}/g, `${serverNumber}服`);
    if (roleList.value.some((role) => role.roleId === roleInfo.roleId && role.name === name)) {
      message.warning(`角色 ${name} 已在待添加列表中`);
      return;
    }
    if (!saveCombUser.value) {
      await storeArrayBuffer(tokenId, buffer);
    }
    roleList.value.push({
      id: tokenId,
      roleId: roleInfo.roleId,
      token,
      name,
      server: `${serverNumber}服`,
      roleIndex,
      wsUrl: importForm.wsUrl,
      importMethod: "mobile",
      serverId: roleInfo.serverId,
      ...(saveCombUser.value && currentCombUser.value
        ? { combUser: currentCombUser.value }
        : {}),
    });
    message.success(`已添加角色：${name}`);
  } catch (error: any) {
    console.error("Failed to add selected role", error);
    message.error(`添加角色失败：${error.message || error}`);
  }
};

const handleDownload = (roleInfo: any) => {
  if (!originalBinData.value) {
    message.error("请先完成手机号登录");
    return;
  }
  try {
    const buffer = buildRoleBin(originalBinData.value, roleInfo.serverId);
    const fileName = getRoleBinFileName(roleInfo);
    downloadBinFile(fileName, buffer);
  } catch (error: any) {
    message.error(`下载失败：${error.message || error}`);
  }
};

const removeRole = (index: number) => roleList.value.splice(index, 1);

const handleImport = () => {
  if (roleList.value.length === 0) {
    message.error("请先登录并选择角色");
    return;
  }
  isImporting.value = true;
  try {
    for (const role of roleList.value) {
      const existing = tokenStore.gameTokens.find((token) => token.id === role.id);
      if (existing) tokenStore.updateToken(existing.id, role);
      else tokenStore.addToken(role);
    }
    roleList.value = [];
    message.success("Token添加成功");
    emit("ok");
  } finally {
    isImporting.value = false;
  }
};

onUnmounted(clearCooldown);
</script>

<style scoped lang="scss">
.mobile-login-import { display: flex; flex-direction: column; gap: var(--spacing-lg); padding: var(--spacing-lg) 0; }
.login-flow-info { padding: var(--spacing-md); background: var(--bg-tertiary); border-radius: var(--border-radius-medium); }
.login-flow-info h3 { margin: 0 0 var(--spacing-sm); font-size: var(--font-size-md); }
.flow-steps { margin: 0; padding-left: var(--spacing-lg); color: var(--text-secondary); }
.flow-steps li { margin-bottom: var(--spacing-xs); font-size: var(--font-size-sm); }
.login-form, .name-form { margin-top: var(--spacing-xs); }
.form-actions { display: flex; flex-direction: column; gap: var(--spacing-md); }
.login-actions { margin-top: calc(var(--spacing-md) * -1); }
.role-row { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: var(--spacing-md); }
</style>
