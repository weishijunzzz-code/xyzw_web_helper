<template>
  <div class="default-layout" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- 左侧导航栏（桌面端） -->
    <aside
      class="layout-sidebar"
      :class="{ collapsed: isSidebarCollapsed }"
    >
      <div class="sidebar-brand">
        <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo" />
        <span v-if="!isSidebarCollapsed" class="brand-text">XYZW 控制台</span>
      </div>

      <div class="sidebar-nav">
        <template v-for="group in sidebarGroups" :key="group.label">
          <div v-if="!isSidebarCollapsed" class="nav-group-label">
            {{ group.label }}
          </div>
          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="side-item"
            active-class="active"
            :title="isSidebarCollapsed ? item.label : undefined"
          >
            <n-icon size="20">
              <component :is="item.icon" />
            </n-icon>
            <span v-if="!isSidebarCollapsed" class="side-label">{{ item.label }}</span>
          </router-link>
        </template>
      </div>

      <div class="sidebar-footer">
        <!-- 调试设置 - 仅在原生应用显示 -->
        <div
          v-if="isNativePlatform"
          class="side-item debug-item"
          :title="isSidebarCollapsed ? '调试设置' : undefined"
          @click="openDebugSettings"
        >
          <n-icon size="20">
            <BugOutline />
          </n-icon>
          <span v-if="!isSidebarCollapsed" class="side-label">调试设置</span>
          <n-switch
            v-if="!isSidebarCollapsed"
            :value="debugEnabled"
            size="small"
            @update:value="toggleDebug"
            @click.stop
          />
        </div>
        <button
          class="side-item collapse-toggle"
          :title="isSidebarCollapsed ? '展开菜单' : '收起菜单'"
          @click="toggleSidebar"
        >
          <n-icon size="20" class="collapse-icon" :class="{ 'is-collapsed': isSidebarCollapsed }">
            <ChevronBack />
          </n-icon>
          <span v-if="!isSidebarCollapsed" class="side-label">收起菜单</span>
        </button>
      </div>
    </aside>

    <!-- 右侧主体 -->
    <div class="layout-body">
      <!-- 顶部工具栏 -->
      <header class="topbar">
        <div class="topbar-left">
          <!-- 移动端汉堡菜单 -->
          <button
            v-if="isMobile"
            class="topbar-icon-btn"
            @click="isMobileMenuOpen = true"
          >
            <n-icon size="20">
              <Menu />
            </n-icon>
          </button>
          <router-link to="/admin/dashboard" class="topbar-brand" v-if="isMobile">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo-sm" />
            <span>XYZW</span>
          </router-link>
        </div>

        <div class="topbar-right">
          <!-- 全局搜索 -->
          <GlobalSearch ref="globalSearchRef" class="topbar-search" />

          <!-- 活动日历 -->
          <span class="topbar-calendar">
            <ActivityCalendarDropdown />
          </span>

          <!-- 主题设置按钮 -->
          <ThemeSettings />

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
            <div class="topbar-icon-btn">
              <n-icon size="18">
                <Settings />
              </n-icon>
            </div>
          </n-dropdown>
        </div>
      </header>

      <!-- 面包屑导航 -->
      <BreadcrumbNav v-if="!isMobile" />

      <div class="main" :class="{ 'has-bottom-nav': isMobile }">
        <router-view v-slot="{ Component, route }">
          <PageTransition :name="route.meta.transition || 'fade-slide'">
            <KeepAlive include="PushingLevels">
              <component :is="Component" :key="route.path" />
            </KeepAlive>
          </PageTransition>
        </router-view>
      </div>
    </div>

    <!-- 移动端抽屉菜单 -->
    <n-drawer
      v-model:show="isMobileMenuOpen"
      placement="left"
      style="width: 260px"
    >
      <div class="drawer-menu">
        <router-link
          v-for="item in drawerItems"
          :key="item.path"
          :to="item.path"
          class="drawer-item"
          @click="isMobileMenuOpen = false"
        >
          <n-icon>
            <component :is="item.icon" />
          </n-icon>
          <span>{{ item.label }}</span>
        </router-link>
        <!-- 调试设置 - 仅在原生应用显示 -->
        <div
          v-if="isNativePlatform"
          class="drawer-item debug-settings-item"
          @click="openDebugSettings"
        >
          <n-icon>
            <BugOutline />
          </n-icon>
          <span>调试设置</span>
          <n-switch
            :value="debugEnabled"
            size="small"
            @update:value="toggleDebug"
            @click.stop
          />
        </div>
      </div>
    </n-drawer>

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
import ThemeSettings from "@/components/Common/ThemeSettings.vue";
import PageTransition from "@/components/DesignSystem/PageTransition.vue";
import GlobalSearch from "@/components/Common/GlobalSearch.vue";
import ActivityCalendarDropdown from "@/views/TaskScheduler/components/ActivityCalendarDropdown.vue";
import BreadcrumbNav from "@/components/Common/BreadcrumbNav.vue";
import { useMobile } from "@/composables/useMobile";
import {
  Home,
  PersonCircle,
  Cube,
  Settings,
  ChevronDown,
  ChevronBack,
  ChatbubbleEllipsesSharp,
  LockOpen,
  Menu,
  Layers,
  Apps,
  Person,
  Search,
  Checkmark,
  Refresh,
  TimerOutline,
  BugOutline,
  ArrowUpCircle,
  CloudCircleOutline,
} from "@vicons/ionicons5";
import { isNativePlatform } from "@/utils/capacitor";

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
const { isMobile } = useMobile();

