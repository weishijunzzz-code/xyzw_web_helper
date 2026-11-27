<template>
  <div class="mobile-layout">
    <!-- 顶部导航栏 -->
    <header class="mobile-header">
      <div class="header-left">
        <n-button v-if="showBack" text aria-label="返回上一页" class="back-btn" @click="goBack">
          <template #icon>
            <n-icon size="24"><ArrowBack /></n-icon>
          </template>
        </n-button>
        <h1 class="header-title">{{ title }}</h1>
      </div>
      
      <div v-if="allTokens.length" class="header-center">
        <button
          ref="accountPickerTrigger"
          class="token-selector"
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="showTokenDrawer"
          :aria-label="accountPickerLabel"
          :title="selectedLogin.error || undefined"
          @click="openAccountPicker"
        >
          <span v-if="tokenStore.selectedToken" class="token-avatar-wrapper" aria-hidden="true">
            <span class="token-avatar">
              <img v-if="tokenStore.selectedToken.avatar" :src="tokenStore.selectedToken.avatar" alt="" />
              <span v-else class="token-avatar-placeholder">
                {{ getTokenDisplayName(tokenStore.selectedToken).charAt(0) }}
              </span>
            </span>
            <span v-if="selectedLogin.status === 'connected'" class="online-indicator"></span>
          </span>
          <span class="token-info">
            <span class="token-name">
              {{ tokenStore.selectedToken ? getTokenDisplayName(tokenStore.selectedToken) : '选择账号' }}
            </span>
            <span v-if="tokenStore.selectedToken" class="token-status" :class="{ 'token-status-error': selectedLogin.status === 'error' }">
              {{ selectedLogin.label }}
            </span>
          </span>
          <n-icon class="dropdown-btn" size="16" aria-hidden="true"><ChevronDown /></n-icon>
        </button>
      </div>

      <div class="header-right">
        <!-- 活动日历 -->
        <ActivityCalendarDropdown />
        <ThemeSettings />
        <slot name="header-right"></slot>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="mobile-main" :class="{ 'has-bottom-nav': showBottomNav }">
      <p v-if="offline" class="mobile-network-status" role="status">网络已断开，部分功能可能无法使用</p>
      <router-view v-slot="{ Component, route: childRoute }">
        <transition name="slide" mode="out-in">
          <component :is="Component" :key="childRoute.path" />
        </transition>
      </router-view>
    </main>

    <nav v-if="showBottomNav" class="mobile-bottom-nav" aria-label="主导航">
      <div class="nav-container">
        <router-link
          v-for="item in bottomNavItems"
          :key="item.path"
          :to="bottomNavTarget(item.path)"
          class="nav-item"
          :class="{ active: isActiveRoute(item.path) }"
          :aria-current="isActiveRoute(item.path) ? 'page' : undefined"
        >
          <div class="nav-icon-wrapper">
            <n-icon size="20">
              <component :is="item.icon" />
            </n-icon>
          </div>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>
    
    <n-drawer
      v-model:show="showTokenDrawer"
      placement="top"
      height="min(34rem, 85vh)"
      class="token-drawer"
      aria-labelledby="mobile-account-picker-title"
      @after-leave="accountPickerTrigger?.focus()"
    >
      <n-drawer-content :body-content-style="{ height: '100%', padding: 0, overflow: 'hidden' }">
        <div class="account-picker">
          <div class="account-picker-controls">
            <div class="account-picker-heading">
              <h2 id="mobile-account-picker-title">选择账号</h2>
              <button
                class="account-picker-close"
                type="button"
                aria-label="关闭账号选择"
                @click="showTokenDrawer = false"
              >
                <n-icon size="20" aria-hidden="true"><Close /></n-icon>
              </button>
            </div>
            <input
              v-model="pickerQuery"
              class="account-picker-search"
              type="search"
              aria-label="搜索账号或区服"
              placeholder="搜索账号 / 区服"
            />
          </div>
          <ul v-if="filteredAccounts.length" class="account-picker-list">
            <li v-for="account in filteredAccounts" :key="account.token.id" class="token-list-item">
              <button
                class="account-picker-option"
                type="button"
                :aria-pressed="account.token.id === tokenStore.selectedToken?.id"
                @click="selectPickerToken(account.token)"
              >
                <span class="account-picker-avatar" aria-hidden="true">
                  <img v-if="account.token.avatar" :src="account.token.avatar" alt="" />
                  <span v-else>{{ account.name.charAt(0) }}</span>
                </span>
                <span class="account-picker-details">
                  <span class="account-picker-name">{{ account.name }}</span>
                  <span class="account-picker-meta">
                    <span v-if="account.server">{{ account.server }}</span>
                    <span class="account-picker-status" role="status">{{ account.login.label }}</span>
                  </span>
                  <span v-if="account.login.error" class="account-picker-error">{{ account.login.error }}</span>
                </span>
                <n-icon
                  v-if="account.token.id === tokenStore.selectedToken?.id"
                  class="account-picker-check"
                  size="18"
                  aria-hidden="true"
                ><CheckmarkCircle /></n-icon>
              </button>
              <button
                v-if="account.actionLabel"
                class="account-picker-connect"
                type="button"
                :aria-label="`${account.actionLabel} ${account.name}`"
                @click="runPickerAction(account.token)"
              >
                {{ account.actionLabel }}
              </button>
            </li>
          </ul>
          <p v-else class="account-picker-empty" role="status">没有匹配的账号</p>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import {
  ArrowBack,
  CheckmarkCircle,
  ChevronDown,
  Close,
  Grid,
  Home,
  Layers,
  Person,
  Time,
} from '@vicons/ionicons5'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeSettings from '@/components/Common/ThemeSettings.vue'
import { useTokenStore } from '@/stores/tokenStore'
import { isNativeGameApp } from '@/utils/runtimePlatform'
import { getTokenLoginDisplay } from '@/utils/tokenLoginDisplay'
import ActivityCalendarDropdown from '@/views/TaskScheduler/components/ActivityCalendarDropdown.vue'

