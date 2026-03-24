<template>
  <MyCard class="recruit-helper" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img :src="iconPath" alt="招募图标" />
    </template>
    <template #title>
      <h3>招募助手</h3>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>
    <template #default>
      <div class="container">
        <!-- 招募令资源卡片 -->
        <div class="recruit-resource-card">
          <div class="resource-header">
            <div class="resource-title">招募令库存</div>
            <div class="resource-total">
              总计: <span class="total-value">{{ totalRecruitTokens }}</span>
            </div>
          </div>
          <div class="resource-item">
            <div class="item-icon-wrapper">
              <img :src="recruitItemImg" alt="招募令" />
            </div>
            <div class="item-info">
              <span class="item-name">招募令</span>
              <span class="item-count" :class="{ low: totalRecruitTokens < 10 }">
                {{ totalRecruitTokens }} 个
              </span>
            </div>
            <div class="item-status" v-if="totalRecruitTokens === 0">
              <span class="status-badge exhausted">已耗尽</span>
            </div>
            <div class="item-status" v-else-if="totalRecruitTokens < 10">
              <span class="status-badge warning">不足</span>
            </div>
          </div>
        </div>

        <!-- 活动层级进度 -->
        <div class="activity-tiers-info">
          <div class="tiers-header">
            <span class="tiers-title">活动层级进度</span>
            <span class="tiers-round">第 {{ currentRound }}/4 轮</span>
          </div>
          <div class="tiers-list">
            <div
              v-for="(tier, index) in activityTiers"
              :key="index"
              class="tier-item"
              :class="{ 
                completed: completedCount >= tier.threshold,
                current: isCurrentTier(tier.threshold)
              }"
            >
              <div class="tier-dot"></div>
              <span class="tier-value">{{ tier.value }}</span>
              <span v-if="index < activityTiers.length - 1" class="tier-line"></span>
            </div>
          </div>
          <div class="tiers-progress-bar">
            <div 
              class="tiers-fill" 
              :style="{ width: tierProgressPercentage + '%' }"
            ></div>
          </div>
          <div class="tiers-status">
            <span v-if="isMaxRoundCompleted" class="status-completed">本轮活动已完成（{{ completedCount }}/1600）</span>
            <span v-else-if="nextTierInfo">
              距离 {{ nextTierInfo.target }} 还差 {{ nextTierInfo.remaining }} 次
            </span>
            <span v-else>活动已完成</span>
          </div>
        </div>

        <!-- 模式切换 -->
        <n-tabs v-model:value="mode" type="segment" class="mode-tabs">
          <n-tab name="manual" tab="手动模式" />
          <n-tab name="auto" tab="自动模式" />
        </n-tabs>

        <!-- 手动模式 -->
        <div v-if="mode === 'manual'" class="manual-mode">
          <div class="config-row">
            <span class="config-label">招募次数</span>
            <n-select
              v-model:value="manualConfig.number"
              :options="numberOptions"
              style="width: 140px"
            />
          </div>
          <div class="config-hint">
            每次招募消耗 1 个招募令
          </div>
        </div>

        <!-- 自动模式 -->
        <div v-else class="auto-mode">
          <div class="target-input-row">
            <span class="input-label">目标次数</span>
            <n-input-number
              v-model:value="autoConfig.targetValue"
              :min="0"
              :step="10"
              :max="Math.min(10000, totalRecruitTokens)"
              placeholder="输入目标次数"
              style="width: 150px"
            />
            <n-button 
              size="tiny" 
              @click="setPresetTarget(Math.min(10, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 10"
            >
              10
            </n-button>
            <n-button 
              size="tiny" 
              @click="setPresetTarget(Math.min(1000, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 1000"
            >
              1000
            </n-button>
            <n-button 
              size="tiny" 
              @click="setPresetTarget(Math.min(2000, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 2000"
            >
              2000
            </n-button>
            <n-button 
              size="tiny" 
              @click="setPresetTarget(Math.min(3000, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 3000"
            >
              3000
            </n-button>
            <n-button 
              size="tiny" 
              @click="setPresetTarget(Math.min(4000, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 4000"
            >
              4000
            </n-button>
          </div>

          <div class="progress-stats">
            <div class="stat-item completed">
              <span class="stat-label">已完成</span>
              <span class="stat-value">
                <AnimatedNumber :value="autoConfig.completedValue" :duration="800" />
              </span>
            </div>
            <div class="stat-item remaining" v-if="remainingValue > 0">
              <span class="stat-label">剩余</span>
              <span class="stat-value">{{ remainingValue }}</span>
            </div>
            <div class="stat-item consumed" v-if="state.isRunning || autoConfig.completedValue > 0">
              <span class="stat-label">已消耗</span>
              <span class="stat-value">{{ autoConfig.completedValue }}</span>
            </div>
            <div class="stat-item time" v-if="state.isRunning">
              <span class="stat-label">运行时间</span>
              <span class="stat-value">{{ runningDuration }}</span>
            </div>
          </div>

          <!-- 进度条 -->
          <div class="progress-section" v-if="state.isRunning || autoConfig.completedValue > 0">
            <n-progress
              type="line"
              :percentage="progressPercentage"
              :indicator-placement="'inside'"
              :status="isCompleted ? 'success' : 'default'"
            />
            <span class="progress-text">{{ state.progressText }}</span>
          </div>
        </div>
      </div>
    </template>
    <template #action>
      <div class="actions">
        <template v-if="mode === 'manual'">
          <a-button
            type="primary"
            :disabled="state.isRunning || totalRecruitTokens === 0"
            secondary
            size="small"
            block
            @click="handleManualRecruit"
          >
            {{ state.isRunning ? "运行中" : "开始招募" }}
          </a-button>
        </template>
        <template v-else>
          <a-button
            type="primary"
            :disabled="!canStart || totalRecruitTokens === 0"
            secondary
            size="small"
            block
            @click="startAutoRecruit"
          >
            {{ state.isRunning ? "运行中..." : "开始自动招募" }}
          </a-button>
          <a-button
            v-if="state.isRunning"
            type="warning"
            size="small"
            @click="stopAuto"
          >
            停止
          </a-button>
          <a-button type="default" size="small" @click="reset">
            重置
          </a-button>
        </template>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, reactive, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { useHelperBase } from "@/composables/useHelperBase";
