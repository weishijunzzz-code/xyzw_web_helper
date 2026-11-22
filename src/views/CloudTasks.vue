<template>
  <div class="cloud-tasks">
    <!-- 未登录：登录/注册 -->
    <div v-if="!isLoggedIn" class="auth-wrap">
      <NCard title="云端任务登录" class="auth-card">
        <NAlert v-if="authError" type="error" style="margin-bottom: 12px">
          {{ authError }}
        </NAlert>
        <NForm>
          <NFormItem label="用户名">
            <NInput v-model:value="authForm.username" placeholder="用户名" />
          </NFormItem>
          <NFormItem label="密码">
            <NInput
              v-model:value="authForm.password"
              type="password"
              show-password-on="click"
              placeholder="密码（至少8位）"
              @keyup.enter="submitAuth"
            />
          </NFormItem>
          <NSpace>
            <NButton type="primary" :loading="authLoading" @click="submitAuth">
              {{ authMode === "login" ? "登录" : "注册并登录" }}
            </NButton>
            <NButton quaternary @click="toggleAuthMode">
              {{ authMode === "login" ? "没有账号？去注册" : "已有账号？去登录" }}
            </NButton>
          </NSpace>
        </NForm>
      </NCard>
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
          <NButton size="small" @click="showCloudLogs = true">执行日志</NButton>
          <NButton size="small" quaternary :disabled="bulkBusy" @click="logout">退出登录</NButton>
        </div>
      </div>

      <div class="cloud-summary" aria-label="云端统计">
        <span>云端账号 <strong>{{ cloudTokens.length }}</strong></span>
        <span>已连接 <strong>{{ connectedCount }}</strong></span>
        <span>定时任务 <strong>{{ scheduledTasks.length }}</strong></span>
        <span>已启用 <strong>{{ enabledTaskCount }}</strong></span>
      </div>

      <div class="cloud-sections">
        <div class="cloud-tabs" role="tablist" aria-label="云端管理">
          <button v-for="tab in cloudTabs" :id="`cloud-tab-${tab.key}`" :key="tab.key" type="button" role="tab" :aria-selected="activeCloudTab === tab.key" :aria-controls="`cloud-panel-${tab.key}`" :tabindex="activeCloudTab === tab.key ? 0 : -1" @click="activeCloudTab = tab.key" @keydown="cloudTabKeydown($event)">{{ tab.label }}</button>
        </div>
        <section v-show="activeCloudTab === 'accounts'" id="cloud-panel-accounts" role="tabpanel" aria-labelledby="cloud-tab-accounts">
          <div class="cloud-toolbar">
            <NInput v-model:value="accountSearch" size="small" placeholder="搜索账号 / 服" clearable class="cloud-search">
              <template #prefix><NIcon size="14"><Search /></NIcon></template>
            </NInput>
            <span class="cloud-muted">本地 {{ localTokens.length }} 个</span>
            <div class="cloud-toolbar-actions">
              <NButton size="small" type="primary" :loading="syncing" :disabled="localTokens.length === 0" @click="syncAllTokens">全部同步（含 BIN）</NButton>
              <NButton size="small" :loading="loadingCloud" @click="refreshCloudTokens">刷新</NButton>
            </div>
          </div>
          <NAlert v-if="syncResult" :type="syncResult.type" class="cloud-notice" closable @close="syncResult = null">{{ syncResult.message }}</NAlert>
          <div v-if="filteredCloudTokens.length" class="cloud-card-grid">
            <article v-for="t in filteredCloudTokens" :key="t.id" class="cloud-account-card">
              <div class="cloud-account-heading">
                <img v-if="t.avatar" class="cloud-avatar" :src="t.avatar" :alt="t.name" referrerpolicy="no-referrer" />
                <span v-else class="cloud-avatar cloud-avatar-fallback">{{ avatarChar(t.name) }}</span>
                <div class="cloud-card-heading-text">
                  <h3 class="cloud-card-title" :title="t.name">{{ t.name }}</h3>
                  <span class="cloud-muted">{{ t.server || '未提供服务器' }}</span>
                </div>
              </div>
              <div class="cloud-account-status" :class="{ 'cloud-connected': connStatus[t.id] === 'connected' }">{{ statusText(connStatus[t.id]) }}</div>
              <div class="cloud-card-actions">
                <NButton size="small" quaternary @click="openAccountSettings(t)">设置</NButton>
                <NButton size="small" :type="connStatus[t.id] === 'connected' ? 'warning' : 'primary'" secondary @click="toggleConnect(t)">{{ connStatus[t.id] === 'connected' ? '断开' : '连接' }}</NButton>
                <NPopconfirm @positive-click="removeCloudToken(t)">
                  <template #trigger><NButton size="small" type="error" quaternary>删除</NButton></template>
                  确定删除云端账号「{{ t.name }}」？（不影响本地）
                </NPopconfirm>
              </div>
            </article>
          </div>
          <NEmpty v-else :description="cloudTokens.length ? '没有匹配的账号' : '云端还没有账号，可从本地全部同步'" class="cloud-empty" />
        </section>
        <section v-show="activeCloudTab === 'schedules'" id="cloud-panel-schedules" role="tabpanel" aria-labelledby="cloud-tab-schedules">
          <div class="cloud-toolbar">
            <span class="cloud-muted">Asia/Shanghai · 停用后不再定时触发</span>
            <div class="cloud-toolbar-actions">
              <NDropdown trigger="click" :options="bulkOptions" :disabled="tasksLocked || !scheduledTasks.length" @select="requestBulkToggle">
                <NButton size="small" :loading="bulkBusy" :disabled="tasksLocked || !scheduledTasks.length">批量开关</NButton>
              </NDropdown>
              <NButton size="small" type="primary" :disabled="tasksLocked" @click="openCreate">新建任务</NButton>
              <NButton size="small" @click="exportTasks">导出</NButton>
              <NButton size="small" :disabled="tasksLocked" @click="fileInput?.click()">导入</NButton>
              <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
            </div>
          </div>
          <NAlert v-if="bulkBusy || bulkReport" :type="bulkReport?.failed.length ? 'warning' : 'info'" class="cloud-notice" aria-live="polite">
            <template v-if="bulkBusy">正在{{ bulkTarget ? '启用' : '停用' }}：{{ bulkProgress }} / {{ bulkTotal }}</template>
            <template v-else>
              {{ bulkReport.message }}
              <div v-if="bulkReport.failed.length" class="cloud-failures">失败任务：{{ bulkReport.failed.map(t => t.name || t.id).join('、') }}</div>
              <NButton v-if="bulkReport.failed.length" size="small" :disabled="tasksLocked" @click="retryBulkToggle">重试失败任务</NButton>
            </template>
          </NAlert>
          <NAlert v-if="taskActionError" type="error" closable class="cloud-notice" @close="taskActionError = ''">{{ taskActionError }}</NAlert>
          <div v-if="scheduledTasks.length" class="cloud-card-grid">
            <article v-for="t in scheduledTasks" :key="t.id" class="cloud-schedule-card" :class="{ 'cloud-schedule-disabled': t.enabled === false }">
              <div class="cloud-task-heading">
                <h3 class="cloud-card-title" :title="t.name || t.id">{{ t.name || t.id }}</h3>
                <div class="cloud-task-toggle">
                  <span>{{ t.enabled !== false ? '已启用' : '已停用' }}</span>
                  <NSwitch :value="t.enabled !== false" :loading="pendingTaskId === t.id" :disabled="tasksLocked" :aria-label="`${t.name || t.id}定时开关`" @update:value="value => toggleTask(t, value)" />
                </div>
              </div>
              <p class="cloud-card-description" :title="taskAccountSummary(t)">{{ taskAccountSummary(t) }}</p>
              <p class="cloud-card-description" :title="taskSelectionSummary(t)">{{ taskSelectionSummary(t) }}</p>
              <code class="cloud-task-cron">{{ t.cron }}</code>
              <div class="cloud-task-result">
                <template v-if="t.lastRun"><span>上次 {{ formatTime(t.lastRun) }}</span><NTag size="tiny" :type="executionStatus(t.lastResult).type" :bordered="false">{{ executionStatus(t.lastResult).label }}</NTag></template>
                <span v-else>尚未执行</span>
              </div>
              <div class="cloud-next-run">下次运行：{{ nextRunLabel(t) }}</div>
              <div class="cloud-card-actions">
                <NButton v-if="t.lastResult" size="small" quaternary @click="openExecutionDetail(t)">执行详情</NButton>
                <NButton size="small" quaternary @click="openExecutionDetail(t, true)">执行记录</NButton>
                <NButton size="small" type="primary" secondary :disabled="tasksLocked" @click="runTaskNow(t)">立即执行</NButton>
                <NButton size="small" quaternary :disabled="tasksLocked" @click="startEditTask(t)">编辑</NButton>
                <NPopconfirm :disabled="tasksLocked" @positive-click="removeTask(t)">
                  <template #trigger><NButton size="small" type="error" quaternary :disabled="tasksLocked">删除</NButton></template>
                  确定删除该定时任务？
                </NPopconfirm>
              </div>
            </article>
          </div>
          <NEmpty v-else description="还没有定时任务，点击上方「新建任务」创建" class="cloud-empty" />
        </section>
      </div>

      <NModal :show="!!executionDetail" preset="card" title="执行详情" class="cloud-execution-modal" :style="{ width: '92vw', maxWidth: '720px' }" @update:show="value => { if (!value) executionDetail = null; }">
        <template v-if="executionDetail">
          <p>{{ executionDetail.name }} · {{ currentRun?.state === 'running' ? '执行中／等待账号队列' : executionStatus(executionDetail.lastResult).label }}</p>
          <NAlert v-if="runError" type="error" class="cloud-notice">{{ runError }}</NAlert>
          <NSpace v-if="historyEnabled" vertical class="cloud-notice">
            <NSelect :value="currentRun?.id" :options="runOptions" :loading="recordBusy" placeholder="选择执行记录" @update:value="selectRun" />
            <NButton v-if="canLoadMoreRuns" size="small" :loading="recordBusy" @click="loadMoreRuns">加载更早记录</NButton>
            <span v-if="currentRun?.parentRunId" class="cloud-muted">本次为补跑，原记录：{{ currentRun.parentRunId }}</span>
          </NSpace>
          <NAlert v-if="executionDetail.lastResult && executionDetail.lastResult.version !== 2" type="warning">旧版记录：使用旧成功判定，无法确认各账号实际完成情况。</NAlert>
          <p v-if="historyEnabled && !recordBusy && !runRows.length" class="cloud-muted">暂无独立执行记录；旧记录不能按账号失败项补跑。</p>
          <p class="cloud-muted">此处展示执行反馈，不代表已独立核验游戏中的最终状态。</p>
          <p v-if="executionDetail.lastResult?.error">{{ executionDetail.lastResult?.error }}</p>
          <p v-if="executionDetail.lastResult?.summary?.reason">{{ executionDetail.lastResult?.summary.reason }}</p>
          <div v-if="retryCandidates.length && currentRun?.state === 'finished'" class="cloud-retry-options">
            <h3>失败账号与子任务</h3>
            <p class="cloud-muted">已成功项目不会补跑。已提交或结果不明确的项目默认不选中；补跑可能重复消耗资源。</p>
            <NCheckboxGroup v-model:value="selectedRetryKeys">
              <NSpace vertical><NCheckbox v-for="item in retryCandidates" :key="item.key" :value="item.key">{{ item.label }}</NCheckbox></NSpace>
            </NCheckboxGroup>
            <NButton size="small" :disabled="!selectedRetryKeys.length || retrySubmitting || currentRun?.state !== 'finished'" @click="showRetryConfirm = true">补跑失败项 ({{ selectedRetryKeys.length }})</NButton>
          </div>
          <section v-for="(result, index) in executionDetail.lastResult?.summary?.results || []" :key="index" class="cloud-result-section">
            <h3>{{ TASK_LABELS[result.task] || result.task }} · {{ outcomeLabels[result.status] || '未确认' }}</h3>
            <p v-if="result.error || result.reason">{{ result.error || result.reason }}</p>
            <div v-for="account in result.accounts?.details || []" :key="account.id" class="cloud-account-result">
              <strong>{{ account.name }} · {{ outcomeLabels[account.status] || '未确认' }}</strong>
              <p v-if="account.reason">{{ account.reason }}</p>
              <div v-if="account.camp" class="cloud-camp-summary">
                <p>营地次数：开始已用 {{ account.camp.initialUsed ?? '未知' }} · 结束已用 {{ account.camp.finalUsed ?? '未知' }} · 剩余 {{ account.camp.remaining ?? '未知' }}</p>
                <p>本轮胜利 {{ account.camp.wins }} · 失败 {{ account.camp.losses }} · 结果不明 {{ account.camp.unknown }}</p>
                <ul v-if="account.camp.battles?.length"><li v-for="(battle, battleIndex) in account.camp.battles" :key="battleIndex">区域{{ Math.ceil(battle.nodeId / 10) }} {{ battle.name }}：{{ outcomeLabels[battle.status] || '未确认' }}（模拟 {{ battle.simulatedWins }}/3 胜）</li></ul>
              </div>
              <p v-if="account.attempts?.length">连接尝试 {{ account.attempts.length }} 次 · {{ account.submitted ? '已提交过业务命令' : '未提交业务命令' }}</p>
              <ul v-if="account.attempts?.length"><li v-for="attempt in account.attempts" :key="attempt.attempt">第 {{ attempt.attempt }} 次：{{ attempt.status === 'ok' ? '就绪' : attempt.reason }}</li></ul>
              <ul v-if="account.steps?.length"><li v-for="(step, stepIndex) in account.steps" :key="stepIndex">{{ step.name }}：{{ outcomeLabels[step.status] || '未确认' }}<span v-if="step.reason"> · {{ step.reason }}</span></li></ul>
            </div>
          </section>
        </template>
      </NModal>

      <NModal v-model:show="showRetryConfirm" preset="dialog" title="确认补跑失败项" positive-text="确认补跑" negative-text="取消" :loading="retrySubmitting" @positive-click="submitFailedRetry">
        将补跑以下 {{ selectedRetryKeys.length }} 个账号子任务。已提交或结果不明确的操作可能实际已成功，再次执行可能重复购买或消耗。
        <ul><li v-for="item in retryCandidates.filter(item => selectedRetryKeys.includes(item.key))" :key="item.key">{{ item.label }}</li></ul>
      </NModal>
      <NModal v-model:show="showBulkConfirm" preset="dialog" :title="bulkTarget ? '全部启用定时任务' : '全部停用定时任务'" positive-text="确认" negative-text="取消" @positive-click="executeBulkToggle">
        将{{ bulkTarget ? '启用' : '停用' }} {{ bulkCandidates.length }} 个任务。{{ bulkTarget ? '启用仅恢复定时触发，不会立即执行。' : '停用仅停止后续定时触发，不中断正在执行的任务。' }}
      </NModal>
      <NDrawer class="cloud-log-drawer" v-model:show="showCloudLogs" :width="isMobile ? '100%' : 480" placement="right">
        <NDrawerContent title="实时执行日志" closable>
          <template #footer><NButton size="small" quaternary @click="logs = []">清空日志</NButton></template>
          <div class="cloud-log-panel">
            <div v-for="(log, i) in logs" :key="logs.length - i" class="cloud-log-line" :class="`cloud-log-${log.level || 'info'}`">
              <time>{{ log.time }}</time> {{ log.message }}
            </div>
            <p v-if="!logs.length">暂无日志。执行任务或连接账号后，这里会实时显示后端推送的进度。</p>
          </div>
        </NDrawerContent>
      </NDrawer>

      <!-- 新建/编辑定时任务弹窗 -->
      <NModal
        v-model:show="showTaskModal"
        preset="card"
        :title="editingTaskId ? `编辑定时任务${taskForm.name ? `：${taskForm.name}` : ''}` : '新建定时任务'"
        :style="{ width: '90%', maxWidth: '600px', backgroundColor: 'var(--bg-primary)' }"
        :mask-closable="false"
        :bordered="false"
        @close="resetTaskForm"
      >
        <NAlert v-if="formError" type="error" size="small" style="margin-bottom: 12px">
          {{ formError }}
        </NAlert>
        <NForm
          class="cloud-task-form"
          :label-placement="isMobile ? 'top' : 'left'"
          :label-width="isMobile ? undefined : 90"
        >
          <NFormItem label="任务名称" :show-require-mark="true">
            <NInput v-model:value="taskForm.name" placeholder="如：每天日常" maxlength="40" />
          </NFormItem>
          <NFormItem label="Cron 表达式" :show-require-mark="true">
            <NSpace vertical style="width: 100%" :size="6">
              <div class="cron-row">
                <NInput
                  v-model:value="taskForm.cron"
                  placeholder="0 6 * * *（每天 6 点）"
                  class="cron-input"
                />
                <NSelect
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
            </NSpace>
          </NFormItem>
          <NFormItem label="执行账号" :show-require-mark="true">
            <NSpace vertical style="width: 100%" :size="4">
              <NSelect
                v-model:value="taskForm.tokenIds"
                multiple
                :options="cloudTokenOptions"
                placeholder="选择要执行的账号（可多选）"
              />
              <NSpace size="small" align="center">
                <NButton size="tiny" @click="taskForm.tokenIds = cloudTokenOptions.map((o) => o.value)">
                  全选账号
                </NButton>
                <NButton size="tiny" @click="taskForm.tokenIds = []">清空</NButton>
                <span v-if="!cloudTokenOptions.length" class="field-hint">
                  云端还没有账号，请先在上方「账号同步」
                </span>
              </NSpace>
            </NSpace>
          </NFormItem>
          <NFormItem label="执行任务" :show-require-mark="true">
            <NSpace vertical style="width: 100%" :size="4">
              <NSelect
                v-model:value="taskForm.selectedTasks"
                multiple
                :options="taskOptions"
                placeholder="选择要执行的任务（可多选，按顺序执行）"
              />
              <NSpace size="small">
                <NButton size="tiny" @click="taskForm.selectedTasks = taskOptions.map((o) => o.value)">
                  全选任务
                </NButton>
                <NButton size="tiny" @click="taskForm.selectedTasks = []">清空</NButton>
              </NSpace>
            </NSpace>
          </NFormItem>
          <NFormItem label="执行模式">
            <NSpace vertical style="width: 100%">
              <NSelect v-model:value="taskForm.executionMode" :options="executionModeOptions" />
              <span class="cloud-muted">按账号连续执行可复用连接；已有计划默认保留按任务批次执行。</span>
            </NSpace>
          </NFormItem>
          <NFormItem label="立即启用">
            <NSwitch v-model:value="taskForm.enabled" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end" :size="8">
            <NButton :disabled="saving" @click="showTaskModal = false">取消</NButton>
            <NButton type="primary" :loading="saving" @click="submitTask">
              {{ editingTaskId ? "保存修改" : "创建定时任务" }}
            </NButton>
          </NSpace>
        </template>
      </NModal>

    <!-- 账号任务设置弹窗（云端 KV：daily-settings:${tokenId}） -->
    <NModal
      v-model:show="showAccountSettings"
      preset="card"
      :title="`任务设置 - ${settingsToken?.name || ''}`"
      style="width: 90%; max-width: 400px"
    >
      <div class="settings-content">
        <div class="settings-grid">
          <div class="setting-item">
            <label class="setting-label">竞技场阵容</label>
            <NSelect
              v-model:value="accountSettings.arenaFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">爬塔阵容</label>
            <NSelect
              v-model:value="accountSettings.towerFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">BOSS阵容</label>
            <NSelect
              v-model:value="accountSettings.bossFormation"
              :options="formationOptions"
              size="small"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">BOSS次数</label>
            <NSelect
              v-model:value="accountSettings.bossTimes"
              :options="bossTimesOptions"
              size="small"
            />
          </div>
          <div class="setting-switches">
            <div class="switch-row">
              <span class="switch-label">领罐子</span>
              <NSwitch v-model:value="accountSettings.claimBottle" />
            </div>
            <div class="switch-row">
              <span class="switch-label">领挂机</span>
              <NSwitch v-model:value="accountSettings.claimHangUp" />
            </div>
            <div class="switch-row">
              <span class="switch-label">竞技场</span>
              <NSwitch v-model:value="accountSettings.arenaEnable" />
            </div>
            <div class="switch-row">
              <span class="switch-label">开宝箱</span>
              <NSwitch v-model:value="accountSettings.openBox" />
            </div>
            <div class="switch-row">
              <span class="switch-label">领取邮件奖励</span>
              <NSwitch v-model:value="accountSettings.claimEmail" />
            </div>
            <div class="switch-row">
              <span class="switch-label">黑市购买物品</span>
              <NSwitch v-model:value="accountSettings.blackMarketPurchase" />
            </div>
            <div class="switch-row">
              <span class="switch-label">付费招募</span>
              <NSwitch v-model:value="accountSettings.payRecruit" />
            </div>
          </div>
        </div>
        <NSpace justify="end" style="margin-top: 20px" :size="8">
          <NButton :disabled="savingAccountSettings" @click="showAccountSettings = false">取消</NButton>
          <NButton type="primary" :loading="savingAccountSettings" @click="saveAccountSettings">
            保存设置
          </NButton>
        </NSpace>
      </div>
    </NModal>
    </template>
  </div>
