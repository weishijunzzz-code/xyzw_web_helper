<template>
  <div class="token-import-page" :class="{ 'account-page-mobile': isMobile }">
    <div class="account-page-content">
      <!-- 统计概览 -->
      <div v-if="tokenStore.hasTokens" class="account-summary">
        <span><strong>{{ tokenStore.gameTokens.length }}</strong> 本地账号</span>
        <span><strong>{{ onlineCount }}</strong> 已连接</span>
        <span v-if="!isMobile"><strong>{{ offlineCount }}</strong> 未连接</span>
      </div>

      <section v-if="nativeGame && singleGameSession" class="retained-game-summary" aria-label="保留的游戏">
        <div class="retained-game-identity">
          <strong :title="singleGameSession.accountName">{{ singleGameSession.accountName }}</strong>
          <span>{{ singleGameSession.status === 'loading' ? '游戏加载中' : singleGameSession.status === 'failed' ? '游戏加载失败' : '游戏已保留' }}</span>
        </div>
        <n-button type="primary" @click="resumeSingleGame(router)">继续游戏</n-button>
        <n-button secondary @click="confirmCloseRetained">关闭游戏</n-button>
      </section>

      <!-- 限流等待提示 -->
      <n-alert
        v-if="rateLimitWaiting"
        type="warning"
        style="margin-bottom: 16px"
      >
        {{ rateLimitMessage }}
      </n-alert>

      <!-- Token导入区域 -->
      <a-modal
        class="token-import-modal"
        v-model:visible="showImportForm"
        :width="isMobile ? '95vw' : '40rem'"
        :footer="false"
        :default-visible="!tokenStore.hasTokens"
      >
        <template #title>
          <h2>
            <n-icon>
              <Add />
            </n-icon>
            添加游戏Token
          </h2>
        </template>
        <div class="card-header">
          <!-- 导入方式选择 - 桌面端使用选项卡 -->
          <div v-if="!isMobile" class="import-method-scroll">
            <n-radio-group
              v-model:value="importMethod"
              class="import-method-tabs"
              size="small"
            >
              <n-radio-button value="manual"> 手动输入 </n-radio-button>
              <n-radio-button value="url"> URL获取 </n-radio-button>
              <n-radio-button value="wxQrcode"> 微信扫码 </n-radio-button>
              <n-radio-button value="mobile"> 手机号验证码 </n-radio-button>
              <n-radio-button value="bin"> 多角色 </n-radio-button>
              <n-radio-button value="singlebin"> 单角色 </n-radio-button>
            </n-radio-group>
          </div>
          <!-- 导入方式选择 - 移动端使用下拉选择 -->
          <div v-else class="import-method-mobile">
            <n-select
              v-model:value="importMethod"
              :options="importMethodOptions"
              size="small"
              class="mobile-method-select"
            />
          </div>
        </div>

        <!-- One-click import from a backup / config file -->
        <div class="config-import-bar">
          <span class="config-import-tip">
            已有备份文件？可直接导入账号与全部配置
          </span>
          <n-upload
            :show-file-list="false"
            accept=".json"
            :custom-request="handleImportConfigFile"
          >
            <n-button size="small" type="info" ghost>
              <template #icon>
                <NIcon>
                  <CloudUpload />
                </NIcon>
              </template>
              导入配置
            </n-button>
          </n-upload>
        </div>
        <div class="card-body">
          <manual-token-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="importMethod === 'manual'"
          />
          <url-token-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="importMethod === 'url'"
          />
          <wx-qrcode-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="importMethod === 'wxQrcode'"
          />
          <mobile-token-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="importMethod === 'mobile'"
          />
          <bin-token-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="importMethod === 'bin'"
          />
          <single-bin-token-form
            @cancel="() => (showImportForm = false)"
            @ok="() => (showImportForm = false)"
            v-if="showImportForm && importMethod === 'singlebin'"
          />
        </div>
      </a-modal>

      <!-- Token列表 -->
      <div v-if="tokenStore.hasTokens" class="tokens-section">
        <div v-if="isMobile" class="account-mobile-toolbar">
          <n-input
            v-model:value="accountSearch"
            placeholder="名称或区服"
            :input-props="{ 'aria-label': '搜索账号名称或区服' }"
            clearable
          >
            <template #prefix>
              <NIcon :component="SearchOutline" aria-hidden="true" />
            </template>
          </n-input>
          <n-button type="primary" @click="openshowImportForm">添加账号</n-button>
          <n-dropdown trigger="click" :options="accountMenuOptions" @select="handleAccountMenuAction">
            <n-button aria-label="排序与更多操作">
              <template #icon><NIcon :component="EllipsisHorizontal" /></template>
            </n-button>
          </n-dropdown>
        </div>
        <div v-else class="section-header account-desktop-toolbar">
          <div class="header-left">
            <h2>Token列表 ({{ tokenStore.gameTokens.length }}个)</h2>
            <n-space align="center" size="small">
              <n-radio-group v-model:value="viewMode" size="small">
                <n-radio-button value="list">列表</n-radio-button>
                <n-radio-button value="card">卡片</n-radio-button>
              </n-radio-group>
              <n-button-group size="small">
                <n-button
                  v-for="option in sortOptions"
                  :key="option.value"
                  :type="sortConfig.field === option.value ? 'primary' : 'default'"
                  @click="toggleSort(option.value)"
                >
                  {{ option.label }} {{ getSortIcon(option.value) }}
                </n-button>
              </n-button-group>
            </n-space>
          </div>
          <div class="header-actions">
            <n-input
              v-model:value="accountSearch"
              size="small"
              placeholder="名称或区服"
              :input-props="{ 'aria-label': '搜索账号名称或区服' }"
              class="account-desktop-search"
              clearable
            >
              <template #prefix><NIcon :component="SearchOutline" aria-hidden="true" /></template>
            </n-input>
            <n-button quaternary size="small" @click="openGame()">
              <template #icon><NIcon :component="GameController" /></template>
              打开游戏
            </n-button>
            <n-button quaternary size="small" @click="goToDashboard">
              <template #icon><NIcon :component="List" /></template>
              批量
            </n-button>
            <n-button quaternary size="small" @click="goToPushingLevels">
              <template #icon><NIcon :component="Rocket" /></template>
              主线推关
            </n-button>
            <n-button v-if="!showImportForm" type="primary" size="small" @click="openshowImportForm">
              <template #icon><NIcon :component="Add" /></template>
              添加Token
            </n-button>
            <n-dropdown trigger="click" :options="desktopBulkOptions" @select="handleAccountMenuAction">
              <n-button size="small">
                <template #icon><NIcon :component="Menu" /></template>
                批量操作
              </n-button>
            </n-dropdown>
          </div>
        </div>

        <div v-if="multiGameSelectedTokenIds.size" class="account-batch-bar">
          <span role="status">{{ isOpeningMultiGame ? "正在准备" : "已选" }} {{ multiGameSelectedTokenIds.size }} 个</span>
          <n-button size="small" :disabled="isOpeningMultiGame || allMultiGameTokensSelected" @click="selectAllMultiGameTokens">
            {{ allMultiGameTokensSelected ? "已全选" : "全选" }}
          </n-button>
          <n-button size="small" :disabled="isOpeningMultiGame" @click="clearMultiGameTokenSelection">清空</n-button>
          <n-button size="small" type="primary" :loading="isOpeningMultiGame" :disabled="Boolean(openingGameTokenId)" @click="openSelectedGames">
            批量进入游戏
          </n-button>
        </div>

        <n-empty v-if="!filteredTokens.length" description="没有匹配的账号" class="account-search-empty">
          <template #extra><n-button text @click="accountSearch = ''">清除搜索</n-button></template>
        </n-empty>
        <div v-else-if="!isMobile && viewMode === 'card'" class="tokens-grid">
          <a-card
            v-for="(token, index) in filteredTokens"
            :key="token.id"
            :draggable="!accountQuery"
            @dragstart="handleDragStart(index, $event)"
            @dragend="dragIndex = null"
            @dragover="handleDragOver($event)"
            @drop="handleDrop(index, $event)"
            class="token-card"
            :class="{ active: selectedTokenId === token.id }"
            @click="selectAccount(token)"
          >
            <template #title>
              <a-space class="token-name" align="center">
                <span
                  class="multi-game-token-checkbox"
                  @click.stop
                  @mousedown.stop
                  @dragstart.stop.prevent
                >
                  <n-checkbox
                    :checked="multiGameSelectedTokenIds.has(token.id)"
                    :disabled="isOpeningMultiGame"
                    :aria-label="`选择 ${token.name} 批量进入游戏`"
                    @click.stop
                    @update:checked="
                      (checked) => setMultiGameTokenSelected(token.id, checked)
                    "
                  />
                </span>
                <n-avatar
                  v-if="token.avatar"
                  :src="token.avatar"
                  round
                  size="small"
                  fallback-src="/icons/xiaoyugan.png"
                />
                <button
                  type="button"
                  class="account-name-button"
                  :title="token.name"
                  :aria-pressed="selectedTokenId === token.id"
                  @click.stop="selectAccount(token)"
                >{{ token.name }}</button>
                <a-tag
                  :color="getServerTagColor(token.id)"
                  v-if="token.server"
                  >{{ token.server }}</a-tag
                >
                <!-- 连接状态指示器 -->
                <a-badge
                  :status="getTokenStyle(token.id)"
                  :text="getConnectionStatusText(token.id)"
                  :title="tokenStore.getWebSocketError(token.id)"
                />
                <!-- 连接状态文字 -->
                <!-- <a-tag color="green">
                  {{ getConnectionStatusText(token.id) }}
                </a-tag> -->
              </a-space>
            </template>
            <template #extra>
              <n-dropdown
                :options="getTokenActions(token)"
                @select="(key) => handleTokenAction(key, token)"
              >
                <n-button text :aria-label="`更多操作：${token.name}`" @click.stop>
                  <template #icon>
                    <NIcon>
                      <EllipsisHorizontal />
                    </NIcon>
                  </template>
                </n-button>
              </n-dropdown>
            </template>

            <template #default>
              <div class="token-display">
                <span class="token-label">Token:</span>
                <code class="token-value">{{ maskToken(token.token) }}</code>
              </div>

              <!-- 备注信息 -->
              <div
                v-if="editingRemark === token.id"
                class="token-remark token-remark-edit"
                @click.stop
              >
                <span class="remark-label">备注：</span>
                <n-input
                  v-model:value="tempRemarks[token.id]"
                  type="textarea"
                  :rows="2"
                  placeholder="添加备注信息..."
                  @blur="saveRemark(token)"
                  @keyup.enter="saveRemark(token)"
                  @keyup.esc="cancelEditRemark()"
                  autofocus
                />
              </div>
              <div
                v-else
                class="token-remark"
                @click.stop="startEditRemark(token)"
              >
                <span class="remark-label">备注：</span>
                <span class="remark-value">{{
                  token.remark || "点击添加备注"
                }}</span>
                <NIcon style="margin-left: 4px; color: var(--text-tertiary)">
                  <Create />
                </NIcon>
              </div>

              <a-button
                :loading="refreshingTokens.has(token.id)"
                @click.stop="refreshToken(token)"
              >
                <template #icon>
                  <NIcon>
                    <Refresh />
                  </NIcon>
                </template>
                {{ token.sourceUrl ? "刷新" : "重新获取" }}
              </a-button>

              <div class="token-timestamps">
                <div class="timestamp-item">
                  <span class="timestamp-label">创建：</span>
                  <span class="timestamp-value">{{
                    formatTime(token.createdAt)
                  }}</span>
                </div>
                <div class="timestamp-item">
                  <span class="timestamp-label">使用：</span>
                  <span class="timestamp-value">{{
                    formatTime(token.lastUsed)
                  }}</span>
                </div>
              </div>

              <!-- 存储类型信息 -->
              <div class="storage-info">
                <div class="storage-item">
                  <span class="storage-label">存储类型：</span>
                  <n-tag
                    size="small"
                    :type="
                      isPermanentToken(token)
                        ? 'success'
                        : 'warning'
                    "
                  >
                    {{
                      isPermanentToken(token)
                        ? "长期有效"
                        : "临时存储"
                    }}
                  </n-tag>
                </div>

                <!-- 升级选项（仅对临时存储的token显示） -->
                <div
                  v-if="
                    !isPermanentToken(token)
                  "
                  class="storage-upgrade"
                >
                  <n-button
                    size="tiny"
                    type="success"
                    ghost
                    @click.stop="upgradeTokenToPermanent(token)"
                  >
                    <template #icon>
                      <NIcon>
                        <Star />
                      </NIcon>
                    </template>
                    升级为长期有效
                  </n-button>
                </div>
              </div>
            </template>
            <template #actions>
              <div class="account-card-actions">
                <n-button
                  :loading="isConnectionPending(token.id)"
                  :aria-label="`${getConnectionActionLabel(token.id)}：${token.name}`"
                  @click.stop="toggleAccountConnection(token)"
                >{{ getConnectionActionLabel(token.id) }}</n-button>
                <n-button type="primary" @click.stop="startTaskManagement(token)">
                  <template #icon><NIcon :component="Home" /></template>
                  进入控制台
                </n-button>
              </div>
            </template>
          </a-card>
        </div>

        <div v-else class="tokens-list">
          <n-card
            v-for="(token, index) in filteredTokens"
            :key="token.id"
            size="small"
            class="account-list-card"
            :class="{ active: selectedTokenId === token.id }"
            :draggable="!isMobile && !accountQuery"
            @dragstart="handleDragStart(index, $event)"
            @dragend="dragIndex = null"
            @dragover="handleDragOver"
            @drop="handleDrop(index, $event)"
            @click="selectAccount(token)"
          >
            <div class="account-list-row">
              <div class="account-list-info">
                <div class="account-list-check" @click.stop @mousedown.stop @dragstart.stop.prevent>
                  <n-checkbox
                    :checked="multiGameSelectedTokenIds.has(token.id)"
                    :disabled="isOpeningMultiGame"
                    :aria-label="`选择 ${token.name} 批量进入游戏`"
                    @update:checked="(checked) => setMultiGameTokenSelected(token.id, checked)"
                  />
                </div>
                <n-avatar
                  v-if="token.avatar"
                  :src="token.avatar"
                  round
                  size="small"
                  fallback-src="/icons/xiaoyugan.png"
                />
                <n-avatar v-else-if="isMobile" size="small" round aria-hidden="true" class="account-avatar-fallback">
                  {{ token.name?.trim().charAt(0) || "号" }}
                </n-avatar>
                <div class="account-list-identity">
                  <button
                    type="button"
                    class="account-name-button"
                    :title="token.name"
                    :aria-pressed="selectedTokenId === token.id"
                    @click.stop="selectAccount(token)"
                  >{{ token.name }}</button>
                  <div class="account-list-meta">
                    <span v-if="token.server" class="account-server" :title="String(token.server)">{{ token.server }}</span>
                    <span v-if="isMobile" class="account-connection-status" role="status">
                      <a-badge :status="getTokenStyle(token.id)" :text="getConnectionStatusText(token.id)" />
                    </span>
                    <a-badge v-else
                      :status="getTokenStyle(token.id)"
                      :text="getConnectionStatusText(token.id)"
                      :title="tokenStore.getWebSocketError(token.id)"
                    />
                    <span v-if="!isMobile" class="account-storage">{{ isPermanentToken(token) ? "长期" : "临时" }}</span>
                  </div>
                  <p v-if="isMobile && getLoginDisplay(token.id).error" class="account-connection-error" role="status">
                    {{ getLoginDisplay(token.id).error }}
                  </p>
                </div>
              </div>
              <div class="account-list-actions">
                <template v-if="isMobile">
                  <n-button
                    v-if="getLoginDisplay(token.id).canCancel"
                    class="compact-account-action"
                    size="small"
                    type="error"
                    quaternary
                    :aria-label="`取消连接：${token.name}`"
                    @click.stop="toggleAccountConnection(token)"
                  >
                    <template #icon><NIcon :component="CloseCircleOutline" aria-hidden="true" /></template>
                  </n-button>
                  <n-button
                    v-else
                    class="compact-account-action account-play"
                    size="small"
                    type="primary"
                    quaternary
                    :loading="openingGameTokenId === token.id"
                    :disabled="Boolean(openingGameTokenId && openingGameTokenId !== token.id) || isOpeningMultiGame"
                    :aria-label="`${nativeGame && singleGameSession?.accountId === token.id ? '继续游戏' : '进入游戏'}：${token.name}`"
                    @click.stop="openGame(token)"
                  >
                    <template #icon><NIcon :component="PlayOutline" aria-hidden="true" /></template>
                  </n-button>
                </template>
                <template v-else>
                  <n-button
                    size="small"
                    :loading="isConnectionPending(token.id)"
                    :aria-label="`${getConnectionActionLabel(token.id)}：${token.name}`"
                    @click.stop="toggleAccountConnection(token)"
                  >{{ getConnectionActionLabel(token.id) }}</n-button>
                  <n-button size="small" type="primary" @click.stop="startTaskManagement(token)">
                    控制台
                  </n-button>
                  <n-button size="small" :loading="refreshingTokens.has(token.id)" @click.stop="refreshToken(token)">刷新</n-button>
                </template>
                <n-dropdown trigger="click" :options="getTokenActions(token)" @select="(key) => handleTokenAction(key, token)">
                  <n-button size="small" :quaternary="isMobile" :class="{ 'compact-account-action': isMobile }" :aria-label="`更多操作：${token.name}`" @click.stop>
                    <template #icon><NIcon :component="EllipsisHorizontal" /></template>
                  </n-button>
                </n-dropdown>
              </div>
            </div>
            <div v-if="editingRemark === token.id" class="account-list-remark" @click.stop>
              <n-input
                v-model:value="tempRemarks[token.id]"
                size="small"
                placeholder="添加备注..."
                aria-label="账号备注"
                @blur="saveCurrentRemark"
                @keyup.enter="saveCurrentRemark"
                @keyup.esc="cancelEditRemark"
                autofocus
              />
            </div>
            <button
              v-else-if="token.remark"
              type="button"
              class="account-list-remark"
              :title="token.remark"
              @click.stop="startEditRemark(token)"
            >{{ token.remark }}</button>
          </n-card>
        </div>
      </div>

      <!-- 空状态 -->
      <a-empty v-if="!tokenStore.hasTokens && !showImportForm">
        <template #image>
          <i class="mdi:bed-empty"></i>
        </template>
        还没有导入任何Token
        <a-button type="link" @click="openshowImportForm"
          >打开Token管理</a-button
        >
      </a-empty>
    </div>

    <!-- 编辑Token模态框 -->
    <n-modal
      v-model:show="showEditModal"
      preset="card"
      title="编辑Token"
      style="width: 500px"
    >
      <n-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-placement="left"
        label-width="80px"
      >
        <n-form-item label="名称" path="name">
          <n-input v-model:value="editForm.name" />
        </n-form-item>
        <n-form-item label="Token字符串" path="token">
          <n-input
            v-model:value="editForm.token"
            type="textarea"
            :rows="3"
            placeholder="粘贴Token字符串..."
            clearable
          />
        </n-form-item>
        <n-form-item label="服务器">
          <n-input v-model:value="editForm.server" />
        </n-form-item>
        <n-form-item label="WebSocket地址">
          <n-input v-model:value="editForm.wsUrl" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input
            v-model:value="editForm.remark"
            type="textarea"
            :rows="2"
            placeholder="添加备注信息..."
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <div class="modal-actions">
          <n-button @click="showEditModal = false"> 取消 </n-button>
          <n-button type="primary" @click="saveEdit"> 保存 </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import ManualTokenForm from "./ManualTokenForm.vue";
