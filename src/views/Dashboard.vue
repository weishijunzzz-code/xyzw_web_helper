<template>
  <div class="dashboard-page">
    <!-- 主要内容 -->
    <main class="dashboard-main">
      <div class="main-container">
        <!-- 骨架屏加载状态 -->
        <template v-if="isLoading">
          <section class="welcome-section">
            <SkeletonCard :rows="2" :showHeader="false" />
          </section>
          <section class="quick-actions-section">
            <h2 class="section-title">快速操作</h2>
            <div class="actions-grid">
              <SkeletonCard 
                v-for="i in 4" 
                :key="i" 
                :rows="2" 
                :showHeader="false"
              />
            </div>
          </section>
        </template>

        <!-- 实际内容 -->
        <template v-else>
          <!-- 欢迎区域 -->
          <section class="welcome-section">
            <div class="welcome-content">
              <div class="welcome-text">
                <h1>
                  欢迎回来，{{ tokenStore.selectedToken?.name || "游戏玩家" }}！
                </h1>
                <p>今天是 {{ currentDate }}，继续您的游戏管理之旅吧</p>
              </div>
              <div class="welcome-actions">
                <n-button
                  type="primary"
                  size="large"
                  @click="router.push('/admin/game-features')"
                >
                  进入游戏功能
                </n-button>
                <n-button size="large" @click="handleManageTokens">
                  管理Token
                </n-button>
              </div>
            </div>
          </section>

          <!-- 统计卡片区域 -->
          <section class="stats-section" v-if="tokenStore.hasTokens">
            <h2 class="section-title">数据概览</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon">
                  <PersonCircle />
                </div>
                <div class="stat-number">
                  <AnimatedNumber :value="tokenCount" :duration="1000" />
                </div>
                <div class="stat-label">已添加Token</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">
                  <CheckmarkCircle />
                </div>
                <div class="stat-number">
                  <AnimatedNumber :value="connectedCount" :duration="1000" />
                </div>
                <div class="stat-label">已连接</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">
                  <Time />
                </div>
                <div class="stat-number">
                  <AnimatedNumber :value="todayTasks" :duration="1000" />
                </div>
                <div class="stat-label">今日任务</div>
              </div>
            </div>
          </section>

          <!-- 快速操作 -->
          <section class="quick-actions-section">
            <h2 class="section-title">快速操作</h2>
            <div class="actions-grid">
              <div
                v-for="action in quickActions"
                :key="action.id"
                class="action-card"
                @click="handleQuickAction(action)"
              >
                <div class="action-icon">
                  <component :is="action.icon" />
                </div>
                <div class="action-content">
                  <h3>{{ action.title }}</h3>
                  <p>{{ action.description }}</p>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import SkeletonCard from "@/components/Common/SkeletonCard.vue";
import AnimatedNumber from "@/components/Common/AnimatedNumber.vue";
import {
  PersonCircle,
  Cube,
  Settings,
  CheckmarkCircle,
  Time,
  TrendingUp,
  Add,
  Cloud,
} from "@vicons/ionicons5";

const router = useRouter();
const message = useMessage();
const tokenStore = useTokenStore();

// 响应式数据
const isLoading = ref(true);
// const recentActivities = ref([]);

// 计算属性
const currentDate = computed(() => {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
});

// 统计数据
const tokenCount = computed(() => {
  return Object.keys(tokenStore.gameTokens || {}).length;
});

const connectedCount = computed(() => {
  return Object.keys(tokenStore.gameTokens || {}).filter(id => {
    return tokenStore.getWebSocketStatus?.(id) === 'connected';
  }).length;
});

const todayTasks = computed(() => {
  // 这里可以根据实际需求计算今日任务数
  return Math.floor(Math.random() * 10) + 5; // 示例数据
});

const quickActions = ref([
  {
    id: 1,
    icon: Cube,
    title: "游戏功能",
    description: "访问所有游戏功能模块",
    action: "game-features",
  },
  {
    id: 2,
    icon: Add,
    title: "添加Token",
    description: "快速添加新的游戏Token",
    action: "add-token",
  },
  {
    id: 3,
    icon: CheckmarkCircle,
    title: "批量任务",
    description: "批量执行任务",
    action: "batch-daily-tasks",
  },
  {
    id: 4,
    icon: Cloud,
    title: "WebSocket测试",
    description: "测试WebSocket连接和游戏命令",
    action: "websocket-test",
  },
]);

