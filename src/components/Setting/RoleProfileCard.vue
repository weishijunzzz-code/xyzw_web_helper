<template>
  <div
    v-if="roleInfo && Object.keys(roleInfo).length > 0"
    class="role-profile-card"
    :class="rankInfo.class"
  >
    <div class="role-profile-content">
      <!-- 头像区域 -->
      <div class="avatar-container">
        <img
          :src="roleAvatar"
          :alt="roleInfo.name || '角色'"
          class="role-avatar"
          @error="handleAvatarError"
        />
      </div>

      <!-- 角色信息区域 -->
      <div class="role-info-section">
        <div class="role-name">{{ roleInfo.name || "未知角色" }}</div>
        <div class="role-stats">
          <span class="level-text">Lv.{{ roleInfo.level || 1 }}</span>
          <span class="power-value"
            >战力 {{ formatPower(roleInfo.power) }}</span
          >
        </div>
      </div>

      <!-- 段位信息 -->
      <div class="rank-section">
        <div class="rank-icon">{{ rankInfo.icon }}</div>
        <div class="rank-title">{{ rankInfo.title }}</div>
      </div>

      <!-- 进度条 -->
      <div class="progress-section">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${progressPercentage}%` }"
            :class="rankInfo.class"
          ></div>
        </div>
        <div class="progress-text">
          <span v-if="nextRankThreshold">{{ progressPercentage }}%</span>
          <span v-else>MAX</span>
        </div>
      </div>
    </div>

    <!-- 炫光边框 -->
    <div class="glow-border"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();

// 默认头像列表（当角色头像为空时随机选择）
const defaultAvatars = [
  "/icons/1733492491706148.png",
  "/icons/1733492491706152.png",
  "/icons/1736425783912140.png",
  "/icons/173746572831736.png",
  "/icons/174023274867420.png",
];

const roleAvatar = ref("");
const selectedDefaultAvatar = ref("");

// 战力段位配置
const powerRanks = [
  {
    min: 0,
    max: 1000000,
    title: "初出茅庐",
    description: "初登江湖，尚显青涩。",
    icon: "🌱",
    class: "rank-beginner",
    color: "#6b7280",
  },
  {
    min: 1000000,
    max: 10000000,
    title: "小有名气",
    description: "已有名声，立足江湖。",
    icon: "⚔️",
    class: "rank-known",
    color: "#10b981",
  },
  {
    min: 10000000,
    max: 100000000,
    title: "出入江湖",
    description: "身经百战，渐成人物。",
    icon: "🗡️",
    class: "rank-veteran",
    color: "#3b82f6",
  },
  {
    min: 100000000,
    max: 500000000,
    title: "纵横四方",
    description: "武艺精进，名震一域。",
    icon: "🏹",
    class: "rank-master",
    color: "#8b5cf6",
  },
  {
    min: 500000000,
    max: 2000000000,
    title: "盖世豪杰",
    description: "豪迈英勇，威震四方。",
    icon: "⚡",
    class: "rank-hero",
    color: "#f59e0b",
  },
  {
    min: 2000000000,
    max: 4000000000,
    title: "一方枭雄",
    description: "才智兼备，呼风唤雨。",
    icon: "👑",
    class: "rank-overlord",
    color: "#ef4444",
  },
  {
    min: 4000000000,
    max: 6000000000,
    title: "睥睨江湖",
    description: "实力深不可测，世人仰望。",
    icon: "🔱",
    class: "rank-supreme",
    color: "#ec4899",
  },
  {
    min: 6000000000,
    max: 9000000000,
    title: "独霸天下",
    description: "威势登峰造极，号令天下。",
    icon: "⚜️",
    class: "rank-emperor",
    color: "#dc2626",
  },
  {
    min: 9000000000,
    max: 15000000000,
    title: "不世之尊",
    description: "超凡入圣，江湖传说。",
    icon: "💎",
    class: "rank-legend",
    color: "#7c3aed",
  },
  {
    min: 15000000000,
    max: Infinity,
    title: "无极至尊",
    description: "超越传说，无人能及。",
    icon: "🌟",
    class: "rank-infinite",
    color: "#fbbf24",
  },
];

// 角色信息计算属性
const roleInfo = computed(() => {
  const gameData = tokenStore.gameData;
  if (gameData && gameData.roleInfo && gameData.roleInfo.role) {
    const role = gameData.roleInfo.role;
    return {
      roleId: role.roleId,
      name: role.name,
      headImg: role.headImg,
      level: role.level,
      power: role.power || role.fighting || 0, // 使用power或fighting字段作为战力
      exp: role.exp,
      vip: role.vip,
      diamond: role.diamond,
      gold: role.gold,
      energy: role.energy,
      maxEnergy: role.maxEnergy,
    };
  }
  return {};
});

// 计算当前段位信息
const rankInfo = computed(() => {
  const power = roleInfo.value.power || 0;
  const rank = powerRanks.find((rank) => power >= rank.min && power < rank.max);
  return rank || powerRanks[0];
});

// 计算下一个段位门槛
const nextRankThreshold = computed(() => {
  const currentRankIndex = powerRanks.findIndex(
    (rank) => rank === rankInfo.value,
  );
  if (currentRankIndex >= 0 && currentRankIndex < powerRanks.length - 1) {
    return powerRanks[currentRankIndex + 1].min;
  }
  return null;
});

// 计算当前段位的进度百分比
const progressPercentage = computed(() => {
  const power = roleInfo.value.power || 0;
  const currentRank = rankInfo.value;

  if (!nextRankThreshold.value) {
    return 100; // 已达最高段位
  }

  const rangeSize = nextRankThreshold.value - currentRank.min;
  const currentProgress = power - currentRank.min;
  const percentage = Math.min(
    100,
    Math.max(0, (currentProgress / rangeSize) * 100),
  );

  return Math.round(percentage);
});

// 格式化战力数值
const formatPower = (power) => {
  if (!power || power === 0) return "0";

  const yi = 100000000; // 1亿
  const wan = 10000; // 1万

  if (power >= yi) {
    const value = (power / yi).toFixed(1);
    return `${value}亿`;
  } else if (power >= wan) {
    const value = (power / wan).toFixed(1);
    return `${value}万`;
  } else {
    return power.toLocaleString();
  }
};

// 头像处理
const initializeAvatar = () => {
  if (roleInfo.value.headImg) {
    roleAvatar.value = roleInfo.value.headImg;
  } else {
    // 如果没有头像，生成一个稳定的随机头像
    if (!selectedDefaultAvatar.value) {
      const roleId = roleInfo.value.roleId || roleInfo.value.name || "default";
      const hash = Array.from(roleId.toString()).reduce((acc, char) => {
        return acc + char.charCodeAt(0);
      }, 0);
      const index = hash % defaultAvatars.length;
      selectedDefaultAvatar.value = defaultAvatars[index];
    }
    roleAvatar.value = selectedDefaultAvatar.value;
  }
};

// 头像加载失败处理
const handleAvatarError = () => {
  if (!selectedDefaultAvatar.value) {
    const index = Math.floor(Math.random() * defaultAvatars.length);
    selectedDefaultAvatar.value = defaultAvatars[index];
  }
  roleAvatar.value = selectedDefaultAvatar.value;
};

// 初始化和数据加载
const loadRoleData = async () => {
  if (!tokenStore.selectedToken) return;

  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);

  if (status === "connected") {
    // 优先请求角色信息
    try {
      await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    } catch (error) {}
  }
};

// 组件挂载时初始化
onMounted(async () => {
  initializeAvatar();
  await loadRoleData();
});

// 监听角色信息变化
watch(() => roleInfo.value, initializeAvatar, { deep: true, immediate: true });

// 监听Token变化
watch(
  () => tokenStore.selectedToken,
  async (newToken) => {
    if (newToken) {
      await loadRoleData();
    }
  },
  { immediate: true },
);

// 监听WebSocket状态变化
const wsStatus = computed(() => {
  if (!tokenStore.selectedToken) return "disconnected";
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
});

watch(wsStatus, async (newStatus) => {
  if (newStatus === "connected" && tokenStore.selectedToken) {
    await loadRoleData();
  }
});
</script>

<style scoped lang="scss">
.role-profile-card {
  position: relative;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-large);
  background: linear-gradient(
    135deg,
    var(--bg-primary) 0%,
    rgba(102, 126, 234, 0.03) 100%
  );
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);

    .glow-border {
      opacity: 1;
    }
  }
}

.role-profile-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  position: relative;
  z-index: 3;
  height: 60px;
}

.avatar-container {
  position: relative;
  flex-shrink: 0;
}

.role-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  object-fit: cover;
  background: var(--bg-tertiary);
}

.role-info-section {
  flex: 1;
  min-width: 0;
  max-width: 160px;
}

.role-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.role-stats {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.level-text {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  line-height: 1.2;
}

.power-value {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--primary-color);
  line-height: 1.2;
  white-space: nowrap;
}

.rank-section {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--border-radius-medium);
  backdrop-filter: blur(10px);
  max-width: 80px;
}

.rank-icon {
  font-size: 14px;
  line-height: 1;
}

.rank-title {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  width: 50px;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
  background: linear-gradient(
    90deg,
    var(--primary-color),
    rgba(102, 126, 234, 0.8)
  );
}

.progress-text {
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  line-height: 1;
}

// 炫光边框
.glow-border {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    45deg,
    rgba(102, 126, 234, 0.4),
    rgba(118, 75, 162, 0.4),
    rgba(254, 202, 87, 0.4),
    rgba(102, 126, 234, 0.4)
  );
  background-size: 300% 300%;
  border-radius: var(--border-radius-large);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 1;
  animation: glowAnimation 3s ease-in-out infinite;

  &::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    right: 2px;
    bottom: 2px;
    background: var(--bg-primary);
    border-radius: calc(var(--border-radius-large) - 2px);
    z-index: 2;
  }
}

@keyframes glowAnimation {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

// 段位特定样式
.rank-beginner {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  .progress-fill {
    background: linear-gradient(90deg, #6b7280, #9ca3af);
  }
}

.rank-known {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  .progress-fill {
    background: linear-gradient(90deg, #10b981, #34d399);
  }
}

.rank-veteran {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  .progress-fill {
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
  }
}

.rank-master {
  background: linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%);
  .progress-fill {
    background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  }
}

.rank-hero {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  .progress-fill {
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
  }
}

.rank-overlord {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  .progress-fill {
    background: linear-gradient(90deg, #ef4444, #f87171);
  }
}

.rank-supreme {
  background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
  .progress-fill {
    background: linear-gradient(90deg, #ec4899, #f472b6);
  }
}

.rank-emperor {
  background: linear-gradient(135deg, #fee2e2 0%, #dc2626 20%);
  .progress-fill {
    background: linear-gradient(90deg, #dc2626, #ef4444);
  }
}

.rank-legend {
  background: linear-gradient(135deg, #ede9fe 0%, #7c3aed 30%);
  .progress-fill {
    background: linear-gradient(90deg, #7c3aed, #8b5cf6);
  }
}

.rank-infinite {
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 30%, #f59e0b 100%);
  animation: shimmer 3s ease-in-out infinite;
  .progress-fill {
    background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24);
    animation: pulse 2s ease-in-out infinite;
  }
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

// 深色主题优化
[data-theme="dark"] .role-profile-card {
  background: linear-gradient(
    135deg,
    var(--bg-secondary) 0%,
    rgba(102, 126, 234, 0.08) 100%
  );

  .role-name {
    color: #ffffff;
  }

  .level-text {
    color: rgba(255, 255, 255, 0.7);
  }

  .power-value {
    color: #60a5fa;
  }

  .rank-title {
    color: #ffffff;
  }

  .progress-text {
    color: rgba(255, 255, 255, 0.6);
  }

  .rank-section {
    background: rgba(255, 255, 255, 0.05);
  }

  .progress-bar {
    background: rgba(255, 255, 255, 0.1);
  }

  // 深色主题段位背景优化
  &.rank-beginner {
    background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
  }

  &.rank-known {
    background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
  }

  &.rank-veteran {
    background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%);
  }

  &.rank-master {
    background: linear-gradient(135deg, #581c87 0%, #6b21a8 100%);
  }

  &.rank-hero {
    background: linear-gradient(135deg, #92400e 0%, #b45309 100%);
  }

  &.rank-overlord {
    background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%);
  }

  &.rank-supreme {
    background: linear-gradient(135deg, #be185d 0%, #db2777 100%);
  }

  &.rank-emperor {
    background: linear-gradient(135deg, #991b1b 0%, #b91c1c 100%);
  }

  &.rank-legend {
    background: linear-gradient(135deg, #581c87 0%, #6b21a8 100%);
  }

  &.rank-infinite {
    background: linear-gradient(135deg, #92400e 0%, #d97706 50%, #f59e0b 100%);
  }
}

// 响应式设计
@media (max-width: 768px) {
  .role-profile-content {
    gap: var(--spacing-xs);
    height: 50px;
  }

  .role-avatar {
    width: 40px;
    height: 40px;
  }

  .role-info-section {
    max-width: 120px;
  }

  .role-name {
    font-size: 12px;
  }

  .level-text,
  .power-value {
    font-size: 10px;
  }

  .rank-section {
    max-width: 70px;
    padding: 2px 6px;
  }

  .rank-title {
    font-size: 10px;
  }

  .progress-section {
    width: 40px;
  }

  .progress-text {
    font-size: 9px;
  }
}
</style>
