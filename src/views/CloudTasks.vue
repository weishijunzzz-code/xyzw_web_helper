<template>
  <div class="cloud-tasks">
    <!-- 未登录：登录/注册 -->
    <div v-if="!isLoggedIn" class="auth-wrap">
      <n-card title="云端任务登录" class="auth-card">
        <n-alert v-if="authError" type="error" style="margin-bottom: 12px">
          {{ authError }}
        </n-alert>
        <n-form>
          <n-form-item label="用户名">
            <n-input v-model:value="authForm.username" placeholder="用户名" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="authForm.password"
              type="password"
              show-password-on="click"
              placeholder="密码（至少8位）"
              @keyup.enter="submitAuth"
            />
          </n-form-item>
          <n-space>
            <n-button type="primary" :loading="authLoading" @click="submitAuth">
              {{ authMode === "login" ? "登录" : "注册并登录" }}
            </n-button>
            <n-button quaternary @click="toggleAuthMode">
              {{ authMode === "login" ? "没有账号？去注册" : "已有账号？去登录" }}
            </n-button>
          </n-space>
        </n-form>
      </n-card>
    </div>

    <!-- 已登录：云端任务管理 -->
    <template v-else>
      <!-- 页头：标题 + 连接状态 + 退出 -->
      <div class="cloud-header">
        <div class="cloud-header-text">
          <h2 class="cloud-title">云端任务</h2>
          <span class="cloud-sub">
            后端 7×24 自动执行，关掉浏览器任务照跑 · {{ user?.username }}
          </span>
        </div>
        <div class="cloud-header-actions">
          <span class="push-pill" :class="{ on: pushConnected }">
            <span class="push-dot" />
            {{ pushConnected ? "实时推送已连接" : "推送未连接" }}
          </span>
          <n-button size="small" quaternary @click="logout">退出登录</n-button>
        </div>
      </div>

      <!-- 统计概览：对齐定时任务页 StatisticCards 的视觉（图标芯片 + 彩色描边） -->
      <div class="stats-row">
        <div class="stat-card stat-total">
          <div class="stat-icon"><n-icon :component="CloudOutline" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ cloudTokens.length }}</span>
            <span class="stat-label">云端账号</span>
          </div>
        </div>
        <div class="stat-card stat-conn">
          <div class="stat-icon"><n-icon :component="CheckmarkCircleOutline" /></div>
          <div class="stat-info">
            <span class="stat-value stat-on">{{ connectedCount }}</span>
            <span class="stat-label">已连接</span>
          </div>
        </div>
        <div class="stat-card stat-sched">
          <div class="stat-icon"><n-icon :component="TimeOutline" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ scheduledTasks.length }}</span>
            <span class="stat-label">定时任务</span>
          </div>
        </div>
        <div class="stat-card stat-enabled">
          <div class="stat-icon"><n-icon :component="PowerOutline" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ enabledTaskCount }}</span>
            <span class="stat-label">已启用</span>
          </div>
        </div>
      </div>

      <!-- Token 同步 -->
      <n-card class="section-card card-sync" :bordered="true">
        <template #header>
          <div class="card-head">
            <span class="head-icon hi-blue"><n-icon :component="PeopleOutline" /></span>
            <span class="card-head-title">账号同步</span>
            <span class="card-head-sub">
              本地 {{ localTokens.length }} 个 · 云端 {{ cloudTokens.length }} 个
            </span>
          </div>
        </template>
        <template #header-extra>
          <div class="card-head-actions">
            <n-input
              v-model:value="accountSearch"
              size="small"
              placeholder="搜索账号 / 服"
              clearable
              class="account-search"
            >
              <template #prefix>
                <n-icon size="14"><Search /></n-icon>
              </template>
            </n-input>
            <n-button
              size="small"
              type="primary"
              :loading="syncing"
              :disabled="localTokens.length === 0"
              @click="syncAllTokens"
            >
              全部同步（含 BIN）
            </n-button>
            <n-button size="small" :loading="loadingCloud" @click="refreshCloudTokens">
              刷新
            </n-button>
          </div>
        </template>

        <n-alert
          v-if="syncResult"
          :type="syncResult.type"
          size="small"
          style="margin-bottom: 10px"
          closable
          @close="syncResult = null"
        >
          {{ syncResult.message }}
        </n-alert>

        <div v-if="filteredCloudTokens.length" class="account-list">
          <div
            v-for="t in filteredCloudTokens"
            :key="t.id"
            class="account-row"
          >
            <img
              v-if="t.avatar"
              class="account-avatar-img"
              :src="t.avatar"
              :alt="t.name"
              referrerpolicy="no-referrer"
            />
            <span v-else class="account-avatar">{{ avatarChar(t.name) }}</span>
            <div class="account-info">
              <span class="account-name" :title="t.name">{{ t.name }}</span>
              <span v-if="t.server" class="account-server">{{ t.server }}</span>
            </div>
            <span class="account-status" :class="`is-${connStatus[t.id] || 'disconnected'}`">
              <span class="status-dot" />
              {{ statusText(connStatus[t.id]) }}
            </span>
            <n-button
              size="tiny"
              quaternary
              @click="openAccountSettings(t)"
            >
              设置
            </n-button>
            <n-button
              size="tiny"
              :type="connStatus[t.id] === 'connected' ? 'warning' : 'success'"
              secondary
              @click="toggleConnect(t)"
            >
              {{ connStatus[t.id] === "connected" ? "断开" : "连接" }}
            </n-button>
            <n-popconfirm @positive-click="removeCloudToken(t)">
              <template #trigger>
                <n-button size="tiny" type="error" quaternary>删除</n-button>
              </template>
              确定删除云端账号「{{ t.name }}」？（不影响本地）
            </n-popconfirm>
          </div>
        </div>
        <n-empty
          v-else
          size="small"
          :description="cloudTokens.length ? '没有匹配的账号' : '云端还没有账号，可从本地全部同步'"
          style="padding: 24px 0"
        />
      </n-card>

      <!-- 定时任务 -->
      <n-card class="section-card card-sched" :bordered="true">
        <template #header>
          <div class="card-head">
            <span class="head-icon hi-violet"><n-icon :component="TimeOutline" /></span>
            <span class="card-head-title">定时任务</span>
            <span class="card-head-sub">服务端 croner · 时区 Asia/Shanghai</span>
          </div>
        </template>
        <template #header-extra>
          <div class="card-head-actions">
            <n-button size="small" type="primary" @click="openCreate">
              + 新建定时任务
            </n-button>
            <n-button size="small" @click="exportTasks">导出</n-button>
            <n-button size="small" @click="fileInput?.click()">导入</n-button>
            <input
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              style="display: none"
              @change="onImportFile"
            />
          </div>
        </template>

        <div v-if="scheduledTasks.length" class="task-list">
          <div
            v-for="t in scheduledTasks"
            :key="t.id"
            class="task-card"
            :class="{ 'is-disabled': t.enabled === false }"
          >
            <div class="task-main">
              <div class="task-title-row">
                <span class="task-name">{{ t.name || t.id }}</span>
                <n-tag size="tiny" :type="t.enabled ? 'success' : 'default'" :bordered="false">
                  {{ t.enabled ? "已启用" : "已停用" }}
                </n-tag>
              </div>
              <div class="task-meta">
                <code class="task-cron">{{ t.cron }}</code>
                <span class="meta-chip">账号 {{ (t.tokenIds || []).length }}</span>
                <span class="meta-chip">任务 {{ (t.settings?.selectedTasks || []).length }} 项</span>
                <template v-if="t.lastRun">
                  <span class="meta-chip">{{ formatTime(t.lastRun) }}</span>
                  <n-tag
                    size="tiny"
                    :type="t.lastResult?.success ? 'success' : 'error'"
                    :bordered="false"
                  >
                    {{ t.lastResult?.success ? "成功" : "失败" }}
                  </n-tag>
                </template>
              </div>
            </div>
            <div class="task-actions">
              <n-button size="tiny" quaternary @click="startEditTask(t)">编辑</n-button>
              <n-button size="tiny" quaternary type="primary" @click="runTaskNow(t)">
                立即执行
              </n-button>
              <n-button size="tiny" quaternary @click="toggleTask(t)">
                {{ t.enabled ? "停用" : "启用" }}
              </n-button>
              <n-popconfirm @positive-click="removeTask(t)">
                <template #trigger>
                  <n-button size="tiny" type="error" quaternary>删除</n-button>
                </template>
                确定删除该定时任务？
              </n-popconfirm>
            </div>
          </div>
        </div>
        <n-empty
          v-else
          size="small"
          description="还没有定时任务，点击上方「新建定时任务」创建"
          style="padding: 24px 0"
        />
      </n-card>

      <!-- 执行日志 -->
      <n-card class="section-card card-log" :bordered="true">
        <template #header>
          <div class="card-head">
            <span class="head-icon hi-green"><n-icon :component="TerminalOutline" /></span>
            <span class="card-head-title">实时执行日志</span>
            <span class="push-pill mini" :class="{ on: pushConnected }">
              <span class="push-dot" />
            </span>
          </div>
        </template>
        <template #header-extra>
          <n-button size="tiny" quaternary @click="logs = []">清空</n-button>
        </template>
        <div class="log-panel">
          <div
            v-for="(log, i) in logs"
            :key="logs.length - i"
            class="log-line"
            :class="`log-${log.level || 'info'}`"
          >
            <span class="log-time">{{ log.time }}</span>
            <span>{{ log.message }}</span>
          </div>
          <div v-if="!logs.length" class="log-empty">
            暂无日志。执行任务或连接账号后，这里会实时显示后端推送的进度。
          </div>
        </div>
      </n-card>

      <!-- 新建/编辑定时任务弹窗 -->
      <n-modal
        v-model:show="showTaskModal"
        preset="card"
        :title="editingTaskId ? `编辑定时任务${taskForm.name ? `：${taskForm.name}` : ''}` : '新建定时任务'"
        :style="{ width: '90%', maxWidth: '600px', backgroundColor: 'var(--bg-primary)' }"
        :mask-closable="false"
        :bordered="false"
        @close="resetTaskForm"
      >
        <n-alert v-if="formError" type="error" size="small" style="margin-bottom: 12px">
          {{ formError }}
        </n-alert>
        <n-form
          class="cloud-task-form"
          :label-placement="isMobile ? 'top' : 'left'"
          :label-width="isMobile ? undefined : 90"
        >
          <n-form-item label="任务名称" :show-require-mark="true">
            <n-input v-model:value="taskForm.name" placeholder="如：每天日常" maxlength="40" />
          </n-form-item>
          <n-form-item label="Cron 表达式" :show-require-mark="true">
            <n-space vertical style="width: 100%" :size="6">
              <div class="cron-row">
                <n-input
                  v-model:value="taskForm.cron"
                  placeholder="0 6 * * *（每天 6 点）"
                  class="cron-input"
                />
                <n-select
                  :value="null"
                  :options="cronPresetOptions"
                  placeholder="常用预设"
                  class="cron-preset"
                  @update:value="(v) => v && (taskForm.cron = v)"
                />
              </div>
              <span v-if="cronError" class="cron-error">{{ cronError }}</span>
              <span v-else-if="nextRunText" class="cron-preview">下次执行：{{ nextRunText }}</span>
              <span v-else class="cron-preview">5 个字段：分 时 日 月 周（如 0 6 * * * 表示每天 6 点）</span>
            </n-space>
          </n-form-item>
          <n-form-item label="执行账号" :show-require-mark="true">
            <n-space vertical style="width: 100%" :size="4">
              <n-select
                v-model:value="taskForm.tokenIds"
                multiple
                :options="cloudTokenOptions"
                placeholder="选择要执行的账号（可多选）"
              />
              <n-space size="small" align="center">
                <n-button size="tiny" @click="taskForm.tokenIds = cloudTokenOptions.map((o) => o.value)">
                  全选账号
                </n-button>
                <n-button size="tiny" @click="taskForm.tokenIds = []">清空</n-button>
                <span v-if="!cloudTokenOptions.length" class="field-hint">
                  云端还没有账号，请先在上方「账号同步」
                </span>
              </n-space>
            </n-space>
          </n-form-item>
          <n-form-item label="执行任务" :show-require-mark="true">
            <n-space vertical style="width: 100%" :size="4">
              <n-select
                v-model:value="taskForm.selectedTasks"
                multiple
                :options="taskOptions"
                placeholder="选择要执行的任务（可多选，按顺序执行）"
              />
              <n-space size="small">
                <n-button size="tiny" @click="taskForm.selectedTasks = taskOptions.map((o) => o.value)">
                  全选任务
                </n-button>
                <n-button size="tiny" @click="taskForm.selectedTasks = []">清空</n-button>
              </n-space>
            </n-space>
          </n-form-item>
          <n-form-item label="立即启用">
            <n-switch v-model:value="taskForm.enabled" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end" :size="8">
            <n-button :disabled="saving" @click="showTaskModal = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="submitTask">
              {{ editingTaskId ? "保存修改" : "创建定时任务" }}
            </n-button>
          </n-space>
        </template>
      </n-modal>

    <!-- 账号任务设置弹窗（云端 KV：daily-settings:${tokenId}） -->
    <n-modal
      v-model:show="showAccountSettings"
      preset="card"
      :title="`任务设置 - ${settingsToken?.name || ''}`"
      style="width: 90%; max-width: 400px"
    >
      <div class="settings-content">
        <div class="settings-grid">
          <div class="setting-item">
            <label class="setting-label">竞技场阵容</label>
            <n-select
              v-model:value="accountSettings.arenaFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">爬塔阵容</label>
            <n-select
              v-model:value="accountSettings.towerFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">BOSS阵容</label>
            <n-select
              v-model:value="accountSettings.bossFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">BOSS次数</label>
            <n-select
              v-model:value="accountSettings.bossTimes"
              :options="bossTimesOptions"
              size="small"
            />
          </div>
          <div class="setting-switches">
            <div class="switch-row">
              <span class="switch-label">领罐子</span>
              <n-switch v-model:value="accountSettings.claimBottle" />
            </div>
            <div class="switch-row">
              <span class="switch-label">领挂机</span>
              <n-switch v-model:value="accountSettings.claimHangUp" />
            </div>
            <div class="switch-row">
              <span class="switch-label">竞技场</span>
              <n-switch v-model:value="accountSettings.arenaEnable" />
            </div>
            <div class="switch-row">
              <span class="switch-label">开宝箱</span>
              <n-switch v-model:value="accountSettings.openBox" />
            </div>
            <div class="switch-row">
              <span class="switch-label">领取邮件奖励</span>
              <n-switch v-model:value="accountSettings.claimEmail" />
            </div>
            <div class="switch-row">
              <span class="switch-label">黑市购买物品</span>
              <n-switch v-model:value="accountSettings.blackMarketPurchase" />
            </div>
            <div class="switch-row">
              <span class="switch-label">付费招募</span>
              <n-switch v-model:value="accountSettings.payRecruit" />
            </div>
          </div>
        </div>
        <n-space justify="end" style="margin-top: 20px" :size="8">
          <n-button :disabled="savingAccountSettings" @click="showAccountSettings = false">取消</n-button>
          <n-button type="primary" :loading="savingAccountSettings" @click="saveAccountSettings">
            保存设置
          </n-button>
        </n-space>
      </div>
    </n-modal>
    </template>
  </div>
