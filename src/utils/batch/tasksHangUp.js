/**
 * 挂机、答题、签到类任务
 * 包含: claimHangUpRewards, batchAddHangUpTime, batchStudy, batchclubsign
 */
import { fillHangUpTime, runWithDailyTaskLock } from "@/utils/dailyTaskState";

/**
 * 创建挂机、答题、签到类任务执行器
 * @param {object} deps - 依赖项
 * @returns {object} 任务函数集合
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
   * Claim optional hang-up rewards and fill only server-confirmed empty help slots.
   * @param {boolean} claimReward Whether to claim accumulated hang-up rewards first.
   * @returns {Promise<void>} Resolves after selected accounts finish or stop.
   */
  const runHangUpTasks = async (claimReward) => {
    if (isRunning.value || selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;
    const label = claimReward ? "领取挂机并补加钟" : "一键加钟";
    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });
    const taskPromises = selectedTokens.value.map(async (tokenId) => {
      if (shouldStop.value) return;
      tokenStatus.value[tokenId] = "running";
      const token = tokens.value.find((t) => t.id === tokenId);
      if (!token) {
        tokenStatus.value[tokenId] = "failed";
        return;
      }
      try {
        await runWithDailyTaskLock(tokenId, async () => {
          let ownsSlot = false;
          const log = (text, type = "info") =>
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name}: ${text}`,
              type,
            });
          const check = () => {
            if (
              shouldStop.value ||
              tokenStore.getWebSocketStatus(tokenId) !== "connected"
            ) {
              const error = new Error(
                "任务已停止或连接已断开，等待重新读取服务器状态",
              );
              error.interrupted = true;
              throw error;
            }
          };
          try {
            log(`开始${label}`);
            await ensureConnection(tokenId, 2, (owned) => {
              ownsSlot = owned;
            });
            check();
            if (claimReward) {
              log("领取挂机奖励");
              await tokenStore.sendMessageWithPromise(
                tokenId,
                "system_claimhangupreward",
                {},
                5000,
              );
              check();
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            const result = await fillHangUpTime({
              tokenStore,
              tokenId,
              check,
              onLog: log,
            });
            tokenStatus.value[tokenId] = result.remaining
              ? "pending"
              : "completed";
            log(
              result.remaining ? `${label}仍有步骤待继续` : `${label}完成`,
              result.remaining ? "warning" : "success",
            );
          } finally {
            if (ownsSlot) {
              try {
                tokenStore.closeWebSocketConnection(tokenId);
              } finally {
                releaseConnectionSlot();
              }
            }
            log(
              `连接清理结束 (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
            );
          }
        });
      } catch (error) {
        tokenStatus.value[tokenId] = error.interrupted ? "stopped" : "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} ${label}: ${error.message || "未知错误"}`,
          type: error.interrupted ? "warning" : "error",
        });
      }
    });
    try {
      await Promise.all(taskPromises);
    } finally {
      isRunning.value = false;
      currentRunningTokenId.value = null;
    }
    message.success(`批量${label}结束`);
  };

  /** Claim hang-up rewards, then refill the remaining help slots. */
  const claimHangUpRewards = () => runHangUpTasks(true);
  /** Refill help slots without claiming rewards or trusting local task progress. */
  const batchAddHangUpTime = () => runHangUpTasks(false);

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

    // Preload questions
    const { preloadQuestions } =
      await import("@/utils/studyQuestionsFromJSON.js");
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在加载题库...`,
      type: "info",
    });
    await preloadQuestions();

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

        // Reset local study status
        tokenStore.gameData.studyStatus = {
          isAnswering: false,
          questionCount: 0,
          answeredCount: 0,
          status: "",
          timestamp: null,
        };

        // Send start command
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "study_startgame",
          {},
          5000,
        );

        // Wait for completion
        let maxWait = 90;
        let completed = false;
        let lastStatus = "";

        while (maxWait > 0 && !shouldStop.value) {
          const status = tokenStore.gameData.studyStatus;

          if (status.status !== lastStatus) {
            lastStatus = status.status;
            if (status.status === "answering") {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 开始答题...`,
                type: "info",
              });
            } else if (status.status === "claiming_rewards") {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 领取奖励...`,
                type: "info",
              });
            }
          }

          if (status.status === "completed") {
            completed = true;
            break;
          }

          await new Promise((r) => setTimeout(r, 1000));
          maxWait--;
        }

        if (completed) {
          tokenStatus.value[tokenId] = "completed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== ${token.name} 答题完成 ===`,
            type: "success",
          });
        } else {
          if (shouldStop.value) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 已停止`,
              type: "warning",
            });
          } else {
            tokenStatus.value[tokenId] = "failed";
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 答题超时或未开始`,
              type: "error",
            });
          }
        }
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

  const normalizeLegionPreview = (response, fallbackLegionId = 0) => {
    const raw =
      response?.legionData || response?.info || response?.legionInfo || null;
    if (!raw) return null;

    const members = raw.members || {};
    const memberCount =
      raw.memberCount ||
      raw.memNum ||
      raw.memberNum ||
      raw.num ||
      Object.keys(members).length ||
      0;

    return {
      id: Number(raw.id || raw.legionId || fallbackLegionId || 0),
      name: raw.name || raw.legionName || "未知俱乐部",
      logo: raw.logo || raw.icon || raw.headImg || raw.badge || "",
      level: Number(raw.level || raw.lv || 0),
      memberCount: Number(memberCount || 0),
      chairmanName:
        raw.chairmanName ||
        raw.leaderName ||
        raw.masterName ||
        raw.ownerName ||
        "",
      notice: raw.notice || raw.declaration || raw.announcement || "",
      raw,
    };
  };

  const extractRoleLegionId = (roleInfo) => {
    const role =
      roleInfo?.role || roleInfo?.roleInfo?.role || roleInfo?.roleInfo || {};
    const legionId =
      role.legionId ??
      role.legionID ??
      role.clubId ??
      role.clubID ??
      role.guildId ??
      role.guildID ??
      0;
    return Number(legionId || 0);
  };

  const queryLegionById = async (tokenId, legionId) => {
    const normalizedLegionId = Number(legionId);
    if (!normalizedLegionId) {
      throw new Error("俱乐部ID无效");
    }

    const response = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: normalizedLegionId },
      5000,
    );

    const preview = normalizeLegionPreview(response, normalizedLegionId);
    if (!preview?.id) {
      throw new Error("未查询到俱乐部信息");
    }

    return preview;
  };

  /**
   * 批量申请俱乐部
   * @param {number|string} legionId - 目标俱乐部ID
   */
  const batchApplyLegion = async (legionId) => {
    const targetLegionId = Number(legionId);

    if (selectedTokens.value.length === 0) {
      message.warning("请先选择账号");
      return;
    }

    if (!targetLegionId) {
      message.warning("请先输入目标俱乐部ID");
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
          message: `=== 开始申请俱乐部: ${token.name} -> ${targetLegionId} ===`,
          type: "info",
        });

        await ensureConnection(tokenId);

        const targetLegion = await queryLegionById(tokenId, targetLegionId);
        const roleInfo = await tokenStore.sendMessageWithPromise(
          tokenId,
          "role_getroleinfo",
          {},
          5000,
        );

        const currentLegionId = extractRoleLegionId(roleInfo);
        if (currentLegionId > 0) {
          if (currentLegionId === targetLegionId) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 已在目标俱乐部 [${targetLegion.name}] 中，跳过 ===`,
              type: "warning",
            });
          } else {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `=== ${token.name} 当前已加入其他俱乐部 (${currentLegionId})，跳过 ===`,
              type: "warning",
            });
          }
          tokenStatus.value[tokenId] = "completed";
          return;
        }

        await tokenStore.sendMessageWithPromise(
          tokenId,
          "legion_applyjoin",
          { legionId: targetLegionId },
          5000,
        );

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 已向 [${targetLegion.name}] 发起申请 ===`,
          type: "success",
        });
        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        console.error(error);
        const errorMessage = error?.message || "未知错误";

        if (
          errorMessage.includes("已加入") ||
          errorMessage.includes("已经加入") ||
          errorMessage.includes("当前已加入")
        ) {
          tokenStatus.value[tokenId] = "completed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== ${token.name} 已加入俱乐部，跳过申请 ===`,
            type: "warning",
          });
        } else {
          tokenStatus.value[tokenId] = "failed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 申请俱乐部失败: ${errorMessage}`,
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
    message.success("批量申请俱乐部结束");
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
            3000, // 短超时，因为这不是关键步骤
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
          // console.warn("领取拍手器失败", e);
        }

        // 获取助威数据以判断次数
        const rankRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "warguess_getrank",
          { bfId: "" },
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
          totalGuessNum = list.reduce(
            (sum, item) => sum + (item.guessNum || 0),
            0,
          );
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
          { guessCoin: coinToUse, legionId },
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

        // Handle specific error: 400000 - Item does not exist (feature locked)
        if (
          error.code === 400000 ||
          (error.message && error.message.includes("400000"))
        ) {
          tokenStatus.value[tokenId] = "completed"; // Mark as completed (skipped)
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

  return {
    claimHangUpRewards,
    batchAddHangUpTime,
    batchStudy,
    batchclubsign,
    batchLegionWarSignUp,
    batchApplyLegion,
    batchWarGuessCheer,
    queryLegionById,
  };
}
