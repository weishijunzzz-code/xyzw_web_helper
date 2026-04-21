<template>
  <!-- 俱乐部赛车 -->
  <div class="status-card legion-match">
    <div class="card-header">
      <img src="/Car.png" alt="赛车" class="status-icon" />
      <div class="status-info">
        <h3>俱乐部赛车</h3>
      </div>
      <div class="status-count">
        <span> 剩余车票: {{ MyItem }} </span>
      </div>
    </div>
    <div class="card-content">
      <div v-if="CarList.length === 0" class="no-data">
        <p>暂无车辆数据</p>
      </div>
      <div class="car-grid">
        <div
          v-for="(car, index) in sortedCarList"
          :key="car.id"
          class="car-item"
          style="width: 0"
        >
          <div class="car-header">
            <h4>
              <span :class="`status-${car.status}`">{{
                getCarStatusText(car)
              }}</span>
            </h4>
            <span class="car-rarity" :class="`rarity-${car.color}`">
              {{ getColorName(car.color) }}
            </span>
          </div>
          <div v-if="car.rewards && car.rewards.length > 0" class="car-rewards">
            <h5>奖励:</h5>
            <text
              v-for="(reward, idx) in parseCarRewards(car.rewards)"
              :key="idx"
            >
              {{ reward }}
              <span
                v-if="
                  isBigPrize([
                    {
                      type: car.rewards[idx].type,
                      itemId: car.rewards[idx].itemId,
                      value: car.rewards[idx].value,
                    },
                  ])
                "
                class="big-prize"
              >
                [大奖]
              </span>
            </text>
            <div v-if="isBigPrize(car.rewards)" class="big-prize-badge">
              包含大奖!
            </div>
          </div>
          <div
            style="
              display: flex;
              flex-direction: row;
              justify-content: space-between;
            "
          >
            <button class="query-btn" @click="refreshCar(car.id)">刷新</button>
            <button class="query-btn" @click="claimCar(car.id)">收车</button>
            <button class="query-btn" @click="sendCar(car.id)">发车</button>
          </div>
        </div>
      </div>
      <div style="margin-top: 10px">
        <button class="query-btn" @click="smartSendCar">智能发车</button>
        <button class="query-btn" @click="claimAllCars">一键收车</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { g_utils } from "@/utils/bonProtocol.js";
import { CarresearchItem } from "@/utils/batch/constants.js";

// 车辆数据处理工具函数
// 根据color值返回颜色名称
const getColorName = (color) => {
  const colorMap = {
    1: "普通",
    2: "稀有",
    3: "史诗",
    4: "传说",
    5: "神话",
  };
  return colorMap[color] || `未知(${color})`;
};

// 物品ID映射字典
const itemMapping = {
  3001: "金币袋子",
  3002: "金砖袋子",
  3005: "紫色随机碎片",
  3006: "橙色随机碎片",
  3007: "红色随机碎片",
  3008: "精铁袋子",
  3009: "进阶袋子",
  3010: "梦魇袋子",
  3011: "白玉袋子",
  3012: "扳手袋子",
  3020: "聚宝盆",
  3021: "豪华聚宝盆",
  3201: "红色万能碎片",
  3302: "橙色万能碎片",
  1001: "招募令",
  1011: "普通鱼竿",
  1012: "黄金鱼竿",
  1013: "珍珠",
  1019: "盐靛",
  1016: "晶石",
  1020: "皮肤币",
  1021: "扫荡魔毯",
  1022: "白玉",
  1033: "贝壳",
  1035: "金盐靛",
  1003: "进阶石",
  1006: "精铁",
  1007: "竞技场门票",
  2001: "木制宝箱",
  2002: "青铜宝箱",
  2003: "黄金宝箱",
  2004: "铂金宝箱",
  2005: "钻石宝箱",
  35002: "刷新券",
  35009: "零件",
};

// 根据物品ID获取物品名称
const getItemName = (itemId) => {
  return itemMapping[itemId] || `未知物品(${itemId})`;
};