// 启用键盘快捷键
useKeyboardShortcuts();

// ========== 侧边栏折叠状态（localStorage 持久化） ==========
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const isSidebarCollapsed = ref(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed.value));
};

// ========== 侧边栏导航分组 ==========
const sidebarGroups = computed(() => [
  {
    label: '总览',
    items: [
      { path: '/admin/dashboard', label: '首页', icon: Home },
    ],
  },
  {
    label: '游戏',
    items: [
      { path: '/admin/game-features', label: '游戏功能', icon: Cube },
      { path: '/admin/PushingLevels', label: '主线推关', icon: ArrowUpCircle },
      { path: '/multi-game', label: '游戏工作区', icon: ArrowUpCircle },
      ...(isNowInLegionWarTime()
        ? [{ path: '/admin/legion-war', label: '实时盐场', icon: LockOpen }]
        : []),
    ],
  },
  {
    label: '任务',
    items: [
      { path: '/admin/daily-tasks', label: '日常任务', icon: Settings },
      { path: '/admin/batch-daily-tasks', label: '批量日常', icon: Layers },
      { path: '/admin/task-scheduler', label: '定时任务', icon: TimerOutline },
      { path: '/admin/cloud-tasks', label: '云端任务', icon: CloudCircleOutline },
    ],
  },
  {
    label: '管理',
    items: [
      { path: '/tokens', label: 'Token管理', icon: PersonCircle },
      { path: '/admin/profile', label: '个人设置', icon: Person },
      { path: '/admin/message-test', label: '消息测试', icon: ChatbubbleEllipsesSharp },
    ],
  },
]);

// 移动端抽屉菜单项（与侧边栏一致 + 分组平铺）
const drawerItems = computed(() => sidebarGroups.value.flatMap(g => g.items));

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

// 底部导航项 - 优化移动端导航结构
const bottomNavItems = computed(() => {
  const items = [
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
      path: '/admin/task-scheduler',
      icon: TimerOutline,
      label: '定时'
    },
    {
      path: '/admin/batch-daily-tasks',
      icon: Layers,
      label: '批量'
    },
    {
      path: '/admin/cloud-tasks',
      icon: CloudCircleOutline,
      label: '云端'
    }
  ];

  // 盐场时间显示实时盐场入口
  if (isNowInLegionWarTime()) {
    items.splice(4, 0, {
      path: '/admin/legion-war',
      icon: LockOpen,
      label: '盐场'
    });
  }

  return items;
});

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

// 调试设置
const debugEnabled = ref(false);

// 从 localStorage 读取调试状态
const loadDebugState = () => {
  debugEnabled.value = localStorage.getItem('enableDebugPanel') === 'true';
};

// 切换调试开关
const toggleDebug = (value) => {
  localStorage.setItem('enableDebugPanel', value.toString());
  debugEnabled.value = value;
  message.success(value ? '调试按钮已开启' : '调试按钮已关闭');
};

// 打开调试设置（点击菜单项时）
const openDebugSettings = () => {
  // 切换开关状态
  toggleDebug(!debugEnabled.value);
};

// 初始化
loadDebugState();
</script>

<style scoped lang="scss">
// ============================================================
// 布局骨架：左侧可折叠侧边栏 + 顶部工具栏（现代控制台风格）
// ============================================================
.default-layout {
  display: flex;
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
}

// ---------- 侧边栏 ----------
.layout-sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-sticky);
  display: flex;
  flex-direction: column;
  width: 240px;
  background: var(--color-bg-elevated, var(--bg-primary));
  border-right: 1px solid var(--color-border-default, var(--border-light));
  transition: width 0.2s var(--ease-out, ease);

  &.collapsed {
    width: 64px;

    .sidebar-brand {
      justify-content: center;
      padding: 0;
    }

    .sidebar-nav {
      padding: var(--space-2, 8px) var(--space-2, 8px);
    }

    .side-item {
  position: relative;
      justify-content: center;
      padding: 10px 0;
    }
  }
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  height: 60px;
  padding: 0 var(--space-4, 16px);
  border-bottom: 1px solid var(--color-border-default, var(--border-light));
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-lg, 8px);
  flex-shrink: 0;
}

.brand-text {
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--font-weight-bold, 700);
  white-space: nowrap;
  color: var(--color-text-primary, var(--text-primary));
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-3, 12px) var(--space-2, 8px);
}

.nav-group-label {
  padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-1, 4px);
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-tertiary, var(--text-tertiary));
  white-space: nowrap;
}