import UrlTokenForm from "./UrlTokenForm.vue";
import BinTokenForm from "./BinTokenForm.vue";
import SingleBinTokenForm from "./SingleBinTokenForm.vue";
import WxQrcodeForm from "./WxQrcodeForm.vue";
import MobileTokenForm from "./MobileTokenForm.vue";

import { useTokenStore, selectedTokenId } from "@/stores/tokenStore";
import {
  Add,
  CloseCircleOutline,
  CloudUpload,
  Copy,
  Create,
  Download,
  DownloadOutline,
  EllipsisHorizontal,
  GameController,
  Home,
  List,
  Menu,
  PlayOutline,
  Refresh,
  Rocket,
  SearchOutline,
  Star,
  SyncCircle,
  TrashBin,
} from "@vicons/ionicons5";
import lz4 from "lz4js";
import { NIcon, NAlert, useDialog, useMessage } from "naive-ui";
import { g_utils } from "@/utils/bonProtocol";
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { transformToken, scheduleAuthUserRequest } from "@/utils/token";
import {
  generateBinFromCombUser,
  refreshTokenFromCombUser,
  roleIndexFromServerId,
} from "@/utils/wechatForceLogout";
import {
  buildRoleBin,
  downloadBinFile,
  getBinPayload,
  getRoleBinFileName,
} from "@/utils/binFile";
import { $emit } from "@/stores/events/index.ts";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useMobile } from "@/composables/useMobile";
import { closeSingleGame, openSingleGame, resumeSingleGame, singleGameSession } from "@/composables/useSingleGameSession";
import { restoreFullBackup, validateBackup } from "@/utils/fullBackup";
import { isGameAccountReserved } from "@/utils/gameAccountLease";
import { prepareMultiGameLaunch, prepareSingleGameLaunch } from "@/utils/gameLauncher";
import {
  pruneTokenSelection,
  selectAllTokenIds,
  toggleTokenSelection,
} from "@/utils/gameSelection";
import { isNativeGameApp } from "@/utils/runtimePlatform";
import { getTokenLoginDisplay } from "@/utils/tokenLoginDisplay";
const { getArrayBuffer, storeArrayBuffer, deleteArrayBuffer, clearAll } =
  useIndexedDB();
