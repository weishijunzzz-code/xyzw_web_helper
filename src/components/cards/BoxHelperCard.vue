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
        <span class="label">宝箱总积分：</span>
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
              <span class="label">当前积分：</span>
              <span class="value">{{ totalPoints }}</span>
            </div>
            <div class="input-group">
              <span class="label">差值：</span>
              <span class="value" :class="{ 'need-more': targetPoints > totalPoints }">
                {{ targetPoints - totalPoints > 0 ? targetPoints - totalPoints : 0 }}
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
            :disabled="state.isRunning || !targetPoints || targetPoints <= totalPoints"
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
          <a-button type="primary" size="small" @click="batchclaimboxpointreward">
            领取积分
          </a-button>
        </div>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, watchEffect, reactive } from "vue";
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
  currentPoints: 0,
});

const progressPercentage = computed(() => {
  if (!targetPoints.value || targetPoints.value === 0) return 0;
  const current = state.currentPoints || totalPoints.value;
  return Math.min(100, Math.round((current / targetPoints.value) * 100));
});

const getBoxStrategy = (neededPoints) => {
  const boxes = [
    { itemId: 2001, name: "木质宝箱", points: 1, threshold: 200 },
    { itemId: 2002, name: "青铜宝箱", points: 10, threshold: 0 },
  ];

  const wooden = roleInfo.value?.role?.items?.[2001]?.quantity || 0;
  const bronze = roleInfo.value?.role?.items?.[2002]?.quantity || 0;

  let selectedBox = boxes[0];
  let useCount = 0;

  if (wooden >= boxes[0].threshold) {
    selectedBox = boxes[0];
    useCount = Math.min(wooden, Math.ceil(neededPoints / boxes[0].points));
  } else {
    if (bronze > 0) {
      selectedBox = boxes[1];
      useCount = Math.min(bronze, Math.ceil(neededPoints / boxes[1].points));
    } else {
      selectedBox = boxes[0];
      useCount = wooden;
    }
  }

  return { box: selectedBox, count: useCount };
};

const calculateBoxesToOpen = (target) => {
  const current = totalPoints.value;
  const needed = target - current;

  if (needed <= 0) return [];

  const wooden = roleInfo.value?.role?.items?.[2001]?.quantity || 0;
  const bronze = roleInfo.value?.role?.items?.[2002]?.quantity || 0;

  if (wooden + bronze === 0) {
    message.warning("没有足够的木质或青铜宝箱");
    return [];
  }

  const boxes = [];

  if (wooden >= 200) {
    const woodenCount = Math.min(wooden, Math.ceil(needed / 1));
    boxes.push({ itemId: 2001, name: "木质宝箱", count: woodenCount, points: 1 });
  } else if (wooden > 0) {
    const woodenPoints = wooden * 1;
    const remainingNeeded = needed - woodenPoints;

    boxes.push({ itemId: 2001, name: "木质宝箱", count: wooden, points: 1 });

    if (remainingNeeded > 0 && bronze > 0) {
      const bronzeCount = Math.min(bronze, Math.ceil(remainingNeeded / 10));
      boxes.push({ itemId: 2002, name: "青铜宝箱", count: bronzeCount, points: 10 });
    }
  } else if (bronze > 0) {
    const bronzeCount = Math.min(bronze, Math.ceil(needed / 10));
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

  if (!targetPoints.value || targetPoints.value <= totalPoints.value) {
    message.warning("请设置目标积分");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;
  state.isRunning = true;
  state.currentPoints = totalPoints.value;

  message.info("开始自动开启宝箱...");

  try {
    while (state.isRunning && state.currentPoints < targetPoints.value) {
      state.progressText = `当前 ${state.currentPoints} / 目标 ${targetPoints.value}`;
      
      const boxesToOpen = calculateBoxesToOpen(targetPoints.value);

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
          await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
            itemId: box.itemId,
            number: 10,
          });
        }

        if (remainder > 0 && state.isRunning) {
          await tokenStore.sendMessageWithPromise(tokenId, "item_openbox", {
            itemId: box.itemId,
            number: remainder,
          });
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      await tokenStore.sendMessage(tokenId, "item_batchclaimboxpointreward");
      await new Promise((r) => setTimeout(r, 500));
      await tokenStore.sendMessage(tokenId, "role_getroleinfo");

      state.currentPoints = totalPoints.value;

      if (state.currentPoints >= targetPoints.value) {
        break;
      }

      const remainingBoxes = 
        (roleInfo.value?.role?.items?.[2001]?.quantity || 0) +
        (roleInfo.value?.role?.items?.[2002]?.quantity || 0);
      
      if (remainingBoxes === 0) {
        message.warning("宝箱已用完");
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (state.currentPoints >= targetPoints.value) {
      message.success(`已达到目标积分 ${targetPoints.value}！`);
    }
  } catch (error) {
    console.error("自动开启宝箱出错:", error);
    message.error("开启出错: " + error.message);
  } finally {
    state.isRunning = false;
    state.progressText = state.currentPoints >= targetPoints.value ? "已完成" : "已停止";
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
  state.currentPoints = totalPoints.value;
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
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "item_openbox",
        { itemId: type.value, number: 10 },
      );
    }
    if (remainder > 0) {
      const result = await tokenStore.sendMessageWithPromise(
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
        min-width: 70px;
      }

      .value {
        color: var(--text-primary);
        font-weight: var(--font-weight-semibold);

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