</template>

<script setup>
import { Search } from "@vicons/ionicons5";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NDrawer,
  NDrawerContent,
  NDropdown,
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
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import {
  scheduledTasksApi,
  ServerPushClient,
  settingsApi,
  statusApi,
  tokenApi,
} from "@/api/serverApi";
import { useMobile } from "@/composables/useMobile";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useCloudAuth } from "@/stores/cloudAuth";
import { useTokenStore } from "@/stores/tokenStore";
import { bossTimesOptions, formationOptions, isRetiredTreasureTask } from "@/utils/batch/constants.js";
import { calculateNextRuns, validateCronExpression } from "@/utils/batch/cronUtils.js";

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
    connStatus.value = Array.isArray(status) ? Object.fromEntries(status.filter(item => item?.id).map(item => [item.id, item.status || "disconnected"])) : status || {};
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
  executionMode: "account",
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
  climbTower: "爬咸将塔",
  climbWeirdTower: "爬怪塔（异变塔）",
  batchClaimFreeEnergy: "怪异塔领取道具",
  skinChallenge: "皮肤挑战",
  batchUseItems: "使用道具",
  batchMergeItems: "合成道具",
  batchUseAndMergeItems: "怪异塔领取、使用并合成",
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
  batchPkRoomAppoint: "赛事预约（PK 房间）",
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
  batchApexClaimTasks: "赛事每日领奖",
  batchApexVote: "赛事助威榜首（使用全部余票）",
  batchFootballBet: "一键竞猜（默认第3项）",
  batchCampChallenge: "营地挑战（普通）",
  batchCampChallengePet: "营地挑战（宠物）",
  batchCampClaimTasks: "营地任务领取",
};

