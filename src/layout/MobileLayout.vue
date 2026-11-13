<template>
  <div class="mobile-layout">
    <!-- 顶部导航栏 - 玻璃拟态风格 -->
    <header class="mobile-header">
      <div class="header-left">
        <n-button text @click="goBack" v-if="showBack" class="back-btn">
          <template #icon>
            <n-icon size="24"><ArrowBack /></n-icon>
          </template>
        </n-button>
        <h1 class="header-title">{{ title }}</h1>
      </div>
      
      <!-- 账号选择和连接状态 -->
      <div class="header-center" v-if="tokenStore.selectedToken">
        <div class="token-selector" @click="showTokenDrawer = true">
          <div class="token-avatar-wrapper">
            <div class="token-avatar" :class="{ online: isConnected }">
              <img v-if="tokenStore.selectedToken.avatar" :src="tokenStore.selectedToken.avatar" />
              <div v-else class="token-avatar-placeholder">
                {{ tokenStore.selectedToken.name?.charAt(0) || '?' }}
              </div>
            </div>
            <div class="online-indicator" v-if="isConnected"></div>
          </div>
          <div class="token-info">
            <div class="token-name">{{ getTokenDisplayName(tokenStore.selectedToken) }}</div>
            <div class="token-status" :class="connectionStatusClass">
              {{ connectionStatusText }}
            </div>
          </div>
          <div class="dropdown-btn">
            <n-icon size="16"><ChevronDown /></n-icon>
          </div>
        </div>
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
      <router-view v-slot="{ Component, route }">
        <transition name="slide" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </main>

    <!-- 底部导航栏 - 悬浮胶囊设计 -->
    <nav class="mobile-bottom-nav" v-if="showBottomNav">
      <div class="nav-container">
        <router-link
          v-for="item in bottomNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActiveRoute(item.path) }"
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
    
    <!-- Token选择抽屉 - 现代卡片风格 -->
    <n-drawer v-model:show="showTokenDrawer" placement="top" :height="540" class="token-drawer">
      <n-drawer-content :body-style="{ padding: 0, background: '#f8fafc' }" :header-style="{ display: 'none' }">
        <div class="drawer-body">
          <!-- 抽屉头部 -->
          <div class="drawer-header">
            <h2 class="drawer-title">选择账号</h2>
            <p class="drawer-subtitle">切换当前操作的游戏账号</p>
          </div>
          
          <!-- 当前选中账号 -->
          <div v-if="tokenStore.selectedToken" class="current-token-section">
            <div class="section-label">
              <span class="label-icon">✦</span>
              当前账号
            </div>
            <div class="current-token-card">
              <div class="card-glow"></div>
              <div class="token-avatar-large">
                <img v-if="tokenStore.selectedToken.avatar" :src="tokenStore.selectedToken.avatar" />
                <div v-else class="avatar-placeholder-large">
                  {{ tokenStore.selectedToken.name?.charAt(0) || '?' }}
                </div>
              </div>
              <div class="token-details">
                <div class="token-name-large">{{ getTokenDisplayName(tokenStore.selectedToken) }}</div>
                <div class="token-meta">
                  <span class="server-badge">{{ formatServer(tokenStore.selectedToken.server) }}</span>
                  <span class="status-badge" :class="getConnectionStatus(tokenStore.selectedToken.id)">
                    {{ getConnectionStatus(tokenStore.selectedToken.id) === 'connected' ? '已连接' : '未连接' }}
                  </span>
                </div>
              </div>
              <div class="active-indicator">
                <n-icon size="20" color="#10b981"><CheckmarkCircle /></n-icon>
              </div>
            </div>
          </div>
          
          <!-- 其他账号列表 -->
          <div class="other-tokens-section">
            <div class="section-label">
              <span class="label-icon">◈</span>
              其他账号
            </div>
            <div v-if="otherTokens.length === 0" class="empty-state">
              <div class="empty-icon">📱</div>
              <p>暂无其他账号</p>
            </div>
            <div v-else class="token-list">
              <div
                v-for="token in otherTokens"
                :key="token.id"
                class="token-list-item"
                @click="selectToken(token)"
              >
                <div class="token-avatar-small">
                  <img v-if="token.avatar" :src="token.avatar" />
                  <div v-else class="avatar-placeholder-small">
                    {{ token.name?.charAt(0) || '?' }}
                  </div>
                </div>
                <div class="token-info-compact">
                  <div class="token-name-small">{{ getTokenDisplayName(token) }}</div>
                  <div class="token-server-small">{{ formatServer(token.server) }}</div>
                </div>
                <div class="status-dot-small" :class="getConnectionStatus(token.id)"></div>
              </div>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeSettings from '@/components/Common/ThemeSettings.vue'
