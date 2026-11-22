import { appointPkRoom } from "../../../src/utils/batch/apexEventTasks.js";
import { runAccountBatch } from "../../../src/utils/batch/runAccountBatch.js";
/**
 * 商店类任务
 * 包含: legion_storebuygoods, legionStoreBuySkinCoins, store_purchase, collection_claimfreereward,
 *       weeklyFreeGift, mondayFreeGift, gachaFreeDrawWeekly, batchPkRoomAppoint, blackMarketPurchaseList
 */

const ACTIVITY_CYCLE_START = new Date("2025-12-12T12:00:00+08:00").getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_CYCLE_MS = 3 * WEEK_MS;

function getActivityWeek(date = new Date()) {
  const elapsed = date.getTime() - ACTIVITY_CYCLE_START;
  if (elapsed < 0) return null;
  const cyclePos = elapsed % ACTIVITY_CYCLE_MS;
  if (cyclePos < WEEK_MS) return "blackMarket";
  if (cyclePos < 2 * WEEK_MS) return "recruit";
  return "box";
}

/**
 * 创建商店类任务执行器
 * @param {Object} deps - 依赖项
 * @returns {Object} 任务函数集合
 */
export function createTasksStore(deps) {
  const {
    selectedTokens,
    tokens,
    tokenStatus,
    isRunning,
    shouldStop,
    ensureConnection,
    releaseConnectionSlot,
    connectionQueue,
    batchSettings,
    tokenStore,
    addLog,
    message,
    currentRunningTokenId,
    delayConfig,
    loadSettings,
  } = deps;

  /**
   * 一键购买四圣碎片
   */
  const legion_storebuygoods = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买四圣碎片: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送购买请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "legion_storebuygoods",
          { id: 6 },
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          if (result.error.includes("俱乐部商品购买数量超出上限")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 本周已购买过四圣碎片，跳过`,
              type: "info",
            });
          } else if (result.error.includes("物品不存在")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 盐锭不足或未加入军团，购买失败`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 购买失败: ${result.error}`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          }
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 购买成功，获得四圣碎片`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 一键购买俱乐部5皮肤币
   */
  const legionStoreBuySkinCoins = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买俱乐部5皮肤币: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送购买请求...`,
          type: "info",
        });

        let result = null;
        for (let i = 0; i < 5; i++) {
          if (shouldStop.value) break;
          result = await tokenStore.sendMessageWithPromise(
            tokenId,
            "legion_storebuygoods",
            { id: 1 },
            5000,
          );

          await new Promise((r) => setTimeout(r, delayConfig.action));
        }

        if (result && result.error) {
          if (result.error.includes("俱乐部商品购买数量超出上限")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 本周已购买过皮肤币，跳过`,
              type: "info",
            });
          } else if (result.error.includes("物品不存在")) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 盐锭不足或未加入军团，购买失败`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 购买失败: ${result.error}`,
              type: "error",
            });
            tokenStatus.value[tokenId] = "failed";
          }
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 购买成功，获得皮肤币`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 免费领取珍宝阁每日奖励
   */
  const collection_claimfreereward = async () => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;
    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始免费领取珍宝阁: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送珍宝阁免费领取请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "collection_claimfreereward",
          {},
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 珍宝阁领取失败: ${result.error}`,
            type: "error",
          });
          tokenStatus.value[tokenId] = "failed";
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 珍宝阁领取成功`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 珍宝阁领取过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 黑市一键采购
   */
  const store_purchase = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始黑市一键采购: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送黑市采购请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "store_purchase",
          {},
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 黑市采购失败: ${result.error}`,
            type: "error",
          });
          tokenStatus.value[tokenId] = "failed";
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 黑市采购成功`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 黑市采购过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  // 通用批量执行器：对每个号连接后执行 handler
  const runBatch = async (label, handler) => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;
    selectedTokens.value.forEach((id) => { tokenStatus.value[id] = "waiting"; });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;
      tokenStatus.value[tokenId] = "running";
      const token = tokens.value.find((t) => t.id === tokenId);
      if (!token) return;
      try {
        addLog({ time: new Date().toLocaleTimeString(), message: `=== 开始${label}: ${token.name} ===`, type: "info" });
        await ensureConnection(tokenId);
        await handler(tokenId, token);
        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} ${label}失败: ${error.message}`, type: "error" });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
      }
    });

    await Promise.all(taskPromises);
    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  // 每周免费礼包（黑市周/招募周/宝箱周 各自的免费档位 goodsIndex 0）
  const weeklyFreeGift = async () => {
    await runBatch("领取每周免费礼包", async (tokenId, token) => {
      const week = getActivityWeek();
      const activityId = week === "recruit" ? 6 : (week === "blackMarket" ? 5 : (week === "box" ? 7 : null));
      if (!activityId) {
        addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 当前活动周未知，跳过`, type: "warning" });
        return;
      }
      await tokenStore.sendMessageWithPromise(tokenId, "activity_buystoregoods", { activityId, goodsIndex: 0, buyNum: 1 }, 8000);
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 每周免费礼包领取成功`, type: "success" });
    });
  };

  // 周一免费礼包
  const mondayFreeGift = async () => {
    await runBatch("领取周一免费礼包", async (tokenId, token) => {
      await tokenStore.sendMessageWithPromise(tokenId, "activity_claimrolluppack", { id: 17 }, 8000);
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 周一免费礼包领取成功`, type: "success" });
    });
  };

  // 每周免费抽卡
  const gachaFreeDrawWeekly = async () => {
    await runBatch("每周免费抽卡", async (tokenId, token) => {
      await tokenStore.sendMessageWithPromise(tokenId, "gacha_drawreward", { num: 1, isGroup: false }, 8000);
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 每周免费抽卡成功`, type: "success" });
    });
  };

  // PK房间预约
  const batchPkRoomAppoint = () => runAccountBatch(deps, "赛事预约", appointPkRoom);

  // 黑市购买清单（仅黑市周执行，goodsIndex 清单可在每号设置 blackMarketPurchaseList 配置）
  const blackMarketPurchaseList = async () => {
    await runBatch("黑市购买清单", async (tokenId, token) => {
      if (getActivityWeek() !== "blackMarket") {
        addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 当前非黑市周，跳过`, type: "warning" });
        return;
      }
      let list = [];
      if (loadSettings) {
        const s = await loadSettings(tokenId);
        if (Array.isArray(s?.blackMarketPurchaseList)) list = s.blackMarketPurchaseList;
      }
      if (list.length === 0) {
        addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 未配置黑市购买清单，跳过`, type: "warning" });
        return;
      }
      let ok = 0, fail = 0;
      for (const goodsIndex of list) {
        try {
          await tokenStore.sendMessageWithPromise(tokenId, "activity_buystoregoods", { activityId: 9, goodsIndex: Number(goodsIndex), buyNum: 1 }, 5000);
          ok++;
        } catch { fail++; }
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 黑市购买完成: 成功${ok}, 失败${fail}`, type: "success" });
    });
  };

  // 工具：判断错误是否属于"已领取/已满/未达标"等可忽略类
  const isIgnorableErr = (msg) => {
    const m = String(msg || "");
    return ["已领取", "超出上限", "1100010", "1100060", "1100070", "12200050", "12200060", "12200040", "3500020", "200020"].some(k => m.includes(k));
  };

  // 充值累计奖励（积分好礼），循环 id 1-15
  const charge_claimaddup_rewards = async () => {
    await runBatch("积分好礼领取", async (tokenId, token) => {
      let ok = 0, skip = 0;
      for (let id = 1; id <= 15; id++) {
        try {
          await tokenStore.sendMessageWithPromise(tokenId, "charge_claimaddup", { id }, 5000);
          ok++;
        } catch (e) {
          if (isIgnorableErr(e.message)) { skip++; } else { skip++; }
        }
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 积分好礼领取完成: 成功${ok}, 跳过${skip}`, type: ok > 0 ? "success" : "info" });
    });
  };

  // 招募福利（周福利综合：根据活动周领对应免费礼 + 锤子 + 周一礼 + 砸金蛋）
  const claim_recruit_welfare = async () => {
    await runBatch("周免费礼领取", async (tokenId, token) => {
      const week = getActivityWeek();
      const isMonday = new Date().getDay() === 1;
      const tasks = [
        { name: "招募周免费礼", cmd: "activity_buystoregoods", params: { activityId: 6, goodsIndex: 0, buyNum: 1 }, when: week === "recruit" },
        { name: "黑市周免费礼", cmd: "activity_buystoregoods", params: { activityId: 5, goodsIndex: 0, buyNum: 1 }, when: week === "blackMarket" },
        { name: "宝箱周免费礼", cmd: "activity_buystoregoods", params: { activityId: 7, goodsIndex: 0, buyNum: 1 }, when: week === "box" },
        { name: "宝箱周锤子奖励", cmd: "activity_claimredquenchreward", params: {}, when: week === "box" },
        { name: "周一免费礼", cmd: "activity_claimrolluppack", params: { id: 17 }, when: isMonday },
        { name: "砸金蛋", cmd: "item_openpack", params: { itemId: 6001, number: 10, index: 0 }, when: week === "box" },
      ];
      let ok = 0, skip = 0;
      for (const tk of tasks) {
        if (!tk.when) { skip++; continue; }
        try {
          await tokenStore.sendMessageWithPromise(tokenId, tk.cmd, tk.params, 5000);
          ok++;
          addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} ${tk.name}领取成功`, type: "success" });
        } catch (e) {
          skip++;
          if (!isIgnorableErr(e.message)) addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} ${tk.name}失败: ${e.message}`, type: "warning" });
        }
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 周福利完成: 成功${ok}, 跳过${skip}`, type: "info" });
    });
  };

  // 怪异塔奖励全部领取（宝箱1-3 + 俱乐部目标4-9 + 俱乐部特权x4 + 通行证）
  const claim_weird_tower_all = async () => {
    await runBatch("怪异塔奖励领取", async (tokenId, token) => {
      for (let taskId = 1; taskId <= 3; taskId++) {
        try { await tokenStore.sendMessageWithPromise(tokenId, "evotower_claimtask", { taskId }, 5000); } catch {}
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      for (let taskId = 4; taskId <= 9; taskId++) {
        try { await tokenStore.sendMessageWithPromise(tokenId, "evotower_claimlegiontask", { taskId }, 5000); } catch {}
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      for (let i = 0; i < 4; i++) {
        try { await tokenStore.sendMessageWithPromise(tokenId, "evotower_claimlegionprivilege", {}, 5000); } catch {}
        await new Promise((r) => setTimeout(r, delayConfig.action));
      }
      try { await tokenStore.sendMessageWithPromise(tokenId, "activity_battlepassrewardclaim", { battlePassId: 1003 }, 5000); } catch {}
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} 怪异塔奖励领取完成`, type: "success" });
    });
  };

  /**
   * 领取周一免费礼包（活动卷轴礼包）
   */
  const activity_claimrolluppack = async () => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;
    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始领取周一免费礼包: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 发送周一礼包领取请求...`,
          type: "info",
        });
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "activity_claimrolluppack",
          { id: 17 },
          5000,
        );

        await new Promise((r) => setTimeout(r, delayConfig.action));

        if (result.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 周一礼包领取失败: ${result.error}`,
            type: "error",
          });
          tokenStatus.value[tokenId] = "failed";
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 周一礼包领取成功`,
            type: "success",
          });
          tokenStatus.value[tokenId] = "completed";
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 周一礼包领取过程出错: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 江湖黑市购买商品
   * @param {Object} options - 配置选项
   * @param {Array} options.goodsIndices - 要购买的商品索引列表，默认为空数组（购买所有）
   */
  const activityShopBuy = async (options = {}) => {
    if (selectedTokens.value.length === 0) return;

    // 只在非定时任务模式下初始化状态
    if (!isRunning.value) {
      isRunning.value = true;
      shouldStop.value = false;

      selectedTokens.value.forEach((id) => {
        tokenStatus.value[id] = "waiting";
      });
    }

    const { goodsIndices = [] } = options;

    // 江湖黑市商品列表（索引对应 goodsIndex）
    const BLACK_MARKET_GOODS = [
      { goodsIndex: 0, name: '黑市福利', price: 0, limit: 1, rewards: '金砖 x500' },
      { goodsIndex: 1, name: '黑市见面礼', price: 600, limit: 1, rewards: '招募令 x5、精铁 x1000' },
      { goodsIndex: 2, name: '黑市惊喜礼', price: 1200, limit: 1, rewards: '招募令 x10、进阶石 x2000' },
      { goodsIndex: 3, name: '初级黑市包', price: 2500, limit: 1, rewards: '进阶石 x6000' },
      { goodsIndex: 4, name: '中级黑市包', price: 5000, limit: 1, rewards: '铂金箱子 x10、黄金箱子 x10、青铜箱子 x10、木质箱子 x10' },
      { goodsIndex: 5, name: '高级黑市包', price: 8000, limit: 1, rewards: '招募令 x40、随机红将碎片 x50' },
      { goodsIndex: 6, name: '顶级鱼竿包', price: 12000, limit: 1, rewards: '普通鱼竿 x30、黄金鱼竿 x30' },
      { goodsIndex: 7, name: '白玉黑市包', price: 2000, limit: 1, rewards: '白玉 x2000' },
      { goodsIndex: 8, name: '特级灵贝包', price: 25000, limit: 1, rewards: '灵贝 x10' },
      { goodsIndex: 9, name: '养成补给包', price: 8000, limit: 4, rewards: '梦魇晶石 x2000、扳手 x3000' },
    ];

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买江湖黑市商品: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        // 获取活动数据
        const actResult = await tokenStore.sendMessageWithPromise(
          tokenId,
          "activity_get",
          {},
          10000,
        );

        const act = actResult?.activity || actResult?.body?.activity || actResult;
        // 从 myStoreInfo['9'].complete 获取已购买记录
        const myStoreInfo = act?.myStoreInfo || {};
        const blackMarketComplete = myStoreInfo['9']?.complete || {};

        // 根据配置过滤要购买的商品（兼容旧的ID配置）
        const goodsToBuy = goodsIndices.length > 0
          ? BLACK_MARKET_GOODS.filter(g => {
              // 兼容旧的 merchandiseId 配置（8101-8110）
              const oldId = 8101 + g.goodsIndex;
              return goodsIndices.includes(g.goodsIndex) || goodsIndices.includes(oldId);
            })
          : BLACK_MARKET_GOODS;

        let purchasedCount = 0;
        let skippedCount = 0;

        for (const goods of goodsToBuy) {
          if (shouldStop.value) break;

          // 检查是否已购买（complete 中存在该索引表示已购买）
          const alreadyBought = blackMarketComplete[goods.goodsIndex] ? 1 : 0;
          const remaining = goods.limit - alreadyBought;

          if (remaining <= 0) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} ${goods.name} 已购买完毕，跳过`,
              type: "info",
            });
            skippedCount++;
            continue;
          }

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 开始购买 ${goods.name} (价格: ${goods.price}金砖)`,
            type: "info",
          });

          try {
            const result = await tokenStore.sendMessageWithPromise(
              tokenId,
              "activity_buystoregoods",
              { activityId: 9, goodsIndex: goods.goodsIndex, buyNum: 1 },
              5000,
            );

            if (result?.error) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 购买 ${goods.name} 失败: ${result.error}`,
                type: "error",
              });
            } else {
              purchasedCount++;
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 成功购买 ${goods.name}`,
                type: "success",
              });
            }
          } catch (error) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 购买 ${goods.name} 出错: ${error.message}`,
              type: "error",
            });
          }

          await new Promise((r) => setTimeout(r, delayConfig.action));
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 江湖黑市购买完成: 购买 ${purchasedCount} 个，跳过 ${skippedCount} 个 ===`,
          type: "success",
        });

        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        console.error(`${token.name} 购买江湖黑市商品失败:`, error);
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买江湖黑市商品失败: ${error.message}`,
          type: "error",
        });
        tokenStatus.value[tokenId] = "failed";
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  /**
   * 助威商店购买
   * @param {Object} options - 配置选项
   * @param {Array} options.goodsIds - 要购买的商品ID列表
   */
  const executeWarguessStoreBuy = async (options = {}) => {
    if (selectedTokens.value.length === 0) return;

    // 只在非定时任务模式下初始化状态
    if (!isRunning.value) {
      isRunning.value = true;
      shouldStop.value = false;

      selectedTokens.value.forEach((id) => {
        tokenStatus.value[id] = "waiting";
      });
    }

    const { goodsIds = [] } = options;

    // 助威商店商品列表
    const warguessStoreGoods = [
      { id: 7, name: "随机红将碎片" },
      { id: 8, name: "白玉" },
      { id: 9, name: "军团币" },
      { id: 10, name: "进阶石" },
      { id: 11, name: "精铁" },
      { id: 12, name: "梦魇晶石" },
      { id: 13, name: "普通鱼竿" },
      { id: 14, name: "黄金鱼竿" },
      { id: 15, name: "招募令" },
    ];

    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始购买助威商店: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        if (!goodsIds || goodsIds.length === 0) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 未配置助威商店购买清单，跳过`,
            type: "warning",
          });
          tokenStatus.value[tokenId] = "completed";
          return;
        }

        let hasSuccess = false;
        let hasFailure = false;

        for (const goodsId of goodsIds) {
          if (shouldStop.value) break;

          const goodsName = warguessStoreGoods.find(g => g.id === goodsId)?.name || `商品${goodsId}`;

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 购买 ${goodsName}...`,
            type: "info",
          });

          try {
            const result = await tokenStore.sendMessageWithPromise(
              tokenId,
              "legion_storebuygoods",
              { id: goodsId },
              5000,
            );

            await new Promise((r) => setTimeout(r, delayConfig.action));

            if (result.error) {
              if (result.error.includes("俱乐部商品购买数量超出上限")) {
                addLog({
                  time: new Date().toLocaleTimeString(),
                  message: `${token.name} ${goodsName} 已购买过，跳过`,
                  type: "info",
                });
              } else if (result.error.includes("物品不存在")) {
                addLog({
                  time: new Date().toLocaleTimeString(),
                  message: `${token.name} ${goodsName} 助威币不足`,
                  type: "warning",
                });
                hasFailure = true;
              } else {
                addLog({
                  time: new Date().toLocaleTimeString(),
                  message: `${token.name} ${goodsName} 购买失败: ${result.error}`,
                  type: "error",
                });
                hasFailure = true;
              }
            } else {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} ${goodsName} 购买成功`,
                type: "success",
              });
              hasSuccess = true;
            }
          } catch (goodsError) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} ${goodsName} 购买异常: ${goodsError.message}`,
              type: "error",
            });
            hasFailure = true;
          }
        }

        if (hasSuccess && !hasFailure) {
          tokenStatus.value[tokenId] = "completed";
        } else if (hasFailure && !hasSuccess) {
          tokenStatus.value[tokenId] = "failed";
        } else {
          tokenStatus.value[tokenId] = "completed";
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 助威商店购买结束 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 购买助威商店失败: ${error.message}`,
          type: "error",
        });
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);

    currentRunningTokenId.value = null;
    isRunning.value = false;
    shouldStop.value = false;
  };

  return {
    legion_storebuygoods,
    legionStoreBuySkinCoins,
    store_purchase,
    collection_claimfreereward,
    activity_claimrolluppack,
    activityShopBuy,
    executeWarguessStoreBuy,
    weeklyFreeGift,
    mondayFreeGift,
    gachaFreeDrawWeekly,
    batchPkRoomAppoint,
    blackMarketPurchaseList,
    charge_claimaddup_rewards,
    claim_recruit_welfare,
    claim_weird_tower_all,
  };
}
