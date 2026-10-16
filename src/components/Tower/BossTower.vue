<template>
  <MyCard class="hang-up" :status-class="{ active: state.isRunning }">
    <template #icon>
      <img
        src="/icons/Ob7pyorzmHiJcbab2c25af264d0758b527bc1b61cc3b.png"
        alt="宝库图标"
      />
    </template>
    <template #title>
      <h3>咸王功能</h3>
    </template>
    <template #default>
      <div class="time-display">宝库当前层数：{{ currentTower }}</div>
    </template>
    <template #action>
      <a-button
        type="primary"
        secondary
        size="small"
        block
        @click="extendbosstower"
        >宝库战斗</a-button
      >
    </template>
  </MyCard>
</template>

<script setup>
import { useMessage } from "naive-ui";

import { computed, ref } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { isSameGameValue } from "@/utils/gameValue.js";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const dayOfWeek = new Date().getDay();

const bossTowerInfo = computed(() => {
  const data = tokenStore.gameData?.bossTowerInfo || null;
  return data;
});
const currentTower = computed(() => {
  const tower = bossTowerInfo.value?.bossTower;
  return tower?.towerId ?? 1;
});
const state = ref({
  isRunning: false,
});

const extendbosstower = async () => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  const tokenId = tokenStore.selectedToken.id;
  state.value.isRunning = true;
  if (!isSameGameValue(dayOfWeek, 1) && !isSameGameValue(dayOfWeek, 2)) {
    if (
      currentTower.value === 1 ||
      currentTower.value === 2 ||
      currentTower.value === 3
    ) {
      try {
        state.value.isExtending = true;
        message.info("正在战斗...");
        for (let i = 0; i < 2; i++) {
          tokenStore.sendMessage(tokenId, "bosstower_startboss", {});
        }
        for (let j = 0; j < 9; j++) {
          tokenStore.sendMessage(tokenId, "bosstower_startbox", {});
        }
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "bosstower_getinfo",
          {},
          10000,
        );
        message.success("战斗已完成，请上线手动领取奖励");
      } catch (e) {
        message.error(`战斗失败: ${e?.message || "未知错误"}`);
      }
    } else if (currentTower.value === 4 || currentTower.value === 5) {
      try {
        state.value.isExtending = true;
        message.info("正在战斗...");
        for (let i = 0; i < 2; i++) {
          tokenStore.sendMessage(tokenId, "bosstower_startboss", {});
        }
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "bosstower_getinfo",
          {},
          10000,
        );
        message.success("战斗已完成");
      } catch (e) {
        message.error(`战斗失败: ${e?.message || "未知错误"}`);
      }
    } else {
      message.error("当前层数暂不支持");
    }
  } else {
    message.error("未到活动开放时间");
  }
  state.value.isRunning = false;
};
</script>

<style scoped lang="scss">
/* 按钮改用 Naive UI；time-display 样式由 MyCard 统一提供 */
</style>