import MyCard from "../Common/MyCard.vue";
import AnimatedNumber from "../Common/AnimatedNumber.vue";

const tokenStore = useTokenStore();
const message = useMessage();

// 使用基础组合式函数
const {
  mode,
  manualConfig,
  autoConfig,
  state,
  remainingValue,
  progressPercentage,
  isCompleted,
  canStart,
  start,
  stop,
  reset,
  updateProgress,
  executeBatches,
  getRunningDuration,
  generateNumberOptions,
} = useHelperBase("recruit", {
  name: "招募",
  batchSize: 10,
  defaultTarget: 0,
  targetStep: 10,
});

// 初始化配置
manualConfig.number = 10;

const iconPath = computed(() => import.meta.env.BASE_URL + "icons/zml.png");
const recruitItemImg = computed(() => import.meta.env.BASE_URL + "icons/zml.png");
const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

// 招募令数量
const totalRecruitTokens = computed(() => {
  return roleInfo.value?.role?.items?.[1001]?.quantity || 0;
});

// 选项 - 支持大活动4000上限
const numberOptions = generateNumberOptions([10, 50, 100, 200, 400, 4000]);

// 活动层级配置：50-100-200-300-400，每轮400，最多4轮
const ACTIVITY_TIERS = [
  { value: 50, threshold: 50 },
  { value: 100, threshold: 100 },
  { value: 200, threshold: 200 },
  { value: 300, threshold: 300 },
  { value: 400, threshold: 400 },
];
const ROUND_TOTAL = 400; // 每轮400
const MAX_ROUNDS = 4; // 最多4轮

// 活动层级数据
const activityTiers = ref(ACTIVITY_TIERS);

// 已完成次数（从游戏数据获取，这里用completedValue模拟）
const completedCount = computed(() => autoConfig.completedValue);

// 当前轮次
const currentRound = computed(() => {
  return Math.min(MAX_ROUNDS, Math.floor(completedCount.value / ROUND_TOTAL) + 1);
});

