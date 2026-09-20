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
      <div class="cloud-header">
        <div>
          <h2 class="cloud-title">云端任务</h2>
          <span class="cloud-sub">
            后端 7×24 自动执行，关掉浏览器任务照跑 · 当前用户：{{ user?.username }}
          </span>
        </div>
        <n-space>
          <n-tag :type="pushConnected ? 'success' : 'error'" size="small">
            {{ pushConnected ? "实时推送已连接" : "推送未连接" }}
          </n-tag>
          <n-button size="small" @click="logout">退出登录</n-button>
        </n-space>
      </div>

      <!-- Token 同步 -->
      <n-card title="账号同步（本地 → 云端）" size="small" class="section-card">
        <n-space align="center">
          <span>
            本地 {{ localTokens.length }} 个账号 · 云端已有
            {{ cloudTokens.length }} 个
          </span>
          <n-button
            type="primary"
            size="small"
            :loading="syncing"
            :disabled="localTokens.length === 0"
            @click="syncAllTokens"
          >
            全部同步到云端（含 BIN）
          </n-button>
          <n-button size="small" :loading="loadingCloud" @click="refreshCloudTokens">
            刷新云端列表
          </n-button>
        </n-space>
        <n-alert v-if="syncResult" :type="syncResult.type" style="margin-top: 10px">
          {{ syncResult.message }}
        </n-alert>

        <div v-if="cloudTokens.length" class="cloud-token-list">
          <div
            v-for="t in cloudTokens"
            :key="t.id"
            class="cloud-token-row"
          >
            <span class="ct-name" :title="t.name">{{ t.name }}</span>
            <span class="ct-server">{{ t.server || "-" }}</span>
            <span
              class="ct-status"
              :class="`is-${connStatus[t.id] || 'disconnected'}`"
            >
              {{ statusText(connStatus[t.id]) }}
            </span>
            <n-button
              size="tiny"
              :type="connStatus[t.id] === 'connected' ? 'warning' : 'success'"
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
      </n-card>

      <!-- 定时任务 -->
      <n-card title="定时任务（服务端 croner，时区 Asia/Shanghai）" size="small" class="section-card">
        <n-collapse v-model:expanded-names="collapseExpanded">
          <n-collapse-item
            :title="editingTaskId ? `编辑定时任务：${taskForm.name || editingTaskId}` : '新建定时任务'"
            name="create"
          >
            <n-form label-placement="left" label-width="90">
              <n-form-item label="任务名称">
                <n-input v-model:value="taskForm.name" placeholder="如：每天日常" />
              </n-form-item>
              <n-form-item label="Cron 表达式">
                <n-input v-model:value="taskForm.cron" placeholder="0 6 * * *（每天 6 点）" />
              </n-form-item>
              <n-form-item label="执行账号">
                <n-space vertical style="width: 100%" :size="4">
                  <n-select
                    v-model:value="taskForm.tokenIds"
                    multiple
                    :options="cloudTokenOptions"
                    placeholder="选择要执行的账号（可多选）"
                  />
                  <n-space size="small">
                    <n-button size="tiny" @click="taskForm.tokenIds = cloudTokenOptions.map((o) => o.value)">
                      全选账号
                    </n-button>
                    <n-button size="tiny" @click="taskForm.tokenIds = []">清空</n-button>
                  </n-space>
                </n-space>
              </n-form-item>
              <n-form-item label="执行任务">
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
              <n-space size="small">
                <n-button type="primary" size="small" @click="submitTask">
                  {{ editingTaskId ? "保存修改" : "创建定时任务" }}
                </n-button>
                <n-button v-if="editingTaskId" size="small" @click="cancelEdit">
                  取消编辑
                </n-button>
              </n-space>
            </n-form>
          </n-collapse-item>
        </n-collapse>

        <div v-if="scheduledTasks.length" class="sched-list">
          <div v-for="t in scheduledTasks" :key="t.id" class="sched-row">
            <div class="sched-info">
              <div class="sched-name">
                {{ t.name || t.id }}
                <n-tag size="tiny" :type="t.enabled ? 'success' : 'default'">
                  {{ t.enabled ? "已启用" : "已停用" }}
                </n-tag>
              </div>
              <div class="sched-meta">
                cron: <code>{{ t.cron }}</code> · 账号 {{ (t.tokenIds || []).length }} 个 ·
                任务 {{ (t.settings?.selectedTasks || []).length }} 项
                <template v-if="t.lastRun">
                  · 上次执行 {{ formatTime(t.lastRun) }}
                  <n-tag
                    size="tiny"
                    :type="t.lastResult?.success ? 'success' : 'error'"
                  >
                    {{ t.lastResult?.success ? "成功" : "失败" }}
                  </n-tag>
                </template>
              </div>
            </div>
            <n-space size="small">
              <n-button size="tiny" @click="startEditTask(t)">编辑</n-button>
              <n-button size="tiny" @click="runTaskNow(t)">立即执行</n-button>
              <n-button size="tiny" @click="toggleTask(t)">
                {{ t.enabled ? "停用" : "启用" }}
              </n-button>
              <n-popconfirm @positive-click="removeTask(t)">
                <template #trigger>
                  <n-button size="tiny" type="error" quaternary>删除</n-button>
                </template>
                确定删除该定时任务？
              </n-popconfirm>
            </n-space>
          </div>
        </div>
        <n-empty v-else description="还没有定时任务，展开上方表单创建" style="margin: 16px 0" />
      </n-card>

      <!-- 执行日志 -->
      <n-card title="实时执行日志" size="small" class="section-card">
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
    </template>
  </div>