// 解析车辆奖励列表，返回格式化的奖励信息
const parseCarRewards = (rewards) => {
  const rewardInfo = [];
  if (!rewards || !Array.isArray(rewards)) return rewardInfo;

  for (const reward of rewards) {
    const rewardType = reward.type || 0;
    const itemId = reward.itemId || 0;
    const value = reward.value || 0;

    if (rewardType === 1) {
      // 金币
      rewardInfo.push(``);
    } else if (rewardType === 2) {
      // 金砖
      rewardInfo.push(`金砖: ${value.toLocaleString()}`);
    } else if (rewardType === 3) {
      // 物品
      const itemName = getItemName(itemId);
      rewardInfo.push(`${itemName}: ${value}`);
    } else {
      rewardInfo.push(`类型${rewardType}物品${itemId}: ${value}`);
    }
  }

  return rewardInfo;
};

// 检测是否包含大奖奖励
const isBigPrize = (rewards) => {
  const bigPrizes = [
    { type: 3, itemId: 3201, value: 10 }, // 10个招募令
    { type: 3, itemId: 1001, value: 10 }, // 10个万能碎片
    { type: 3, itemId: 1022, value: 2000 }, // 2000白玉
    { type: 2, itemId: 0, value: 2000 }, // 2000金砖
    { type: 3, itemId: 1023, value: 5 }, // 5彩玉
    { type: 3, itemId: 1022, value: 2500 }, // 2500白玉
    { type: 3, itemId: 1001, value: 12 }, // 12个招募令
  ];

  if (!rewards || !Array.isArray(rewards)) return false;

  for (const prize of bigPrizes) {
    const found = rewards.find(
      (reward) =>
        reward.type === prize.type &&
        reward.itemId === prize.itemId &&
        reward.value >= prize.value,
    );
    if (found) return true;
  }

  return false;
};

// 获取车辆状态文本
const getCarStatusText = (carData) => {
  const sendAt = carData.sendAt || 0;
  const claimAt = carData.claimAt || 0;
  const rewards = carData.rewards || [];

  // 优先判断是否可收菜（发过车且完成但未领取）
  if (sendAt > 0 && claimAt == 0 && rewards.length > 0) {
    return "可收菜";
  } else if (sendAt > 0) {
    // 已发车
    return `已发车 `;
  } else {
    // 未发车
    return "未发车";
  }
};

const tokenStore = useTokenStore();

const MyItem = ref({});

// 定义响应式的车辆列表
const CarList = ref([]);

// 按槽位从大到小排序的计算属性
const sortedCarList = computed(() => {
  return [...CarList.value].sort((a, b) => a.slot - b.slot);
});

// 刷新车辆方法
const refreshCar = async (carId) => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status === "connected") {
    try {
      // 构建刷新车辆命令参数
      const params = { carId: carId };
      // 发送刷新车辆命令
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "car_refresh",
        params,
      );
      console.log("刷新车辆命令返回结果:", result);
      // 刷新车辆列表
      await getCarList();

      return result;
    } catch (error) {
      console.error("刷新车辆失败:", error);
      throw error;
    }
  } else {
    console.log("WebSocket未连接，无法刷新车辆");
  }
};

// 收车方法（领取奖励）
const claimCar = async (carId) => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status === "connected") {
    try {
      // 构建收车命令参数
      const params = { carId: carId };
      // 发送收车命令
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "car_claim",
        params,
      );

      console.log("收车命令返回结果:", result);

      // 收车后自动升级赛车科技
      console.log("收车成功，开始升级赛车科技...");
      const currentLevel = await getCarResearchLevel(tokenId);
      await upgradeCarResearch(tokenId, currentLevel);

      // 刷新车辆列表
      await getCarList();

      return result;
    } catch (error) {
      console.error("收车失败:", error);
      throw error;
    }
  } else {
    console.log("WebSocket未连接，无法收车");
  }
};

