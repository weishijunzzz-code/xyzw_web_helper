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
  const batchPkRoomAppoint = async () => {
    await runBatch("PK房间预约", async (tokenId, token) => {
      await tokenStore.sendMessageWithPromise(tokenId, "pkroom_appoint", {}, 8000);
      addLog({ time: new Date().toLocaleTimeString(), message: `${token.name} PK房间预约成功`, type: "success" });
    });
  };

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

  return {
    legion_storebuygoods,
    legionStoreBuySkinCoins,
    store_purchase,
    collection_claimfreereward,
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
