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

        <!-- 保底提示 -->
        <div class="guarantee-info">
          <div class="guarantee-title">保底机制</div>
          <div class="guarantee-progress">
            <div class="guarantee-bar">
              <div 
                class="guarantee-fill" 
                :style="{ width: guaranteeProgress + '%' }"
              ></div>
            </div>
            <span class="guarantee-text">{{ guaranteeText }}</span>
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
              @click="setPresetTarget(Math.min(50, totalRecruitTokens))"
              :disabled="totalRecruitTokens < 50"
            >
              50
            </n-button>
            <n-button 
              size="tiny" 
              @click="setPresetTarget(totalRecruitTokens)"
              :disabled="totalRecruitTokens === 0"
            >
              全部
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

// 选项
const numberOptions = generateNumberOptions([10, 50, 100, 200, 400]);

// 保底机制（假设每100次保底）
const GUARANTEE_THRESHOLD = 100;
const guaranteeProgress = computed(() => {
  const current = autoConfig.completedValue % GUARANTEE_THRESHOLD;
  return (current / GUARANTEE_THRESHOLD) * 100;
});

const guaranteeText = computed(() => {
  const current = autoConfig.completedValue % GUARANTEE_THRESHOLD;
  const remaining = GUARANTEE_THRESHOLD - current;
  if (remaining === GUARANTEE_THRESHOLD && autoConfig.completedValue > 0) {
    return "本轮保底已达成！";
  }
  return `距离保底还差 ${remaining} 次`;
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

  // 保底信息
  .guarantee-info {
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);
    padding: 10px;

    .guarantee-title {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .guarantee-progress {
      display: flex;
      align-items: center;
      gap: 10px;

      .guarantee-bar {
        flex: 1;
        height: 8px;
        background: var(--bg-secondary);
        border-radius: 4px;
        overflow: hidden;

        .guarantee-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary-color), var(--primary-color-light));
          border-radius: 4px;
          transition: width 0.3s ease;
        }
      }

      .guarantee-text {
        font-size: 11px;
        color: var(--text-secondary);
        white-space: nowrap;
        min-width: 100px;
        text-align: right;
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