const taskOptions = Object.entries(TASK_LABELS).filter(([value]) => !isRetiredTreasureTask(value)).map(([value, label]) => ({
  value,
  label,
}));

let tasksRefreshPromise = null;
async function refreshTasks() {
  if (tasksRefreshPromise) return tasksRefreshPromise;
  tasksRefreshPromise = loadScheduledTasks();
  try { await tasksRefreshPromise; } finally { tasksRefreshPromise = null; }
}
async function loadScheduledTasks() {
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
  taskForm.executionMode = "account";
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
  taskForm.executionMode = t.settings?.executionMode === "account" ? "account" : "task";
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
      ...(scheduledTasks.value.find(t => t.id === editingTaskId.value)?.settings || {}),
      executionMode: taskForm.executionMode,
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
  if (tasksLocked.value) return;
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

const activeCloudTab = ref("accounts");
const cloudTabs = computed(() => [
  { key: "accounts", label: `云端账号 (${cloudTokens.value.length})` },
  { key: "schedules", label: `定时任务 (${scheduledTasks.value.length})` },
]);
function cloudTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  activeCloudTab.value = event.key === "Home" ? "accounts" : event.key === "End" ? "schedules" : activeCloudTab.value === "accounts" ? "schedules" : "accounts";
  document.getElementById(`cloud-tab-${activeCloudTab.value}`)?.focus();
}
const showCloudLogs = ref(false);
const pendingTaskId = ref(null);
const taskActionError = ref("");
const bulkBusy = ref(false);
const bulkTarget = ref(false);
const bulkProgress = ref(0);
const bulkTotal = ref(0);
const bulkReport = ref(null);
const showBulkConfirm = ref(false);
const bulkCandidates = ref([]);
const importingTasks = ref(false);
const tasksLocked = computed(() => bulkBusy.value || pendingTaskId.value !== null || importingTasks.value || saving.value);
const bulkOptions = computed(() => [
  { label: `全部启用 (${scheduledTasks.value.filter(t => t.enabled === false).length})`, key: "enable", disabled: !scheduledTasks.value.some(t => t.enabled === false) },
  { label: `全部停用 (${enabledTaskCount.value})`, key: "disable", disabled: !enabledTaskCount.value },
]);
let cloudPageDisposed = false;

