<template>
  <MyCard class="box-helper" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img :src="iconPath" alt="宝箱图标" />
    </template>
    <template #title>
      <h3>宝箱助手</h3>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>
    <template #default>
      <div class="container">
        <!-- 总积分展示 -->
        <div class="total-points-card">
          <div class="points-ring" :style="{ '--progress': totalPointsProgress }">
            <div class="ring-content">
              <span class="points-value">
                <AnimatedNumber :value="totalPoints" :duration="1000" />
              </span>
              <span class="points-label">可获积分</span>
            </div>
          </div>
        </div>

        <!-- 宝箱列表 -->
        <div class="box-grid">
          <div
            class="box-item"
            v-for="(item, index) in boxDataList"
            :key="item.type"
            :class="{ 
              active: selectedBoxIndex === index,
              'low-stock': item.count <= item.minReserve && item.count > 0,
              'no-stock': item.count === 0
            }"
            @click="selectedBoxIndex = index"
          >
            <div class="box-icon-wrapper">
              <img :src="item.img" :alt="item.type" />
              <span class="box-quantity" :class="{ reserve: item.count <= item.minReserve }">
                {{ item.count }}
              </span>
            </div>
            <span class="box-name">{{ item.type }}</span>
            <span class="box-point">{{ item.points }}分/个</span>
            <span class="box-reserve" v-if="item.minReserve > 0">保留{{ item.minReserve }}</span>
          </div>
        </div>

        <!-- 策略可视化 -->
        <div class="strategy-flow">
          <div class="flow-title">开箱策略</div>
          <div class="flow-steps">
            <div
              v-for="(step, index) in strategySteps"
              :key="index"
              class="flow-step"
              :class="{ current: currentStrategyStep === index }"
            >
              <div class="step-icon">{{ step.icon }}</div>
              <span class="step-name">{{ step.name }}</span>
              <span v-if="index < strategySteps.length - 1" class="step-arrow">→</span>
            </div>
          </div>
        </div>

        <!-- 当前策略说明 -->
        <div class="strategy-detail" v-if="mode === 'auto'">
          <div class="detail-title">当前策略</div>
          <div class="detail-content">{{ currentStrategyText }}</div>
          <div class="detail-hint" v-if="remainingToTarget < 100 && remainingToTarget > 0">
            距离目标 {{ remainingToTarget }} 分，将使用木质宝箱兜底
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
            <span class="config-label">宝箱类型</span>
            <n-select
              v-model:value="manualConfig.type"
              :options="typeOptions"
              style="width: 140px"
            />
          </div>
          <div class="config-row">
            <span class="config-label">开启数量</span>
            <n-select
              v-model:value="manualConfig.number"
              :options="numberOptions"
              style="width: 140px"
            />
          </div>
        </div>

        <!-- 自动模式 -->
        <div v-else class="auto-mode">
          <div class="target-input-row">
            <span class="input-label">目标积分</span>
            <n-input-number
              v-model:value="autoConfig.targetValue"
              :min="0"
              :step="100"
              :max="100000"
              placeholder="输入目标积分"
              style="width: 150px"
            />
            <n-button size="tiny" @click="setPresetTarget(2000)">2000</n-button>
            <n-button size="tiny" @click="setPresetTarget(4000)">4000</n-button>
            <n-button size="tiny" @click="setPresetTarget(8000)">8000</n-button>
          </div>

          <div class="progress-stats">
            <div class="stat-item earned">
              <span class="stat-label">已获得</span>
              <span class="stat-value">
                <AnimatedNumber :value="autoConfig.completedValue" :duration="800" />
              </span>
            </div>
            <div class="stat-item remaining" v-if="remainingValue > 0">
              <span class="stat-label">还需</span>
              <span class="stat-value">{{ remainingValue }}</span>
            </div>
            <div class="stat-item time" v-if="state.isRunning">
              <span class="stat-label">运行时间</span>
              <span class="stat-value">{{ runningDuration }}</span>
            </div>
          </div>

          <!-- 层级进度 -->
          <div class="tier-progress" v-if="mode === 'auto'">
            <div class="tier-header">
              <span>层级进度</span>
              <span class="tier-current">当前: {{ currentTier }}</span>
            </div>
            <div class="tier-bar">
              <div
                v-for="tier in tierLevels"
                :key="tier.value"
                class="tier-segment"
                :class="{
                  completed: effectivePoints >= tier.value,
                  current: getCurrentTierTarget() === tier.value,
                }"
              >
                <div class="tier-marker">{{ tier.value }}</div>
                <div class="tier-reward" v-if="tier.reward">{{ tier.reward }}</div>
              </div>
            </div>
            <div class="tier-next" v-if="nextTierInfo">
              距离下一层级还需 {{ nextTierInfo.remaining }} 积分
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
            :disabled="state.isRunning"
            secondary
            size="small"
            block
            @click="handleManualOpen"
          >
            {{ state.isRunning ? "运行中" : "开启宝箱" }}
          </a-button>
          <a-button type="primary" size="small" @click="claimBoxRewards">
            领取积分
          </a-button>
        </template>
        <template v-else>
          <a-button
            type="primary"
            :disabled="!canStart"
            secondary
            size="small"
            block
            @click="startAutoOpen"
          >
            {{ state.isRunning ? "运行中..." : "开始自动开启" }}
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
import {
  calculateBoxesStrategy,
  shouldClaimTierReward,
  getStrategyDescription,
  getCurrentTier,
  getNextTierTarget,
  BOX_CONFIG,
} from "@/composables/useBoxStrategy";
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
} = useHelperBase("box", {
  name: "宝箱",
  batchSize: 10,
  defaultTarget: 0,
  targetStep: 100,
});

