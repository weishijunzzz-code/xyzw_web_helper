<template>
  <div class="daily-tasks-page">
    <!-- SaaS 工具栏 -->
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <h1 class="page-title">日常任务</h1>
            <p class="page-subtitle">
              管理和执行当前账号的日常游戏任务
              <template v-if="accountName"> · {{ accountName }}</template>
            </p>
          </div>
          <div class="header-actions">
            <n-tag :type="isConnected ? 'success' : 'error'" size="small">
              {{ isConnected ? "已连接" : "未连接" }}
            </n-tag>
            <n-button
              v-if="!isConnected && tokenStore.selectedToken"
              size="small"
              type="primary"
              ghost
              :loading="connecting"
              @click="connectSelectedToken"
            >
              连接游戏服务
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 日常状态卡片组（与游戏功能页「日常」标签一致，基于当前选中账号的真实数据） -->
    <div class="container">
      <div class="daily-grid">
        <TeamFormation />
        <DailyTaskStatus />
        <TowerStatus v-if="isShowTowerStatus" />
        <WeirdTowerStatus />
        <BottleHelperCard />
        <HangUpStatusCard />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { gameTokens } from "@/stores/tokenStore";
import TeamFormation from "@/components/Team/TeamFormation.vue";
import DailyTaskStatus from "@/components/Daily/DailyTaskStatus.vue";
import TowerStatus from "@/components/Tower/TowerStatus.vue";
import WeirdTowerStatus from "@/components/Tower/WeirdTowerStatus.vue";
import BottleHelperCard from "@/components/cards/BottleHelperCard.vue";
import HangUpStatusCard from "@/components/cards/HangUpStatusCard.vue";

const message = useMessage();
const tokenStore = useTokenStore();
const connecting = ref(false);

const selectedToken = computed(() => tokenStore.selectedToken);
const accountName = computed(() => selectedToken.value?.name || "");

const isConnected = computed(() => {
  if (!selectedToken.value) return false;
  return (
    tokenStore.getWebSocketStatus(selectedToken.value.id) === "connected"
  );
});

// 咸将塔卡片显示条件（与 GameStatus 一致：高层数后隐藏）
const isShowTowerStatus = computed(() => {
  const tower = tokenStore.gameData?.roleInfo?.role?.tower;
  const floor = Math.floor((tower?.id || 0) / 10) + 1;
  return floor <= 450;
});

// 初始化当前账号的游戏数据（与 GameFeatures 一致）
const initializeGameData = async () => {
  if (!selectedToken.value) return;
  try {
    const tokenId = selectedToken.value.id;
    tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "tower_getinfo");
    tokenStore.sendMessage(tokenId, "evotower_getinfo");
    tokenStore.sendMessage(tokenId, "presetteam_getinfo");
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "fight_startlevel",
    );
    tokenStore.setBattleVersion(res?.battleData?.version);
  } catch (error) {
    // 静默处理初始化异常
  }
};

const connectSelectedToken = () => {
  if (!selectedToken.value) {
    message.warning("请先选择一个账号");
    return;
  }
  try {
    connecting.value = true;
    const tokenId = selectedToken.value.id;
    tokenStore.createWebSocketConnection(tokenId, selectedToken.value.token);
    setTimeout(async () => {
      connecting.value = false;
      if (tokenStore.getWebSocketStatus(tokenId) === "connected") {
        message.success("连接成功");
        await initializeGameData();
      }
    }, 2000);
  } catch (error) {
    connecting.value = false;
    console.error("WebSocket连接失败:", error);
    message.error("连接失败");
  }
};

onMounted(() => {
  // 未选择账号时自动选中第一个，避免页面空转
  if (!selectedToken.value && gameTokens.value.length > 0) {
    tokenStore.selectToken(gameTokens.value[0].id);
  }
  // 已选账号但未连接时自动建连，保证卡片拿到真实数据
  if (selectedToken.value) {
    const status = tokenStore.getWebSocketStatus(selectedToken.value.id);
    if (status !== "connected") {
      connectSelectedToken();
    } else {
      initializeGameData();
    }
  }
});
</script>

<style scoped lang="scss">
.daily-tasks-page {
  min-height: 100vh;
  padding-bottom: var(--spacing-xl);
  background: var(--bg-secondary);
}

/* SaaS 工具栏：白底描边，与控制台其他页面统一 */
.page-header {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
  padding: var(--spacing-lg) 0;
  color: var(--text-primary);
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--spacing-lg);
}

.header-left {
  flex: 1;
  min-width: 0;
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-xs);
  color: var(--text-primary);
}

.page-subtitle {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

/* 日常卡片组：与 GameStatus 一致的自适应网格 */
.daily-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) 0;

  // 移动端：允许列收缩 + 单列（否则宽内容会把列撑爆）
  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;

    > * {
      min-width: 0;
    }
  }
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--spacing-md);
  }

  .page-header {
    padding: var(--spacing-md) 0;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }
}
</style>