function taskAccountSummary(task) {
  const ids = task.tokenIds || [];
  const names = ids.slice(0, 2).map(id => cloudTokens.value.find(t => t.id === id)?.name || id);
  return ids.length ? `${names.join('、')}${ids.length > 2 ? '…' : ''} · ${ids.length} 个账号` : '未选择账号';
}
function taskSelectionSummary(task) {
  const selected = task.settings?.selectedTasks || [];
  return selected.length ? selected.map(key => TASK_LABELS[key] || key).join('、') : '未选择任务';
}
function requestBulkToggle(key) {
  if (tasksLocked.value) return;
  bulkTarget.value = key === "enable";
  bulkCandidates.value = scheduledTasks.value.filter(t => (t.enabled !== false) !== bulkTarget.value);
  if (bulkCandidates.value.length) showBulkConfirm.value = true;
}
function retryBulkToggle() {
  if (tasksLocked.value || !bulkReport.value) return;
  const failedIds = new Set(bulkReport.value.failed.map(t => t.id));
  bulkTarget.value = bulkReport.value.target;
  bulkCandidates.value = scheduledTasks.value.filter(t => failedIds.has(t.id) && (t.enabled !== false) !== bulkTarget.value);
  if (bulkCandidates.value.length) showBulkConfirm.value = true;
}
async function executeBulkToggle() {
  if (tasksLocked.value || !isLoggedIn.value || cloudPageDisposed) return;
  showBulkConfirm.value = false;
  const target = bulkTarget.value;
  const candidates = [...bulkCandidates.value];
  bulkBusy.value = true;
  bulkProgress.value = 0;
  bulkTotal.value = candidates.length;
  bulkReport.value = null;
  taskActionError.value = "";
  let next = 0;
  let expired = false;
  let succeeded = 0;
  const failed = [];
  async function worker() {
    while (next < candidates.length) {
      if (expired || cloudPageDisposed || !isLoggedIn.value) break;
      const task = candidates[next++];
      try {
        await scheduledTasksApi.update(task.id, { enabled: target });
        task.enabled = target;
        succeeded++;
      } catch (error) {
        failed.push(task);
        if (error.response?.status === 401) expired = true;
      } finally {
        bulkProgress.value++;
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, worker));
    failed.push(...candidates.slice(next));
    if (!expired && !cloudPageDisposed && isLoggedIn.value) await refreshTasks();
    bulkReport.value = { target, failed, message: `${target ? '启用' : '停用'}完成：成功 ${succeeded} 个，失败或未提交 ${failed.length} 个。` };
    pushLog(failed.length ? 'warning' : 'success', bulkReport.value.message);
  } finally {
    bulkBusy.value = false;
  }
}
async function toggleTask(t, enabled) {
  if (tasksLocked.value) return;
  pendingTaskId.value = t.id;
  taskActionError.value = "";
  try {
    await scheduledTasksApi.update(t.id, { enabled });
    t.enabled = enabled;
    await refreshTasks();
  } catch (e) {
    taskActionError.value = `操作失败: ${e.response?.data?.error || e.message}`;
    pushLog("error", taskActionError.value);
  } finally {
    pendingTaskId.value = null;
  }
}