// 接收路由参数
const props = defineProps({
  token: String,
  name: String,
  server: String,
  wsUrl: String,
  api: String,
  auto: Boolean,
});

const router = useRouter();
const route = useRoute();
const message = useMessage();
const dialog = useDialog();
const tokenStore = useTokenStore();
const nativeGame = isNativeGameApp();
const { isMobile: isNarrow } = useMobile();
const isMobile = computed(() => isNarrow.value || route.name === "MobileTokens");

// 限流等待状态
const rateLimitWaiting = ref(false);
const rateLimitMessage = ref("");

// 响应式数据
const showImportForm = ref(false);
const isImporting = ref(false);
const showEditModal = ref(false);
const importFormRef = ref(null);
const urlFormRef = ref(null);
const editFormRef = ref(null);
const editingToken = ref(null);
const importMethod = ref("manual");
const refreshingTokens = ref(new Set());
const accountSearch = ref("");
const accountQuery = computed(() => accountSearch.value.trim().toLowerCase());
// 从localStorage读取上次的视图模式，默认为列表视图
const viewMode = ref(localStorage.getItem("tokenViewMode") || "list");
const dragIndex = ref(null);
const multiGameSelectedTokenIds = ref(new Set());
const isOpeningMultiGame = ref(false);
const openingGameTokenId = ref(null);

// 导入方式选项 - 用于移动端下拉选择
const importMethodOptions = [
  { label: "手动输入", value: "manual" },
  { label: "URL获取", value: "url" },
  { label: "微信扫码", value: "wxQrcode" },
  { label: "手机号验证码", value: "mobile" },
  { label: "多角色BIN", value: "bin" },
  { label: "单角色BIN", value: "singlebin" },
];

// 两种布局共用的排序选项
const sortOptions = [
  { label: "名称", value: "name" },
  { label: "服务器", value: "server" },
  { label: "创建", value: "createdAt" },
  { label: "使用", value: "lastUsed" },
];

// 备注编辑状态管理
const editingRemark = ref(null); // 当前正在编辑备注的tokenId
const tempRemarks = ref({}); // 临时保存编辑中的备注内容

// 监听视图模式变化，保存到localStorage
watch(viewMode, (newViewMode) => {
  localStorage.setItem("tokenViewMode", newViewMode);
});

// 排序状态管理 - 从localStorage读取上次的排序设置
const savedSortConfig = localStorage.getItem("tokenSortConfig");
const sortConfig = ref(
  savedSortConfig
    ? JSON.parse(savedSortConfig)
    : {
        field: "createdAt", // 排序字段：name, server, createdAt, lastUsed
        direction: "asc", // 排序方向：asc, desc
      },
);

// 排序后的游戏角色Token列表
const sortedTokens = computed(() => {
  if (sortConfig.value.field === "manual") {
    return tokenStore.gameTokens;
  }

  return [...tokenStore.gameTokens].sort((tokenA, tokenB) => {
    let valueA, valueB;

    // 根据排序字段获取比较值
    switch (sortConfig.value.field) {
      case "name":
        valueA = tokenA.name?.toLowerCase() || "";
        valueB = tokenB.name?.toLowerCase() || "";
        break;
      case "server":
        valueA = tokenA.server?.toLowerCase() || "";
        valueB = tokenB.server?.toLowerCase() || "";
        break;
      case "createdAt":
        valueA = new Date(tokenA.createdAt || 0).getTime();
        valueB = new Date(tokenB.createdAt || 0).getTime();
        break;
      case "lastUsed":
        valueA = new Date(tokenA.lastUsed || 0).getTime();
        valueB = new Date(tokenB.lastUsed || 0).getTime();
        break;
      default:
        valueA = tokenA.name?.toLowerCase() || "";
        valueB = tokenB.name?.toLowerCase() || "";
    }

    // 根据排序方向比较值
    if (valueA < valueB) {
      return sortConfig.value.direction === "asc" ? -1 : 1;
    }
    if (valueA > valueB) {
      return sortConfig.value.direction === "asc" ? 1 : -1;
    }
    return 0;
  });
});

const filteredTokens = computed(() => {
  const query = accountQuery.value;
  if (!query) return sortedTokens.value;

  return sortedTokens.value.filter((token) =>
    [token.name, token.server, token.serverId].some((value) =>
      String(value ?? "").toLowerCase().includes(query),
    ),
  );
});

const selectedMultiGameTokens = computed(() =>
  sortedTokens.value.filter((token) =>
    multiGameSelectedTokenIds.value.has(token.id),
  ),
);
const allMultiGameTokensSelected = computed(
  () =>
    sortedTokens.value.length > 0 &&
    selectedMultiGameTokens.value.length === sortedTokens.value.length,
);

function setMultiGameTokenSelected(tokenId, checked) {
  multiGameSelectedTokenIds.value = toggleTokenSelection(
    multiGameSelectedTokenIds.value,
    tokenId,
    checked,
  );
}

function selectAllMultiGameTokens() {
  multiGameSelectedTokenIds.value = selectAllTokenIds(sortedTokens.value);
}

function clearMultiGameTokenSelection() {
  multiGameSelectedTokenIds.value = new Set();
}

watch(
  () => tokenStore.gameTokens.map((token) => token.id),
  () => {
    multiGameSelectedTokenIds.value = pruneTokenSelection(
      multiGameSelectedTokenIds.value,
      tokenStore.gameTokens,
    );
  },
);

// 切换排序
const toggleSort = (field) => {
  if (sortConfig.value.field === field) {
    // 如果点击的是当前排序字段，则切换排序方向
    sortConfig.value.direction =
      sortConfig.value.direction === "asc" ? "desc" : "asc";
  } else {
    // 如果点击的是新的排序字段，则默认升序
    sortConfig.value.field = field;
    sortConfig.value.direction = "asc";
  }

  // 保存排序设置到localStorage
  localStorage.setItem("tokenSortConfig", JSON.stringify(sortConfig.value));
};

// 获取排序图标
const getSortIcon = (field) => {
  if (sortConfig.value.field !== field) return null;
  return sortConfig.value.direction === "asc" ? "↑" : "↓";
};

const handleDragStart = (index, event) => {
  if (isMobile.value || accountQuery.value) return;
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = "move";
  // 可以在这里设置拖拽时的预览图等
};

const handleDragOver = (event) => {
  if (dragIndex.value === null || accountQuery.value) return;
  event.preventDefault(); // 允许放置
  event.dataTransfer.dropEffect = "move";
};

const handleDrop = (index, event) => {
  event.preventDefault();
  if (accountQuery.value || dragIndex.value === null || dragIndex.value === index) return;

  // 使用当前显示的列表（sortedTokens）来进行重新排序
  // 这样可以确保用户看到的顺序就是最终保存的顺序
  const currentTokens = [...sortedTokens.value];
  const draggedItem = currentTokens[dragIndex.value];

  // 移动元素
  currentTokens.splice(dragIndex.value, 1);
  currentTokens.splice(index, 0, draggedItem);

  // 更新 store
  tokenStore.gameTokens = currentTokens;

  // 切换到手动排序模式，防止自动排序打乱顺序
  sortConfig.value.field = "manual";
  // 保存排序设置
  localStorage.setItem("tokenSortConfig", JSON.stringify(sortConfig.value));

  dragIndex.value = null;
  message.success("Token 顺序已更新");
};

// 编辑表单
const editForm = reactive({
  name: "",
  token: "",
  server: "",
  wsUrl: "",
  remark: "",
});

const editRules = {
  name: [{ required: true, message: "请输入Token名称", trigger: "blur" }],
  token: [{ required: true, message: "请输入Token字符串", trigger: "blur" }],
};

const bulkOptions = [
  { label: "刷新所有Token", key: "refreshAll" },
  { label: "更新token信息", key: "updateInfo" },
  { label: "导出所有Token", key: "export" },
  { label: "导入Token文件", key: "import" },
  { label: "清理过期Token", key: "clean" },
  { label: "断开所有连接", key: "disconnect" },
  { label: "清除所有Token", key: "clear" },
];

const selectAllGamesOption = computed(() => ({
  label: "全选账号用于批量进入游戏",
  key: "selectAllForGame",
  disabled: allMultiGameTokensSelected.value || isOpeningMultiGame.value,
}));
const desktopBulkOptions = computed(() => [
  selectAllGamesOption.value,
  { type: "divider", key: "bulk-divider" },
  ...bulkOptions,
]);
const accountMenuOptions = computed(() => [
  {
    type: "group",
    label: "排序",
    key: "sort",
    children: sortOptions.map(({ label, value }) => ({
      label: [label, getSortIcon(value)].filter(Boolean).join(" "),
      key: `sort:${value}`,
    })),
  },
  { label: "打开游戏", key: "openGame" },
  { label: "主线推关", key: "pushingLevels" },
  selectAllGamesOption.value,
  { type: "group", label: "批量操作", key: "bulk", children: bulkOptions },
]);
const handleAccountMenuAction = (key) => {
  if (key.startsWith("sort:")) {
    toggleSort(key.slice(5));
    return;
  }
  switch (key) {
    case "selectAllForGame":
      selectAllMultiGameTokens();
      break;
    case "openGame":
      openGame();
      break;
    case "pushingLevels":
      goToPushingLevels();
      break;
    default:
      handleBulkAction(key);
  }
};

/**
 * 手动打开Token管理卡片
 */
const openshowImportForm = () => {
  showImportForm.value = true;
};