// 升级赛车科技方法
const upgradeCarResearch = async (tokenId, initialLevel = 0) => {
  try {
    console.log(`[upgradeCarResearch] 开始升级赛车科技，初始等级: ${initialLevel}`);
    
    // 获取当前科技等级和零件数量
    const roleRes = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
      5000,
    );
    let refreshpieces = Number(
      roleRes?.role?.items?.[35009]?.quantity || 0,
    );
    let refreshlevel = initialLevel;
    
    console.log(`[upgradeCarResearch] 当前零件数量: ${refreshpieces}, 科技等级: ${refreshlevel}`);

    // 循环升级科技
    let upgradeCount = 0;
    while (
      refreshlevel < CarresearchItem.length &&
      refreshpieces >= CarresearchItem[refreshlevel]
    ) {
      const cost = CarresearchItem[refreshlevel];
      console.log(`[upgradeCarResearch] 尝试升级: 等级 ${refreshlevel} -> ${refreshlevel + 1}, 消耗: ${cost}, 拥有: ${refreshpieces}`);
      
      try {
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "car_research",
          { researchId: 1 },
          5000,
        );
        refreshlevel++;
        upgradeCount++;

        // 更新零件数量
        const updatedRoleRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "role_getroleinfo",
          {},
          5000,
        );
        refreshpieces = Number(
          updatedRoleRes?.role?.items?.[35009]?.quantity || 0,
        );

        console.log(`[upgradeCarResearch] ✅ 升级成功，当前等级: ${refreshlevel}, 剩余零件: ${refreshpieces}`);
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.error(`[upgradeCarResearch] ❌ 升级失败:`, e.message);
        break;
      }
    }
    
    if (upgradeCount === 0) {
      console.log(`[upgradeCarResearch] ⚠️ 没有进行任何升级，原因: 零件不足或已达最高等级`);
    } else {
      console.log(`[upgradeCarResearch] ✅ 共升级 ${upgradeCount} 次，最终等级: ${refreshlevel}`);
    }

    // 尝试领取改装升级累计奖励
    try {
      const rewardRes = await tokenStore.sendMessageWithPromise(
        tokenId,
        "car_claimpartconsumereward",
        {},
        5000,
      );
      if (rewardRes && rewardRes.reward) {
        console.log("[upgradeCarResearch] ✅ 领取改装升级累计奖励成功");
      }
    } catch (e) {
      // 忽略错误
    }

    return refreshlevel;
  } catch (error) {
    console.error("[upgradeCarResearch] ❌ 升级赛车科技失败:", error.message);
    return initialLevel;
  }
};

// 发车方法
const sendCar = async (carId) => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status === "connected") {
    try {
      // 构建发车命令参数
      const params = {
        carId: carId,
        helperId: 0, // 默认助战ID为0
        text: "", // 默认发车文本
      };

      // 发送发车命令
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "car_send",
        params,
      );
      console.log("发车命令返回结果:", result);
      // 刷新车辆列表
      await getCarList();

      return result;
    } catch (error) {
      console.error("发车失败:", error);
      throw error;
    }
  } else {
    console.log("WebSocket未连接，无法发车");
  }
};

// 获取当前科技等级
const getCarResearchLevel = async (tokenId) => {
  try {
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "car_getrolecar",
      {},
      5000,
    );
    return res?.roleCar?.research?.[1] || 0;
  } catch (error) {
    console.error("获取科技等级失败:", error.message);
    return 0;
  }
};

// 一键收车方法
const claimAllCars = async () => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  console.log(`[claimAllCars] 开始一键收车，Token状态: ${status}`);
  
  if (status === "connected") {
    try {
      // 获取初始科技等级
      console.log(`[claimAllCars] 获取初始科技等级...`);
      let currentResearchLevel = await getCarResearchLevel(tokenId);
      console.log(`[claimAllCars] 初始科技等级: ${currentResearchLevel}`);

      // 筛选出所有可收菜的车辆
      const claimableCars = sortedCarList.value.filter(
        (car) => car.status === "claimable",
      );
      console.log(`[claimAllCars] 可收车辆数量: ${claimableCars.length}`);

      if (claimableCars.length === 0) {
        console.log(`[claimAllCars] ⚠️ 没有可收的车辆`);
        // 即使没有可收的车，也尝试升级科技（可能之前有零件）
        await upgradeCarResearch(tokenId, currentResearchLevel);
        return;
      }

      // 遍历所有可收菜的车辆并执行收车操作
      for (let i = 0; i < claimableCars.length; i++) {
        const car = claimableCars[i];
        try {
          console.log(`[claimAllCars] 正在收车 ${i + 1}/${claimableCars.length}: ${car.id}`);
          
          // 构建收车命令参数
          const params = { carId: car.id };
          // 发送收车命令
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "car_claim",
            params,
          );
          console.log(`[claimAllCars] ✅ 收车成功: ${car.id}`);

          // 每收一辆车后尝试升级科技
          console.log(`[claimAllCars] 收车后升级科技...`);
          currentResearchLevel = await upgradeCarResearch(
            tokenId,
            currentResearchLevel,
          );
          console.log(`[claimAllCars] 当前科技等级更新为: ${currentResearchLevel}`);

          // 为了避免请求过于频繁，可以添加一个小的延迟
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`[claimAllCars] ❌ 收车失败 ${car.id}:`, error);
          // 继续收其他车辆，不中断整个过程
        }
      }

      // 最后再尝试一次升级（收取所有车辆后可能累积了更多零件）
      console.log(`[claimAllCars] 所有车辆收完，最终升级科技...`);
      await upgradeCarResearch(tokenId, currentResearchLevel);

      // 最后统一刷新一次车辆列表
      console.log(`[claimAllCars] 刷新车辆列表...`);
      await getCarList();

      console.log(`[claimAllCars] ✅ 一键收车完成`);
    } catch (error) {
      console.error(`[claimAllCars] ❌ 一键收车过程中发生错误:`, error);
    }
  } else {
    console.log(`[claimAllCars] ❌ WebSocket未连接，无法一键收车`);
  }
};

