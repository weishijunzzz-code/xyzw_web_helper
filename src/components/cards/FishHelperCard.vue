<template>
  <MyCard class="fish-helper" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img :src="iconPath" alt="钓鱼图标" />
    </template>
    <template #title>
      <h3>钓鱼助手</h3>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>
    <template #default>
      <div class="container">
        <!-- 鱼竿资源卡片 -->
        <div class="rods-resource-card">
          <div class="resource-title">鱼竿库存</div>
          <div class="rods-grid">
            <div
              v-for="(rod, index) in rodDataList"
              :key="rod.type"
              class="rod-item"
              :class="{ 
                active: selectedRodIndex === index,
                exhausted: rod.count === 0 
              }"
              @click="selectedRodIndex = index"
            >
              <div class="rod-icon-wrapper">
                <img :src="rod.img" :alt="rod.type" />
                <span class="rod-quantity" :class="{ zero: rod.count === 0 }">
                  {{ rod.count }}
                </span>
              </div>
              <span class="rod-name">{{ rod.type }}</span>
              <span class="rod-desc">{{ rod.description }}</span>
            </div>
          </div>
        </div>

        <!-- 智能策略提示 -->
        <div class="strategy-tip" v-if="recommendedRod">
          <div class="tip-icon">💡</div>
          <div class="tip-content">
            <span class="tip-label">智能推荐：</span>
            <span class="tip-text">{{ recommendedRod.reason }}</span>
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
            <span class="config-label">鱼竿类型</span>
            <n-select
              v-model:value="manualConfig.rodType"
              :options="rodTypeOptions"
              style="width: 140px"
            />
          </div>
          <div class="config-row">
            <span class="config-label">钓鱼次数</span>
            <n-select
              v-model:value="manualConfig.number"
              :options="numberOptions"
              style="width: 140px"
            />
          </div>
        </div>

        <!-- 自动模式 -->
        <div v-else class="auto-mode">
          <div class="auto-config">
            <div class="config-row">
              <span class="config-label">优先使用</span>
              <n-select
                v-model:value="autoConfig.rodType"
                :options="rodTypeOptions"
                style="width: 140px"
              />
            </div>
            <div class="config-row">
              <span class="config-label">智能切换</span>
              <n-switch v-model:value="autoConfig.autoSwitch" />
              <span class="switch-hint">用完自动切换另一种</span>
            </div>
          </div>

          <div class="target-input-row">
            <span class="input-label">目标次数</span>
            <n-input-number
              v-model:value="autoConfig.targetValue"
              :min="0"
              :step="10"
              :max="10000"
              placeholder="输入目标次数"
              style="width: 150px"
            />
            <n-button size="tiny" @click="setPresetTarget(160)">160</n-button>
            <n-button size="tiny" @click="setPresetTarget(320)">320</n-button>
            <n-button size="tiny" @click="setPresetTarget(1300)">1300</n-button>
            <n-button size="tiny" @click="setPresetTarget(1450)">1450</n-button>
            <n-button size="tiny" @click="setPresetTarget(1600)">1600</n-button>
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
            <div class="stat-item time" v-if="state.isRunning">
              <span class="stat-label">运行时间</span>
              <span class="stat-value">{{ runningDuration }}</span>
            </div>
          </div>

          <!-- 消耗预估 -->
          <div class="consumption-estimate" v-if="autoConfig.targetValue > 0">
            <div class="estimate-title">预计消耗</div>
            <div class="estimate-content">
              <div class="estimate-item">
                <img :src="currentRodImg" class="estimate-icon" />
                <span class="estimate-value">{{ estimatedConsumption }} 个</span>
              </div>
              <div class="estimate-item" v-if="estimatedTime">
                <span class="estimate-label">约需</span>
                <span class="estimate-value">{{ estimatedTime }}</span>
              </div>
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
            :disabled="state.isRunning || !hasSelectedRod"
            secondary
            size="small"
            block
            @click="handleManualFish"
          >
            {{ state.isRunning ? "运行中" : "开始钓鱼" }}
          </a-button>
        </template>
        <template v-else>
          <a-button
            type="primary"
            :disabled="!canStart || !hasAnyRod"
            secondary
            size="small"
            block
            @click="startAutoFish"
          >
            {{ state.isRunning ? "运行中..." : "开始自动钓鱼" }}
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
} = useHelperBase("fish", {
  name: "钓鱼",
  batchSize: 10,
  defaultTarget: 0,
  targetStep: 10,
});