const handleManageTokens = () => {
  // 降噪
  /* 当前Token状态:
    hasTokens: tokenStore.hasTokens,
    selectedToken: tokenStore.selectedToken?.name,
    tokenCount: tokenStore.gameTokens.length
  */

  try {
    router.push("/tokens");
    // 降噪
  } catch (error) {
    console.error("❌ 导航失败:", error);
    message.error("导航到Token管理页面失败");
  }
};

const handleQuickAction = (action) => {
  switch (action.action) {
    case "game-features":
      router.push("/admin/game-features");
      break;
    case "add-token":
      handleManageTokens();
      break;
    case "execute-tasks":
      router.push("/admin/game-features");
      break;
    case "websocket-test":
      router.push("/websocket-test");
      break;
    case "open-settings":
      router.push("/admin/profile");
      break;
    case "batch-daily-tasks":
      router.push("/admin/batch-daily-tasks");
      break;
  }
};

/*
const getActivityIcon = (type) => {
  switch (type) {
    case "success":
      return CheckmarkCircle;
    case "warning":
      return Time;
    case "info":
    default:
      return Cube;
  }
};

const formatTime = (timestamp) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return "刚刚";
  }
};
*/

// 生命周期
onMounted(async () => {
  // 模拟加载延迟，展示骨架屏效果
  setTimeout(() => {
    isLoading.value = false;
  }, 800);

  // 确保有Token
  if (!tokenStore.hasTokens) {
    router.push("/tokens");
    return;
  }

  // 初始化Token数据
  tokenStore.initTokenStore();
});
</script>

<style scoped lang="scss">
.dashboard-page {
  min-height: 100vh;
  background: var(--bg-secondary);
}

// 主要内容
.dashboard-main {
  padding: var(--spacing-xl);
}

.main-container {
  max-width: 1400px;
  margin: 0 auto;
}

// 欢迎区域
.welcome-section {
  background: linear-gradient(
    135deg,
    var(--primary-color) 0%,
    var(--secondary-color) 100%
  );
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-2xl);
  margin-bottom: var(--spacing-xl);
  color: white;
}

.welcome-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
}

.welcome-text {
  h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-sm);
  }

  p {
    font-size: var(--font-size-lg);
    opacity: 0.9;
    margin: 0;
  }
}

.welcome-actions {
  display: flex;
  gap: var(--spacing-md);
}

// 统计区域
.stats-section {
  margin-bottom: var(--spacing-xl);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-lg);
}

.stat-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-light);
  transition: all var(--transition-normal);

  &:hover {
    box-shadow: var(--shadow-medium);
    transform: translateY(-2px);
  }
}

.stat-icon {
  width: 48px;
  height: 48px;
  margin-bottom: var(--spacing-md);

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.stat-number {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-xs);
}

.stat-change {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);

  &.positive {
    color: var(--success-color);
  }

  &.negative {
    color: var(--error-color);
  }
}

// 快速操作区域
.quick-actions-section {
  margin-bottom: var(--spacing-xl);
}

.section-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-lg);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-lg);
}

.action-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-light);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    box-shadow: var(--shadow-medium);
    transform: translateY(-2px);
  }
}

.action-icon {
  width: 40px;
  height: 40px;
  color: var(--primary-color);
  margin-bottom: var(--spacing-md);

  :deep(svg) {
    width: 100%;
    height: 100%;
  }
}

.action-content {
  h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin-bottom: var(--spacing-xs);
  }

  p {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }
}

// 最近活动区域
.recent-activity-section {
  background: var(--bg-primary);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-light);
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.activity-item {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-medium);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--bg-tertiary);
  }
}

.activity-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.success {
    background: rgba(24, 160, 88, 0.1);
    color: var(--success-color);
  }

  &.warning {
    background: rgba(240, 160, 32, 0.1);
    color: var(--warning-color);
  }

  &.info {
    background: rgba(32, 128, 240, 0.1);
    color: var(--info-color);
  }

  :deep(svg) {
    width: 16px;
    height: 16px;
  }
}

.activity-content {
  flex: 1;
}

.activity-text {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-xs);
}

.activity-time {
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.empty-activity {
  text-align: center;
  padding: var(--spacing-xl) 0;
}

// 响应式设计
@media (max-width: 1024px) {
  .welcome-content {
    flex-direction: column;
    text-align: center;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
}

@media (max-width: 768px) {
  .dashboard-main {
    padding: var(--spacing-md);
  }

  .nav-menu {
    display: none;
  }

  .welcome-section {
    padding: var(--spacing-xl);
  }

  .welcome-text h1 {
    font-size: var(--font-size-2xl);
  }

  .welcome-actions {
    flex-direction: column;
    width: 100%;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