</template>

<script setup>
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
} from "naive-ui";
import { Search, CloudOutline, CheckmarkCircleOutline, TimeOutline, PowerOutline, PeopleOutline, TerminalOutline } from "@vicons/ionicons5";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import { useCloudAuth } from "@/stores/cloudAuth";
import { useMobile } from "@/composables/useMobile";
import {
  scheduledTasksApi,
  ServerPushClient,
  settingsApi,
  statusApi,
  tokenApi,
} from "@/api/serverApi";
import { bossTimesOptions, formationOptions } from "@/utils/batch/constants.js";
import { validateCronExpression, calculateNextRuns } from "@/utils/batch/cronUtils.js";

const { isMobile } = useMobile();

const { getArrayBuffer } = useIndexedDB();
const tokenStore = useTokenStore();
const { user, isLoggedIn, login, register, logout } = useCloudAuth();

/* ---------- 登录/注册 ---------- */
const authMode = ref("login");
const authLoading = ref(false);
const authError = ref("");
const authForm = reactive({ username: "", password: "" });

function toggleAuthMode() {
  authMode.value = authMode.value === "login" ? "register" : "login";
  authError.value = "";
}

async function submitAuth() {
  authError.value = "";
  if (!authForm.username || !authForm.password) {
    authError.value = "请输入用户名和密码";
    return;
  }
  if (authForm.password.length < 8) {
    authError.value = "密码至少 8 位";
    return;
  }
  authLoading.value = true;
  try {
    if (authMode.value === "login") {
      await login(authForm.username, authForm.password);
    } else {
      await register(authForm.username, authForm.password);
    }
  } catch (e) {
    authError.value = e.response?.data?.error || "请求失败，请检查后端服务是否可用";
  } finally {
    authLoading.value = false;
    if (isLoggedIn.value) onAuthReady();
  }
}