// 当前轮次内的进度
const roundProgress = computed(() => {
  return completedCount.value % ROUND_TOTAL;
});

// 是否已完成最大轮次
const isMaxRoundCompleted = computed(() => {
  return completedCount.value >= MAX_ROUNDS * ROUND_TOTAL;
});

// 层级进度百分比
const tierProgressPercentage = computed(() => {
  if (isMaxRoundCompleted.value) return 100;
  const progress = roundProgress.value;
  return Math.min(100, (progress / ROUND_TOTAL) * 100);
});

// 判断是否是当前层级
const isCurrentTier = (threshold) => {
  const progress = roundProgress.value;
  const prevThreshold = threshold === 50 ? 0 : 
    ACTIVITY_TIERS.find(t => t.value === threshold - 50)?.threshold || 0;
  return progress >= prevThreshold && progress < threshold;
};

// 下一层级信息
const nextTierInfo = computed(() => {
  if (isMaxRoundCompleted.value) return null;
  const progress = roundProgress.value;
  for (const tier of ACTIVITY_TIERS) {
    if (progress < tier.threshold) {
      return {
        target: tier.value,
        remaining: tier.threshold - progress,
      };
    }
  }
  // 当前轮次已完成，进入下一轮
  return {
    target: '下一轮',
    remaining: ROUND_TOTAL - progress,
  };
});

// 运行时长
const runningDuration = ref("00:00");
let durationTimer = null;

const startDurationTimer = () => {
  durationTimer = setInterval(() => {
    runningDuration.value = getRunningDuration();
  }, 1000);
};

const stopDurationTimer = () => {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
};

// 设置预设目标
const setPresetTarget = (value) => {
  autoConfig.targetValue = Math.min(value, totalRecruitTokens.value);
};

// 手动招募
const handleManualRecruit = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    const count = Math.min(manualConfig.number, totalRecruitTokens.value);

    if (count <= 0) {
      message.warning("没有足够的招募令");
      return;
    }

    // 修复：使用 executeBatches 正确处理批量
    await executeBatches(
      count,
      async (batchSize) => {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_recruit", {
          recruitType: 1,
          recruitNumber: batchSize,
        });
      },
      {
        batchSize: 10,
        delay: 200,
      }
    );

    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("招募完毕");
  });

  if (success) {
    stop();
  }
};

// 自动招募（修复批量逻辑）
const startAutoRecruit = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    startDurationTimer();

    message.info("开始自动招募...");

    try {
      while (state.isRunning && remainingValue.value > 0) {
        const available = totalRecruitTokens.value;

        if (available <= 0) {
          message.warning("没有足够的招募令");
          break;
        }

        // 计算本次可执行的次数
        const canDo = Math.min(remainingValue.value, available);
        
        updateProgress(autoConfig.completedValue, autoConfig.targetValue);

        // 修复：使用 executeBatches 正确处理批量逻辑
        await executeBatches(
          canDo,
          async (batchSize) => {
            await tokenStore.sendMessageWithPromise(tokenId, "hero_recruit", {
              recruitType: 1,
              recruitNumber: batchSize,
            });
          },
          {
            batchSize: 10,
            delay: 200,
            onBatchComplete: async (batchSize, completed) => {
              autoConfig.completedValue = completed;
              updateProgress(completed, autoConfig.targetValue);
            },
          }
        );

        await tokenStore.sendMessage(tokenId, "role_getroleinfo");

        if (autoConfig.completedValue >= autoConfig.targetValue) {
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (autoConfig.completedValue >= autoConfig.targetValue) {
        message.success(`已达到目标次数 ${autoConfig.targetValue}！`);
      }
    } catch (error) {
      console.error("自动招募出错:", error);
      message.error("招募出错: " + error.message);
    } finally {
      stopDurationTimer();
    }
  });

  if (success) {
    stop();
  }
};

// 停止
const stopAuto = () => {
  stop(stopDurationTimer);
  message.info("已停止自动招募");
};

// 监听模式切换
watch(mode, () => {
  if (!state.isRunning) {
    reset();
  }
});

// 监听招募令变化，自动调整目标
watch(totalRecruitTokens, (newVal) => {
  if (mode.value === 'auto' && autoConfig.targetValue > newVal) {
    autoConfig.targetValue = newVal;
  }
});
</script>