// 初始化手动配置
manualConfig.type = 2001;
manualConfig.number = 10;

const iconPath = computed(() => import.meta.env.BASE_URL + "box/zsbx.png");
const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

// 宝箱数据（使用策略配置）
const boxDefinitions = [
  { type: "木质宝箱", itemId: 2001, points: BOX_CONFIG[2001].points, icon: "mzbx.png", minReserve: BOX_CONFIG[2001].minReserve },
  { type: "青铜宝箱", itemId: 2002, points: BOX_CONFIG[2002].points, icon: "qtbx.png", minReserve: BOX_CONFIG[2002].minReserve },
  { type: "黄金宝箱", itemId: 2003, points: BOX_CONFIG[2003].points, icon: "hjbx.png", minReserve: BOX_CONFIG[2003].minReserve },
  { type: "铂金宝箱", itemId: 2004, points: BOX_CONFIG[2004].points, icon: "bjbx.png", minReserve: BOX_CONFIG[2004].minReserve },
];

const boxDataList = computed(() => {
  const getImgPath = (path) => import.meta.env.BASE_URL + path;
  return boxDefinitions.map((box) => ({
    ...box,
    img: getImgPath(`box/${box.icon}`),
    count: roleInfo.value?.role?.items?.[box.itemId]?.quantity || 0,
  }));
});

// 总积分
const totalPoints = computed(() => {
  return boxDataList.value.reduce((sum, box) => sum + box.count * box.points, 0);
});

const totalPointsProgress = computed(() => {
  const max = 10000;
  return Math.min(100, (totalPoints.value / max) * 100);
});

// 选项
const typeOptions = boxDefinitions.map((box) => ({
  label: box.type,
  value: box.itemId,
}));

const numberOptions = generateNumberOptions([10, 100, 200, 500, 1000, 2000, 5000]);

// 策略步骤
const strategySteps = [
  { name: "木质", icon: "🪵" },
  { name: "青铜", icon: "🥉" },
  { name: "黄金", icon: "🥇" },
  { name: "铂金", icon: "💎" },
];

// 层级系统
const tierLevels = [
  { value: 2000, reward: "奖励1" },
  { value: 4000, reward: "奖励2" },
  { value: 6000, reward: "奖励3" },
  { value: 8000, reward: "奖励4" },
];

const TIER_CYCLE = 8000;

const effectivePoints = computed(() => autoConfig.completedValue % TIER_CYCLE);

const currentTier = computed(() => {
  for (let i = tierLevels.length - 1; i >= 0; i--) {
    if (effectivePoints.value >= tierLevels[i].value) {
      return tierLevels[i].value;
    }
  }
  return 0;
});

const getCurrentTierTarget = () => {
  for (const tier of tierLevels) {
    if (effectivePoints.value < tier.value) {
      return tier.value;
    }
  }
  return null;
};

const nextTierInfo = computed(() => {
  const target = getCurrentTierTarget();
  if (!target) return null;
  return {
    target,
    remaining: target - effectivePoints.value,
  };
});

const currentStrategyStep = computed(() => {
  const points = effectivePoints.value;
  if (points < 2000) return 0;
  if (points < 4000) return 1;
  if (points < 6000) return 2;
  return 3;
});

// 当前策略文本
const currentStrategyText = computed(() => {
  return getStrategyDescription(autoConfig.completedValue, getAvailableBoxes());
});

