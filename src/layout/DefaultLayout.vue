<template>
  <div class="default-layout">
    <!-- 顶部导航 -->
    <nav class="dashboard-nav">
      <div class="nav-container">
        <div class="nav-brand">
          <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo" />
          <div class="brand-toggle" @click="isMobileMenuOpen = true">
            <n-icon>
              <Menu />
            </n-icon>
            <span class="brand-text">XYZW 控制台</span>
          </div>
        </div>

        <div class="nav-menu">
          <router-link
            to="/admin/dashboard"
            class="nav-item"
            active-class="active"
          >
            <n-icon>
              <Home />
            </n-icon>
            <span>首页</span>
          </router-link>
          <router-link
            to="/admin/game-features"
            class="nav-item"
            active-class="active"
          >
            <n-icon>
              <Cube />
            </n-icon>
            <span>游戏功能</span>
          </router-link>
          <router-link to="/tokens" class="nav-item" active-class="active">
            <n-icon>
              <PersonCircle />
            </n-icon>
            <span>Token管理</span>
          </router-link>
          <router-link
            to="/admin/batch-daily-tasks"
            class="nav-item"
            active-class="active"
          >
            <n-icon>
              <Layers />
            </n-icon>
            <span>批量日常</span>
          </router-link>
          <router-link
            to="/admin/message-test"
            class="nav-item"
            active-class="active"
          >
            <n-icon>
              <ChatbubbleEllipsesSharp />
            </n-icon>
            <span>消息测试</span>
          </router-link>
          <router-link to="/admin/legion-war" class="nav-item" active-class="active"  v-if="isNowInLegionWarTime()" >
            <n-icon>
              <LockOpen />
            </n-icon>
            <span>实时盐场</span>
          </router-link>
        </div>

        <div class="nav-user">
          <!-- 全局搜索 -->
          <GlobalSearch ref="globalSearchRef" />

          <!-- 主题切换按钮 -->
          <ThemeToggle />

          <!-- Token 选择器 -->
          <div class="token-selector">
            <n-popover
              trigger="click"
              placement="bottom-end"
              :show-arrow="false"
              style="padding: 0;"
              @update:show="handlePopoverShow"
            >
              <template #trigger>
                <div class="token-trigger" :class="{ 'is-active': isTokenPopoverOpen }">
                  <n-badge
                    :value="onlineTokenCount"
                    :max="99"
                    :show="onlineTokenCount > 0"
                    type="success"
                  >
                    <n-avatar
                      :src="selectedToken?.avatar || '/icons/xiaoyugan.png'"
                      size="small"
                      fallback-src="/icons/xiaoyugan.png"
                    />
                  </n-badge>
                  <span class="token-name">{{ selectedToken?.name || "选择Token" }}</span>
                  <n-icon size="14" class="token-chevron" :class="{ 'is-open': isTokenPopoverOpen }">
                    <ChevronDown />
                  </n-icon>
                </div>
              </template>
              
              <div class="token-dropdown-panel">
                <!-- 搜索框 -->
                <div class="token-search">
                  <n-input
                    v-model:value="tokenSearchQuery"
                    placeholder="搜索Token..."
                    size="small"
                    clearable
                  >
                    <template #prefix>
                      <n-icon><Search /></n-icon>
                    </template>
                  </n-input>
                </div>
                
                <!-- 分组标签 -->
                <div class="token-group-tabs">
                  <n-space size="small">
                    <n-tag
                      v-for="group in tokenGroups"
                      :key="group.key"
                      :type="selectedGroup === group.key ? 'primary' : 'default'"
                      size="small"
                      clickable
                      @click="selectedGroup = group.key"
                    >
                      {{ group.label }} ({{ group.count }})
                    </n-tag>
                  </n-space>
                </div>
                
                <!-- Token列表 -->
                <div class="token-list" v-if="filteredTokens.length > 0">
                  <div
                    v-for="token in filteredTokens"
                    :key="token.id"
                    class="token-item"
                    :class="{ 'is-selected': selectedTokenId === token.id }"
                    @click="handleTokenChange(token.id)"
                  >
                    <div class="token-item-avatar">
                      <n-avatar
                        :src="token.avatar || '/icons/xiaoyugan.png'"
                        size="small"
                        fallback-src="/icons/xiaoyugan.png"
                      />
                      <div class="token-status" :class="{ 'is-online': isTokenOnline(token.id) }"></div>
                    </div>
                    <div class="token-item-info">
                      <div class="token-item-name">{{ token.name }}</div>
                      <div class="token-item-meta">
                        <n-tag v-if="token.server" size="tiny" :bordered="false">{{ token.server }}</n-tag>
                        <span v-if="token.level" class="token-level">Lv.{{ token.level }}</span>
                      </div>
                    </div>
                    <n-icon v-if="selectedTokenId === token.id" class="token-check">
                      <Checkmark />
                    </n-icon>
                  </div>
                </div>
                
                <!-- 空状态 -->
                <div v-else class="token-empty">
                  <n-empty description="没有找到Token" size="small" />
                </div>
                
                <!-- 底部操作 -->
                <div class="token-actions">
                  <n-button text size="small" @click="router.push('/tokens')">
                    <template #icon>
                      <n-icon><Settings /></n-icon>
                    </template>
                    管理Token
                  </n-button>
                  <n-button text size="small" @click="refreshTokens">
                    <template #icon>
                      <n-icon><Refresh /></n-icon>
                    </template>
                    刷新
                  </n-button>
                </div>
              </div>
            </n-popover>
          </div>

          <n-dropdown :options="userMenuOptions" @select="handleUserAction">
            <div class="user-menu-trigger">
              <n-icon size="18">
                <Settings />
              </n-icon>
            </div>
          </n-dropdown>
        </div>
      </div>
    </nav>
    <n-drawer
      v-model:show="isMobileMenuOpen"
      placement="left"
      style="width: 260px"
    >
      <div class="drawer-menu">
        <router-link
          to="/admin/dashboard"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Home />
          </n-icon>
          <span>首页</span>
        </router-link>
        <router-link
          to="/admin/game-features"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Cube />
          </n-icon>
          <span>游戏功能</span>
        </router-link>
        <router-link
          to="/tokens"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <PersonCircle />
          </n-icon>
          <span>Token管理</span>
        </router-link>
        <router-link
          to="/admin/daily-tasks"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Settings />
          </n-icon>
          <span>任务管理</span>
        </router-link>
        <router-link
          to="/admin/batch-daily-tasks"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Layers />
          </n-icon>
          <span>批量日常</span>
        </router-link>
        <router-link
          to="/admin/message-test"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <ChatbubbleEllipsesSharp />
          </n-icon>
          <span>消息测试</span>
        </router-link>
          <router-link to="/admin/legion-war" class="nav-item" active-class="active"  v-if="isNowInLegionWarTime()" >
            <n-icon>
              <LockOpen />
            </n-icon>
            <span>实时盐场</span>
          </router-link>
        <router-link
          to="/admin/profile"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <Settings />
          </n-icon>
          <span>个人设置</span>
        </router-link>
      </div>
    </n-drawer>
    <div class="main" :class="{ 'has-bottom-nav': isMobile }">
      <router-view v-slot="{ Component, route }">
        <PageTransition :name="route.meta.transition || 'fade-slide'">
          <component :is="Component" :key="route.path" />
        </PageTransition>
      </router-view>
    </div>

    <!-- 移动端底部导航栏 -->
    <nav class="mobile-bottom-nav" v-if="isMobile">
      <router-link
        v-for="item in bottomNavItems"
        :key="item.path"
        :to="item.path"
        class="bottom-nav-item"
        :class="{ active: isActiveRoute(item.path) }"
      >
        <n-icon size="20">
          <component :is="item.icon" />
        </n-icon>
        <span class="bottom-nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import {
  useTokenStore,
  selectedToken,
  selectedTokenId,
} from "@/stores/tokenStore";
import ThemeToggle from "@/components/Common/ThemeToggle.vue";
import PageTransition from "@/components/DesignSystem/PageTransition.vue";
import GlobalSearch from "@/components/Common/GlobalSearch.vue";
import { useMobile } from "@/composables/useMobile";
import {
  Home,
  PersonCircle,
  Cube,
  Settings,
  ChevronDown,
  ChatbubbleEllipsesSharp,
  LockClosedSharp,LockOpen,
  Menu,
  Layers,
  Grid,
  Apps,
  Person,
  Mail,
  Search,
  Checkmark,
  Refresh,
} from "@vicons/ionicons5";