// 初始化配置
manualConfig.rodType = 1;
manualConfig.number = 10;
autoConfig.rodType = 1;
autoConfig.autoSwitch = true;

const iconPath = computed(() => import.meta.env.BASE_URL + "fish/hjyg.png");
const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

// 鱼竿定义
const rodDefinitions = [
  { 
    type: "普通鱼竿", 
    itemId: 1011, 
    icon: "ptyg.png",
    description: "基础鱼竿",
    lotteryType: 1
  },
  { 
    type: "黄金鱼竿", 
    itemId: 1012, 
    icon: "hjyg.png",
    description: "高级鱼竿",
    lotteryType: 2
  },
];

const rodDataList = computed(() => {
  const getImgPath = (path) => import.meta.env.BASE_URL + path;
  return rodDefinitions.map((rod) => ({
    ...rod,
    img: getImgPath(`fish/${rod.icon}`),
    count: roleInfo.value?.role?.items?.[rod.itemId]?.quantity || 0,
  }));
});

// 选项
const rodTypeOptions = rodDefinitions.map((rod) => ({
  label: rod.type,
  value: rod.lotteryType,
}));

const numberOptions = generateNumberOptions([10, 20, 50, 80, 100, 160, 1300, 1450, 1600]);

// 选中的鱼竿
const selectedRodIndex = ref(0);

// 计算属性
const hasSelectedRod = computed(() => {
  const rod = rodDataList.value.find(r => r.lotteryType === manualConfig.rodType);
  return rod && rod.count > 0;
});

const hasAnyRod = computed(() => {
  return rodDataList.value.some(rod => rod.count > 0);
});

const currentRodImg = computed(() => {
  const rod = rodDataList.value.find(r => r.lotteryType === autoConfig.rodType);
  return rod ? rod.img : '';
});

// 智能推荐
const recommendedRod = computed(() => {
  const normalRod = rodDataList.value.find(r => r.lotteryType === 1);
  const goldRod = rodDataList.value.find(r => r.lotteryType === 2);
  
  if (!normalRod || !goldRod) return null;
  
  if (mode.value === 'auto') {
    if (autoConfig.rodType === 1 && normalRod.count > 0) {
      return { reason: `优先使用普通鱼竿（剩余 ${normalRod.count} 个）` };
    }
    if (autoConfig.rodType === 2 && goldRod.count > 0) {
      return { reason: `优先使用黄金鱼竿（剩余 ${goldRod.count} 个）` };
    }
    if (autoConfig.autoSwitch) {
      if (normalRod.count > 0) {
        return { reason: `黄金鱼竿不足，将自动切换为普通鱼竿（${normalRod.count} 个）` };
      }
      if (goldRod.count > 0) {
        return { reason: `普通鱼竿不足，将自动切换为黄金鱼竿（${goldRod.count} 个）` };
      }
    }
  } else {
    if (normalRod.count >= 10) {
      return { reason: `普通鱼竿充足（${normalRod.count} 个），推荐批量使用` };
    }
    if (goldRod.count > 0 && normalRod.count < 10) {
      return { reason: `普通鱼竿不足，推荐使用黄金鱼竿` };
    }
  }
  return null;
});

// 消耗预估
const estimatedConsumption = computed(() => {
  return Math.min(autoConfig.targetValue, getAvailableRodCount(autoConfig.rodType));
});