// 距离目标的剩余积分
const remainingToTarget = computed(() => {
  return Math.max(0, autoConfig.targetValue - autoConfig.completedValue);
});

// 选中的宝箱索引
const selectedBoxIndex = ref(0);

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
  autoConfig.targetValue = value;
};

// 获取可用宝箱数量对象
const getAvailableBoxes = () => {
  const boxes = {};
  boxDataList.value.forEach(box => {
    boxes[box.itemId] = box.count;
  });
  return boxes;
};

// 检查并领取层级奖励（使用策略函数）
const checkAndClaimTierReward = async (tokenId, currentPoints, newPoints) => {
  if (shouldClaimTierReward(currentPoints, newPoints)) {
    const newTier = getCurrentTier(newPoints);
    message.info(`已达积分层级 ${newTier * 2000}，自动领取宝箱积分...`);
    await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
    await new Promise((r) => setTimeout(r, 500));
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    await new Promise((r) => setTimeout(r, 300));
    return true;
  }
  return false;
};

// 手动开启
const handleManualOpen = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    const count = manualConfig.number;

    await executeBatches(
      count,
      async (batchSize) => {
        await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
          itemId: manualConfig.type,
          number: batchSize,
        });
      },
      {
        batchSize: 10,
        delay: 200,
      }
    );

    await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
    await new Promise((r) => setTimeout(r, 500));
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("宝箱开启完毕");
  });

  if (success) {
    stop();
  }
};

// 领取宝箱积分
const claimBoxRewards = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
  await new Promise((r) => setTimeout(r, 500));
  await tokenStore.sendMessage(tokenId, "role_getroleinfo");
  message.success("宝箱积分领取完毕");
};

// 自动开启（使用新的策略逻辑）
const startAutoOpen = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    startDurationTimer();

    message.info("开始自动开启宝箱...");
    
    // 显示当前策略
    const initialStrategy = getStrategyDescription(autoConfig.completedValue, getAvailableBoxes());
    console.log("当前策略:", initialStrategy);

    try {
      while (state.isRunning && remainingValue.value > 0) {
        const targetPoints = autoConfig.targetValue;
        const currentPoints = autoConfig.completedValue;
        
        // 使用策略计算需要开启的宝箱
        const availableBoxes = getAvailableBoxes();
        const boxesToOpen = calculateBoxesStrategy(
          targetPoints,
          currentPoints,
          { ...availableBoxes }, // 复制对象，避免修改原始数据
          { considerMailReward: true }
        );

        if (boxesToOpen.length === 0) {
          message.warning("没有足够的宝箱可开启（已考虑保留数量）");
          break;
        }

        // 显示本次计划
        const planText = boxesToOpen.map(b => `${b.name}x${b.count}`).join(", ");
        console.log(`计划开启: ${planText}`);
        updateProgress(autoConfig.completedValue, autoConfig.targetValue, `计划: ${planText}`);

        for (const box of boxesToOpen) {
          if (!state.isRunning) break;
          if (box.count <= 0) continue;

          const pointsBefore = autoConfig.completedValue;

          await executeBatches(
            box.count,
            async (batchSize) => {
              await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
                itemId: box.itemId,
                number: batchSize,
              });
            },
            {
              batchSize: 10,
              delay: 200,
              onBatchComplete: async (batchSize) => {
                autoConfig.completedValue += box.points * batchSize;
                
                // 检查是否达到新层级
                const claimed = await checkAndClaimTierReward(
                  tokenId,
                  pointsBefore,
                  autoConfig.completedValue
                );
                
                // 如果领取了奖励，刷新数据（邮件可能赠送青铜宝箱）
                if (claimed) {
                  await new Promise((r) => setTimeout(r, 500));
                }
              },
            }
          );

          await new Promise((r) => setTimeout(r, 200));
        }

        if (!state.isRunning) break;

        // 每次循环结束后领取奖励并刷新数据
        await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
        await new Promise((r) => setTimeout(r, 500));
        await tokenStore.sendMessage(tokenId, "role_getroleinfo");
        
        // 显示当前策略状态
        const currentStrategy = getStrategyDescription(
          autoConfig.completedValue, 
          getAvailableBoxes()
        );
        console.log("当前策略状态:", currentStrategy);

        if (autoConfig.completedValue >= autoConfig.targetValue) {
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (autoConfig.completedValue >= autoConfig.targetValue) {
        message.success(`已达到目标积分 ${autoConfig.targetValue}！`);
      }
    } catch (error) {
      console.error("自动开启宝箱出错:", error);
      message.error("开启出错: " + error.message);
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
  message.info("已停止自动开启");
};