const route = useRoute()
const router = useRouter()
const tokenStore = useTokenStore()
const landingPage = computed(() => tokenStore.hasTokens ? '/mobile/dashboard' : '/mobile/tokens')

// 底部导航项（云端任务已并入"定时"页的分段切换，不再单占一个 tab）
const bottomNavItems = [
  { path: '/mobile/dashboard', label: '首页', icon: Home },
  { path: '/mobile/game-features', label: '功能', icon: Grid },
  { path: '/mobile/tokens', label: '账号', icon: Person },
  { path: '/mobile/task-scheduler', label: '定时', icon: Time },
  { path: '/mobile/batch-daily-tasks', label: '批量', icon: Layers }
]

function bottomNavTarget(path) {
  if (path === '/mobile/task-scheduler' && !tokenStore.hasTokens) {
    return { path, query: { tab: 'cloud' } }
  }
  return path
}

// 计算属性
const title = computed(() => route.meta.title || 'XYZW助手')
const showBack = computed(() => route.meta.showBack !== false && route.path !== '/mobile/dashboard' &&
  (!isNativeGameApp() || route.path !== landingPage.value))
const showBottomNav = computed(() => route.meta.showBottomNav !== false)

const root = document.documentElement
const viewport = window.visualViewport
const offline = ref(!navigator.onLine)
let keyboardObserver

function syncNetworkStatus() {
  offline.value = !navigator.onLine
}

function syncViewport() {
  const fieldFocused = document.activeElement?.matches('input:not([type="checkbox"], [type="radio"], [type="file"]), textarea, [contenteditable="true"]')
  const viewportHeight = viewport?.height || window.innerHeight
  const keyboardOpen = root.hasAttribute('data-native-keyboard') ||
    (fieldFocused && viewport?.scale === 1 && window.innerHeight - viewportHeight > 100)
  root.toggleAttribute('data-mobile-keyboard', keyboardOpen)
  if (keyboardOpen) root.style.setProperty('--mobile-viewport-height', `${viewportHeight}px`)
  else root.style.removeProperty('--mobile-viewport-height')
}

onMounted(() => {
  root.setAttribute('data-mobile-shell', '')
  syncViewport()
  keyboardObserver = new MutationObserver(syncViewport)
  keyboardObserver.observe(root, { attributes: true, attributeFilter: ['data-native-keyboard'] })
  viewport?.addEventListener('resize', syncViewport)
  window.addEventListener('resize', syncViewport)
  window.addEventListener('online', syncNetworkStatus)
  window.addEventListener('offline', syncNetworkStatus)
})

onUnmounted(() => {
  keyboardObserver?.disconnect()
  viewport?.removeEventListener('resize', syncViewport)
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('online', syncNetworkStatus)
  window.removeEventListener('offline', syncNetworkStatus)
  root.removeAttribute('data-mobile-shell')
  root.removeAttribute('data-mobile-keyboard')
  root.style.removeProperty('--mobile-viewport-height')
})