async function removeTask(t) {
  if (tasksLocked.value) return;
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
        settings: { ...t.settings, executionMode: t.settings?.executionMode === "account" ? "account" : "task" },
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
  if (tasksLocked.value) { ev.target.value = ""; return; }
  importingTasks.value = true;
  try {
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
        settings: { ...t.settings, executionMode: t.settings?.executionMode === "account" ? "account" : "task" },
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
  } finally { importingTasks.value = false; }
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
    if (msg.result?.persisted) { refreshTasks(); refreshExecutionHistory(); }
    pushLog(msg.result?.status === "ok" ? "success" : "info", `[结束] ${msg.taskName || msg.message || ""}${msg.result?.status ? `：${outcomeLabels[msg.result.status] || "未确认"}` : ""}`);
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

const executionModeOptions = [{ label: '按账号连续执行', value: 'account' }, { label: '按任务批次执行', value: 'task' }];
const executionDetail = ref(null);
const currentRun = ref(null);
const runRows = ref([]);
const historyEnabled = ref(false);
const recordBusy = ref(false);
const runError = ref("");
const canLoadMoreRuns = ref(false);
const selectedRetryKeys = ref([]);
const retrySubmitting = ref(false);
const showRetryConfirm = ref(false);
let recordRequest = 0;
const runOptions = computed(() => runRows.value.map(run => ({ value: run.id, label: `${formatTime(run.startedAt)} · ${run.parentRunId ? '补跑' : '执行'} · ${run.state === 'running' ? '执行中' : outcomeLabels[run.status] || '未确认'}` })));
const retryCandidates = computed(() => (currentRun.value?.result?.summary?.results || []).flatMap(result => (result.accounts?.details || []).filter(account => ['error', 'partial', 'unverified', 'incomplete'].includes(account.status)).map(account => ({ key: JSON.stringify([account.id, result.task]), tokenId: account.id, task: result.task, label: `${account.name} · ${TASK_LABELS[result.task] || result.task} · ${account.reason || outcomeLabels[account.status]}`, safeDefault: account.status === 'error' && account.stage === 'preflight' && !account.submitted }))));
async function openExecutionDetail(task, forceHistory = false) {
  recordRequest++;
  executionDetail.value = task;
  currentRun.value = null; runRows.value = []; runError.value = ''; selectedRetryKeys.value = [];
  historyEnabled.value = forceHistory || !!task.lastResult?.runId;
  if (historyEnabled.value) await refreshExecutionHistory(forceHistory ? undefined : task.lastResult?.runId, true);
}
async function refreshExecutionHistory(preferredId, force = false) {
  if (!executionDetail.value || !historyEnabled.value || (recordBusy.value && !force)) return;
  const id = executionDetail.value.id; const request = ++recordRequest;
  recordBusy.value = true;
  try {
    const rows = await scheduledTasksApi.runs(id);
    if (request !== recordRequest || executionDetail.value?.id !== id) return;
    runRows.value = rows; canLoadMoreRuns.value = rows.length === 20;
    const runId = preferredId || currentRun.value?.id || rows[0]?.id;
    if (runId) await selectRun(runId, request);
  } catch (error) { runError.value = `读取执行记录失败：${error.response?.data?.error || error.message}`; }
  finally { recordBusy.value = false; }
}
async function selectRun(runId, inheritedRequest) {
  if (!executionDetail.value) return;
  const request = typeof inheritedRequest === 'number' ? inheritedRequest : ++recordRequest;
  const id = executionDetail.value.id;
  try {
    const run = await scheduledTasksApi.getRun(id, runId);
    if (request !== recordRequest || executionDetail.value?.id !== id) return;
    const changed = currentRun.value?.id !== run.id;
    currentRun.value = run;
    executionDetail.value = { ...executionDetail.value, lastResult: run.result || { version: 2, status: 'unverified' } };
    if (changed) selectedRetryKeys.value = retryCandidates.value.filter(item => item.safeDefault).map(item => item.key);
  } catch (error) { runError.value = `读取执行详情失败：${error.response?.data?.error || error.message}`; }
}
async function loadMoreRuns() {
  if (recordBusy.value || !executionDetail.value) return;
  recordBusy.value = true;
  try {
    const rows = await scheduledTasksApi.runs(executionDetail.value.id, runRows.value.length);
    runRows.value.push(...rows); canLoadMoreRuns.value = rows.length === 20;
  } catch (error) { runError.value = error.message; }
  finally { recordBusy.value = false; }
}
async function submitFailedRetry() {
  if (!executionDetail.value || !currentRun.value || retrySubmitting.value || !selectedRetryKeys.value.length) return false;
  retrySubmitting.value = true; runError.value = '';
  try {
    const selection = retryCandidates.value.filter(item => selectedRetryKeys.value.includes(item.key)).map(({ tokenId, task }) => ({ tokenId, task }));
    const result = await scheduledTasksApi.retry(executionDetail.value.id, currentRun.value.id, selection);
    showRetryConfirm.value = false;
    await refreshExecutionHistory(result.runId);
  } catch (error) { runError.value = `补跑提交失败：${error.response?.data?.error || error.message}`; }
  finally { retrySubmitting.value = false; }
  return false;
}
const outcomeLabels = { ok: '成功', partial: '部分失败', error: '失败', skip: '跳过', unverified: '未确认', incomplete: '未完成' };
function executionStatus(result) {
  if (result?.version !== 2) return { label: '旧版记录', type: 'default' };
  return { label: outcomeLabels[result.status] || '未确认', type: ({ ok: 'success', partial: 'warning', error: 'error', skip: 'default', unverified: 'warning', incomplete: 'warning' })[result.status] || 'warning' };
}
function formatTime(iso) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '时间不可用';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
}
function nextRunLabel(task) {
  if (task.enabled === false) return '已停用';
  return task.nextRunAt ? formatTime(task.nextRunAt) : task.nextRunReason || '服务端未提供调度时间';
}
let tasksRefreshTimer = null;
function syncTaskRefresh() {
  clearInterval(tasksRefreshTimer);
  tasksRefreshTimer = null;
  if (document.hidden || cloudPageDisposed) return;
  if (isLoggedIn.value) refreshTasks();
  tasksRefreshTimer = setInterval(() => { if (isLoggedIn.value && !document.hidden) { refreshTasks(); refreshExecutionHistory(); } }, 30000);
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
  document.addEventListener("visibilitychange", syncTaskRefresh);
  syncTaskRefresh();
  if (isLoggedIn.value) onAuthReady();
});