import { useRouter, useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { ref, computed, h } from 'vue'
import { isNowInLegionWarTime } from '@/utils/clubBattleUtils'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { gameTokens } from '@/stores/tokenStore'

const tokenStore = useTokenStore();
const router = useRouter();
const route = useRoute();
const message = useMessage();

const isMobileMenuOpen = ref(false);
const isTokenPopoverOpen = ref(false);
const tokenSearchQuery = ref('');
const selectedGroup = ref('all');

// 移动端检测
const { isMobile, isMobileLayout } = useMobile();

// 启用键盘快捷键
useKeyboardShortcuts();

// 判断token是否在线的辅助函数
const isTokenOnline = (tokenId) => {
  return tokenStore.wsConnections[tokenId]?.status === 'connected';
};

// Token分组
const tokenGroups = computed(() => [
  { key: 'all', label: '全部', count: gameTokens.value.length },
  { key: 'online', label: '在线', count: gameTokens.value.filter(t => isTokenOnline(t.id)).length },
  { key: 'offline', label: '离线', count: gameTokens.value.filter(t => !isTokenOnline(t.id)).length },
]);

// 在线Token数量
const onlineTokenCount = computed(() => gameTokens.value.filter(t => isTokenOnline(t.id)).length);

// 过滤后的Token列表
const filteredTokens = computed(() => {
  let tokens = gameTokens.value;

  // 按分组过滤
  if (selectedGroup.value === 'online') {
    tokens = tokens.filter(t => isTokenOnline(t.id));
  } else if (selectedGroup.value === 'offline') {
    tokens = tokens.filter(t => !isTokenOnline(t.id));
  }
  
  // 按搜索词过滤
  if (tokenSearchQuery.value.trim()) {
    const query = tokenSearchQuery.value.toLowerCase();
    tokens = tokens.filter(t => 
      t.name?.toLowerCase().includes(query) ||
      t.server?.toLowerCase().includes(query)
    );
  }
  
  return tokens;
});

// Token popover显示状态
const handlePopoverShow = (show) => {
  isTokenPopoverOpen.value = show;
  if (show) {
    // 重置搜索
    tokenSearchQuery.value = '';
    selectedGroup.value = 'all';
  }
};

// Token 切换处理
const handleTokenChange = (tokenId) => {
  const token = gameTokens.value.find(t => t.id === tokenId);
  if (token) {
    message.success(`已切换到: ${token.name}`);
    tokenStore.selectToken?.(tokenId);
    isTokenPopoverOpen.value = false;
  }
};

// 刷新Token列表
const refreshTokens = () => {
  message.info('刷新Token列表...');
  // 这里可以触发重新获取Token状态
};

// 底部导航项
const bottomNavItems = computed(() => [
  {
    path: '/admin/dashboard',
    icon: Home,
    label: '首页'
  },
  {
    path: '/admin/game-features',
    icon: Apps,
    label: '功能'
  },
  {
    path: '/tokens',
    icon: Person,
    label: 'Token'
  },
  {
    path: '/admin/batch-daily-tasks',
    icon: Layers,
    label: '批量'
  },
  {
    path: '/admin/message-test',
    icon: Mail,
    label: '消息'
  }
]);

// 检查当前路由是否激活
const isActiveRoute = (path) => {
  return route.path === path || route.path.startsWith(path + '/');
};

const userMenuOptions = [
  {
    label: "清除所有Token并退出",
    key: "logout",
  },
];

// 方法
const handleUserAction = async (key) => {
  switch (key) {
    case "logout":
      await tokenStore.clearAllTokens();
      message.success("已清除所有Token");
      router.push("/tokens");
      break;
  }
};
</script>

<style scoped lang="scss">
// 导航栏 - 使用新的设计令牌
.dashboard-nav {
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border-default);
  padding: 0 var(--space-6);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
}