const allTokens = computed(() => tokenStore.gameTokens || [])
const showTokenDrawer = ref(false)
const pickerQuery = ref('')
const accountPickerTrigger = ref(null)
function getLoginDisplay(tokenId) {
  if (!tokenId) return getTokenLoginDisplay()
  return getTokenLoginDisplay(tokenStore.getTokenLoginState(tokenId), tokenStore.getWebSocketStatus(tokenId))
}
const selectedLogin = computed(() => getLoginDisplay(tokenStore.selectedToken?.id))
const accountPickerLabel = computed(() => {
  const token = tokenStore.selectedToken
  if (!token) return '选择账号'
  return `选择账号，当前为 ${getTokenDisplayName(token)}，${selectedLogin.value.label}`
})

function openAccountPicker() {
  pickerQuery.value = ''
  showTokenDrawer.value = true
}

function selectPickerToken(token) {
  if (tokenStore.selectTokenOnly(token.id)) {
    showTokenDrawer.value = false
  }
}

function runPickerAction(token) {
  const login = getLoginDisplay(token.id)
  if (login.canCancel) {
    tokenStore.cancelTokenLogin(token.id)
  } else if (!login.pending && login.status !== 'connected') {
    tokenStore.selectToken(token.id, login.canRetry)
  }
}

// 格式化服务器显示
const formatServer = (server) => {
  if (!server) return ''
  if (String(server).includes('服')) {
    return server
  }
  return `${server}服`
}

// 获取Token显示名称
const getTokenDisplayName = (token) => {
  if (token.name && token.name.trim()) {
    return token.name
  }
  if (tokenStore.selectedToken?.id === token.id) {
    const gameRoleName = tokenStore.gameData?.roleInfo?.role?.name
    if (gameRoleName) {
      return gameRoleName
    }
  }
  if (token.server) {
    return formatServer(token.server)
  }
  return `账号${token.id?.slice(-4) || '未知'}`
}

function getPickerActionLabel(login) {
  if (login.canCancel) return '取消连接'
  if (login.canRetry) return '重试连接'
  return login.status === 'disconnected' ? '连接' : ''
}

const filteredAccounts = computed(() => {
  const query = pickerQuery.value.trim().toLowerCase()
  return allTokens.value
    .map((token) => {
      const login = getLoginDisplay(token.id)
      return {
        token,
        name: getTokenDisplayName(token),
        server: formatServer(token.server),
        login,
        actionLabel: getPickerActionLabel(login),
      }
    })
    .filter(({ name, server }) => !query || `${name} ${server}`.toLowerCase().includes(query))
})

// 返回上一页
const goBack = () => {
  if (window.history.state?.back) router.back()
  else router.replace(landingPage.value)
}

// 检查当前路由是否激活
const isActiveRoute = (path) => {
  return route.meta.mobileTab === path || route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped lang="scss">
// 设计令牌：全局变量统一在 src/assets/styles/variables.scss 与 design-tokens.scss 中定义
// （scoped 样式中的 :root 块永远不会匹配 html，故不再在此重复定义）

.mobile-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Helvetica Neue",
    Helvetica,
    Arial,
    sans-serif;
  font-variant-numeric: tabular-nums;
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: var(--mobile-header-height);
  padding-block-start: var(--mobile-safe-top);
  padding-inline: calc(var(--mobile-page-gutter) + var(--mobile-safe-left)) calc(var(--mobile-page-gutter) + var(--mobile-safe-right));
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  
  .back-btn {
    color: var(--text-primary);
    transition: transform 0.2s;
    
    &:active {
      transform: scale(0.9);
    }
  }
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-center {
  flex: 2;
  display: flex;
  justify-content: center;
}

.token-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 12px 6px 6px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
}

.token-avatar-wrapper {
  position: relative;
}

.token-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--primary-color-light);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.token-avatar-placeholder {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: var(--success-color);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-primary);
}

.token-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}

.token-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.token-status-error,
.account-picker-error {
  color: var(--error-color);
}

.dropdown-btn {
  width: 20px;
  color: var(--text-secondary);
}

.header-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;

  /* 移动端适配：只显示图标，隐藏文字 */
  :deep(.activity-calendar-btn) {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    color: var(--text-primary);
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.95);
      background: var(--bg-hover);
    }

    .n-icon {
      font-size: 16px;
    }

    /* 隐藏文字和小徽章 */
    .btn-text,
    .activity-badge {
      display: none !important;
    }
  }
}

// 主内容区域
.mobile-main {
  flex: 1;
  min-width: 0;
  padding-block: var(--mobile-header-height) calc(var(--mobile-page-gutter) + var(--mobile-safe-bottom));
  padding-inline: var(--mobile-safe-left) var(--mobile-safe-right);

  &.has-bottom-nav {
    padding-bottom: calc(var(--mobile-page-gutter) + var(--mobile-nav-height));
  }
}