// 刷新Token
const refreshToken = async (token) => {
  if (isNativeGameApp() && token.importMethod === "bin") {
    if (!getLoginDisplay(token.id).pending) {
      void tokenStore.startTokenLogin(token.id, { force: true, refresh: true });
    }
    return;
  }

  refreshingTokens.value.add(token.id);

  try {
    if (token.importMethod === "url") {
      // 有源URL的token - 从URL重新获取（使用限流）
      const data = await scheduleAuthUserRequest(async () => {
        let response;

        const isLocalUrl =
          token.sourceUrl.startsWith(window.location.origin) ||
          token.sourceUrl.startsWith("/") ||
          token.sourceUrl.startsWith("http://localhost") ||
          token.sourceUrl.startsWith("http://127.0.0.1");

        if (isLocalUrl) {
          response = await fetch(token.sourceUrl);
        } else {
          try {
            response = await fetch(token.sourceUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              mode: "cors",
            });
          } catch (corsError) {
            throw new Error(
              `跨域请求被阻止。请确保目标服务器支持CORS。错误详情: ${corsError.message}`,
            );
          }
        }

        if (!response.ok) {
          throw new Error(
            `请求失败: ${response.status} ${response.statusText}`,
          );
        }

        const result = await response.json();

        if (!result.token) {
          throw new Error("返回数据中未找到token字段");
        }

        return result;
      });

      // 更新token信息
      tokenStore.updateToken(token.id, {
        token: data.token,
        server: data.server || token.server,
        lastRefreshed: Date.now(),
      });

      message.success("Token刷新成功");
    } else if (token.combUser) {
      // 有 combUser → 重新登录拿新 BIN，同时写回 IndexedDB 防止下次 combUser 失效
      const refreshed = await refreshTokenFromCombUser(token.combUser, {
        serverId: token.serverId,
        roleIndex: token.roleIndex,
        roleId: token.roleId,
      });
      tokenStore.updateToken(token.id, {
        token: refreshed.token,
        serverId: refreshed.role.serverId,
        roleId: refreshed.role.roleId,
        roleIndex: roleIndexFromServerId(refreshed.role.serverId),
        lastRefreshed: Date.now(),
      });
      // 关键修复：将 combUser 重新登录生成的新 BIN 持久化，
      // 这样即使日后 combUser 过期，也能靠 BIN 继续刷新
      await storeArrayBuffer(token.id, refreshed.bin);
      message.success("combUser Token刷新成功（BIN 已同步）");
    } else {
      // 凭证数据（userToken/BIN）就是登录凭证：本地存有即可向官方登录接口换新 token，
      // 不按导入方式限制（手动导入但之前存过 BIN 的账号同样可刷）
      let userToken = await getArrayBuffer(token.id);
      let usedOldKey = false;
      if (!userToken) {
        userToken = await getArrayBuffer(token.name);
        usedOldKey = true;
      }
      if (userToken) {
        const newToken = await transformToken(userToken);
        tokenStore.updateToken(token.id, {
          token: newToken,
          lastRefreshed: Date.now(),
        });
        if (usedOldKey) {
          await storeArrayBuffer(token.id, userToken);
          await deleteArrayBuffer(token.name);
          console.log("已迁移IndexedDB数据:", token.name, "->", token.id);
        }
        message.success("Token刷新成功");
      } else {
        // 本地没有任何登录凭证数据，无法自动刷新
        const methodText = {
          manual: "手动输入",
          url: "URL 获取",
          wxQrcode: "微信扫码",
          mobile: "手机号验证码",
          bin: "BIN 文件",
          singlebin: "单角色 BIN",
          wxForceLogout: "强制下线",
        }[token.importMethod] || token.importMethod || "未知方式";
        dialog.info({
          title: "重新获取Token",
          content: `Token "${token.name}"（${methodText}导入）本地没有可用的登录凭证数据（userToken），无法自动刷新。

请选择以下操作：
1. 重新手动导入新的Token
2. 尝试重新连接现有Token`,
          positiveText: "重新导入",
          negativeText: "重新连接",
        onPositiveClick: () => {
          showImportForm.value = true;
          importMethod.value = "manual";
          importForm.name = token.name;
          importForm.server = token.server;
          importForm.wsUrl = token.wsUrl;
        },
        onNegativeClick: () => {
          // 断开现有连接
          if (tokenStore.getWebSocketStatus(token.id) === "connected") {
            tokenStore.closeWebSocketConnection(token.id);
          }

          // 尝试重新连接
          setTimeout(() => {
            tokenStore.createWebSocketConnection(
              token.id,
              token.token,
              token.wsUrl,
            );
            message.info("正在尝试重新连接...");
          }, 500);
        },
      });
      return;
    }
  }

    // 如果当前token有连接，需要重新连接
    if (tokenStore.getWebSocketStatus(token.id) === "connected") {
      tokenStore.closeWebSocketConnection(token.id);
      setTimeout(() => {
        tokenStore.createWebSocketConnection(
          token.id,
          token.token,
          token.wsUrl,
        );
      }, 500);
    }
  } catch (error) {
    console.error("刷新Token失败:", error);
    message.error(error.message || "Token刷新失败");
  } finally {
    refreshingTokens.value.delete(token.id);
    // 关闭限流等待提示
    rateLimitWaiting.value = false;
  }
};

// 升级Token为长期有效
const upgradeTokenToPermanent = (token) => {
  dialog.warning({
    title: "升级为长期有效",
    content: `确认要将Token "${token.name}" 升级为长期有效吗？升级后该Token将不会因24小时未使用而被自动清理。`,
    positiveText: "确认升级",
    negativeText: "取消",
    onPositiveClick: () => {
      const success = tokenStore.upgradeTokenToPermanent(token.id);
      if (success) {
        message.success(`Token "${token.name}" 已升级为长期有效！`);
      } else {
        message.error("升级失败，该Token可能已经是长期有效状态");
      }
    },
  });
};

const pendingTokenLogins = reactive(new Map());
watch(
  () => [...pendingTokenLogins.keys()].map((id) => ({
    id,
    login: getLoginDisplay(id),
    error: tokenStore.wsConnections[id]?.lastError,
  })),
  (connections) => {
    for (const { id, login, error } of connections) {
      const attempt = pendingTokenLogins.get(id);
      if (!attempt) continue;
      if (login.status === "connected") {
        message.success(`已连接 ${attempt.name}`);
        pendingTokenLogins.delete(id);
      } else if (login.status === "error" && (login.error || (error && error !== attempt.previousError))) {
        message.error(`${attempt.name}：${login.error || "连接失败，请重试"}`);
        pendingTokenLogins.delete(id);
      } else if (login.status === "cancelled") {
        pendingTokenLogins.delete(id);
      }
    }
  },
);

const selectAccount = (token) => {
  if (editingRemark.value) saveCurrentRemark();
  tokenStore.selectTokenOnly(token.id);
};

function getLoginDisplay(tokenId) {
  return getTokenLoginDisplay(tokenStore.getTokenLoginState(tokenId), getConnectionStatus(tokenId));
}

const isConnectionPending = (tokenId) => getLoginDisplay(tokenId).pending;

const getConnectionActionLabel = (tokenId) => {
  const login = getLoginDisplay(tokenId);
  const status = getConnectionStatus(tokenId);
  if (isMobile.value && login.canCancel) return "取消连接";
  if (isMobile.value && login.canRetry) return "重试连接";
  if (status === "disconnecting") return "正在断开";
  if (login.pending) return "正在连接";
  return status === "connected" ? "断开连接" : "连接账号";
};

const toggleAccountConnection = (token) => {
  if (nativeGame && isGameAccountReserved(token.id)) return promptGameBeforeConsole(token, () => toggleAccountConnection(token));
  const login = getLoginDisplay(token.id);
  if (isMobile.value && login.canCancel) {
    tokenStore.cancelTokenLogin(token.id);
    return;
  }
  if (login.pending) return;

  const connected = isMobile.value ? login.status === "connected" : getConnectionStatus(token.id) === "connected";
  if (connected) {
    tokenStore.closeWebSocketConnection(token.id);
    return;
  }

  const previousError = tokenStore.wsConnections[token.id]?.lastError;
  const selected = isMobile.value && login.canRetry
    ? tokenStore.selectToken(token.id, true)
    : tokenStore.selectToken(token.id);
  if (selected) {
    if (!isMobile.value) {
      pendingTokenLogins.set(token.id, { name: token.name, previousError });
      message.info(`正在连接 ${token.name}…`);
    }
  } else {
    message.error(`未找到账号：${token.name}`);
  }
};

const getConnectionStatus = (tokenId) => {
  return tokenStore.getWebSocketStatus(tokenId);
};

// 统计概览：在线 / 离线
const onlineCount = computed(
  () =>
    tokenStore.gameTokens.filter(
      (t) => getConnectionStatus(t.id) === "connected",
    ).length,
);
const offlineCount = computed(
  () => tokenStore.gameTokens.length - onlineCount.value,
);

const getConnectionStatusText = (tokenId) => {
  if (isMobile.value) return getLoginDisplay(tokenId).label;
  const status = getConnectionStatus(tokenId);
  const statusMap = {
    connected: "已连接",
    connecting: "连接中...",
    disconnected: "未连接",
    error: "连接错误",
    disconnecting: "断开中...",
  };
  return statusMap[status] || "未连接";
};

const getTokenStyle = (tokenId) => {
  const status = isMobile.value ? getLoginDisplay(tokenId).status : getConnectionStatus(tokenId);
  const statusMap = {
    connected: "success",
    connecting: "warning",
    verifying: "warning",
    refreshing: "warning",
    disconnected: "normal",
    error: "danger",
    disconnecting: "warning",
  };
  return statusMap[status] || "normal";
};

const getServerTagColor = (tokenId) => {
  const status = getConnectionStatus(tokenId);
  // 连接成功时服务器标签使用绿色，其他状态保持红色
  return status === "connected" ? "green" : "red";
};

const permanentImportMethods = new Set(["url", "bin", "wxQrcode", "mobile", "wxForceLogout"]);
const isPermanentToken = (token) =>
  permanentImportMethods.has(token.importMethod) || !!token.upgradedToPermanent;