import { useTokenStore } from '@/stores/tokenStore'
import ActivityCalendarDropdown from '@/views/TaskScheduler/components/ActivityCalendarDropdown.vue'
import {
  ArrowBack,
  ChevronDown,
  Home,
  Grid,
  Person,
  Time,
  Layers,
  CheckmarkCircle
} from '@vicons/ionicons5'

const route = useRoute()
const router = useRouter()
const tokenStore = useTokenStore()

// 底部导航项（云端任务已并入"定时"页的分段切换，不再单占一个 tab）
const bottomNavItems = [
  { path: '/mobile/dashboard', label: '首页', icon: Home },
  { path: '/mobile/game-features', label: '功能', icon: Grid },
  { path: '/mobile/tokens', label: '账号', icon: Person },
  { path: '/mobile/task-scheduler', label: '定时', icon: Time },
  { path: '/mobile/batch-daily-tasks', label: '批量', icon: Layers }
]

// 计算属性
const title = computed(() => route.meta.title || 'XYZW助手')
const showBack = computed(() => route.meta.showBack !== false && route.path !== '/mobile/dashboard')
const showBottomNav = computed(() => route.meta.showBottomNav !== false)

// 连接状态
const isConnected = computed(() => {
  if (!tokenStore.selectedToken) return false
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id) === 'connected'
})

const connectionStatusClass = computed(() => ({
  connected: isConnected.value,
  disconnected: !isConnected.value
}))

const connectionStatusText = computed(() => {
  if (!tokenStore.selectedToken) return '未选择'
  return isConnected.value ? '已连接' : '未连接'
})

// 所有账号列表
const allTokens = computed(() => tokenStore.gameTokens || [])

// 其他账号列表（排除当前选中的）
const otherTokens = computed(() => {
  if (!tokenStore.selectedToken) return allTokens.value
  return allTokens.value.filter(t => t.id !== tokenStore.selectedToken.id)
})

// Token选择抽屉
const showTokenDrawer = ref(false)

// 选择Token
const selectToken = (token) => {
  tokenStore.selectToken(token.id)
  showTokenDrawer.value = false
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

// 获取连接状态
const getConnectionStatus = (tokenId) => {
  const status = tokenStore.getWebSocketStatus(tokenId)
  return status || 'disconnected'
}

// 返回上一页
const goBack = () => {
  router.back()
}

// 检查当前路由是否激活
const isActiveRoute = (path) => {
  return route.path === path || route.path.startsWith(path + '/')
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

// 顶部导航栏 - 玻璃拟态风格
.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 16px;
  background: var(--bg-primary);
  backdrop-filter: none;
  backdrop-filter: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  /* 深色主题适配 */
  [data-theme="dark"] & {
    background: var(--bg-primary);
    border-bottom-color: rgba(255, 255, 255, 0.05);
  }
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
  padding: 6px 12px 6px 6px;
  background: rgba(241, 245, 249, 0.8);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  &:hover {
    background: rgba(241, 245, 249, 1);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  &:active {
    transform: translateY(0);
  }

  /* 深色主题适配 */
  [data-theme="dark"] & {
    background: rgba(51, 65, 85, 0.8);
    border-color: rgba(255, 255, 255, 0.1);

    &:hover {
      background: rgba(51, 65, 85, 1);
    }
  }
}

.token-avatar-wrapper {
  position: relative;
}

.token-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--primary-color-light);
  border: 2px solid transparent;
  transition: all 0.3s;
  
  &.online {
    border-color: var(--success-color);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
  }
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.token-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background: var(--success-color);
  border-radius: var(--radius-full);
  border: 2px solid white;
}