const estimatedTime = computed(() => {
  const seconds = Math.ceil(autoConfig.targetValue * 1.5);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}分钟`;
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
  autoConfig.targetValue = value;
};

// 获取可用鱼竿数量
const getAvailableRodCount = (rodType) => {
  const rod = rodDataList.value.find(r => r.lotteryType === rodType);
  return rod ? rod.count : 0;
};

// 获取当前应使用的鱼竿类型（考虑自动切换）
const getCurrentRodType = () => {
  const preferredCount = getAvailableRodCount(autoConfig.rodType);
  if (preferredCount > 0) return autoConfig.rodType;
  
  if (autoConfig.autoSwitch) {
    // 尝试切换另一种鱼竿
    const otherType = autoConfig.rodType === 1 ? 2 : 1;
    const otherCount = getAvailableRodCount(otherType);
    if (otherCount > 0) {
      return otherType;
    }
  }
  
  return null;
};

// 手动钓鱼
const handleManualFish = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    const count = manualConfig.number;
    const rodType = manualConfig.rodType;

    await executeBatches(
      count,
      async (batchSize) => {
        await tokenStore.sendMessageWithPromise(tokenId, "artifact_lottery", {
          type: rodType,
          lotteryNumber: batchSize,
          newFree: true,
        });
      },
      {
        batchSize: 10,
        delay: 200,
      }
    );

    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("钓鱼完毕");
  });

  if (success) {
    stop();
  }
};

// 自动钓鱼
const startAutoFish = async () => {
  const success = await start(async () => {
    const tokenId = tokenStore.selectedToken.id;
    startDurationTimer();

    message.info("开始自动钓鱼...");

    try {
      while (state.isRunning && remainingValue.value > 0) {
        const rodType = getCurrentRodType();
        
        if (!rodType) {
          const rodName = autoConfig.rodType === 1 ? "普通鱼竿" : "黄金鱼竿";
          message.warning(`${rodName}已用完`);
          break;
        }

        const rodName = rodType === 1 ? "普通鱼竿" : "黄金鱼竿";
        const availableCount = getAvailableRodCount(rodType);
        const remaining = Math.min(remainingValue.value, availableCount);

        if (remaining <= 0) {
          if (autoConfig.autoSwitch) {
            continue; // 尝试切换
          }
          break;
        }

        updateProgress(autoConfig.completedValue, autoConfig.targetValue, `使用${rodName}`);

        await executeBatches(
          remaining,
          async (batchSize) => {
            await tokenStore.sendMessageWithPromise(tokenId, "artifact_lottery", {
              type: rodType,
              lotteryNumber: batchSize,
              newFree: true,
            });
          },
          {
            batchSize: 10,
            delay: 200,
            onBatchComplete: async (batchSize) => {
              autoConfig.completedValue += batchSize;
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
      console.error("自动钓鱼出错:", error);
      message.error("钓鱼出错: " + error.message);
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
  message.info("已停止自动钓鱼");
};

// 监听模式切换
watch(mode, () => {
  if (!state.isRunning) {
    reset();
  }
});
</script>

<style scoped lang="scss">
.fish-helper {
  .container {
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // 资源卡片
  .rods-resource-card {
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);
    padding: 12px;

    .resource-title {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 10px;
      text-align: center;
    }

    .rods-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;

      .rod-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px 6px;
        border-radius: var(--border-radius-medium);
        background: var(--bg-secondary);
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

        &.exhausted {
          opacity: 0.5;
          .rod-quantity {
            background: var(--text-tertiary);
          }
        }

        .rod-icon-wrapper {
          position: relative;
          width: 48px;
          height: 48px;

          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          .rod-quantity {
            position: absolute;
            bottom: -4px;
            right: -4px;
            background: var(--primary-color);
            color: white;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 20px;
            text-align: center;

            &.zero {
              background: var(--text-tertiary);
            }
          }
        }

        .rod-name {
          font-size: 12px;
          color: var(--text-primary);
          margin-top: 6px;
          font-weight: var(--font-weight-medium);
        }

        .rod-desc {
          font-size: 10px;
          color: var(--text-secondary);
        }
      }
    }
  }

  // 策略提示
  .strategy-tip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px;
    background: var(--primary-color-light);
    border-radius: var(--border-radius-medium);
    border-left: 3px solid var(--primary-color);

    .tip-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .tip-content {
      .tip-label {
        font-size: 11px;
        color: var(--primary-color);
        font-weight: var(--font-weight-bold);
      }

      .tip-text {
        font-size: 12px;
        color: var(--text-primary);
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
  }

  // 自动模式
  .auto-mode {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 0;

    .auto-config {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-medium);

      .config-row {
        display: flex;
        align-items: center;
        gap: 12px;

        .config-label {
          font-size: 13px;
          color: var(--text-secondary);
          min-width: 60px;
        }

        .switch-hint {
          font-size: 11px;
          color: var(--text-tertiary);
        }
      }
    }

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

        &.completed .stat-value {
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

    // 消耗预估
    .consumption-estimate {
      background: var(--bg-tertiary);
      border-radius: var(--border-radius-medium);
      padding: 10px;

      .estimate-title {
        font-size: 11px;
        color: var(--text-secondary);
        margin-bottom: 8px;
      }

      .estimate-content {
        display: flex;
        gap: 16px;
        align-items: center;

        .estimate-item {
          display: flex;
          align-items: center;
          gap: 6px;

          .estimate-icon {
            width: 24px;
            height: 24px;
            object-fit: contain;
          }

          .estimate-label {
            font-size: 12px;
            color: var(--text-secondary);
          }

          .estimate-value {
            font-size: 14px;
            font-weight: var(--font-weight-bold);
            color: var(--text-primary);
          }
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
