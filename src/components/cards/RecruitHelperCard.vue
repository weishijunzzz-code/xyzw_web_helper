<template>
  <MyCard class="helper" :statusClass="{ active: state.isRunning }">
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
        <div class="list">
          <div class="item" v-for="item in dataList" :key="item.type">
            <img :src="item.img" :alt="item.type" />
            <div class="box-info">
              <div class="box-type">{{ item.type }}</div>
              <div class="box-count">数量：{{ item.count }}</div>
            </div>
          </div>
        </div>

        <n-tabs v-model:value="mode" type="segment" class="mode-tabs">
          <n-tab name="manual" tab="手动模式" />
          <n-tab name="auto" tab="自动模式" />
        </n-tabs>

        <div v-if="mode === 'manual'" class="manual-mode">
          <div class="selects">
            <n-select v-model:value="number" :options="numberOptions" />
          </div>
        </div>

        <div v-else class="auto-mode">
          <div class="auto-inputs">
            <div class="input-group">
              <span class="label">目标次数：</span>
              <n-input-number
                v-model:value="targetTimes"
                :min="0"
                :step="10"
                placeholder="输入目标次数"
                style="width: 150px"
              />
            </div>
            <div class="input-group">
              <span class="label">已完成：</span>
              <span class="value earned">{{ state.completedTimes }}</span>
            </div>
            <div class="input-group">
              <span class="label">还需次数：</span>
              <span class="value" :class="{ 'need-more': remainingTimes > 0 }">
                {{ remainingTimes > 0 ? remainingTimes : 0 }}
              </span>
            </div>
          </div>
          <div class="progress-info" v-if="state.isRunning">
            <n-progress
              type="line"
              :percentage="progressPercentage"
              :indicator-placement="'inside'"
            />
            <span class="progress-text">{{ state.progressText }}</span>
          </div>
        </div>
      </div>
    </template>
    <template #action>
      <div class="actions">
        <div class="manual-actions" v-if="mode === 'manual'">
          <a-button
            type="primary"
            :disabled="state.isRunning"
            secondary
            size="small"
            block
            @click="handleHelper"
          >
            {{ state.isRunning ? "运行中" : "开始招募" }}
          </a-button>
        </div>
        <div class="auto-actions" v-else>
          <a-button
            type="primary"
            :disabled="state.isRunning || !targetTimes || remainingTimes <= 0"
            secondary
            size="small"
            block
            @click="startAuto"
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
          <a-button type="primary" size="small" @click="resetCompleted">
            重置
          </a-button>
        </div>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, reactive } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const iconPath = computed(() => import.meta.env.BASE_URL + "icons/zml.png");

const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

const dataList = computed(() => {
  const getImgPath = (path) =>
    import.meta.env.BASE_URL + path.replace(/^\//, "");
  return [
    {
      type: "招募令",
      img: getImgPath("/icons/zml.png"),
      count: roleInfo.value?.role?.items?.[1001]?.quantity || 0,
    },
  ];
});

const mode = ref("manual");

const number = ref(10);
const numberOptions = [
  { label: "10", value: 10 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "400", value: 400 },
];

const targetTimes = ref(0);

const state = reactive({
  isRunning: false,
  progressText: "",
  completedTimes: 0,
});

const remainingTimes = computed(() => {
  return targetTimes.value - state.completedTimes;
});

const progressPercentage = computed(() => {
  if (!targetTimes.value || targetTimes.value === 0) return 0;
  return Math.min(100, Math.round((state.completedTimes / targetTimes.value) * 100));
});

const resetCompleted = () => {
  state.completedTimes = 0;
  message.info("已重置已完成次数");
};

const stopAuto = () => {
  state.isRunning = false;
  state.progressText = "已停止";
  message.info("已停止自动招募");
};

const getAvailableRecruit = () => {
  const recruitItem = roleInfo.value?.role?.items?.[1001]?.quantity || 0;
  return recruitItem > 0 ? recruitItem : 0;
};

const startAuto = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (!targetTimes.value || targetTimes.value <= 0) {
    message.warning("请设置目标次数");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;
  state.isRunning = true;
  state.completedTimes = 0;

  message.info("开始自动招募...");

  try {
    while (state.isRunning && remainingTimes.value > 0) {
      const available = getAvailableRecruit();

      if (available <= 0) {
        message.warning("没有足够的招募令");
        break;
      }

      const batches = Math.floor(remainingTimes.value / 10);
      const remainder = remainingTimes.value % 10;

      if (batches > 0) {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_recruit", {
          recruitType: 1,
          recruitNumber: 10,
        });
        state.completedTimes += 10;
        state.progressText = `已完成 ${state.completedTimes} / 目标 ${targetTimes.value}`;
      }

      if (remainder > 0 && state.isRunning && remainingTimes.value > 0) {
        const availableCheck = getAvailableRecruit();
        if (availableCheck > 0) {
          await tokenStore.sendMessageWithPromise(tokenId, "hero_recruit", {
            recruitType: 1,
            recruitNumber: remainder,
          });
          state.completedTimes += remainder;
          state.progressText = `已完成 ${state.completedTimes} / 目标 ${targetTimes.value}`;
        }
      }

      await tokenStore.sendMessage(tokenId, "role_getroleinfo");

      if (state.completedTimes >= targetTimes.value) {
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (state.completedTimes >= targetTimes.value) {
      message.success(`已达到目标次数 ${targetTimes.value}！`);
    }
  } catch (error) {
    console.error("自动招募出错:", error);
    message.error("招募出错: " + error.message);
  } finally {
    state.isRunning = false;
    state.progressText = state.completedTimes >= targetTimes.value ? "已完成" : "已停止";
  }
};

const handleHelper = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  state.isRunning = true;
  message.info("招募助手运行中");
  if (number.value >= 10) {
    const batches = Math.floor(number.value / 10);
    const remainder = number.value % 10;
    for (let i = 0; i < batches; i++) {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "hero_recruit",
        { recruitType: 1, recruitNumber: 10 },
      );
    }
    if (remainder > 0) {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "hero_recruit",
        { recruitType: 1, recruitNumber: remainder },
      );
    }
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("招募完毕");
    state.isRunning = false;
    return;
  }
};
</script>

<style scoped lang="scss">
.container {
  padding: 10px 0;
  display: flex;
  flex-direction: column;

  .list {
    display: flex;
    align-items: center;
    justify-content: space-around;

    .item {
      display: flex;
      flex-direction: column;
      align-items: center;

      > img {
        width: 40px;
        height: 40px;
      }

      .box-info {
        display: flex;
        flex-direction: column;
        align-items: center;

        .box-type {
          font-weight: bold;
          margin-top: 4px;
        }

        .box-count {
          margin-top: 2px;
          color: #666;
        }
      }
    }
  }

  .mode-tabs {
    margin-top: 12px;
  }

  .manual-mode,
  .auto-mode {
    margin-top: 12px;
  }

  .selects {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .auto-inputs {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .input-group {
      display: flex;
      align-items: center;
      gap: 8px;

      .label {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        min-width: 80px;
      }

      .value {
        color: var(--text-primary);
        font-weight: var(--font-weight-semibold);

        &.earned {
          color: #18bc5c;
        }

        &.need-more {
          color: #e6a23c;
        }
      }
    }
  }

  .progress-info {
    margin-top: 8px;

    .progress-text {
      display: block;
      text-align: center;
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }
  }
}

.actions {
  display: flex;
  gap: 8px;

  .manual-actions,
  .auto-actions {
    display: flex;
    gap: 8px;
    flex: 1;
  }
}
</style>
