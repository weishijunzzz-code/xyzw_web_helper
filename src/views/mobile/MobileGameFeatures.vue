<template>
  <div class="mobile-game-features">
    <!-- 连接操作条：顶栏已展示标题与账号，这里只留连接切换 -->
    <div class="mgf-header">
      <span class="mgf-hint">{{ connectionStatusText }} · 点击切换连接</span>
      <div
        class="mgf-conn-pill"
        :class="connectionStatus"
        @click="toggleConnection"
      >
        <span class="pill-dot" />
        {{ isConnected ? "断开" : "连接" }}
      </div>
    </div>

    <!-- 快速入口区 -->
    <div class="quick-entries">
      <div class="quick-entry-card" @click="goToPushingLevels">
        <div class="entry-icon">⚔️</div>
        <div class="entry-info">
          <div class="entry-title">主线推关</div>
          <div class="entry-desc">批量自动推图</div>
        </div>
        <n-icon size="18" class="entry-arrow"><ChevronForward /></n-icon>
      </div>
      <div class="quick-entry-card apex" @click="goToApex">
        <div class="entry-icon">🐉</div>
        <div class="entry-info">
          <div class="entry-title">逐鹿盐山</div>
          <div class="entry-desc">Apex 竞速挑战 · 竞猜助威</div>
        </div>
        <n-icon size="18" class="entry-arrow"><ChevronForward /></n-icon>
      </div>
    </div>

    <!-- 功能主体：标签页 + 功能卡片 -->
    <div class="mgf-body" ref="bodyRef">
      <GameStatus ref="gameStatusRef" />
    </div>

    <!-- 连接详情：可展开 -->
    <div class="mgf-conn-section">
      <n-collapse :default-expanded-names="connectionStatus === 'connected' ? [] : ['conn']">
        <n-collapse-item name="conn">
          <template #header>
            <span class="conn-header-text">连接详情</span>
          </template>
          <div class="conn-rows">
            <div class="conn-row">
              <span class="conn-label">WebSocket 状态</span>
              <span class="conn-value" :class="connectionClass">{{ connectionStatusText }}</span>
            </div>
            <div v-if="currentAccount" class="conn-row">
              <span class="conn-label">当前账号</span>
              <span class="conn-value">{{ currentAccount }}</span>
            </div>
            <n-button
              size="small"
              :type="isConnected ? 'warning' : 'primary'"
              ghost
              @click="toggleConnection"
            >
              {{ isConnected ? "断开连接" : "重新连接" }}
            </n-button>
          </div>
        </n-collapse-item>
      </n-collapse>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { ChevronForward } from '@vicons/ionicons5'
import { useTokenStore } from '@/stores/tokenStore'
import GameStatus from '@/components/GameStatus.vue'

const router = useRouter()
const message = useMessage()
const tokenStore = useTokenStore()

// 功能主体引用：用于快速入口切换分区/滚动定位
const gameStatusRef = ref(null)
const bodyRef = ref(null)

// ========== 连接状态（与 PC 版 GameFeatures 行为一致） ==========
const connectionStatus = computed(() => {
  if (!tokenStore.selectedToken) return 'disconnected'
  const status = tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)
  return status === 'connected' ? 'connected' : 'disconnected'
})

const connectionStatusText = computed(() => {
  if (!tokenStore.selectedToken) return '未选择账号'
  return connectionStatus.value === 'connected' ? '已连接' : '未连接'
})

const connectionClass = computed(() =>
  connectionStatus.value === 'connected' ? 'status-connected' : 'status-disconnected'
)

const isConnected = computed(() => connectionStatus.value === 'connected')

const currentAccount = computed(() => tokenStore.selectedToken?.name || '')

const initializeGameData = async () => {
  if (!tokenStore.selectedToken) return
  try {
    const tokenId = tokenStore.selectedToken.id
    tokenStore.sendMessage(tokenId, 'role_getroleinfo')
    tokenStore.sendMessage(tokenId, 'tower_getinfo')
    tokenStore.sendMessage(tokenId, 'evotower_getinfo')
    tokenStore.sendMessage(tokenId, 'presetteam_getinfo')
    const res = await tokenStore.sendMessageWithPromise(tokenId, 'fight_startlevel')
    tokenStore.setBattleVersion(res?.battleData?.version)
  } catch (error) {
    // 静默处理初始化异常
  }
}

