<template>
  <MyCard class="bottle-helper" :statusClass="{ active: state.isRunning }">
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
      <div class="total-points">
        <span class="label">背包宝箱可获积分：</span>
        <span class="value">{{ totalPoints }}</span>
      </div>
      <div class="container">
        <div class="list">
          <div class="item" v-for="item in boxDataList" :key="item.type">
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
            <n-select v-model:value="type" :options="typeOptions" />
            <n-select v-model:value="number" :options="numberOptions" />
          </div>
        </div>

        <div v-else class="auto-mode">
          <div class="auto-inputs">
            <div class="input-group">
              <span class="label">目标积分：</span>
              <n-input-number
                v-model:value="targetPoints"
                :min="0"
                :step="100"
                placeholder="输入目标积分"
                style="width: 150px"
              />
            </div>
            <div class="input-group">
              <span class="label">已获得积分：</span>
              <span class="value earned">{{ state.earnedPoints }}</span>
            </div>
            <div class="input-group">
              <span class="label">还需积分：</span>
              <span class="value" :class="{ 'need-more': remainingPoints > 0 }">
                {{ remainingPoints > 0 ? remainingPoints : 0 }}
              </span>
            </div>
          </div>
          <div class="strategy-info">
            <span class="label">策略：</span>
            <span class="value">优先木质(不足200用青铜)</span>
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
            @click="handleBoxHelper"
          >
            {{ state.isRunning ? "运行中" : "开启宝箱" }}
          </a-button>
          <a-button type="primary" size="small" @click="batchclaimboxpointreward"
            >领取宝箱积分</a-button
          >
        </div>
        <div class="auto-actions" v-else>
          <a-button
            type="primary"
            :disabled="state.isRunning || !targetPoints || remainingPoints <= 0"
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
            @click="stopAutoOpen"
          >
            停止
          </a-button>
          <a-button type="primary" size="small" @click="resetEarnedPoints">
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

const iconPath = computed(() => import.meta.env.BASE_URL + "box/zsbx.png");

const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