const getTokenActions = (token) => {
  const actions = [
    {
      label: "编辑",
      key: "edit",
      icon: () => h(NIcon, null, { default: () => h(Create) }),
    },
    {
      label: "复制Token",
      key: "copy",
      icon: () => h(NIcon, null, { default: () => h(Copy) }),
    },
    {
      label: "下载 BIN",
      key: "download-bin",
      icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }),
    },
  ];

  if (isMobile.value) {
    const login = getLoginDisplay(token.id);
    actions.unshift({ label: "进入控制台", key: "console" }, { type: "divider" });
    if (!login.canCancel) {
      actions.unshift({ label: getConnectionActionLabel(token.id), key: "connection", disabled: login.pending });
    }
  }

  actions.push({ label: "编辑备注", key: "remark" });
  if (!isPermanentToken(token)) {
    actions.push({ label: "升级为长期有效", key: "upgrade" });
  }

  // 根据Token类型添加刷新选项
  if (token.importMethod === "url" && token.sourceUrl) {
    actions.push({
      label: "从URL刷新",
      key: "refresh-url",
      icon: () => h(NIcon, null, { default: () => h(SyncCircle) }),
    });
  } else {
    actions.push({
      label: "重新获取",
      key: "refresh",
      icon: () => h(NIcon, null, { default: () => h(Refresh) }),
    });
  }

  actions.push(
    {
      label: "导出BIN",
      key: "export-bin",
      icon: () => h(NIcon, null, { default: () => h(Download) }),
    },
    { type: "divider" },
    {
      label: "删除",
      key: "delete",
      icon: () => h(NIcon, null, { default: () => h(TrashBin) }),
      props: { style: { color: "#e74c3c" } },
    },
  );

  return actions;
};

const handleTokenAction = async (key, token) => {
  switch (key) {
    case "connection":
      toggleAccountConnection(token);
      break;
    case "console":
      startTaskManagement(token);
      break;
    case "edit":
      editToken(token);
      break;
    case "remark":
      startEditRemark(token);
      break;
    case "upgrade":
      upgradeTokenToPermanent(token);
      break;
    case "copy":
      copyToken(token);
      break;
    case "download-bin":
      downloadTokenBin(token);
      break;
    case "refresh":
      // 重新获取Token
      refreshToken(token);
      break;
    case "refresh-url":
      // URL获取的Token刷新
      refreshToken(token);
      break;
    case "export-bin":
      // 导出Token的BIN数据
      exportTokenBin(token);
      break;
    case "delete":
      deleteToken(token);
      break;
  }
};

const editToken = async (token) => {
  editingToken.value = token;
  // 有 BIN 数据的 Token：编辑框直接展示增强JSON（含bin），
  // 所见即所得；保存时检测 bin 字段同步覆盖 IndexedDB（幂等）
  const enhanced = await buildEnhancedTokenText(token);
  Object.assign(editForm, {
    name: token.name,
    token: enhanced || token.token,
    server: token.server || "",
    wsUrl: token.wsUrl || "",
    remark: token.remark || "",
  });
  showEditModal.value = true;
};

const saveEdit = async () => {
  if (!editFormRef.value || !editingToken.value) return;

  try {
    await editFormRef.value.validate();

    let tokenStr = editForm.token;
    let binUpdated = false;
    // 增强JSON（含bin字段）：解码并覆盖该Token的IndexedDB BIN数据，
    // token字段存剔除bin后的JSON，避免冗余base64
    try {
      const parsed = JSON.parse(tokenStr);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.bin === "string" &&
        parsed.bin
      ) {
        const binary = atob(parsed.bin);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        await storeArrayBuffer(editingToken.value.id, bytes.buffer);
        const { bin: _ignored, ...rest } = parsed;
        tokenStr = JSON.stringify(rest);
        binUpdated = true;
      }
    } catch (e) {
      // 非JSON，按原文保存
    }

    tokenStore.updateToken(editingToken.value.id, {
      name: editForm.name,
      token: tokenStr,
      server: editForm.server,
      wsUrl: editForm.wsUrl,
      remark: editForm.remark,
    });

    message.success(
      binUpdated ? "Token信息已更新（BIN数据已同步覆盖）" : "Token信息已更新",
    );
    showEditModal.value = false;
    editingToken.value = null;
  } catch (error) {
    // 验证失败
  }
};

// 拼装增强 Token JSON（含 bin base64，lx/pl 标准格式）；无 BIN 数据时返回 null
const buildEnhancedTokenText = async (token) => {
  try {
    const binData = await getArrayBuffer(token.id);
    if (!binData) return null;
    const lxBytes = convertBinToLx(binData);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < lxBytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        lxBytes.subarray(i, i + chunk),
      );
    }
    let payload;
    try {
      payload = JSON.parse(token.token);
    } catch (e) {
      payload = null;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      payload = { token: token.token };
    }
    payload.name = token.name;
    payload.server = token.server;
    payload.bin = btoa(binary);
    return JSON.stringify(payload);
  } catch (e) {
    return null;
  }
};

const copyToken = async (token) => {
  try {
    // 有 BIN 数据时复制增强 JSON（含 bin base64），
    // 导入该 JSON 会自动恢复 BIN 数据，可直接打开游戏/导出BIN。
    const enhanced = await buildEnhancedTokenText(token);
    if (enhanced) {
      await navigator.clipboard.writeText(enhanced);
      message.success("Token已复制（含BIN数据，导入后可直接打开游戏/导出BIN）");
    } else {
      await navigator.clipboard.writeText(token.token);
      message.info("Token已复制到剪贴板（该Token无BIN数据）");
    }
  } catch (error) {
    message.error("复制失败");
  }
};

const downloadTokenBin = async (token) => {
  try {
    let sourceBin;
    if (token.combUser) {
      sourceBin = generateBinFromCombUser(token.combUser, token.serverId);
    } else {
      sourceBin = await getArrayBuffer(token.id);
      if (!sourceBin) sourceBin = await getArrayBuffer(token.name);
      if (!sourceBin) {
        throw new Error("该账号未保存 BIN 登录凭据，无法下载");
      }
    }

    const payload = getBinPayload(sourceBin);
    const serverId = token.serverId ?? payload.serverId;
    if (serverId === undefined || serverId === null || serverId === "") {
      throw new Error("BIN 登录凭据缺少区服信息");
    }

    const bin = buildRoleBin(payload, serverId);
    const fileName = getRoleBinFileName({
      serverId,
      roleId: token.roleId ?? token.id,
      name: token.name,
    });
    downloadBinFile(fileName, bin);
    message.success(`已开始下载: ${fileName}`);
  } catch (error) {
    console.error("下载 BIN 失败:", error);
    message.error(error.message || "下载 BIN 失败");
  }
};

// 快速编辑备注功能
const startEditRemark = (token) => {
  editingRemark.value = token.id;
  tempRemarks.value[token.id] = token.remark || "";
};

// 保存备注的通用函数
const saveCurrentRemark = () => {
  if (!editingRemark.value) return;

  const editingTokenId = editingRemark.value;
  const remark = tempRemarks.value[editingTokenId] || "";
  tokenStore.updateToken(editingTokenId, {
    remark: remark,
  });
  editingRemark.value = null;
  message.success("备注已保存");
};

const saveRemark = (token) => {
  saveCurrentRemark();
};

const cancelEditRemark = () => {
  editingRemark.value = null;
};

const deleteToken = (token) => {
  dialog.warning({
    title: "删除Token",
    content: `确定要删除Token "${token.name}" 吗？此操作无法恢复。`,
    positiveText: "确定删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      await tokenStore.removeToken(token.id);
      message.success("Token已删除");
    },
  });
};

// 导出Token的BIN数据为.bin文件（可与游戏上号器的"导入BIN文件"配合使用）
const exportTokenBin = async (token) => {
  try {
    // 从 IndexedDB 读取原始 BIN 数据（打开游戏登录用的就是这份数据）
    const binData = await getArrayBuffer(token.id);
    if (!binData) {
      message.error(
        `Token "${token.name}" 没有BIN数据（仅BIN文件/扫码导入的Token支持导出）`,
      );
      return;
    }

    // 统一转换为标准 lx (pl) 格式（LZ4+XOR，与抓包bin文件一致）
    // IndexedDB 中可能是 px 格式（bin/扫码导入时经 g_utils.encode 的 x 加密重编码），
    // 游戏上号器与游戏模块的 lz4XorDecode 只认 pl 格式，"打开游戏"登录前也做了同样转换
    const exportData = convertBinToLx(binData);

    // 尝试解析BIN中的serverId，构造标准文件名: bin-{server}服-{name}.bin
    let fileName = `${token.name}.bin`;
    try {
      const binMsg = g_utils.parse(exportData);
      let binContent = binMsg.getData();
      if (!binContent && binMsg._raw) {
        binContent = binMsg._raw;
      }
      if (binContent && binContent.serverId) {
        let sid = Number(binContent.serverId);
        if (sid >= 2000000) {
          sid -= 2000000;
        } else if (sid >= 1000000) {
          sid -= 1000000;
        }
        const serverNum = sid - 27;
        fileName = `bin-${serverNum}服-${token.name}.bin`;
      }
    } catch (e) {
      // 解析失败则使用默认文件名
    }

    downloadBinFile(fileName, exportData);
    message.success(`已开始下载: ${fileName}`);
  } catch (error) {
    console.error("导出BIN失败:", error);
    message.error("导出BIN失败: " + (error.message || error));
  }
};

// 批量刷新所有URLToken
const refreshAllTokens = async () => {
  if (!tokenStore.gameTokens.length) {
    message.warning("没有可刷新的Token");
    return;
  }

  const tokensToRefresh = tokenStore.gameTokens.filter(
    (token) =>
      token.importMethod === "url" ||
      token.importMethod === "wxQrcode" ||
      token.importMethod === "mobile" ||
      token.importMethod === "wxForceLogout" ||
      token.importMethod === "bin",
  );
  const manualTokens = tokenStore.gameTokens.filter(
    (token) => token.importMethod === "manual",
  );

  if (tokensToRefresh.length === 0) {
    message.warning("没有支持自动刷新的Token");
    return;
  }

  // 显示确认对话框
  dialog.warning({
    title: "批量刷新Token",
    content: "确定要刷新所有支持自动刷新的Token吗?",
    positiveText: "开始刷新",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        let successCount = 0;
        let failCount = 0;

        // 显示进度提示
        const loadingMessage = message.loading(
          `正在批量刷新Token (0/${tokensToRefresh.length})`,
          {
            duration: 0,
          },
        );

        for (let i = 0; i < tokensToRefresh.length; i++) {
          const token = tokensToRefresh[i];

          try {
            // 更新进度显示
            loadingMessage.content = `正在刷新Token (${i + 1}/${tokensToRefresh.length}): ${token.name}`;

            // 调用单个刷新函数（限流器会自动处理等待）
            await refreshToken(token);
            successCount++;
          } catch (error) {
            console.error(`刷新Token "${token.name}" 失败:`, error);
            failCount++;
          }
        }

        // 关闭进度提示
        loadingMessage.destroy();

        // 关闭限流等待提示
        rateLimitWaiting.value = false;

        // 显示结果
        if (failCount === 0) {
          message.success(`批量刷新完成！成功刷新 ${successCount} 个Token`);
        } else {
          message.warning(
            `批量刷新完成，成功 ${successCount} 个，失败 ${failCount} 个`,
          );
        }

        // 如果有手动导入的Token，提示用户
        if (manualTokens.length > 0) {
          message.info(`${manualTokens.length} 个手动导入的Token需要手动刷新`);
        }
      } catch (error) {
        message.error("批量刷新过程中发生错误: " + error.message);
      }
    },
  });
};