// 查询车辆列表方法
const getCarList = async () => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status === "connected") {
    // 执行车辆查询命令
    try {
      // 构建符合格式的命令参数
      const params = {};
      // 使用sendMessageWithPromise以获取返回结果
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "car_getrolecar",
        params,
      );
      //获取车辆刷新票数量
      const result1 = await tokenStore.sendMessageWithPromise(
        tokenId,
        "role_getroleinfo",
        params,
      );
      MyItem.value = result1.role.items[35002]
        ? result1.role.items[35002].quantity || 0
        : 0;
      // console.log('车辆查询命令返回结果:', result)

      // 处理返回的车辆数据
      if (result && result.roleCar && result.roleCar.carDataMap) {
        const carDataMap = result.roleCar.carDataMap;
        const processedCars = [];

        // 遍历所有车辆
        for (const carId in carDataMap) {
          if (carDataMap.hasOwnProperty(carId)) {
            const carInfo = carDataMap[carId];
            const color = carInfo.color || 0;
            const slot = carInfo.slot || 0;
            const colorName = getColorName(color);
            const sendAt = carInfo.sendAt || 0;
            const claimAt = carInfo.claimAt || 0;
            const rewards = carInfo.rewards || [];

            // 构建车辆对象
            const car = {
              id: carId,
              slot: slot,
              color: color,
              color_name: colorName,
              sendAt: sendAt,
              claimAt: claimAt,
              rewards: rewards,
              // 添加其他可能需要的属性
              raided: carInfo.raided || 0,
              // 根据Python逻辑添加状态判断
              status:
                sendAt > 0 && claimAt === 0 && rewards.length > 0
                  ? "claimable"
                  : sendAt > 0
                    ? "sent"
                    : "unsent",
            };

            processedCars.push(car);
          }
        }

        // 更新响应式的车辆列表
        CarList.value = processedCars;
      }

      return result;
    } catch (error) {
      console.error("查询车辆失败:", error);
      throw error;
    }
  } else {
    console.log("WebSocket未连接，无法查询车辆");
  }
};

// 初始化和数据加载
const loadRoleData = async () => {
  await getCarList();
};

// 组件挂载时初始化
onMounted(async () => {
  await loadRoleData();
});

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

// 计算奖励中包含的赛车刷新券数量
const countRacingRefreshTickets = (rewards) => {
  if (!rewards || !Array.isArray(rewards)) return 0;

  let count = 0;
  for (const reward of rewards) {
    if (reward.type === 3 && reward.itemId === 35002) {
      count += reward.value;
    }
  }
  return count;
};

// 判断车辆是否符合发车条件
const shouldSendCar = (carInfo, refreshTickets) => {
  const color = carInfo.color || 0;
  const rewards = carInfo.rewards || [];

  // 计算奖励中的赛车刷新券数量
  const racingTicketsCount = countRacingRefreshTickets(rewards);

  // 如果刷新券充足（>=6），寻找神话以上|赛车刷新券>=4|大奖车
  if (refreshTickets >= 6) {
    return (
      color >= 5 || // 神话以上
      racingTicketsCount >= 4 || // 赛车刷新券>=4
      isBigPrize(rewards)
    ); // 大奖车
  } else {
    // 刷新券不足，寻找传说以上|赛车刷新券>=2|大奖车
    return (
      color >= 4 || // 传说以上
      racingTicketsCount >= 2 || // 赛车刷新券>=2
      isBigPrize(rewards)
    ); // 大奖车
  }
};