const boxDataList = computed(() => {
  const getImgPath = (path) =>
    import.meta.env.BASE_URL + path.replace(/^\//, "");
  return [
    {
      type: "木质宝箱",
      img: getImgPath("/box/mzbx.png"),
      count: roleInfo.value?.role?.items?.[2001]?.quantity || 0,
      points: 1,
      itemId: 2001,
    },
    {
      type: "青铜宝箱",
      img: getImgPath("/box/qtbx.png"),
      count: roleInfo.value?.role?.items?.[2002]?.quantity || 0,
      points: 10,
      itemId: 2002,
    },
    {
      type: "黄金宝箱",
      img: getImgPath("/box/hjbx.png"),
      count: roleInfo.value?.role?.items?.[2003]?.quantity || 0,
      points: 20,
      itemId: 2003,
    },
    {
      type: "铂金宝箱",
      img: getImgPath("/box/bjbx.png"),
      count: roleInfo.value?.role?.items?.[2004]?.quantity || 0,
      points: 50,
      itemId: 2004,
    },
  ];
});

const totalPoints = computed(() => {
  const wooden = roleInfo.value?.role?.items?.[2001]?.quantity || 0;
  const bronze = roleInfo.value?.role?.items?.[2002]?.quantity || 0;
  const gold = roleInfo.value?.role?.items?.[2003]?.quantity || 0;
  const platinum = roleInfo.value?.role?.items?.[2004]?.quantity || 0;

  return wooden * 1 + bronze * 10 + gold * 20 + platinum * 50;
});

const mode = ref("manual");

const type = ref(2001);
const typeOptions = [
  { label: "木质宝箱", value: 2001 },
  { label: "青铜宝箱", value: 2002 },
  { label: "黄金宝箱", value: 2003 },
  { label: "铂金宝箱", value: 2004 },
];

const number = ref(10);
const numberOptions = [
  { label: "10", value: 10 },
  { label: "100", value: 100 },
  { label: "1000", value: 1000 },
  { label: "2000", value: 2000 },
  { label: "5000", value: 5000 },
  { label: "10000", value: 10000 },
];

const targetPoints = ref(0);

const state = reactive({
  isRunning: false,
  progressText: "",
  earnedPoints: 0,
});

const remainingPoints = computed(() => {
  return targetPoints.value - state.earnedPoints;
});

const progressPercentage = computed(() => {
  if (!targetPoints.value || targetPoints.value === 0) return 0;
  return Math.min(100, Math.round((state.earnedPoints / targetPoints.value) * 100));
});

const resetEarnedPoints = () => {
  state.earnedPoints = 0;
  message.info("已重置已获得积分");
};

const getBoxPoints = (itemId, count) => {
  const pointsMap = { 2001: 1, 2002: 10, 2003: 20, 2004: 50 };
  return (pointsMap[itemId] || 0) * count;
};

const calculateBoxesToOpen = (neededPoints) => {
  if (neededPoints <= 0) return [];

  const wooden = roleInfo.value?.role?.items?.[2001]?.quantity || 0;
  const bronze = roleInfo.value?.role?.items?.[2002]?.quantity || 0;

  if (wooden + bronze === 0) {
    return [];
  }

  const boxes = [];

  if (wooden >= 200) {
    const woodenCount = Math.min(wooden, Math.ceil(neededPoints / 1));
    boxes.push({ itemId: 2001, name: "木质宝箱", count: woodenCount, points: 1 });
  } else if (wooden > 0) {
    const woodenPoints = wooden * 1;
    const remainingNeeded = neededPoints - woodenPoints;

    boxes.push({ itemId: 2001, name: "木质宝箱", count: wooden, points: 1 });

    if (remainingNeeded > 0 && bronze > 0) {
      const bronzeCount = Math.min(bronze, Math.ceil(remainingNeeded / 10));
      boxes.push({ itemId: 2002, name: "青铜宝箱", count: bronzeCount, points: 10 });
    }
  } else if (bronze > 0) {
    const bronzeCount = Math.min(bronze, Math.ceil(neededPoints / 10));
    boxes.push({ itemId: 2002, name: "青铜宝箱", count: bronzeCount, points: 10 });
  }

  return boxes;
};

const stopAutoOpen = () => {
  state.isRunning = false;
  state.progressText = "已停止";
  message.info("已停止自动开启");
};

const startAutoOpen = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (!targetPoints.value || targetPoints.value <= 0) {
    message.warning("请设置目标积分");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;
  state.isRunning = true;
  state.earnedPoints = 0;

  message.info("开始自动开启宝箱...");

  try {
    while (state.isRunning && remainingPoints.value > 0) {
      const remaining = remainingPoints.value;
      
      state.progressText = `已获得 ${state.earnedPoints} / 目标 ${targetPoints.value} (还需 ${remaining})`;
      
      const boxesToOpen = calculateBoxesToOpen(remaining);

      if (boxesToOpen.length === 0) {
        message.warning("没有足够的宝箱可开启");
        break;
      }

      for (const box of boxesToOpen) {
        if (!state.isRunning) break;
        if (box.count <= 0) continue;

        const batches = Math.floor(box.count / 10);
        const remainder = box.count % 10;

        for (let i = 0; i < batches; i++) {
          if (!state.isRunning) break;
          if (remainingPoints.value <= 0) break;
          
          await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
            itemId: box.itemId,
            number: 10,
          });
          
          state.earnedPoints += box.points * 10;
          state.progressText = `已获得 ${state.earnedPoints} / 目标 ${targetPoints.value} (还需 ${remainingPoints.value})`;
        }

        if (remainder > 0 && state.isRunning && remainingPoints.value > 0) {
          await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
            itemId: box.itemId,
            number: remainder,
          });
          
          state.earnedPoints += box.points * remainder;
          state.progressText = `已获得 ${state.earnedPoints} / 目标 ${targetPoints.value} (还需 ${remainingPoints.value})`;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
      await new Promise((r) => setTimeout(r, 500));
      await tokenStore.sendMessage(tokenId, "role_getroleinfo");

      if (state.earnedPoints >= targetPoints.value) {
        break;
      }

      const remainingBoxes = 
        (roleInfo.value?.role?.items?.[2001]?.quantity || 0) +
        (roleInfo.value?.role?.items?.[2002]?.quantity || 0);
      
      if (remainingBoxes === 0) {
        message.warning("宝箱已用完");
        break;
      }

      if (remainingPoints.value <= 0) {
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (state.earnedPoints >= targetPoints.value) {
      message.success(`已达到目标积分 ${targetPoints.value}！`);
    }
  } catch (error) {
    console.error("自动开启宝箱出错:", error);
    message.error("开启出错: " + error.message);
  } finally {
    state.isRunning = false;
    state.progressText = state.earnedPoints >= targetPoints.value ? "已完成" : "已停止";
  }
};

const batchclaimboxpointreward = async () => {
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

const handleBoxHelper = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  state.isRunning = true;
  message.info("宝箱开启中");
  if (number.value >= 10) {
    const batches = Math.floor(number.value / 10);
    const remainder = number.value % 10;
    for (let i = 0; i < batches; i++) {
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "item_openbox",
        { itemId: type.value, number: 10 },
      );
    }
    if (remainder > 0) {
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "item_openbox",
        { itemId: type.value, number: remainder },
      );
    }
    await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
    await new Promise((r) => setTimeout(r, 500));
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("宝箱开启完毕");
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
    justify-content: space-between;

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

  .strategy-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 6px;
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);

    .label {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }

    .value {
      color: var(--text-primary);
      font-size: var(--font-size-sm);
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

  .total-points {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 2px;
    background: var(--bg-tertiary);
    border-radius: var(--border-radius-medium);

    .label {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }

    .value {
      color: var(--text-primary);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
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