/* ---------- Token 同步 ---------- */
const localTokens = computed(() => tokenStore.gameTokens || []);
const cloudTokens = ref([]);
const loadingCloud = ref(false);
const syncing = ref(false);
const syncResult = ref(null);
const connStatus = ref({});
const accountSearch = ref("");

const filteredCloudTokens = computed(() => {
  const q = accountSearch.value.trim().toLowerCase();
  if (!q) return cloudTokens.value;
  return cloudTokens.value.filter(
    (t) =>
      t.name?.toLowerCase().includes(q) || String(t.server || "").toLowerCase().includes(q),
  );
});

const connectedCount = computed(
  () =>
    Object.values(connStatus.value).filter((s) => s === "connected").length,
);

const enabledTaskCount = computed(
  () => scheduledTasks.value.filter((t) => t.enabled !== false).length,
);

function avatarChar(name) {
  const n = String(name || "?").trim();
  return n.charAt(0).toUpperCase() || "?";
}

async function refreshCloudTokens() {
  loadingCloud.value = true;
  try {
    cloudTokens.value = await tokenApi.getAll();
    const status = await statusApi.getAll().catch(() => ({}));
    connStatus.value = status || {};
  } catch (e) {
    syncResult.value = {
      type: "error",
      message: `读取云端列表失败: ${e.response?.data?.error || e.message}`,
    };
  } finally {
    loadingCloud.value = false;
  }
}