.mobile-network-status {
  margin: 0;
  padding: 6px var(--mobile-page-gutter);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
  font-size: .875rem;
}

.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-sizing: border-box;
  min-height: var(--mobile-nav-height);
  padding-block: 4px calc(4px + var(--mobile-safe-bottom));
  padding-inline: calc(8px + var(--mobile-safe-left)) calc(8px + var(--mobile-safe-right));
  background: var(--bg-primary);
  border-top: 1px solid var(--border-light);
}

.nav-container {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: var(--mobile-touch-target);
  text-decoration: none;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  
  &:hover {
    color: var(--text-secondary);
  }
  
  &.active {
    color: var(--primary-color);
    
    .nav-icon-wrapper {
      background: var(--primary-color-light);
    }
    
    .nav-label {
      font-weight: 600;
    }
  }
}

.nav-icon-wrapper {
  width: 30px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: transparent;
}

.nav-label {
  font-size: .875rem;
  font-weight: 500;
}

:global(.n-drawer.token-drawer) {
  width: 100% !important;
  max-width: none !important;
  max-height: 85dvh;
  background: var(--bg-primary);
}

.account-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.account-picker-controls {
  flex-shrink: 0;
  padding: 8px 16px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-primary);
}

.account-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.account-picker-close,
.account-picker-option,
.account-picker-connect {
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

.account-picker-search,
.account-picker-close,
.account-picker-option,
.account-picker-connect {
  min-height: 44px;

  &:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }
}

.account-picker-close {
  display: grid;
  place-items: center;
  width: 44px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.account-picker-search {
  display: block;
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 16px;

  &::placeholder {
    color: var(--text-secondary);
  }
}

.account-picker-list {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px 16px 16px;
  margin: 0;
  list-style: none;
}

.token-list-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 0 4px;
  border-bottom: 1px solid var(--border-light);
}

.account-picker-option {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  text-align: left;

  &[aria-pressed="true"] {
    background: var(--primary-color-light);
  }
}

.account-picker-avatar {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.account-picker-details {
  display: grid;
  flex: 1;
  min-width: 0;
}

.account-picker-name {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.account-picker-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  color: var(--text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.account-picker-error {
  font-size: 12px;
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.account-picker-check,
.account-picker-connect {
  flex-shrink: 0;
  color: var(--primary-color);
}

.account-picker-connect {
  min-width: 44px;
  padding: 0 6px;
  border-radius: var(--radius-md);
  font-size: 14px;
}

@media (hover: hover) {
  .account-picker-option:hover,
  .account-picker-close:hover,
  .account-picker-connect:hover {
    background: var(--bg-hover);
  }
}

.account-picker-empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--text-secondary);
  text-align: center;
}

// 页面过渡动画
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Reserve both edge controls; the account chip uses only the remaining width. */
@media (max-width: 768px) {
  .mobile-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; }
  .header-left { grid-column: 1; min-width: 0; gap: 4px; }
  .header-title { min-width: 0; }
  .header-left .back-btn { flex: 0 0 44px; width: 44px; height: 44px; }
  .header-center { grid-column: 2; min-width: 0; }
  .header-right { grid-column: 3; min-width: 0; }
  .header-right :deep(.activity-calendar-btn) { width: var(--mobile-touch-target); height: var(--mobile-touch-target); }
  .token-selector { width: 100%; max-width: 260px; min-width: 0; gap: 6px; padding: 5px 6px; }
  .token-avatar-wrapper { flex: 0 0 28px; }
  .token-avatar { width: 28px; height: 28px; }
  .token-info { min-width: 0; flex: 1; }
  .token-name { max-width: none; width: 100%; }
  .dropdown-btn { flex: 0 0 16px; width: 16px; }
  .header-left { max-width: 104px; }
  .header-title { font-size: 1rem; }
  .token-selector { gap: 4px; padding: 3px 5px; }
  .token-avatar-wrapper { flex-basis: 24px; }
  .token-avatar { width: 24px; height: 24px; }
  .token-name { font-size: 12px; }
  .token-status { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .header-right { gap: 4px; flex-wrap: nowrap; }
  .header-right > :deep(*) { flex-shrink: 0; }
  .header-right :deep(.theme-settings), .header-right :deep(.theme-toggle-btn) { width: var(--mobile-touch-target); height: var(--mobile-touch-target); }
}

@media (max-width: 350px) {
  .token-avatar-wrapper { display: none; }
}

@media (min-width: 560px) and (max-width: 768px) {
  .header-left { max-width: none; }
}
</style>