onUnmounted(() => {
  cloudPageDisposed = true;
  clearInterval(tasksRefreshTimer);
  document.removeEventListener("visibilitychange", syncTaskRefresh);
  if (pushClient) {
    pushClient.disconnect();
    pushClient = null;
  }
});
</script>

<style scoped>
.cloud-tasks { width: 100%; min-width: 0; padding: 16px; box-sizing: border-box; }
.cloud-header, .cloud-header-actions, .cloud-toolbar, .cloud-toolbar-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cloud-header { justify-content: space-between; margin-bottom: 16px; }
.cloud-header-text { min-width: 0; }
.cloud-title { margin: 0 0 4px; font-size: 20px; color: var(--text-primary); }
.cloud-sub, .cloud-muted { color: var(--text-secondary); font-size: 12px; }
.push-pill { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 12px; }
.push-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-tertiary); }
.push-pill.on .push-dot { background: var(--success-color); }
.cloud-summary { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; color: var(--text-secondary); font-size: 12px; }
.cloud-summary strong { margin-left: 6px; color: var(--text-primary); font-size: 14px; font-weight: 600; }
.cloud-toolbar { margin: 8px 0 16px; }
.cloud-toolbar-actions { margin-left: auto; gap: 8px; }
.cloud-search { width: 220px; max-width: 100%; }
.cloud-notice { margin-bottom: 12px; }
.cloud-failures { overflow-wrap: anywhere; margin: 4px 0; }
.cloud-sections { container-type: inline-size; }
.cloud-tabs { display: flex; gap: 24px; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); }
.cloud-tabs button { appearance: none; padding: 12px 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-secondary); font: inherit; font-size: 14px; cursor: pointer; }
.cloud-tabs button[aria-selected="true"] { border-bottom-color: var(--primary-color); color: var(--primary-color); font-weight: 600; }
.cloud-tabs button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 3px; border-radius: 4px; }
.cloud-card-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@container (min-width: 600px) { .cloud-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: 960px) { .cloud-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (min-width: 1280px) { .cloud-card-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.cloud-account-card, .cloud-schedule-card { min-width: 0; padding: 16px; border-radius: 12px; background: var(--bg-primary); box-shadow: 0 4px 16px rgba(0,0,0,.06); display: flex; flex-direction: column; gap: 10px; }
.cloud-account-heading, .cloud-task-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cloud-card-heading-text { flex: 1; min-width: 0; }
.cloud-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.cloud-avatar-fallback { display: grid; place-items: center; color: var(--primary-color); background: var(--primary-color-light); }
.cloud-card-title { margin: 0; color: var(--text-primary); font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cloud-task-heading .cloud-card-title { flex: 1; min-width: 0; }
.cloud-task-toggle { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 12px; color: var(--text-secondary); }
.cloud-task-heading :deep(.n-switch) { flex-shrink: 0; }
.cloud-account-status { color: var(--text-secondary); font-size: 12px; }
.cloud-connected { color: var(--success-color); }
.cloud-card-description { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.cloud-task-cron { color: var(--text-secondary); background: var(--bg-secondary); padding: 4px 8px; border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
.cloud-next-run { font-size: 12px; color: var(--text-secondary); overflow-wrap: anywhere; }
.cloud-retry-options { padding: 12px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 16px; }
.cloud-retry-options h3 { font-size: 14px; }
.cloud-retry-options :deep(.n-checkbox) { white-space: normal; }
.cloud-result-section { margin-top: 16px; overflow-wrap: anywhere; }
.cloud-result-section h3 { font-size: 14px; }
.cloud-account-result { padding: 10px 0; border-bottom: 1px solid var(--border-light); font-size: 12px; }
.cloud-account-result p { margin: 4px 0; }
.cloud-account-result ul { padding-left: 20px; }
.cloud-task-result { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); margin-top: auto; }
.cloud-card-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; padding-top: 8px; margin-top: auto; border-top: 1px solid var(--border-light); }
.cloud-schedule-disabled .cloud-card-title { color: var(--text-secondary); }
.cloud-empty { padding: 40px 0; }
.cloud-log-panel { padding: 12px; border-radius: 12px; background: var(--bg-secondary); color: var(--text-secondary); font-family: ui-monospace, monospace; font-size: 12px; }
.cloud-log-line { padding: 4px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.cloud-log-line time { color: var(--text-tertiary); margin-right: 6px; }
.cloud-log-error { color: var(--error-color); }
.cloud-log-success { color: var(--success-color); }
.cloud-log-warning { color: var(--warning-color); }
.auth-wrap { display: grid; place-items: center; min-height: 60vh; }
.auth-card { width: 100%; max-width: 380px; }
@media (max-width: 768px) {
  :global(.cloud-log-drawer.n-drawer) { width: 100vw !important; max-width: 100vw !important; }
  .cloud-tasks { padding: 12px; }
  .cloud-toolbar-actions { margin-left: 0; width: 100%; }
  .cloud-search { width: 100%; }
  .cloud-header-actions { gap: 8px; }
  .cloud-tasks :deep(.n-button) { min-height: 44px; }
  .cloud-task-heading :deep(.n-switch) { min-height: 44px; }
}
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