// 监听模式切换
watch(mode, () => {
  if (!state.isRunning) {
    reset();
  }
});
</script>

<style scoped lang="scss">
.box-helper {
  .container {
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // 总积分卡片
  .total-points-card {
    display: flex;
    justify-content: center;
    padding: 8px 0;

    .points-ring {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: conic-gradient(
        var(--primary-color) calc(var(--progress) * 1%),
        var(--bg-tertiary) 0
      );
      display: flex;
      align-items: center;
      justify-content: center;

      &::before {
        content: "";
        position: absolute;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--bg-secondary);
      }

      .ring-content {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;

        .points-value {
          font-size: 20px;
          font-weight: var(--font-weight-bold);
          color: var(--primary-color);
        }

        .points-label {
          font-size: 11px;
          color: var(--text-secondary);
        }
      }
    }
  }

  // 宝箱网格
  .box-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;

    .box-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 4px;
      border-radius: var(--border-radius-medium);
      background: var(--bg-tertiary);
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;

      &:hover {
        background: var(--bg-hover);
      }

      &.active {
        border-color: var(--primary-color);
        background: var(--primary-color-light);
      }

      .box-icon-wrapper {
        position: relative;
        width: 40px;
        height: 40px;

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .box-quantity {
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: var(--primary-color);
          color: white;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 8px;
          min-width: 16px;
          text-align: center;

          &.reserve {
            background: var(--warning-color);
          }
        }
      }

      .box-name {
        font-size: 11px;
        color: var(--text-primary);
        margin-top: 4px;
        font-weight: var(--font-weight-medium);
      }

      .box-point {
        font-size: 10px;
        color: var(--text-secondary);
      }

      .box-reserve {
        font-size: 9px;
        color: var(--warning-color);
        margin-top: 2px;
      }

      &.low-stock {
        border-color: var(--warning-color);
        background: var(--warning-color-light);
      }

      &.no-stock {
        opacity: 0.5;
        .box-quantity {
          background: var(--text-tertiary);
        }
      }
    }
  }

  // 策略流程
  .strategy-flow {
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);
    padding: 10px;

    .flow-title {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-align: center;
    }

    .flow-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;

      .flow-step {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: var(--border-radius-small);
        transition: all 0.2s ease;

        &.current {
          background: var(--primary-color-light);
          .step-name {
            color: var(--primary-color);
            font-weight: var(--font-weight-bold);
          }
        }

        .step-icon {
          font-size: 14px;
        }

        .step-name {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .step-arrow {
          color: var(--text-tertiary);
          font-size: 12px;
        }
      }
    }
  }

  // 策略详情
  .strategy-detail {
    background: var(--primary-color-light);
    border-radius: var(--border-radius-medium);
    padding: 10px;
    border-left: 3px solid var(--primary-color);

    .detail-title {
      font-size: 11px;
      color: var(--primary-color);
      font-weight: var(--font-weight-bold);
      margin-bottom: 6px;
    }

    .detail-content {
      font-size: 12px;
      color: var(--text-primary);
      line-height: 1.5;
      white-space: pre-line;
    }

    .detail-hint {
      margin-top: 8px;
      padding: 6px;
      background: var(--warning-color-light);
      border-radius: var(--border-radius-small);
      font-size: 11px;
      color: var(--warning-color);
      font-weight: var(--font-weight-medium);
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
      gap: 16px;
      padding: 10px;
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-medium);

      .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;

        .stat-label {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .stat-value {
          font-size: 16px;
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
        }

        &.earned .stat-value {
          color: #18bc5c;
        }

        &.remaining .stat-value {
          color: #e6a23c;
        }

        &.time .stat-value {
          color: var(--primary-color);
          font-size: 14px;
        }
      }
    }

    // 层级进度
    .tier-progress {
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-medium);
      padding: 10px;

      .tier-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--text-secondary);

        .tier-current {
          color: var(--primary-color);
          font-weight: var(--font-weight-bold);
        }
      }

      .tier-bar {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;

        .tier-segment {
          flex: 1;
          height: 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
          position: relative;
          transition: all 0.3s ease;

          &.completed {
            background: #18bc5c;
          }

          &.current {
            background: var(--primary-color);
            box-shadow: 0 0 4px var(--primary-color);
          }

          .tier-marker {
            position: absolute;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10px;
            color: var(--text-tertiary);
          }

          .tier-reward {
            position: absolute;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 9px;
            color: var(--text-secondary);
            white-space: nowrap;
          }
        }
      }

      .tier-next {
        text-align: center;
        font-size: 11px;
        color: var(--text-secondary);
        margin-top: 20px;
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