.dark .dashboard-nav {
  background: rgba(15, 23, 42, 0.9);
}

.nav-container {
  display: flex;
  align-items: center;
  height: 64px;
  max-width: 1400px;
  margin: 0 auto;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: var(--space-8);
}

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-normal) var(--ease-out);

  &:hover {
    transform: scale(1.05) rotate(5deg);
  }
}

.brand-text {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-toggle {
  display: none;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-xl);
}

.brand-toggle .n-icon {
  font-size: inherit;
}

.nav-menu {
  display: flex;
  gap: var(--space-2);
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 0;
    height: 2px;
    background: var(--color-primary-500);
    transition: all var(--duration-normal) var(--ease-out-expo);
    transform: translateX(-50%);
  }

  &:hover {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);

    &::before {
      width: 60%;
    }
  }

  &.active {
    background: var(--color-primary-50);
    color: var(--color-primary-600);

    &::before {
      width: 60%;
    }
  }
}

.nav-user {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.token-selector {
  .token-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-xl);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out-expo);
    box-shadow: var(--shadow-sm);

    &:hover,
    &.is-active {
      border-color: var(--color-primary-300);
      background: var(--color-bg-tertiary);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .token-name {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .token-chevron {
      transition: transform var(--transition-fast);
      
      &.is-open {
        transform: rotate(180deg);
      }
    }
  }
}