.token-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  
  &.connected {
    color: var(--success-color);
  }
  
  &.disconnected {
    color: var(--text-tertiary);
  }
}

.dropdown-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: transform 0.3s;
  
  .token-selector:hover & {
    transform: rotate(180deg);
  }
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
    background: rgba(241, 245, 249, 0.8);
    border: 1px solid rgba(0, 0, 0, 0.05);
    color: var(--text-secondary);
    transition: all 0.3s ease;

    &:active {
      transform: scale(0.95);
      background: rgba(241, 245, 249, 1);
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
  padding-top: 64px;
  padding-bottom: calc(90px + env(safe-area-inset-bottom, 20px));

  &.has-bottom-nav {
    padding-bottom: calc(110px + env(safe-area-inset-bottom, 20px));
  }

  // 注意：这里不能设 overflow，否则本元素会成为滚动容器，
  // 页面内 position: sticky 元素将相对它吸附（而它高度随内容增长、永不滚动）。
  // 移动端实际滚动由 body 承担，横向溢出也在 body 上裁剪（见 global.scss）。

  // Density is controlled by spacing, preserving readable text and touch sizes.
}

// 底部导航栏 - 悬浮胶囊设计
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 20px));
  background: linear-gradient(to top, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.8) 100%);
  backdrop-filter: none;
  backdrop-filter: none;

  /* 深色主题适配 */
  [data-theme="dark"] & {
    background: linear-gradient(to top, rgba(30, 41, 59, 0.95) 0%, rgba(30, 41, 59, 0.8) 100%);
  }
}

.nav-container {
  display: flex;
  justify-content: space-around;
  align-items: center;
  max-width: 380px;
  margin: 0 auto;
  padding: 6px 8px;
  background: rgba(241, 245, 249, 0.9);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);

  /* 深色主题适配 */
  [data-theme="dark"] & {
    background: rgba(51, 65, 85, 0.9);
  }
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px; // 5 项，留足水平内边距且不溢出胶囊
  text-decoration: none;
  color: var(--text-tertiary);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: var(--radius-md);
  
  &:hover {
    color: var(--text-secondary);
  }
  
  &.active {
    color: #6366f1;
    
    .nav-icon-wrapper {
      background: var(--bg-primary);
      color: var(--text-primary);
      transform: translateY(-2px);
      box-shadow: var(--shadow-light);
    }
    
    .nav-label {
      font-weight: 600;
      color: #6366f1;
    }
  }
}

.nav-icon-wrapper {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: transparent;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-label {
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s;
}

// Token选择抽屉 - 现代卡片风格
.token-drawer {
  :deep(.n-drawer-content) {
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }
}

.drawer-body {
  padding: 24px 20px;
  background: var(--bg-secondary);
  min-height: 100%;
}

.drawer-header {
  text-align: center;
  margin-bottom: 24px;
  
  .drawer-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px 0;
  }
  
  .drawer-subtitle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 0;
  }
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  .label-icon {
    font-size: 12px;
    opacity: 0.7;
  }
}

// 当前账号卡片
.current-token-section {
  margin-bottom: 24px;
}

.current-token-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-light);
}

.card-glow {
  display: none;
  position: absolute;
  top: -50%;
  right: -20%;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%);
  pointer-events: none;
}