<style scoped lang="scss">
.recruit-helper {
  .container {
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // 资源卡片
  .recruit-resource-card {
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);
    padding: 12px;

    .resource-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;

      .resource-title {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .resource-total {
        font-size: 12px;
        color: var(--text-secondary);

        .total-value {
          font-size: 16px;
          font-weight: var(--font-weight-bold);
          color: var(--primary-color);
        }
      }
    }

    .resource-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: var(--bg-secondary);
      border-radius: var(--border-radius-medium);

      .item-icon-wrapper {
        width: 48px;
        height: 48px;

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      }

      .item-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;

        .item-name {
          font-size: 14px;
          font-weight: var(--font-weight-medium);
          color: var(--text-primary);
        }

        .item-count {
          font-size: 13px;
          color: var(--text-secondary);

          &.low {
            color: #e6a23c;
            font-weight: var(--font-weight-bold);
          }
        }
      }

      .item-status {
        .status-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: var(--font-weight-medium);

          &.exhausted {
            background: var(--error-color-light);
            color: var(--error-color);
          }

          &.warning {
            background: var(--warning-color-light);
            color: var(--warning-color);
          }
        }
      }
    }
  }

  // 活动层级信息
  .activity-tiers-info {
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);
    padding: 12px;

    .tiers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;

      .tiers-title {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .tiers-round {
        font-size: 12px;
        color: var(--primary-color);
        font-weight: var(--font-weight-bold);
      }
    }

    .tiers-list {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      position: relative;

      .tier-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        position: relative;
        z-index: 1;

        .tier-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--bg-secondary);
          border: 2px solid var(--text-tertiary);
          transition: all 0.3s ease;
        }

        .tier-value {
          font-size: 10px;
          color: var(--text-secondary);
          font-weight: var(--font-weight-medium);
        }

        &.completed {
          .tier-dot {
            background: #18bc5c;
            border-color: #18bc5c;
          }
          .tier-value {
            color: #18bc5c;
          }
        }

        &.current {
          .tier-dot {
            background: var(--primary-color);
            border-color: var(--primary-color);
            box-shadow: 0 0 6px var(--primary-color);
          }
          .tier-value {
            color: var(--primary-color);
            font-weight: var(--font-weight-bold);
          }
        }
      }
    }

    .tiers-progress-bar {
      height: 6px;
      background: var(--bg-secondary);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;

      .tiers-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-color), var(--primary-color-light));
        border-radius: 3px;
        transition: width 0.3s ease;
      }
    }

    .tiers-status {
      text-align: center;
      font-size: 11px;
      color: var(--text-secondary);

      .status-completed {
        color: #18bc5c;
        font-weight: var(--font-weight-bold);
      }
    }
  }

  // 模式标签
  .mode-tabs {
    margin-top: 4px;
  }

  // 手动模式
  .manual-mode {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 0;

    .config-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .config-label {
        font-size: 13px;
        color: var(--text-secondary);
      }
    }

    .config-hint {
      font-size: 11px;
      color: var(--text-tertiary);
      text-align: center;
      padding: 4px;
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-small);
    }
  }

  // 自动模式
  .auto-mode {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 0;

    .target-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .input-label {
        font-size: 13px;
        color: var(--text-secondary);
        min-width: 60px;
      }
    }

    .progress-stats {
      display: flex;
      gap: 12px;
      padding: 10px;
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-medium);

      .stat-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;

        .stat-label {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .stat-value {
          font-size: 14px;
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
        }

        &.completed .stat-value {
          color: #18bc5c;
        }

        &.remaining .stat-value {
          color: #e6a23c;
        }

        &.consumed .stat-value {
          color: var(--primary-color);
        }

        &.time .stat-value {
          color: var(--text-secondary);
          font-size: 12px;
        }
      }
    }

    // 进度区域
    .progress-section {
      .progress-text {
        display: block;
        text-align: center;
        margin-top: 6px;
        color: var(--text-secondary);
        font-size: 12px;
      }
    }
  }

  // 操作按钮
  .actions {
    display: flex;
    gap: 8px;

    > * {
      flex: 1;
    }
  }
}
</style>