const handleBulkAction = (key) => {
  switch (key) {
    case "refreshAll":
      refreshAllTokens();
      break;
    case "updateInfo":
      updateAllTokenInfo();
      break;
    case "export":
      exportTokens();
      break;
    case "import":
      importTokenFile();
      break;
    case "clean":
      cleanExpiredTokens();
      break;
    case "disconnect":
      disconnectAll();
      break;
    case "clear":
      clearAllTokens();
      break;
  }
};

const exportTokens = () => {
  try {
    const data = tokenStore.exportTokens();
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `tokens_backup_${new Date().toISOString().split("T")[0]}.json`;
    link.click();

    message.success("Token数据已导出");
  } catch (error) {
    message.error("导出失败");
  }
};

const importTokenFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const result = tokenStore.importTokens(data);
          if (result.success) {
            message.success(result.message);
          } else {
            message.error(result.message);
          }
        } catch (error) {
          message.error("文件格式错误");
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
};

// Import a config file. Supports three formats, auto-detected:
//  1. Full backup  (from BackupRestore page / Profile "数据导出")
//  2. Batch-daily export  { version, tokens, scheduledTasks, ... }
//  3. Plain token export  { tokens: [...] }
const handleImportConfigFile = ({ file }) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (error) {
      message.error("配置文件解析失败，请确认文件未损坏");
      return;
    }

    // 1. Full backup file -> let the user pick a restore mode.
    if (!validateBackup(data)) {
      dialog.warning({
        title: "恢复配置",
        content:
          "检测到全量备份文件。覆盖模式会先清空当前浏览器的数据再写入备份；合并模式只补充本地不存在的条目。",
        positiveText: "覆盖",
        negativeText: "合并",
        onPositiveClick: () => runFullBackupRestore(data, "replace"),
        onNegativeClick: () => runFullBackupRestore(data, "merge"),
      });
      return;
    }

    // 2. Batch-daily "导出配置" format.
    if (
      data.version &&
      Array.isArray(data.tokens) &&
      Array.isArray(data.scheduledTasks)
    ) {
      importBatchConfig(data);
      return;
    }

    // 3. Plain token export format.
    if (Array.isArray(data.tokens)) {
      const result = tokenStore.importTokens(data);
      if (result.success) {
        message.success(result.message);
      } else {
        message.error(result.message);
      }
      return;
    }

    message.error("无法识别的配置文件格式");
  };
  reader.readAsText(file.file);
};

// Restore a full backup; reload afterwards so all stores re-read fresh data.
const runFullBackupRestore = async (data, mode) => {
  try {
    const result = await restoreFullBackup(data, mode);
    const idbSummary = Object.entries(result.indexedDB)
      .map(([name, count]) => `${name} ${count} 条`)
      .join("，");
    message.success(
      `恢复完成：localStorage ${result.localStorageKeys} 项${
        idbSummary ? `，IndexedDB ${idbSummary}` : ""
      }。页面将刷新以生效`,
    );
    window.setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    console.error("恢复失败:", error);
    message.error(`恢复失败：${error.message}`);
  }
};

// Import a batch-daily config export: tokens, scheduled tasks, batch settings
// and per-account daily settings. Existing entries are skipped (add-only).
const importBatchConfig = (data) => {
  try {
    let importedTokens = 0;
    let importedTasks = 0;

    data.tokens.forEach((token) => {
      const exists = tokenStore.gameTokens.some(
        (t) => t.token === token.token || t.id === token.id,
      );
      if (!exists && token.token) {
        tokenStore.gameTokens.push({
          id:
            token.id ||
            `token_${Date.now()}${Math.random().toString(36).slice(2)}`,
          name: token.name || "",
          token: token.token,
          server: token.server || "",
          wsUrl: token.wsUrl || null,
          remark: token.remark || "",
          importMethod: token.importMethod || "import",
          sourceUrl: token.sourceUrl || null,
          upgradedToPermanent: true,
          upgradedAt: token.upgradedAt || null,
          updatedAt: token.updatedAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
        });
        importedTokens++;
      }
    });

    // Scheduled tasks: append only the ones not present locally.
    const existingTasks = JSON.parse(
      localStorage.getItem("scheduledTasks") || "[]",
    );
    const existingTaskIds = new Set(existingTasks.map((t) => t.id));
    data.scheduledTasks.forEach((task) => {
      if (task.id && !existingTaskIds.has(task.id)) {
        existingTasks.push(task);
        importedTasks++;
      }
    });
    localStorage.setItem("scheduledTasks", JSON.stringify(existingTasks));

    // Batch settings and per-account daily settings (overwrite if present).
    if (data.batchSettings) {
      localStorage.setItem("batchSettings", JSON.stringify(data.batchSettings));
    }

    if (Array.isArray(data.tokenSettings)) {
      data.tokenSettings.forEach((item) => {
        if (item.tokenId && item.settings) {
          localStorage.setItem(
            `daily-settings:${item.tokenId}`,
            JSON.stringify(item.settings),
          );
        }
      });
    }

    message.success(
      `导入成功：${importedTokens} 个新账号，${importedTasks} 个新定时任务${
        data.tokenSettings?.length
          ? `，${data.tokenSettings.length} 份账号设置`
          : ""
      }`,
    );
  } catch (error) {
    console.error("导入配置失败:", error);
    message.error(`导入失败：${error.message}`);
  }
};

const cleanExpiredTokens = async () => {
  const count = await tokenStore.cleanExpiredTokens();
  message.success(`已清理 ${count} 个过期Token`);
};

const disconnectAll = () => {
  tokenStore.gameTokens.forEach((token) => {
    tokenStore.closeWebSocketConnection(token.id);
  });
  message.success("所有连接已断开");
};

const clearAllTokens = () => {
  dialog.error({
    title: "清除所有Token",
    content: "确定要清除所有Token吗？此操作无法恢复！",
    positiveText: "确定清除",
    negativeText: "取消",
    onPositiveClick: async () => {
      await tokenStore.clearAllTokens();
      message.success("所有Token已清除");
    },
  });
};

// 一键连接更新所有token信息
const updateAllTokenInfo = async () => {
  if (tokenStore.gameTokens.length === 0) {
    message.warning("没有可更新的Token");
    return;
  }

  dialog.warning({
    title: "更新所有Token信息",
    content:
      "此操作将逐个连接所有Token，获取最新的角色名称和服务器信息，完成后自动断开连接。\n\n预计耗时：约3-5秒/个Token",
    positiveText: "开始更新",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        let successCount = 0;
        let failCount = 0;
        const totalTokens = tokenStore.gameTokens.length;

        // 显示进度提示
        const loadingMessage = message.loading(
          `正在更新Token信息 (0/${totalTokens})`,
          {
            duration: 0,
          },
        );

        // 顺序处理每个token
        for (let i = 0; i < tokenStore.gameTokens.length; i++) {
          const token = tokenStore.gameTokens[i];

          // 更新进度显示
          loadingMessage.content = `正在更新Token信息 (${i + 1}/${totalTokens}): ${token.name}`;

          try {
            // 连接token获取角色信息
            await tokenStore.selectToken(token.id);

            // 等待1秒确保角色信息已获取（可根据实际情况调整）
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // 断开连接
            tokenStore.closeWebSocketConnection(token.id);

            successCount++;
            message.success(`Token "${token.name}" 信息更新成功`);
          } catch (error) {
            console.error(`更新Token "${token.name}" 失败:`, error);
            failCount++;
            message.error(`Token "${token.name}" 信息更新失败`);
          }

          // 添加短暂延迟，避免服务器压力过大
          if (i < tokenStore.gameTokens.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // 关闭进度提示
        loadingMessage.destroy();

        // 显示结果
        if (failCount === 0) {
          message.success(
            `所有Token信息更新完成！成功更新 ${successCount} 个Token`,
          );
        } else {
          message.warning(
            `Token信息更新完成，成功 ${successCount} 个，失败 ${failCount} 个`,
          );
        }
      } catch (error) {
        message.error("更新过程中发生错误: " + error.message);
      }
    },
  });
};

const maskToken = (token) => {
  if (!token) return "";
  const len = token.length;
  if (len <= 8) return token;
  return token.substring(0, 4) + "***" + token.substring(len - 4);
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString("zh-CN");
};

const goToDashboard = () => {
  router.push("/admin/batch-daily-tasks");
};

const goToPushingLevels = () => {
  router.push("/admin/PushingLevels");
};

// ============ BIN 格式转换（来自 convertBin.mjs） ============

function extractKey(bytes) {
  return (
    (((bytes[2] >> 6) & 1) << 7) |
    (((bytes[2] >> 4) & 1) << 6) |
    (((bytes[2] >> 2) & 1) << 5) |
    ((bytes[2] & 1) << 4) |
    (((bytes[3] >> 6) & 1) << 3) |
    (((bytes[3] >> 4) & 1) << 2) |
    (((bytes[3] >> 2) & 1) << 1) |
    (bytes[3] & 1)
  );
}

function encodeKey(bytes, r) {
  bytes[2] =
    (bytes[2] & 0b10101010) |
    (((r >> 7) & 1) << 6) |
    (((r >> 6) & 1) << 4) |
    (((r >> 5) & 1) << 2) |
    ((r >> 4) & 1);
  bytes[3] =
    (bytes[3] & 0b10101010) |
    (((r >> 3) & 1) << 6) |
    (((r >> 2) & 1) << 4) |
    (((r >> 1) & 1) << 2) |
    (r & 1);
}

function xDecrypt(buf) {
  const e = new Uint8Array(buf);
  const t = extractKey(e);
  const out = new Uint8Array(e);
  for (let n = out.length; --n >= 4; ) out[n] ^= t;
  return out.subarray(4);
}

function lxEncrypt(plain) {
  const compressed = lz4.compress(plain);
  const out = new Uint8Array(compressed.length);
  out.set(compressed);
  const r = 2 + ~~(Math.random() * 248);
  for (let n = Math.min(out.length, 100); --n >= 0; ) out[n] ^= r;
  out[0] = 112; // 'p'
  out[1] = 108; // 'l'
  encodeKey(out, r);
  return out;
}