// 智能发车方法
const smartSendCar = async () => {
  const tokenId = tokenStore.selectedToken.id;
  const status = tokenStore.getWebSocketStatus(tokenId);

  if (status === "connected") {
    try {
      // 首先查询最新的车辆列表
      await getCarList();

      // 获取当前刷新券数量
      const refreshTickets = MyItem.value || 0;

      // 创建车辆数据映射
      const carDataMap = {};
      sortedCarList.value.forEach((car) => {
        carDataMap[car.id] = car;
      });

      console.log(`=== 开始智能发车 ===`);
      console.log(`当前刷新券数量: ${refreshTickets}`);

      // 遍历所有未发车的车辆
      for (const car of sortedCarList.value) {
        if (car.status === "unsent") {
          console.log(`=== 处理车辆: ${car.id}，槽位: ${car.slot} ===`);
          console.log(`当前车辆品质: ${car.color_name}(${car.color})`);

          // 判断当前车辆是否符合发车条件
          if (shouldSendCar(car, refreshTickets)) {
            console.log("✅ 该车辆已符合发车条件，开始发车");
            await sendCar(car.id);
            await new Promise((resolve) => setTimeout(resolve, 500)); // 发车后延迟
            continue;
          }

          // 获取当前车辆的刷新次数
          const refreshCount = car.refreshCount || 0;

          // 判断是否应该刷新这辆车
          let shouldRefresh = false;
          let remainingTickets = refreshTickets;

          if (refreshTickets >= 6) {
            // 刷新券充足时：使用刷新券寻找神话以上|赛车刷新券>=4|大奖车
            console.log(
              `💎 刷新券充足，使用刷新券刷新该车辆 (当前刷新券: ${refreshTickets})`,
            );
            shouldRefresh = true;
          } else {
            // 刷新券不足时
            if (refreshCount === 0) {
              // 有免费刷新：使用免费刷新寻找传说以上|赛车刷新券>=2|大奖车
              console.log("🎯 刷新券不足，使用免费刷新寻找传说以上车辆");
              shouldRefresh = true;
            } else {
              // 没有免费刷新且刷新券不足，直接发车
              console.log("🔄 没有免费刷新且刷新券不足，直接发车");
              await sendCar(car.id);
              await new Promise((resolve) => setTimeout(resolve, 500)); // 发车后延迟
              continue;
            }
          }

          // 持续刷新这辆车直到找到符合条件的车辆或无法继续刷新
          while (shouldRefresh) {
            // 执行刷新
            console.log(`正在刷新车辆: ${car.id}`);
            const refreshResult = await refreshCar(car.id);

            // 重新获取车辆列表以更新数据
            await getCarList();

            // 查找更新后的车辆信息
            const updatedCar = sortedCarList.value.find((c) => c.id === car.id);
            if (!updatedCar) {
              console.error("刷新后未找到车辆信息");
              shouldRefresh = false;
              break;
            }

            // 更新车辆信息
            carDataMap[car.id] = updatedCar;

            // 如果使用了刷新券，需要更新刷新券数量
            if (refreshCount > 0) {
              // 不是免费刷新
              remainingTickets = MyItem.value || 0;
              console.log(`消耗1张刷新券，剩余刷新券: ${remainingTickets}`);
            }

            // 再次判断是否符合发车条件
            if (shouldSendCar(updatedCar, remainingTickets)) {
              console.log("✅ 刷新后车辆符合发车条件，开始发车");
              await sendCar(updatedCar.id);
              await new Promise((resolve) => setTimeout(resolve, 500)); // 发车后延迟
              shouldRefresh = false;
              break;
            } else {
              console.log("❌ 刷新后仍不符合发车条件");
              console.log(
                `当前车辆品质: ${updatedCar.color_name}(${updatedCar.color})`,
              );

              // 检查是否可以继续刷新
              const newRefreshCount = updatedCar.refreshCount || 0;
              if (remainingTickets >= 6) {
                // 刷新券充足，继续使用刷新券
                console.log(
                  `💎 继续使用刷新券刷新该车辆 (当前刷新券: ${remainingTickets})`,
                );
                shouldRefresh = true;
              } else if (newRefreshCount === 0) {
                // 刷新券不足，但可以继续免费刷新
                console.log("🎯 该车辆可以继续免费刷新");
                shouldRefresh = true;
              } else {
                // 没有免费刷新且刷新券不足，直接发车
                console.log("🔄 没有免费刷新且刷新券不足，直接发车");
                await sendCar(updatedCar.id);
                await new Promise((resolve) => setTimeout(resolve, 500)); // 发车后延迟
                shouldRefresh = false;
              }
            }
          }
        }
      }

      console.log("🎉 智能发车流程完成");
      // 最后统一刷新一次车辆列表
      await getCarList();
    } catch (error) {
      console.error("智能发车过程中发生错误:", error);
    }
  } else {
    console.log("WebSocket未连接，无法智能发车");
  }
};