async function syncAllTokens() {
  syncing.value = true;
  syncResult.value = null;
  let ok = 0;
  let fail = 0;
  let seeded = 0;
  try {
    // 批量读云端已有的账号设置 key（已有则不覆盖，云端编辑为准）
    let existingSettings = {};
    try {
      existingSettings =
        (await settingsApi.batchGet(
          localTokens.value.map((t) => `daily-settings:${t.id}`),
        )) || {};
    } catch {
      /* 读失败则当作全缺失，按本地值补种 */
    }
    for (const t of localTokens.value) {
      try {
        await tokenApi.importTokens([
          {
            id: t.id,
            name: t.name,
            token: t.token,
            wsUrl: t.wsUrl || null,
            server: t.server || "",
            remark: t.remark || "",
            importMethod: t.importMethod || "manual",
            sourceUrl: t.sourceUrl || null,
            avatar: t.avatar || "",
          },
        ]);
        // 本地任务设置补种（云端缺失才推，含竞技场阵容等）
        const settingsKey = `daily-settings:${t.id}`;
        if (existingSettings[settingsKey] == null) {
          const localRaw = localStorage.getItem(settingsKey);
          if (localRaw) {
            try {
              await settingsApi.put(settingsKey, JSON.parse(localRaw));
              seeded++;
            } catch {
              /* 设置补种失败不影响 token 同步 */
            }
          }
        }
        // BIN 数据（有才传；游戏连接解密需要）
        try {
          const bin = await getArrayBuffer(t.id);
          if (bin) await tokenApi.uploadBin(t.id, bin);
        } catch {
          /* 无 BIN 也能连接部分账号，忽略 */
        }
        ok++;
      } catch {
        fail++;
      }
    }
    syncResult.value = {
      type: fail ? "warning" : "success",
      message: `同步完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}${seeded ? `，补种设置 ${seeded} 个` : ""}`,
    };
    await refreshCloudTokens();
  } finally {
    syncing.value = false;
  }
}

/* ---------- 账号任务设置（云端 KV，执行时以该 K-V 为准） ---------- */
const DEFAULT_ACCOUNT_SETTINGS = {
  arenaFormation: 1,
  towerFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  claimHangUp: true,
  arenaEnable: true,
  openBox: true,
  claimEmail: true,
  blackMarketPurchase: true,
  payRecruit: true,
  freeGachaEnable: true,
};
const showAccountSettings = ref(false);
const savingAccountSettings = ref(false);
const settingsToken = ref(null);
const accountSettings = ref({ ...DEFAULT_ACCOUNT_SETTINGS });

async function openAccountSettings(t) {
  settingsToken.value = t;
  showAccountSettings.value = true;
  savingAccountSettings.value = true;
  try {
    const value = await settingsApi.get(`daily-settings:${t.id}`);
    accountSettings.value = { ...DEFAULT_ACCOUNT_SETTINGS, ...(value || {}) };
  } catch (e) {
    accountSettings.value = { ...DEFAULT_ACCOUNT_SETTINGS };
    pushLog("error", `读取账号设置失败: ${e.response?.data?.error || e.message}`);
  } finally {
    savingAccountSettings.value = false;
  }
}

async function saveAccountSettings() {
  if (!settingsToken.value) return;
  savingAccountSettings.value = true;
  try {
    await settingsApi.put(
      `daily-settings:${settingsToken.value.id}`,
      accountSettings.value,
    );
    pushLog(
      "success",
      `账号「${settingsToken.value.name}」任务设置已保存（竞技场阵容${accountSettings.value.arenaFormation}），下次云端执行生效`,
    );
    showAccountSettings.value = false;
  } catch (e) {
    pushLog("error", `保存账号设置失败: ${e.response?.data?.error || e.message}`);
  } finally {
    savingAccountSettings.value = false;
  }
}