</template>

<script setup>
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
} from "naive-ui";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import { useCloudAuth } from "@/stores/cloudAuth";
import {
  ServerPushClient,
  scheduledTasksApi,
  statusApi,
  tokenApi,
} from "@/api/serverApi";

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
  try {
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
          },
        ]);
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
      message: `同步完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}`,
    };
    await refreshCloudTokens();
  } finally {
    syncing.value = false;
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
  batchSmartSendCar: "智能发车",
  batchClaimCars: "领取车辆",
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
  batchLegacyClaim: "遗产领取",
  batchLegacyGiftSendEnhanced: "遗产送礼",
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
const collapseExpanded = ref([]);

function resetTaskForm() {
  editingTaskId.value = null;
  taskForm.name = "";
  taskForm.cron = "0 6 * * *";
  taskForm.tokenIds = [];
  taskForm.selectedTasks = [];
  taskForm.enabled = true;
}

function startEditTask(t) {
  editingTaskId.value = t.id;
  taskForm.name = t.name || "";
  taskForm.cron = t.cron || "0 6 * * *";
  taskForm.tokenIds = [...(t.tokenIds || [])];
  taskForm.selectedTasks = [...(t.settings?.selectedTasks || [])];
  taskForm.enabled = t.enabled !== false;
  collapseExpanded.value = ["create"]; // 自动展开编辑表单
}

function cancelEdit() {
  resetTaskForm();
  collapseExpanded.value = [];
}

async function submitTask() {
  if (!taskForm.name || !taskForm.cron) {
    pushLog("error", "请填写任务名称和 cron 表达式");
    return;
  }
  if (!taskForm.tokenIds.length || !taskForm.selectedTasks.length) {
    pushLog("error", "请选择执行账号和执行任务");
    return;
  }
  const payload = {
    name: taskForm.name,
    cron: taskForm.cron,
    tokenIds: taskForm.tokenIds,
    enabled: taskForm.enabled,
    settings: {
      selectedTasks: taskForm.selectedTasks,
      maxActive: 3,
      commandDelay: 500,
      taskDelay: 1000,
    },
  };
  const taskName = taskForm.name;
  try {
    if (editingTaskId.value) {
      await scheduledTasksApi.update(editingTaskId.value, payload);
      pushLog("success", `定时任务「${taskName}」已更新`);
    } else {
      await scheduledTasksApi.create(payload);
      pushLog("success", `定时任务「${taskName}」已创建`);
    }
    resetTaskForm();
    await refreshTasks();
  } catch (e) {
    pushLog(
      "error",
      `${editingTaskId.value ? "更新" : "创建"}失败: ${e.response?.data?.error || e.message}`,
    );
  }
}

async function runTaskNow(t) {
  pushLog("info", `手动执行「${t.name || t.id}」...`);
  try {
    const result = await scheduledTasksApi.run(t.id);
    pushLog("success", `执行完成: ${JSON.stringify(result).slice(0, 200)}`);
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
  max-width: 1080px;
  padding: 16px;
  margin: 0 auto;
}

.auth-wrap {
  display: grid;
  place-items: center;
  min-height: 60vh;
}

.auth-card {
  width: 100%;
  max-width: 380px;
}

.cloud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cloud-title {
  margin: 0;
  font-size: 20px;
}

.cloud-sub {
  color: var(--text-muted, #889);
  font-size: 13px;
}

.section-card {
  margin-bottom: 16px;
}

.cloud-token-list {
  margin-top: 12px;
}

.cloud-token-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.ct-name {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-server {
  flex: 1;
  color: var(--text-muted, #889);
  font-size: 12px;
}

.ct-status {
  font-size: 12px;
}

.ct-status.is-connected {
  color: #18a058;
}

.ct-status.is-connecting {
  color: #f0a020;
}

.ct-status.is-error {
  color: #d03050;
}

.ct-status.is-disconnected {
  color: #999;
}

.sched-list {
  margin-top: 12px;
}

.sched-row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.sched-name {
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
}

.sched-meta {
  margin-top: 2px;
  color: var(--text-muted, #889);
  font-size: 12px;
}

.log-panel {
  max-height: 320px;
  padding: 8px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  background: var(--log-bg, #0d1117);
  border-radius: 6px;
}

.log-line {
  padding: 2px 0;
  color: #c9d1d9;
  word-break: break-all;
}

.log-time {
  margin-right: 8px;
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
  padding: 16px;
  color: #7d8590;
  text-align: center;
}
</style>