function convertBinToLx(buf) {
  const e = new Uint8Array(buf);
  // 已经是 lx 格式
  if (e.length > 4 && e[0] === 112 && e[1] === 108) return e;
  // x 格式，转换为 lx
  if (e.length > 4 && e[0] === 112 && e[1] === 120) {
    const plain = xDecrypt(e);
    return lxEncrypt(plain);
  }
  // 其他格式原样返回
  return e;
}

async function openSelectedGames() {
  if (selectedMultiGameTokens.value.length === 0 || isOpeningMultiGame.value || openingGameTokenId.value) return;
  const retainedAccount = nativeGame ? singleGameSession.value?.accountId : undefined;
  const tokensToOpen = selectedMultiGameTokens.value.filter(token => token.id !== retainedAccount);
  if (!tokensToOpen.length) {
    message.warning('请先关闭该账号保留的游戏，再进入多开。');
    return;
  }
  if (tokensToOpen.length < selectedMultiGameTokens.value.length) message.warning('已跳过正在单开的账号。');
  isOpeningMultiGame.value = true;
  try {
    const { launch, failures } = await prepareMultiGameLaunch({
      tokens: tokensToOpen,
      getArrayBuffer,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    });

    if (launch.sessions.length === 0) {
      message.error("所选账号均准备失败，请检查 BIN 数据后重试");
      return;
    }
    if (failures.length > 0) {
      const failedNames = failures.map((failure) => failure.name).join("、");
      message.warning(`已跳过 ${failures.length} 个账号：${failedNames}`);
    }
    await router.push("/multi-game");
  } catch (error) {
    console.error("Batch game launch failed:", error);
    message.error("批量进入游戏失败，请重试");
  } finally {
    isOpeningMultiGame.value = false;
  }
}

const openGame = async (token = tokenStore.selectedToken) => {
  if (openingGameTokenId.value || isOpeningMultiGame.value) return;
  if (!token) {
    message.warning("请先选择一个Token");
    return;
  }
  if (nativeGame && singleGameSession.value?.accountId === token.id) return resumeSingleGame(router);
  openingGameTokenId.value = token.id;
  try {
    if (nativeGame) {
      const session = await openSingleGame(token, { confirmSwitch: confirmRetainedSwitch });
      if (session) await resumeSingleGame(router);
      return;
    }
    await prepareSingleGameLaunch({ token, getArrayBuffer, localStorage });
    if (isMobile.value) {
      await tokenStore.closeWebSocketConnection(token.id);
      tokenStore.selectTokenOnly(token.id);
      await router.push({ name: "GamePlayer", query: { bin_id: token.id } });
    } else {
      await router.push("/game");
    }
  } catch (error) {
    if (error?.message === "未找到该账号的 BIN 数据") {
      message.error(isMobile.value ? "未找到该账号的 BIN 数据，请先导入对应的 BIN 文件" : "未找到该Token的BIN数据");
    } else if (error?.message === '该账号已在其他游戏窗口打开') {
      message.warning(error.message);
    } else {
      message.error("打开游戏失败，请重试");
    }
  } finally {
    openingGameTokenId.value = null;
  }
};

function confirmRetainedSwitch(previous) {
  return new Promise((resolve) => {
    dialog.warning({
      title: '切换游戏账号', content: `切换会关闭「${previous.accountName}」的游戏窗口。`,
      positiveText: '关闭并切换', negativeText: '取消',
      onPositiveClick: () => resolve(true), onNegativeClick: () => resolve(false), onClose: () => resolve(false),
      onEsc: () => resolve(false), onMaskClick: () => resolve(false),
    });
  });
}

function confirmCloseRetained() {
  const retained = singleGameSession.value;
  if (!retained) return;
  dialog.warning({
    title: '关闭游戏', content: `关闭后将结束「${retained.accountName}」的游戏连接。`,
    positiveText: '关闭游戏', negativeText: '取消', onPositiveClick: () => closeSingleGame(retained.accountId),
  });
}

function promptGameBeforeConsole(token, connect) {
  if (singleGameSession.value?.accountId !== token.id) {
    message.warning('该账号已在其他游戏窗口打开，请先关闭游戏窗口。');
    return;
  }
  dialog.warning({
    title: '切换到控制台连接', content: '连接控制台前需要关闭该账号的游戏窗口。',
    positiveText: '关闭并连接', negativeText: '取消',
    async onPositiveClick() {
      await closeSingleGame(token.id);
      connect();
    },
  });
}

// 开始任务管理 - 直接跳转到控制台
const startTaskManagement = (token) => {
  if (nativeGame && isGameAccountReserved(token.id)) return promptGameBeforeConsole(token, () => startTaskManagement(token));
  // 选择token
  tokenStore.selectToken(token.id);
  // 直接跳转到控制台，不等待连接
  message.success(`正在进入 ${token.name} 的控制台`);
  router.push("/admin/dashboard");
};