async function toggleConnect(t) {
  try {
    if (connStatus.value[t.id] === "connected") {
      await tokenApi.disconnect(t.id);
      connStatus.value[t.id] = "disconnected";
    } else {
      await tokenApi.connect(t.id);
      connStatus.value[t.id] = "connecting";
    }
  } catch (e) {
    pushLog("error", `连接操作失败: ${e.response?.data?.error || e.message}`);
  }
}

async function removeCloudToken(t) {
  try {
    await tokenApi.remove(t.id);
    cloudTokens.value = cloudTokens.value.filter((x) => x.id !== t.id);
  } catch (e) {
    pushLog("error", `删除失败: ${e.response?.data?.error || e.message}`);
  }
}

/* ---------- 定时任务 ---------- */
const scheduledTasks = ref([]);
const taskForm = reactive({
  name: "",
  cron: "0 6 * * *",
  tokenIds: [],
  selectedTasks: [],
  enabled: true,
});

const cloudTokenOptions = computed(() =>
  cloudTokens.value.map((t) => ({ label: t.name, value: t.id })),
);

const TASK_LABELS = {
  startBatch: "日常任务全集（签到/挂机/邮件等）",
  batchclubsign: "俱乐部签到",
  claimHangUpRewards: "领取挂机奖励",
  batchAddHangUpTime: "增加挂机时长",
  batchStudy: "答题学习",
  batchWarGuessCheer: "战争竞猜助威",
  resetBottles: "重置瓶子",
  batchlingguanzi: "领瓶子",
  climbTower: "爬塔（宝库）",
  climbWeirdTower: "爬怪塔（异变塔）",
  batchClaimFreeEnergy: "领取免费体力",
  skinChallenge: "皮肤挑战",
  batchUseItems: "使用道具",
  batchMergeItems: "合成道具",
  batchOpenBox: "开宝箱",
  batchOpenBoxByPoints: "按积分开箱",
  batchClaimBoxPointReward: "领宝箱积分奖励",
  batchFish: "钓鱼",
  batchRecruit: "招募",
  batchHeroUpgrade: "武将升级",
  batchBookUpgrade: "兵书升级",
  batchClaimStarRewards: "领升星奖励",
  batchClaimPeachTasks: "领蚌任务奖励",
  batchGenieSweep: "灯神扫荡",
  batchOpenFragmentPacks: "开碎片包",
  batchClaimBoxWeeklyRewards: "领宝箱周奖励",
  batchTopUpBoxWeekWithoutClaim: "宝箱周补齐（不领积分）",
  batchTopUpBoxWeekWithClaim: "宝箱周补齐（并领积分）",
  batchClaimRollUpPack: "领取十殿精选礼包",
  batchGachaDrawReward: "一键免费扭蛋",
  batchbaoku13: "宝库 1-3 层",
  batchbaoku45: "宝库 4-5 层",
  batchmengjing: "梦境",
  batchBuyDreamItems: "梦境购物",
  batcharenafight: "竞技场战斗",
  batchTopUpFish: "补钓竿",
  batchTopUpArena: "补竞技场票",
  legion_storebuygoods: "军团商店购物",
  legionStoreBuySkinCoins: "军团商店换肤币",
  store_purchase: "商店购买",
  collection_claimfreereward: "珍宝阁免费奖励",
  weeklyFreeGift: "每周免费礼包",
  mondayFreeGift: "周一免费礼包",
  gachaFreeDrawWeekly: "每周免费抽卡",
  batchPkRoomAppoint: "PK 房委任",
  blackMarketPurchaseList: "黑市购买清单",
  charge_claimaddup_rewards: "累计充值奖励",
  claim_recruit_welfare: "招募福利",
  claim_weird_tower_all: "怪塔全部奖励",
  activity_claimrolluppack: "领取周一免费礼包",
  activityShopBuy: "江湖黑市购买",
  executeWarguessStoreBuy: "助威商店购买（需配置 warguessGoodsIds）",
  batchLegacyClaim: "遗产领取",
  batchLegacyGiftSendEnhanced: "遗产送礼",
  batchLegacyBeginHangup: "功法挂机修炼",
  batchLegionWarSignUp: "军团战报名（盐场）",
  batchJoinClub: "一键加入俱乐部（需配置 joinClubId）",
  batchXuanwuBlessing: "一键玄武赐福",
  batchApexGuess: "逐鹿盐山竞猜",
  batchFootballBet: "一键竞猜（默认第3项）",
  batchCampChallenge: "营地挑战（普通）",
  batchCampChallengePet: "营地挑战（宠物）",
  batchCampClaimTasks: "营地任务领取",
};

const taskOptions = Object.entries(TASK_LABELS).map(([value, label]) => ({
  value,
  label,
}));

async function refreshTasks() {
  try {
    scheduledTasks.value = await scheduledTasksApi.getAll();
  } catch {
    /* 未登录时静默 */
  }
}

const editingTaskId = ref(null);
const showTaskModal = ref(false);
const saving = ref(false);
const formError = ref("");