.side-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: 10px var(--space-3, 12px);
  margin-bottom: 2px;
  border-radius: var(--radius-lg, 8px);
  color: var(--color-text-secondary, var(--text-secondary));
  text-decoration: none;
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  border: none;
  background: transparent;
  width: 100%;

  &:hover {
    background: var(--color-bg-secondary, var(--bg-secondary));
    color: var(--color-text-primary, var(--text-primary));
  }

  &.active {
    background: transparent;
    color: var(--primary-color);
    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 10px;
      bottom: 10px;
      width: 3px;
      border-radius: 999px;
      background: var(--primary-color);
    }
    font-weight: var(--font-weight-semibold, 600);
  }

  .n-icon {
    flex-shrink: 0;
  }
}

.side-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  flex-shrink: 0;
  padding: var(--space-2, 8px);
  border-top: 1px solid var(--color-border-default, var(--border-light));
}

.debug-item {
  .n-switch {
    margin-left: auto;
  }
}

.collapse-toggle {
  color: var(--color-text-tertiary, var(--text-tertiary));

  &:hover {
    color: var(--color-text-primary, var(--text-primary));
  }
}

.collapse-icon {
  transition: transform 0.2s ease;

  &.is-collapsed {
    transform: rotate(180deg);
  }
}

// ---------- 右侧主体 ----------
.layout-body {
  flex: 1;
  min-width: 0;
  margin-left: 240px;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.2s var(--ease-out, ease);
}

.default-layout.sidebar-collapsed .layout-body {
  margin-left: 64px;
}

@media (max-width: 768px) {
  // 移动端无侧边栏，折叠态的偏移一并归零
  .default-layout.sidebar-collapsed .layout-body {
    margin-left: 0;
  }
}

// ---------- 顶部工具栏 ----------
.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  height: 60px;
  padding: 0 var(--space-6, 24px);
  background: var(--color-bg-elevated, var(--bg-primary));
  border-bottom: 1px solid var(--color-border-default, var(--border-light));
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-width: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  text-decoration: none;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text-primary, var(--text-primary));
}

.brand-logo-sm {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md, 6px);
}

.topbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-lg, 8px);
  background: transparent;
  color: var(--color-text-secondary, var(--text-secondary));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--color-bg-secondary, var(--bg-secondary));
    color: var(--color-text-primary, var(--text-primary));
  }
}

// ---------- Token 选择器 ----------
.token-selector {
  .token-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-radius: var(--radius-full, 9999px);
    background: var(--color-bg-secondary, var(--bg-secondary));
    border: 1px solid var(--color-border-default, var(--border-light));
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover,
    &.is-active {
      border-color: var(--color-border-active, var(--primary-color));
      background: var(--color-bg-tertiary, var(--bg-tertiary));
    }

    .token-name {
      font-size: var(--font-size-sm, 14px);
      color: var(--color-text-primary, var(--text-primary));
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .token-chevron {
      transition: transform var(--transition-fast, 0.15s ease);

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

// ---------- 主内容区域 ----------
.main {
  position: relative;
  z-index: 1;
  flex: 1;
  background: var(--color-bg-secondary, var(--bg-secondary));
  min-height: calc(100vh - 60px);
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 768px) {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;

    // Density is controlled by spacing, preserving readable text and touch sizes.
  }
}

// ---------- 移动端 ----------
@media (max-width: 768px) {
  // 侧边栏隐藏，改用抽屉 + 底部导航
  .layout-sidebar {
    display: none;
  }

  .layout-body {
    margin-left: 0;
  }

  .topbar {
    height: 56px;
    padding: 0 var(--spacing-sm);
  }

  // 顶栏收敛：隐藏搜索入口（保留抽屉导航与快捷键），日历只留图标
  .topbar-search {
    display: none;

    // GlobalSearch 为多根组件时 class 不会透传，兜底隐藏内部触发按钮
    :deep(.search-trigger) {
      display: none;
    }
  }

  .topbar-calendar {
    :deep(.activity-calendar-btn) {
      padding: 0;
      border-radius: var(--radius-md, 6px);
    }

    :deep(.btn-text) {
      display: none !important;
    }
  }

  .token-selector .token-trigger .token-name {
    display: none;
  }
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
  font-size: 12px;
  line-height: 1.2;
}

@media (max-width: 768px) {
  .mobile-bottom-nav {
    display: flex;
  }

  .main.has-bottom-nav {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0));
  }
}

// ---------- 抽屉菜单 ----------
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
  background: transparent;
  border-left: 3px solid var(--primary-color);
  color: var(--primary-color);
}

// 调试设置项样式
.drawer-item.debug-settings-item {
  cursor: pointer;
  justify-content: space-between;

  &:hover {
    background: var(--bg-secondary);
  }

  .n-switch {
    margin-left: auto;
  }
}

/* 禁用样式：灰化、鼠标禁止、无hover效果 */
.side-item.disabled,
.drawer-item.disabled {
  background: #cccccc;
  color: #999999;
  cursor: not-allowed;
  pointer-events: none;
}
</style>