// 监听WebSocket状态变化
const wsStatus = computed(() => {
  if (!tokenStore.selectedToken) return "disconnected";
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
});

watch(wsStatus, async (newStatus) => {
  if (newStatus === "connected" && tokenStore.selectedToken) {
    // 降噪
    await loadRoleData();
  }
});
</script>

<style scoped lang="scss">
.status-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all var(--transition-normal);
  min-height: 200px;

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
}
.status-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}
.status-info {
  flex: 1;

  h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-xs) 0;
  }

  p {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }
}
.card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}
.card-header img {
  width: 60px;
}
.query-btn {
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 25px;
  padding: var(--spacing-sm) 10px;
  margin: 0 5px;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-normal);
  white-space: nowrap;

  &:hover {
    background: var(--primary-hover-color);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    background: var(--bg-disabled);
    cursor: not-allowed;
    transform: none;
  }
}
.card-content {
  .time-display {
    font-size: 1rem; /* text-2xl */
    font-weight: 600; /* font-bold */
    color: var(--text-primary);
    text-align: center;
    margin-bottom: var(--spacing-md);
    font-family:
      "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Consolas", monospace;
    letter-spacing: 0.1em;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    background: var(--bg-tertiary);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-light);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease-in-out;

    &:hover {
      transform: translateY(-1px);
      box-shadow:
        0 4px 6px rgba(0, 0, 0, 0.1),
        0 2px 4px rgba(0, 0, 0, 0.06);
    }
  }

  .description {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    margin-bottom: var(--spacing-lg);
  }

  .club-name {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-lg);

    strong {
      color: var(--text-primary);
      font-weight: var(--font-weight-medium);
    }
  }

  .tower-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);

    .label {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
    }

    .tower-level {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--text-primary);
    }
  }

  .no-data {
    text-align: center;
    color: var(--text-secondary);
    padding: 2rem;
  }

  .car-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
    overflow-y: scroll;
    height: 250px;
  }

  .car-item {
    background: var(--bg-secondary);
    border-radius: 10px;
    padding: 10px;
    border: 1px solid var(--border-light);
    flex: 0 0 calc(50% - var(--spacing-md) / 2);
    box-sizing: border-box;
    transition: transform 0.2s ease;
  }

  .car-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    .car-item {
      flex: 0 0 100%;
    }
  }

  .car-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-sm);
  }

  .car-header h4 {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  .car-rarity {
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .rarity-1 {
    background: #9e9e9e;
    color: white;
    border-radius: 10px;
  } // 普通
  .rarity-2 {
    background: #4caf50;
    color: white;
    border-radius: 10px;
  } // 稀有
  .rarity-3 {
    background: #2196f3;
    color: white;
    border-radius: 10px;
  } // 史诗
  .rarity-4 {
    background: #9c27b0;
    color: white;
    border-radius: 10px;
  } // 传说
  .rarity-5 {
    background: #ff9800;
    color: white;
    border-radius: 10px;
  } // 神话

  .car-info {
    margin-bottom: var(--spacing-sm);
  }

  .car-info p {
    margin: 0.25rem 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .status-claimable {
    color: #4caf50;
    font-weight: var(--font-weight-semibold);
  }

  .status-sent {
    color: #2196f3;
  }

  .status-unsent {
    color: #9e9e9e;
  }

  .raided-warning {
    color: #f44336;
  }

  .car-rewards {
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--border-light);
  }

  .car-rewards h5 {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  .car-rewards ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .car-rewards li {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0.25rem 0;
    display: flex;
    align-items: center;
  }

  .big-prize {
    color: #ff9800;
    font-weight: var(--font-weight-bold);
    margin-left: 0.5rem;
  }

  .big-prize-badge {
    background: #fff3e0;
    color: #f57c00;
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    display: inline-block;
    margin-top: var(--spacing-xs);
  }
}
</style>