const connectWebSocket = () => {
  if (!tokenStore.selectedToken) {
    message.warning('请先选择一个账号')
    router.push('/mobile/tokens')
    return
  }
  try {
    const tokenId = tokenStore.selectedToken.id
    const token = tokenStore.selectedToken.token
    tokenStore.createWebSocketConnection(tokenId, token)
    message.info('正在建立 WebSocket 连接...')
    setTimeout(async () => {
      const status = tokenStore.getWebSocketStatus(tokenId)
      if (status === 'connected') {
        message.success('WebSocket 连接成功')
        await initializeGameData()
      }
    }, 2000)
  } catch (error) {
    console.error('WebSocket连接失败:', error)
    message.error('WebSocket连接失败')
  }
}

const disconnectWebSocket = () => {
  if (tokenStore.selectedToken) {
    tokenStore.closeWebSocketConnection(tokenStore.selectedToken.id)
    message.info('WebSocket连接已断开')
  }
}

const toggleConnection = () => {
  if (connectionStatus.value === 'connected') {
    disconnectWebSocket()
  } else {
    connectWebSocket()
  }
}

// ========== 生命周期 ==========
onMounted(() => {
  if (tokenStore.selectedToken) {
    const status = tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)
    if (status !== 'connected') {
      connectWebSocket()
    } else {
      initializeGameData()
    }
  }
})

// 监听 Token 过期（如 token 过期给出明确提示）
watch(
  () => {
    if (!tokenStore.selectedToken)
      return { status: 'disconnected', lastError: null }
    const conn = tokenStore.wsConnections[tokenStore.selectedToken.id]
    return { status: conn?.status, lastError: conn?.lastError }
  },
  (cur) => {
    if (!cur) return
    if (cur.status === 'error' && cur.lastError) {
      const err = String(cur.lastError.error || '').toLowerCase()
      if (err.includes('token') && err.includes('expired')) {
        const importMethod = tokenStore.selectedToken?.importMethod
        if (
          ['url', 'bin', 'wxQrcode', 'mobile', 'wxForceLogout'].includes(importMethod)
        ) {
          message.warning('Token已过期，正在尝试自动刷新...')
          return
        }
        message.error('当前 Token 已过期，请重新导入后再试')
        router.push('/mobile/tokens')
      }
    }
  },
  { deep: true },
)

onUnmounted(() => {})

// ========== 快速入口 ==========
const goToPushingLevels = () => {
  router.push('/mobile/pushing-levels')
}

// 逐鹿盐山：本页 GameStatus 已含"逐鹿盐山"标签页，直接切换分区并滚动到功能主体
const goToApex = () => {
  gameStatusRef.value?.setSection('apexChallengeGroup')
  if (bodyRef.value) {
    bodyRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<style scoped lang="scss">
.mobile-game-features {
  display: flex;
  flex-direction: column;
  padding-bottom: var(--spacing-md);
}

/* ---------- 连接操作条 ---------- */
.mgf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md) 0;
}

.mgf-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mgf-conn-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--border-radius-full);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;

  .pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  &.connected {
    color: var(--success-color);
    background: var(--success-soft);
  }

  &.disconnected {
    color: var(--error-color);
    background: var(--error-soft);
  }

  &:active {
    transform: scale(0.97);
  }
}

/* ---------- 快速入口 ---------- */
.quick-entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-md) var(--spacing-sm);
}

.quick-entry-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: var(--border-radius-large);
  color: white;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  min-width: 0;

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
  }

  &.apex {
    background: linear-gradient(135deg, #f6b93b 0%, #e58e26 55%, #d63031 100%);
    box-shadow: 0 4px 12px rgba(230, 126, 34, 0.35);

    &:active {
      box-shadow: 0 2px 8px rgba(230, 126, 34, 0.25);
    }
  }
}

.entry-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.entry-info {
  flex: 1;
  min-width: 0;
}

.entry-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-desc {
  font-size: 11px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-arrow {
  flex-shrink: 0;
  opacity: 0.8;
}

/* ---------- 功能主体 ---------- */
.mgf-body {
  padding: 0 var(--spacing-sm);
}

/* ---------- 连接详情 ---------- */
.mgf-conn-section {
  margin: var(--spacing-sm) var(--spacing-md) 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  padding: 0 var(--spacing-md);
}

.conn-header-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.conn-rows {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
}

.conn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  font-size: var(--font-size-sm);
}

.conn-label {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.conn-value {
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;

  &.status-connected {
    color: var(--success-color);
  }

  &.status-disconnected {
    color: var(--error-color);
  }
}
</style>