.token-avatar-large {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.avatar-placeholder-large {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.token-details {
  flex: 1;
  min-width: 0;
}

.token-name-large {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.server-badge {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.status-badge {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  
  &.connected {
    background: rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }
  
  &.disconnected {
    background: rgba(156, 163, 175, 0.3);
    color: #d1d5db;
  }
}

.active-indicator {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

// 其他账号列表
.other-tokens-section {
  flex: 1;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-tertiary);

  .empty-icon {
    font-size: 20px;
    margin-bottom: 12px;
  }

  p {
    font-size: 14px;
    margin: 0;
  }
}

.token-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.token-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  &:hover {
    background: rgba(241, 245, 249, 0.8);
    transform: translateX(4px);
  }

  &:active {
    transform: translateX(0);
  }

  /* 深色主题适配 */
  [data-theme="dark"] & {
    background: rgba(30, 41, 59, 0.8);
    border-color: rgba(255, 255, 255, 0.1);

    &:hover {
      background: rgba(51, 65, 85, 0.9);
    }
  }
}

.token-avatar-small {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--primary-color-light);
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.avatar-placeholder-small {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #6366f1;
}

.token-info-compact {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.token-name-small {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
}

.token-server-small {
  font-size: 12px;
  color: var(--text-tertiary);
}

.status-dot-small {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  
  &.connected {
    background: var(--success-color);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
  }
  
  &.disconnected {
    background: var(--text-tertiary);
  }
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
  .mobile-header { display: grid; grid-template-columns: minmax(0, 112px) minmax(0, 1fr) 44px; gap: 8px; padding: 0 12px; }
  .header-left { grid-column: 1; min-width: 0; gap: 4px; }
  .header-title { min-width: 0; }
  .header-left .back-btn { flex: 0 0 44px; width: 44px; height: 44px; }
  .header-center { grid-column: 2; min-width: 0; }
  .header-right { grid-column: 3; min-width: 0; }
  .header-right :deep(.activity-calendar-btn) { width: 44px; height: 44px; }
  .token-selector { width: 100%; max-width: 260px; min-width: 0; gap: 6px; padding: 5px 6px; }
  .token-avatar-wrapper { flex: 0 0 28px; }
  .token-avatar { width: 28px; height: 28px; }
  .token-info { min-width: 0; flex: 1; }
  .token-name { max-width: none; width: 100%; }
  .dropdown-btn { flex: 0 0 16px; width: 16px; }
}

/* Compact mobile chrome leaves more of the viewport for page content. */
@media (max-width: 768px) {
  .mobile-header { height: 52px; grid-template-columns: auto minmax(0, 1fr) 76px; gap: 6px; padding: 0 10px; }
  .header-left { max-width: 104px; }
  .header-title { font-size: 14px; }
  .header-left .back-btn { flex-basis: 36px; width: 36px; height: 36px; }
  .header-right :deep(.activity-calendar-btn) { width: 36px; height: 36px; }
  .token-selector { gap: 4px; padding: 3px 5px; }
  .token-avatar-wrapper { flex-basis: 24px; }
  .token-avatar { width: 24px; height: 24px; }
  .token-name { font-size: 12px; }
  .token-status { font-size: 12px; }
  .mobile-main { padding-top: 52px; }
  .mobile-main.has-bottom-nav { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
  .mobile-bottom-nav { padding: 4px 8px calc(4px + env(safe-area-inset-bottom, 0px)); }
  .nav-container { padding: 2px 4px; }
  .nav-item { min-width: 44px; min-height: 44px; padding: 0 8px; gap: 0; }
  .nav-icon-wrapper { width: 26px; height: 26px; }
  .nav-item.active, .nav-item.active .nav-label { color: var(--primary-color); }
}

@media (max-width: 768px) {
  .header-right { gap: 4px; flex-wrap: nowrap; }
  .header-right > :deep(*) { flex-shrink: 0; }
  .header-right :deep(.theme-settings), .header-right :deep(.theme-toggle-btn) { width: 36px; height: 36px; }
  .token-selector { overflow: hidden; }
}

/* Fill the bottom bar instead of shrinking the capsule to its content width. */
@media (max-width: 768px) {
  // Override the legacy global fixed height so safe-area padding can expand the bar.
  .mobile-bottom-nav {
    display: block !important;
    height: auto !important;
    min-height: 56px;
    padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px)) !important;
  }
  .mobile-bottom-nav .nav-container {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
    max-width: none;
    margin: 0;
    box-sizing: border-box;
  }
  .mobile-bottom-nav .nav-item { width: 100%; min-width: 0; min-height: 44px; padding: 0; box-sizing: border-box; }
}
</style>