// Token下拉面板
.token-dropdown-panel {
  width: 280px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.token-search {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-light);
}

.token-group-tabs {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-light);
}

.token-list {
  flex: 1;
  overflow-y: auto;
  max-height: 240px;
  padding: var(--spacing-xs);
}

.token-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-secondary);
  }

  &.is-selected {
    background: var(--primary-color-light);
  }
}

.token-item-avatar {
  position: relative;
  
  .token-status {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-tertiary);
    border: 2px solid var(--bg-primary);
    
    &.is-online {
      background: var(--success-color);
    }
  }
}

.token-item-info {
  flex: 1;
  min-width: 0;
}

.token-item-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-item-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: 2px;
}

.token-level {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.token-check {
  color: var(--primary-color);
}

.token-empty {
  padding: var(--spacing-lg);
}

.token-actions {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-light);
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: background var(--transition-fast);
  color: var(--text-secondary);

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.username {
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .nav-item span {
    display: none;
  }

  .nav-menu {
    display: none;
  }

  .nav-item {
    padding: var(--spacing-sm);
    flex: 0 0 auto;
  }

  .nav-container {
    height: 56px;
  }

  .brand-logo {
    display: none;
  }

  .brand-toggle {
    display: inline-flex;
  }
  
  .token-selector .token-trigger .token-name {
    max-width: 80px;
  }
  
  .token-dropdown-panel {
    width: 260px;
  }
}

.drawer-menu {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
}

.drawer-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-medium);
  color: var(--text-secondary);
  text-decoration: none;
}

.drawer-item.router-link-active {
  background: var(--primary-color-light);
  color: var(--primary-color);
}

/* 禁用样式：灰化、鼠标禁止、无hover效果 */
.nav-item.disabled {
  background: #cccccc;
  color: #999999;
  cursor: not-allowed; /* 鼠标样式：禁止 */
  pointer-events: none; /* 可选：直接禁用所有鼠标事件（比阻止click更彻底） */
}

// 移动端底部导航栏
.mobile-bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-light);
  z-index: var(--z-sticky);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--transition-fast);
  min-height: 44px; // 触摸区域最小高度
  
  &:hover,
  &.active {
    color: var(--primary-color);
  }
  
  &.active {
    background: var(--primary-color-light);
  }
  
  .n-icon {
    font-size: 20px;
  }
}

.bottom-nav-label {
  font-size: 10px;
  line-height: 1.2;
}

// 移动端适配
@media (max-width: 768px) {
  .mobile-bottom-nav {
    display: flex;
  }
  
  .main.has-bottom-nav {
    padding-bottom: 56px; // 为底部导航栏留出空间
  }
  
  .nav-item span {
    display: none;
  }

  .nav-menu {
    display: none;
  }

  .nav-item {
    padding: var(--spacing-sm);
    flex: 0 0 auto;
  }

  .nav-container {
    height: 56px;
  }

  .brand-logo {
    display: none;
  }

  .brand-toggle {
    display: inline-flex;
  }
}
</style>