// 常用 cron 预设
const cronPresetOptions = [
  { label: "每天 6:00", value: "0 6 * * *" },
  { label: "每天 12:00", value: "0 12 * * *" },
  { label: "每天 20:00", value: "0 20 * * *" },
  { label: "每周一 6:00", value: "0 6 * * 1" },
  { label: "每月 1 号 6:00", value: "0 6 1 * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
];

// cron 内联校验（后端仍做最终校验）
const cronError = computed(() => {
  if (!showTaskModal.value || !taskForm.cron?.trim()) return "";
  const r = validateCronExpression(taskForm.cron.trim());
  return r.valid ? "" : r.message;
});

// 下次执行时间预览
const nextRunText = computed(() => {
  if (!showTaskModal.value || cronError.value || !taskForm.cron?.trim()) return "";
  try {
    const parts = taskForm.cron.trim().split(/\s+/);
    const next = calculateNextRuns(parts[0], parts[1], parts[2], parts[3], parts[4], 1);
    if (next?.[0]) return new Date(next[0]).toLocaleString();
  } catch {
    /* 预览失败不阻塞输入 */
  }
  return "";
});

function resetTaskForm() {
  editingTaskId.value = null;
  formError.value = "";
  taskForm.name = "";
  taskForm.cron = "0 6 * * *";
  taskForm.tokenIds = [];
  taskForm.selectedTasks = [];
  taskForm.enabled = true;
}

function openCreate() {
  resetTaskForm();
  showTaskModal.value = true;
}

function startEditTask(t) {
  editingTaskId.value = t.id;
  formError.value = "";
  taskForm.name = t.name || "";
  taskForm.cron = t.cron || "0 6 * * *";
  taskForm.tokenIds = [...(t.tokenIds || [])];
  taskForm.selectedTasks = [...(t.settings?.selectedTasks || [])];
  taskForm.enabled = t.enabled !== false;
  showTaskModal.value = true;
}

async function submitTask() {
  formError.value = "";
  if (!taskForm.name?.trim()) {
    formError.value = "请填写任务名称";
    return;
  }
  if (!taskForm.cron?.trim()) {
    formError.value = "请填写 cron 表达式";
    return;
  }
  const cronCheck = validateCronExpression(taskForm.cron.trim());
  if (!cronCheck.valid) {
    formError.value = `cron 表达式有误：${cronCheck.message}`;
    return;
  }
  if (!taskForm.tokenIds.length) {
    formError.value = "请选择至少一个执行账号";
    return;
  }
  if (!taskForm.selectedTasks.length) {
    formError.value = "请选择至少一个执行任务";
    return;
  }
  const payload = {
    name: taskForm.name.trim(),
    cron: taskForm.cron.trim(),
    tokenIds: taskForm.tokenIds,
    enabled: taskForm.enabled,
    settings: {
      selectedTasks: taskForm.selectedTasks,
      maxActive: 3,
      commandDelay: 500,
      taskDelay: 1000,
    },
  };
  const taskName = taskForm.name.trim();
  saving.value = true;
  try {
    if (editingTaskId.value) {
      await scheduledTasksApi.update(editingTaskId.value, payload);
      pushLog("success", `定时任务「${taskName}」已更新`);
    } else {
      await scheduledTasksApi.create(payload);
      pushLog("success", `定时任务「${taskName}」已创建`);
    }
    resetTaskForm();
    showTaskModal.value = false;
    await refreshTasks();
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    formError.value = `${editingTaskId.value ? "更新" : "创建"}失败：${msg}`;
    pushLog("error", `${editingTaskId.value ? "更新" : "创建"}失败: ${msg}`);
  } finally {
    saving.value = false;
  }
}

async function runTaskNow(t) {
  pushLog("info", `手动执行「${t.name || t.id}」...`);
  try {
    const result = await scheduledTasksApi.run(t.id);
    if (result?.status === "started") {
      pushLog("info", `「${t.name || t.id}」已在后台开始执行，进度见实时日志，结果稍后写入任务列表`);
    } else {
      pushLog("success", `执行完成: ${JSON.stringify(result).slice(0, 200)}`);
    }
    await refreshTasks();
  } catch (e) {
    pushLog("error", `执行失败: ${e.response?.data?.error || e.message}`);
  }
}

async function toggleTask(t) {
  try {
    await scheduledTasksApi.update(t.id, { enabled: !t.enabled });
    await refreshTasks();
  } catch (e) {
    pushLog("error", `操作失败: ${e.response?.data?.error || e.message}`);
  }
}

async function removeTask(t) {
  try {
    await scheduledTasksApi.remove(t.id);
    await refreshTasks();
  } catch (e) {
    pushLog("error", `删除失败: ${e.response?.data?.error || e.message}`);
  }
}

/* ---------- 导出/导入定时任务 ---------- */
const fileInput = ref(null);

async function exportTasks() {
  try {
    const tasks = await scheduledTasksApi.getAll();
    const payload = {
      type: "xyzw-scheduled-tasks",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: (tasks || []).map((t) => ({
        name: t.name,
        cron: t.cron,
        taskType: t.taskType,
        settings: t.settings || {},
        enabled: t.enabled !== false,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `xyzw-scheduled-tasks-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushLog("success", `已导出 ${payload.tasks.length} 条定时任务`);
  } catch (e) {
    pushLog("error", `导出失败: ${e.response?.data?.error || e.message}`);
  }
}

async function onImportFile(ev) {
  const file = ev.target?.files?.[0];
  ev.target.value = ""; // 允许重复选择同一文件
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    pushLog("error", "导入失败：文件不是合法的 JSON");
    return;
  }
  if (data?.type !== "xyzw-scheduled-tasks" || !Array.isArray(data.tasks)) {
    pushLog("error", "导入失败：文件格式不符（缺少 xyzw-scheduled-tasks 标识）");
    return;
  }
  if (data.tasks.length === 0) {
    pushLog("info", "文件中没有任务");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const t of data.tasks) {
    try {
      // tokenIds 固定传空：执行账号由导入方登录后用「编辑」自行选择
      await scheduledTasksApi.create({
        name: t.name || "",
        cron: t.cron,
        taskType: t.taskType || "batch_daily",
        tokenIds: [],
        settings: t.settings || {},
        enabled: t.enabled !== false,
      });
      ok++;
    } catch (e) {
      fail++;
      pushLog(
        "error",
        `导入「${t.name || "未命名"}」失败: ${e.response?.data?.error || e.message}`,
      );
    }
  }
  await refreshTasks();
  if (ok > 0) {
    pushLog(
      "success",
      `导入完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ""}，执行账号需用「编辑」自行选择`,
    );
  } else if (fail > 0) {
    pushLog("error", `导入失败：${fail} 条任务全部未成功`);
  }
}

/* ---------- 实时推送 ---------- */
const logs = ref([]);
const pushConnected = ref(false);
let pushClient = null;

function pushLog(level, message) {
  logs.value.unshift({
    time: new Date().toLocaleTimeString(),
    level,
    message,
  });
  if (logs.value.length > 300) logs.value.pop();
}

function handlePush(raw) {
  // 服务端推送结构为 {type, data, ts}，解包为平铺字段
  const msg =
    raw && typeof raw === "object" && "type" in raw && "data" in raw
      ? { ...(raw.data || {}), type: raw.type }
      : raw;
  if (msg.type === "connection") {
    connStatus.value[msg.tokenId] = msg.status;
    if (msg.status === "connected") {
      const t = cloudTokens.value.find((x) => x.id === msg.tokenId);
      pushLog("success", `账号已连接: ${t?.name || msg.tokenId}`);
    } else if (msg.status === "disconnected") {
      const t = cloudTokens.value.find((x) => x.id === msg.tokenId);
      pushLog("warning", `账号已断开: ${t?.name || msg.tokenId}`);
    }
  } else if (msg.type === "taskProgress") {
    pushLog("info", `[进度] ${msg.message || JSON.stringify(msg).slice(0, 120)}`);
  } else if (msg.type === "taskComplete") {
    pushLog("success", `[完成] ${msg.taskName || msg.message || ""}`);
  } else if (msg.type === "log") {
    pushLog(msg.level || "info", msg.message || "");
  } else if (msg.type === "connected") {
    pushConnected.value = true;
  }
}

function statusText(s) {
  return {
    connected: "已连接",
    connecting: "连接中",
    disconnected: "未连接",
    error: "错误",
  }[s || "disconnected"];
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ---------- 生命周期 ---------- */
function onAuthReady() {
  authError.value = "";
  refreshCloudTokens();
  refreshTasks();
  // 初始化连接状态（页面刷新后从服务端恢复真实状态）
  statusApi
    .getAll()
    .then((list) => {
      for (const item of list || []) {
        if (item?.id) {
          connStatus.value[item.id] = item.status || "disconnected";
        }
      }
    })
    .catch(() => {});
  if (!pushClient) {
    pushClient = new ServerPushClient(handlePush);
    pushClient.connect();
  }
}

onMounted(() => {
  if (isLoggedIn.value) onAuthReady();
});

onUnmounted(() => {
  if (pushClient) {
    pushClient.disconnect();
    pushClient = null;
  }
});
</script>

<style scoped>
.cloud-tasks {
  max-width: 1280px;
  padding: var(--spacing-md);
  margin: 0 auto;
}

/* 被定时任务页嵌入时，留白与宽度由父级 page-content 提供 */
.cloud-tasks.embedded {
  max-width: none;
  padding: 0;
}

/* ============ 页头 ============ */
.cloud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.cloud-title {
  margin: 0;
  font-size: 20px;
}

.cloud-sub {
  display: block;
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.cloud-header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

/* 推送状态胶囊 */
.push-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--error-color);
  background: var(--error-soft);
  border-radius: var(--border-radius-full);
}

.push-pill.on {
  color: var(--success-color);
  background: var(--success-soft);
}

.push-pill .push-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.push-pill.mini {
  padding: 0;
  background: transparent;
}

/* ============ 统计概览（对齐定时任务页 StatisticCards） ============ */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px 18px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-left: 4px solid transparent;
  border-radius: 12px;
  box-shadow: var(--shadow-light);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-light);
}

.stat-total {
  border-left-color: var(--primary-color);
}

.stat-conn {
  border-left-color: #10b981;
}

.stat-sched {
  border-left-color: var(--primary-color);
}

.stat-enabled {
  border-left-color: #f59e0b;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: 14px;
  font-size: 20px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-total .stat-icon {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
}

.stat-conn .stat-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.stat-sched .stat-icon {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
}

.stat-enabled .stat-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-primary);
}

.stat-value.stat-on {
  color: var(--success-color);
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ============ 卡片头部 ============ */
.card-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

/* 区块标题图标芯片 */
.head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 14px;
  flex-shrink: 0;
}

.hi-blue {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
}

.hi-violet {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
}

.hi-green {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.card-head-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.card-head-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.card-head-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.account-search {
  width: 170px;
}

/* ============ 账号列表 ============ */
.account-list {
  display: flex;
  flex-direction: column;
}

.account-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  padding: 9px 10px;
  border-radius: 10px;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.15s ease;
}

.account-row:last-child {
  border-bottom: none;
}

.account-row:hover {
  background: var(--bg-secondary);
}

.account-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-radius: 50%;
}

.account-avatar-img {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 50%;
}

.account-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}

.account-name {
  overflow: hidden;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-server {
  flex-shrink: 0;
  padding: 1px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-full);
}

.account-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.account-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-disabled);
}

.account-status.is-connected {
  color: var(--success-color);
}

.account-status.is-connected .status-dot {
  background: var(--success-color);
}

.account-status.is-connecting {
  color: var(--warning-color);
}

.account-status.is-connecting .status-dot {
  background: var(--warning-color);
}

.account-status.is-error {
  color: var(--error-color);
}

.account-status.is-error .status-dot {
  background: var(--error-color);
}

/* ============ 新建/编辑弹窗 ============ */
.cron-row {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
}

.cron-row .cron-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.cron-row .cron-preset {
  width: 132px;
  flex-shrink: 0;
}

.cron-error {
  font-size: 12px;
  color: var(--error-color);
}

.cron-preview {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 移动端弹窗适配 */
@media (max-width: 768px) {
  /* Cron 行上下堆叠：输入框整行 + 预设下拉整行。
     不依赖 flex 布局，规避部分手机内核（微信 X5/XWeb 等）flex/gap
     实现差异导致的输入框塌陷不可见问题 */
  .cron-row {
    display: block;
  }

  .cron-row .cron-input {
    display: block;
    width: 100%;
  }

  .cron-row .cron-preset {
    display: block;
    width: 100%;
    margin-top: 6px;
  }

  /* 多选（执行账号/执行任务）标签墙限高滚动，避免弹窗被撑得过长 */
  .cloud-task-form :deep(.n-base-selection-tags) {
    max-height: 132px;
    overflow-y: auto;
  }
}

.field-hint {
  font-size: 12px;
  color: var(--warning-color);
}

/* ============ 定时任务列表 ============ */
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.task-card {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--success-color);
  border-radius: 10px;
  background: var(--bg-primary);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.task-card:hover {
  border-color: var(--primary-color-light);
  box-shadow: var(--shadow-light);
}

.task-card.is-disabled {
  border-left-color: var(--text-disabled);
  opacity: 0.75;
}

.task-main {
  flex: 1;
  min-width: 0;
}

.task-title-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  flex-wrap: wrap;
}

.task-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.task-meta {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.task-cron {
  padding: 1px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
}

.meta-chip {
  white-space: nowrap;
}

.task-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* ============ 日志面板 ============ */
.log-panel {
  max-height: 320px;
  padding: var(--spacing-sm);
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: var(--log-bg);
  border-radius: var(--border-radius-md);
}

.log-line {
  padding: 2px 0;
  color: #c9d1d9;
  word-break: break-all;
}

.log-time {
  margin-right: var(--spacing-sm);
  color: #7d8590;
}

.log-success {
  color: #7ee787;
}

.log-error {
  color: #ffa198;
}

.log-warning {
  color: #f2cc60;
}

.log-empty {
  padding: var(--spacing-md);
  color: #7d8590;
  text-align: center;
}

/* ============ 未登录 ============ */
.auth-wrap {
  display: grid;
  place-items: center;
  min-height: 60vh;
}

.auth-card {
  width: 100%;
  max-width: 380px;
}

.section-card {
  margin-bottom: var(--spacing-md);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-light);
}

/* 彩色描边用 inset 阴影实现，避免覆盖 n-card 自身边框 */
.card-sync {
  box-shadow: inset 4px 0 0 var(--primary-color), var(--shadow-light, 0 2px 8px rgba(0, 0, 0, 0.06));
}

.card-sched {
  box-shadow: inset 4px 0 0 var(--primary-color), var(--shadow-light, 0 2px 8px rgba(0, 0, 0, 0.06));
}

.card-log {
  box-shadow: inset 4px 0 0 #10b981, var(--shadow-light, 0 2px 8px rgba(0, 0, 0, 0.06));
}

/* ============ 桌面端双栏：左配置 + 右常驻日志 ============ */
@media (min-width: 769px) {
  .cloud-tasks {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 400px);
    grid-template-areas:
      "header header"
      "stats stats"
      "sync log"
      "sched log";
    gap: var(--spacing-md);
    align-items: start;
  }

  .section-card {
    margin-bottom: 0;
  }

  .cloud-header {
    grid-area: header;
  }

  .stats-row {
    grid-area: stats;
  }

  .card-sync {
    grid-area: sync;
  }

  .card-sched {
    grid-area: sched;
  }

  /* 日志面板常驻右侧，滚动时吸顶，随视口高度撑满 */
  .card-log {
    grid-area: log;
    position: sticky;
    top: 76px;
  }

  .card-log .log-panel {
    max-height: calc(100vh - 250px);
    min-height: 200px;
  }
}

/* ============ 移动端 ============ */
@media (max-width: 768px) {
  .cloud-tasks {
    padding: var(--spacing-sm);
  }

  .cloud-header {
    flex-direction: column;
    align-items: stretch;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .stat-card {
    padding: 12px 14px;
  }

  .stat-icon {
    width: 36px;
    height: 36px;
    margin-right: 10px;
    font-size: 16px;
  }

  .stat-value {
    font-size: 20px;
  }

  .account-search {
    flex: 1;
    width: auto;
  }

  .card-head-actions {
    width: 100%;
  }

  /* 窄屏下卡片头部（标题 + 操作区）允许换行，避免标题被挤成竖排 */
  .section-card :deep(.n-card-header) {
    flex-wrap: wrap;
    gap: 6px;
  }

  .task-card {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .task-main {
    flex: 1 1 100%;
  }

  .task-actions {
    margin-left: auto;
  }
}

/* 账号任务设置弹窗 */
.settings-content {
  display: flex;
  flex-direction: column;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.setting-switches {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-label {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