// URL参数处理函数
const handleUrlParams = async () => {
  // 检查是否通过URL传递了token参数
  if (props.token || props.api) {
    try {
      isImporting.value = true;
      let tokenResult = null;

      if (props.api) {
        // 通过API获取token
        // 降噪
        message.info("正在从API获取token...");

        const response = await fetch(props.api, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(
            `API请求失败: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (!data.token) {
          throw new Error("API返回数据中未找到token字段");
        }

        // 使用API获取的token
        tokenResult = tokenStore.importBase64Token(
          props.name || data.name || "通过API导入的Token",
          data.token,
          {
            server: props.server || data.server,
            wsUrl: props.wsUrl,
            sourceUrl: props.api,
            importMethod: "url",
          },
        );
      } else if (props.token) {
        // 直接使用URL中的token
        // 降噪
        message.info("正在导入token...");

        tokenResult = tokenStore.importBase64Token(
          props.name || "通过URL导入的Token",
          props.token,
          {
            server: props.server,
            wsUrl: props.wsUrl,
            importMethod: "url",
          },
        );
      }

      if (tokenResult && tokenResult.success) {
        message.success(`Token "${tokenResult.tokenName}" 导入成功！`);

        // 如果auto=true，自动选择并跳转到控制台
        if (props.auto && tokenResult.token) {
          tokenStore.selectToken(tokenResult.token.id);
          message.success("正在跳转到控制台...");
          setTimeout(() => {
            router.push("/admin/dashboard");
          }, 1500);
        } else {
          // 清除URL参数，避免重复处理
          router.replace("/tokens");
        }
      } else {
        throw new Error(tokenResult?.message || "Token导入失败");
      }
    } catch (error) {
      console.error("URL参数处理失败:", error);
      message.error(`导入失败: ${error.message}`);
      // 清除URL参数
      router.replace("/tokens");
    } finally {
      isImporting.value = false;
    }
  }
};

// 监听路由参数变化
watch(() => [props.token, props.api], handleUrlParams, { immediate: false });

// 限流等待事件处理
const handleRateLimitWaiting = (data) => {
  rateLimitWaiting.value = true;
  rateLimitMessage.value = `Token刷新限流等待中，预计等待 ${data.waitSeconds} 秒（队列: ${data.queueSize}）`;
};

// 生命周期
onMounted(async () => {
  tokenStore.initTokenStore();

  // 监听限流等待事件
  $emit.on("token:refresh:waiting", handleRateLimitWaiting);

  // 处理URL参数
  await handleUrlParams();

  // 如果没有token且没有URL参数，显示导入表单
  if (!tokenStore.hasTokens && !props.token && !props.api) {
    showImportForm.value = true;
  }
});

onUnmounted(() => {
  // 移除限流等待事件监听
  $emit.off("token:refresh:waiting", handleRateLimitWaiting);
});
</script>

<style scoped lang="scss">
.token-import-page {
  min-height: 100vh;
  background: var(--bg-secondary);
  padding: var(--spacing-lg) 0;
}

.account-page-content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.config-import-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-md);
  border: 1px dashed var(--border-light);
  border-radius: var(--border-radius-medium);
  background: var(--bg-tertiary);
}

.config-import-tip {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.header-content p {
  font-size: var(--font-size-lg);
  margin: 0;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.import-section {
  margin-bottom: var(--spacing-2xl);
}

.import-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-2xl);
  box-shadow: var(--shadow-large);
  max-width: 600px;
  margin: 0 auto;
}

.card-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);

  h2 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-sm);
  }

  p {
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .subtitle {
    font-size: var(--font-size-md);
    color: var(--text-tertiary);
    margin: 0;
    font-weight: var(--font-weight-normal);
  }

  .import-method-scroll {
    margin-top: var(--spacing-md);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color) transparent;

    &::-webkit-scrollbar {
      height: 4px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 2px;
    }
  }

  .import-method-tabs {
    display: inline-flex;
    flex-wrap: nowrap;
    white-space: nowrap;

    :deep(.n-radio-button) {
      flex-shrink: 0;
      white-space: nowrap;
      min-width: fit-content;
    }

    &.is-mobile {
      :deep(.n-radio-button) {
        padding: 6px 10px;
        font-size: 12px;
      }
    }
  }
}

// 移动端适配
@media screen and (max-width: 768px) {
  .token-import-page .account-page-content {
    padding: 8px;
  }

  .token-import-modal {
    .arco-modal {
      width: 100vw !important;
      max-width: 100vw !important;
      margin: 0 !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      border-radius: 0 !important;
      height: 100vh !important;
      max-height: 100vh !important;
    }

    .arco-modal-content {
      padding: 12px !important;
      height: calc(100vh - 60px) !important;
      overflow-y: auto !important;
    }

    .card-header {
      margin-bottom: 16px;
    }

    // 移动端使用下拉选择器
    .import-method-mobile {
      width: 100%;

      .mobile-method-select {
        width: 100%;

        :deep(.n-base-selection) {
          height: 40px;
        }

        :deep(.n-base-selection-label) {
          height: 40px;
          line-height: 40px;
        }
      }
    }

    .n-form {
      padding: 0 !important;
    }

    .n-form-item {
      margin-bottom: 12px !important;
    }
  }

  // Token列表移动端适配
  .tokens-section {
    padding: var(--spacing-md);
    max-height: none;
  }

  .tokens-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  .token-card {
    padding: var(--spacing-md);
  }
}

.form-tips {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-tip {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.cors-tip {
  color: var(--warning-color);
  font-weight: var(--font-weight-medium);
}

.connection-actions {
  display: flex;
  gap: var(--spacing-xs);
  align-items: center;
}

/* 深色主题强制覆盖（与全局 data-theme 保持一致） */
[data-theme="dark"] .n-form-item-label,
[data-theme="dark"] .n-form-item-label__text {
  color: #ffffff !important;
}

[data-theme="dark"] .n-input__input,
[data-theme="dark"] .n-input__textarea {
  color: #ffffff !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}

[data-theme="dark"] .n-input__placeholder {
  color: rgba(255, 255, 255, 0.5) !important;
}

[data-theme="dark"] .n-card {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .import-card {
  background: rgba(45, 55, 72, 0.9) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .import-card h2 {
  color: #ffffff !important;
}

[data-theme="dark"] .import-card .subtitle {
  color: rgba(255, 255, 255, 0.7) !important;
}

[data-theme="dark"] .n-collapse-item__header {
  color: #ffffff !important;
}

[data-theme="dark"] .n-collapse-item__content-wrapper {
  background-color: transparent !important;
}

[data-theme="dark"] .n-radio-button {
  color: #ffffff !important;
}

[data-theme="dark"] .n-radio-button--checked {
  background-color: rgba(16, 185, 129, 0.8) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .form-tip {
  color: rgba(255, 255, 255, 0.6) !important;
}

.optional-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
}

.tokens-section {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-medium);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - var(--spacing-2xl) * 4);
}

/* 深色主题下的列表区域背景 */
[data-theme="dark"] .tokens-section {
  background: rgba(45, 55, 72, 0.9);
  color: #ffffff;
}

/* 深色主题下的固定头部 */
[data-theme="dark"] .section-header {
  background: rgba(45, 55, 72, 0.9);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.section-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--spacing-xl);
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-primary);
  padding: var(--spacing-lg) 0;
  margin: -var(--spacing-xl) -var(--spacing-xl) var(--spacing-md);
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-light);

  h2 {
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    margin: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  // 移动端适配
  &.is-mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);

    h2 {
      font-size: var(--font-size-md);
    }

    .header-left {
      width: 100%;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }
  }
}

.section-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  min-width: 0;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.sort-buttons {
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  flex-wrap: wrap;
  flex: 0 0 auto;
  overflow: visible;
  justify-content: flex-end;
}

.multi-game-token-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: default;
}

.tokens-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-lg);
  overflow-y: auto;
  padding-right: var(--spacing-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--border-medium) var(--bg-tertiary);
  flex: 1;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-tertiary);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-medium);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--border-dark);
  }
}

.token-card {
  border: 2px solid var(--border-light);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    box-shadow: var(--shadow-medium);
    transform: translateY(-2px);
  }

  &.active {
    border-color: var(--primary-color);
    box-shadow: var(--shadow-light);
  }

  &.connected {
    border-left: 4px solid var(--success-color);
  }
}

.tokens-list {
  overflow-y: auto;
  padding-right: var(--spacing-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--border-medium) var(--bg-tertiary);
  flex: 1;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-tertiary);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-medium);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--border-dark);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-md);
}

.token-info {
  flex: 1;
}

.token-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.token-meta {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.meta-item {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-small);
}

.card-body {
  margin-bottom: var(--spacing-md);
}

.token-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
}

.token-label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.token-value {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  flex: 1;
}

.connection-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);

  &.connected {
    background: var(--success-color);
  }

  &.connecting {
    background: var(--warning-color);
  }

  &.error {
    background: var(--error-color);
  }
}

.status-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.token-remark {
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-xs);

  &:hover {
    background: var(--bg-secondary);
  }
}

.token-remark-edit {
  cursor: default;
  background: var(--bg-primary);
  border: 1px solid var(--border-medium);

  &:hover {
    background: var(--bg-primary);
  }
}

.remark-label {
  font-weight: var(--font-weight-medium);
  margin-right: var(--spacing-xs);
  color: var(--text-primary);
  flex-shrink: 0;
}

.remark-value {
  font-style: italic;
  flex: 1;
}

.token-timestamps {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.timestamp-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.timestamp-label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.timestamp-value {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.card-footer {
  border-top: 1px solid var(--border-light);
  padding-top: var(--spacing-md);
}

/* 连接状态指示器样式 */
.connection-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: var(--spacing-xs);
  position: relative;

  &.connected {
    background-color: #10b981;
    /* 绿色 - 已连接 */
    animation: pulse-green 2s infinite;
  }

  &.connecting {
    background-color: #f59e0b;
    /* 黄色 - 连接中 */
    animation: pulse-yellow 1s infinite;
  }

  &.disconnected {
    background-color: #6b7280;
    /* 灰色 - 已断开 */
  }

  &.error {
    background-color: #ef4444;
    /* 红色 - 连接错误 */
    animation: pulse-red 1s infinite;
  }
}

.connection-status {
  font-size: var(--font-size-xs);
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;

  &.connected {
    color: #10b981;
    background-color: rgba(16, 185, 129, 0.1);
  }

  &.connecting {
    color: #f59e0b;
    background-color: rgba(245, 158, 11, 0.1);
  }

  &.disconnected {
    color: #6b7280;
    background-color: rgba(107, 114, 128, 0.1);
  }

  &.error {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }
}

@keyframes pulse-green {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

@keyframes pulse-yellow {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}

@keyframes pulse-red {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  box-shadow: var(--shadow-medium);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .account-page-content {
    padding: 0 var(--spacing-md);
  }

  .tokens-grid {
    grid-template-columns: 1fr;
  }

  .optional-fields {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    gap: var(--spacing-md);
    align-items: stretch;
  }

  .section-main {
    width: 100%;
  }

  .section-title-row {
    flex-wrap: wrap;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .token-timestamps {
    flex-direction: column;
  }

  .storage-info {
    flex-direction: column;
    gap: var(--spacing-sm);
  }
}

/* 存储信息样式 */
.storage-info {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}

.storage-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.storage-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  min-width: 70px;
}

.storage-upgrade {
  margin-top: var(--spacing-xs);
}

:global([data-theme="dark"] .token-import-modal .arco-modal) {
  background: var(--bg-primary) !important;
}

/* ============ 视觉打磨层（SaaS 范式，后声明覆盖） ============ */

/* 状态徽章统一为彩色圆点 */
.token-import-page .ant-badge-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 列表行：细描边 + 悬停反馈，选中态主色描边 */
.tokens-list .n-card {
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: var(--border-medium);
    box-shadow: var(--shadow-light);
  }

  &.active {
    border-color: var(--primary-color);
    box-shadow: var(--shadow-light);
  }
}

/* 卡片视图：去紫蓝渐变，统一中性描边卡片 */
.tokens-grid .token-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
}

.tokens-grid .token-card:hover {
  border-color: var(--border-medium);
  transform: translateY(-2px);
  box-shadow: var(--shadow-light);
}

[data-theme="dark"] .token-card {
  background: var(--bg-primary);
}

/* 存储类型 / 区服标签弱化为小胶囊 */
.token-import-page .n-tag {
  font-weight: 500;
}

/* 工具栏与列表间距收敛 */
.tokens-section {
  padding: var(--spacing-lg);
  border: 1px solid var(--border-light);
  box-shadow: none;
  max-height: none;
}

.section-header {
  position: static;
  padding: 0 0 var(--spacing-md);
  margin: 0 0 var(--spacing-md);
  border-bottom: 1px solid var(--border-light);
}

/* 选中高亮 */
.tokens-list .n-card.active,
.tokens-grid .token-card.active {
  background: var(--primary-color-light);
}

.account-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);

  strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
}

.account-desktop-search {
  width: 148px;
  max-width: 100%;
}

.account-mobile-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  .n-input {
    min-width: 0;
    min-height: 44px;
    --n-height: 44px !important;

    :deep(.n-input__input-el) {
      min-height: 44px;
    }
  }

  .n-button {
    height: 44px;
    padding-inline: 10px;
  }
}

.account-batch-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: var(--border-radius-medium);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);

  > span {
    margin-inline-end: auto;
  }
}

.account-search-empty {
  padding: 24px 0;
}

.account-name-button,
button.account-list-remark {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  padding: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.account-card-actions,
.account-list-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.account-list-card {
  cursor: pointer;

  + .account-list-card {
    margin-top: 8px;
  }
}

.account-list-row,
.account-list-info,
.account-list-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.account-list-row {
  justify-content: space-between;
}

.account-list-info {
  flex: 1;

  :deep(.n-avatar) {
    flex-shrink: 0;
  }
}

.account-list-identity {
  min-width: 0;
}

.account-list-meta {
  flex-wrap: wrap;
  gap: 2px 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);

  :deep(.arco-badge-status-text) {
    color: inherit;
    font-size: inherit;
  }
}

.account-server {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-connection-error {
  margin: 4px 0 0;
  color: var(--error-color);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.account-list-remark {
  margin-top: 6px;
}

button.account-list-remark {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 400;
}

.account-page-mobile {
  min-height: 0;
  padding: 0;

  .account-page-content {
    padding-inline: 10px;
  }

  .account-summary {
    margin-bottom: 8px;
  }

  .retained-game-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    margin-bottom: 8px;
    border-radius: var(--border-radius, 12px);
    background: var(--bg-secondary);
    box-shadow: var(--shadow-light);
  }

  .retained-game-identity {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    span { color: var(--text-secondary); font-size: var(--font-size-xs); }
  }

  .retained-game-summary :deep(.n-button) { min-height: 44px; }

  .tokens-section {
    max-height: none;
    border: none;
    background: transparent;
    padding: 0;
  }

  .tokens-list {
    padding: 0;
    overflow: visible;
  }

  .account-list-card {
    --n-padding-left: 8px !important;
    --n-padding-right: 8px !important;
    --n-padding-bottom: 5px !important;
    --n-padding-top: 5px !important;
    border-radius: var(--radius-md, 12px);
  }

  .account-list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
  }

  .account-list-info { gap: 6px; }
  .account-list-identity { flex: 1; }
  .account-avatar-fallback { color: var(--primary-color); background: var(--primary-color-light); }

  .account-list-check :deep(.n-checkbox) {
    width: 44px;
    height: 44px;
    justify-content: center;
    align-items: center;
  }

  .account-list-actions {
    flex-wrap: nowrap;
    gap: 0;

    .compact-account-action {
      min-width: 44px;
      width: 44px;
      padding: 0;
    }
  }

  .account-play :deep(.n-button__icon) { font-size: 20px; }

  .account-list-actions .n-button,
  .account-batch-bar .n-button,
  .account-search-empty .n-button {
    min-height: 44px;
    height: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tokens-list .n-card,
  .tokens-grid .token-card {
    transition: none;
  }

  .tokens-grid .token-card:hover {
    transform: none;
  }
}
</style>
