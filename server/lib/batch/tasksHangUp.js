/**
 * 挂机、答题、签到类任务
 * 包含: claimHangUpRewards, batchAddHangUpTime, batchStudy, batchclubsign,
 *       batchLegionWarSignUp, batchJoinClub
 */

import { preloadQuestions, findAnswer } from '../studyQuestionsFromJSON.js';

/**
 * 创建挂机、答题、签到类任务执行器
 * @param {Object} deps - 依赖项
 * @returns {Object} 任务函数集合
 */
export function createTasksHangUp(deps) {
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
  } = deps;

  /**
   * 领取挂机奖励
   */
  const claimHangUpRewards = async () => {
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
          message: `=== 开始领取挂机: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        // 1. Claim reward
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 领取挂机奖励`,
          type: "info",
        });
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "system_claimhangupreward",
          {},
          5000,
        );
        await new Promise((r) => setTimeout(r, 500));

        // 2. Add time 4 times
        for (let i = 0; i < 4; i++) {
          if (shouldStop.value) break;
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 挂机加钟 ${i + 1}/4`,
            type: "info",
          });
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "system_mysharecallback",
            { isSkipShareCard: true, type: 2 },
            5000,
          );
          await new Promise((r) => setTimeout(r, 500));
        }

        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 领取挂机奖励完成 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 领取挂机奖励失败: ${error.message}`,
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

    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量领取挂机结束");
  };

  /**
   * 一键加钟
   */
  const batchAddHangUpTime = async () => {
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
          message: `=== 开始一键加钟: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        for (let i = 0; i < 4; i++) {
          if (shouldStop.value) break;
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 执行加钟 ${i + 1}/4`,
            type: "info",
          });
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "system_mysharecallback",
            { isSkipShareCard: true, type: 2 },
            5000,
          );
          await new Promise((r) => setTimeout(r, 500));
        }
        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 加钟完成 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 加钟失败: ${error.message || "未知错误"}`,
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
    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量加钟结束");
  };

  /**
   * 一键答题
   */
  const batchStudy = async () => {
    if (selectedTokens.value.length === 0) return;

    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在加载题库...`,
      type: "info",
    });
    const questions = await preloadQuestions();


    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;

      tokenStatus.value[tokenId] = "running";

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始答题: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        const resp = await tokenStore.sendMessageWithPromise(
          tokenId,
          "study_startgame",
          {},
          5000,
        );

        const questionList = resp?.questionList || resp?.body?.questionList || [];
        const studyId = resp?.role?.study?.id || resp?.body?.role?.study?.id || resp?.study?.id || resp?.id;

        if (!questionList.length) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 未获取到题目，可能已答过`,
            type: "warning",
          });
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 获取到 ${questionList.length} 道题, studyId=${studyId}`,
            type: "info",
          });

          let answered = 0;
          for (const q of questionList) {
            if (shouldStop.value) break;
            const answer = await findAnswer(q.question) || (Math.floor(2 * Math.random()) + 1);
            try {
              await tokenStore.sendMessageWithPromise(
                tokenId,
                "study_answer",
                { id: studyId, option: [answer], questionId: [q.id] },
                5000,
              );
              answered++;
            } catch (e) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 第${answered+1}题失败: ${e.message}`,
                type: "error",
              });
            }
            await new Promise(r => setTimeout(r, 1000));
          }

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 答对 ${answered}/${questionList.length} 题`,
            type: "info",
          });

          for (let rewardId = 1; rewardId <= 10; rewardId++) {
            try {
              await tokenStore.sendMessageWithPromise(
                tokenId,
                "study_claimreward",
                { rewardId },
                3000,
              );
            } catch {}
            await new Promise(r => setTimeout(r, 200));
          }
        }

        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 答题完成 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `答题失败: ${error.message}`,
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

    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量答题结束");
  };

  /**
   * 一键俱乐部签到
   */
  const batchclubsign = async () => {
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
          message: `=== 开始一键俱乐部签到: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        if (shouldStop.value) return;
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "legion_signin",
          {},
          5000,
        );
        await new Promise((r) => setTimeout(r, 500));
        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 俱乐部签到已完成 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 俱乐部签到失败: ${error.message || "未知错误"}`,
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
    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量俱乐部签到结束");
  };

  /**
   * 月赛助威
   * @param {number} legionId - 俱乐部ID
   * @param {number} guessCoin - 竞猜币数量
   */
  const batchWarGuessCheer = async (legionId, guessCoin) => {
    if (selectedTokens.value.length === 0) {
      message.warning("请先选择账号");
      return;
    }
    if (!legionId) {
      message.warning("请选择要助威的俱乐部");
      return;
    }
    
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
          message: `=== 开始助威: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        
        // 尝试领取拍手器
        try {
          const rewardRes = await tokenStore.sendMessageWithPromise(
            tokenId,
            "warguess_getguesscoinreward",
            {},
            3000
          );
          if (rewardRes && rewardRes.reward) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 领取拍手器成功 ===`,
              type: "success",
            });
          }
        } catch (e) {
          // 忽略领取失败
        }

        // 获取助威数据以判断次数
        const rankRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "warguess_getrank",
          { bfId: '' },
          5000,
        );

        let totalGuessNum = 0;
        if (rankRes && rankRes.list) {
          let list = [];
          if (Array.isArray(rankRes.list)) {
            list = rankRes.list;
          } else {
            list = Object.values(rankRes.list);
          }
          totalGuessNum = list.reduce((sum, item) => sum + (item.guessNum || 0), 0);
        }

        if (totalGuessNum === 20) {
             addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 助威次数已满 (${totalGuessNum}/20)，跳过 ===`,
                type: "warning",
              });
             tokenStatus.value[tokenId] = "completed";
             return;
        }

        let coinToUse = Number(guessCoin);
        const remaining = 20 - totalGuessNum;
        
        if (coinToUse > remaining) {
            addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 剩余助威次数不足，调整为 ${remaining} 次 (原计划: ${coinToUse}) ===`,
                type: "info",
            });
            coinToUse = remaining;
        }

        if (coinToUse <= 0) {
             tokenStatus.value[tokenId] = "completed";
             return;
        }

        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "warguess_startguess",
          { guessCoin: coinToUse, legionId: legionId },
          5000,
        );

        if (result && result.guessLegion) {
             addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 助威成功 (当前次数: ${result.guessLegion.guessNum}/20) ===`,
                type: "success",
              });
             tokenStatus.value[tokenId] = "completed";
        } else {
             addLog({
                time: new Date().toLocaleTimeString(),
                message: `=== ${token.name} 助威失败 ===`,
                type: "error",
              });
             tokenStatus.value[tokenId] = "failed";
        }
      } catch (error) {
        console.error(error);
        
        if (error.code === 400000 || (error.message && error.message.includes("400000"))) {
          tokenStatus.value[tokenId] = "completed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== ${token.name} 助威失败: 未解锁该功能===`,
            type: "warning",
          });
        } else {
          tokenStatus.value[tokenId] = "failed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 助威失败: ${error.message || "未知错误"}`,
            type: "error",
          });
        }
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 连接已关闭`,
          type: "info",
        });
      }
    });

    await Promise.all(taskPromises);
    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量助威结束");
  };

  /**
   * 一键盐场报名
   */
  const batchLegionWarSignUp = async () => {
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
          message: `=== 开始盐场报名: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        if (shouldStop.value) return;
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "legion_signup",
          {},
          5000,
        );
        await new Promise((r) => setTimeout(r, 500));
        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 盐场报名已完成 ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 盐场报名失败: ${error.message || "未知错误"}`,
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
    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量盐场报名结束");
  };

  /**
   * 一键加入俱乐部（串行处理）
   * @param {string|number} clubId - 俱乐部ID（定时任务 settings 传入）
   * @param {string} reason - 申请理由
   */
  const batchJoinClub = async (clubId, reason) => {
    if (selectedTokens.value.length === 0) {
      message.warning("请先选择账号");
      return;
    }
    if (!clubId) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: "未配置俱乐部ID，跳过一键加入俱乐部（需在定时任务设置中加入 joinClubId）",
        type: "warning",
      });
      return;
    }

    isRunning.value = true;
    const results = [];

    for (let i = 0; i < selectedTokens.value.length; i++) {
      const tokenId = selectedTokens.value[i];
      const token = tokens.value.find((t) => t.id === tokenId);
      if (!token) continue;

      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始加入俱乐部: ${token.name} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        // 检查是否已加入俱乐部
        let clubInfo = null;
        try {
          clubInfo = await tokenStore.sendMessageWithPromise(
            tokenId,
            "legion_getinfo",
            {},
            5000,
          );
        } catch (e) {
          // 获取失败说明可能未加入俱乐部，继续申请
          clubInfo = null;
        }

        if (clubInfo && (clubInfo.legionId || clubInfo.id || (clubInfo.info && clubInfo.info.id))) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 已加入俱乐部，跳过`,
            type: "info",
          });
          results.push({ tokenId, success: false, message: "已加入俱乐部" });
          continue;
        }

        // 发送加入申请
        let response;
        try {
          response = await tokenStore.sendMessageWithPromise(
            tokenId,
            "legion_applyjoin",
            {
              legionId: Number(clubId),
              applyReason: String(reason || "").trim(),
            },
            10000,
          );
        } catch (e) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 申请加入请求失败: ${e.message || "未知错误"}`,
            type: "error",
          });
          results.push({ tokenId, success: false, message: e.message });
          continue;
        }

        // 处理响应
        const errorCode = response?.error || response?.code || response?.ret;
        if (errorCode === 0 || errorCode === undefined || errorCode === null) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 申请加入俱乐部成功`,
            type: "success",
          });
          results.push({ tokenId, success: true, message: "申请成功" });
        } else {
          const errorMsg = response?.msg || response?.message || `错误码: ${errorCode}`;
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 申请加入失败: ${errorMsg}`,
            type: "error",
          });
          results.push({ tokenId, success: false, message: errorMsg });
        }
      } catch (error) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 申请加入失败: ${error.message || "未知错误"}`,
          type: "error",
        });
        results.push({ tokenId, success: false, message: error.message });
      } finally {
        tokenStore.closeWebSocketConnection(tokenId);
        releaseConnectionSlot();
      }

      // 串行延迟避免请求过快
      if (i < selectedTokens.value.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    isRunning.value = false;
    currentRunningTokenId.value = null;

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    message.success(`批量加入俱乐部完成：成功 ${successCount} 个，失败 ${failCount} 个`);
  };

  return {
    claimHangUpRewards,
    batchAddHangUpTime,
    batchStudy,
    batchclubsign,
    batchLegionWarSignUp,
    batchJoinClub,
    batchWarGuessCheer,
  };
}
