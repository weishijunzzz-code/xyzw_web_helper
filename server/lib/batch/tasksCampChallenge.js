import { runCampChallenge } from './campChallengeRunner.js';
/**
 * 营地挑战类任务
 * 包含: batchCampChallenge, batchCampChallengePet, batchCampClaimTasks
 */

/**
 * 创建营地挑战类任务执行器
 * @param {object} deps - 依赖项
 * @returns {object} 任务函数集合
 */
export function createTasksCampChallenge(deps) {
  const {
    selectedTokens,
    tokens,
    tokenStatus,
    isRunning,
    shouldStop,
    ensureConnection,
    releaseConnectionSlot,
    tokenStore,
    addLog,
    message,
    currentRunningTokenId,
    loadSettings,
  } = deps;

  /**
   * 一键营地挑战
   */
  const batchCampChallenge = async () => {
    if (!selectedTokens.value.length) return;
    isRunning.value = true;
    shouldStop.value = false;
    deps.accountOutcomes ||= {};
    selectedTokens.value.forEach(id => { tokenStatus.value[id] = 'waiting'; });
    try {
      await Promise.all(selectedTokens.value.map(async tokenId => {
        const token = tokens.value.find(t => t.id === tokenId);
        tokenStatus.value[tokenId] = 'running';
        try {
          await ensureConnection(tokenId);
          const settings = await loadSettings?.(tokenId) || {};
          const outcome = await runCampChallenge({
            ...deps.campChallengeOptions,
            send: (cmd, params, timeout) => tokenStore.sendMessageWithPromise(tokenId, cmd, params, timeout),
            settings, stopped: () => shouldStop.value,
            log: (text, type) => addLog({ time: new Date().toLocaleTimeString(), message: `[${token?.name || tokenId}] ${text}`, type }),
          });
          deps.accountOutcomes[tokenId] = outcome;
          tokenStatus.value[tokenId] = outcome.status === 'ok' ? 'completed' : outcome.status === 'skip' ? 'skipped' : 'failed';
        } catch (error) {
          deps.accountOutcomes[tokenId] = { status: 'error', reason: error.message };
          tokenStatus.value[tokenId] = 'failed';
        } finally {
          tokenStore.closeWebSocketConnection(tokenId);
          releaseConnectionSlot();
        }
      }));
    } finally {
      isRunning.value = false;
      currentRunningTokenId.value = null;
    }
    message.info('批量营地挑战结束，结果以账号明细为准');
    // Preserve the existing reward-claim operation; it must not overwrite challenge outcomes.
    await batchCampClaimTasks();
  };

  /**
   * 一键营地挑战宠物
   */
  const batchCampChallengePet = async () => {
    if (selectedTokens.value.length === 0) return;
    isRunning.value = true;
    shouldStop.value = false;

    selectedTokens.value.forEach((id) => {
      tokenStatus.value[id] = "waiting";
    });

    const maxRounds = 3;
    for (let round = 1; round <= maxRounds; round++) {
      if (shouldStop.value) break;

      const taskPromises = selectedTokens.value.map(async (tokenId) => {
        if (shouldStop.value) return;
        tokenStatus.value[tokenId] = "running";
        const token = tokens.value.find((t) => t.id === tokenId);
        let switchedFormation = false;
        let originalTeamId = null;
        try {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 营地挑战宠物 ${token.name} (第${round}/${maxRounds}轮) ===`,
            type: "info",
          });
          await ensureConnection(tokenId);
          if (shouldStop.value) return;

          // 获取我方阵容配置
          const [presetTeamResult, roleInfoResult] = await Promise.all([
            tokenStore.sendMessageWithPromise(
              tokenId,
              "presetteam_getinfo",
              {},
              5000,
            ),
            tokenStore.sendMessageWithPromise(
              tokenId,
              "role_getroleinfo",
              {},
              15000,
            ),
          ]);

          const lordWeaponId = roleInfoResult?.role?.lordWeaponId || 0;

          // 解析阵容数据，优先使用竞技场阵容
          const tokenSettings = (await loadSettings?.(tokenId)) || {};
          const formationId = String(tokenSettings?.arenaFormation || 1);
          const root =
            presetTeamResult?.presetTeamInfo?.presetTeamInfo ||
            presetTeamResult?.presetTeamInfo ||
            {};
          const teamInfoData =
            root[formationId]?.teamInfo || root["1"]?.teamInfo || {};

          const battleTeam = {};
          for (const [pos, hero] of Object.entries(teamInfoData)) {
            const hid = hero?.heroId ?? hero?.id;
            if (hid) {
              battleTeam[pos] = Number(hid);
            }
          }

          if (Object.keys(battleTeam).length === 0) {
            throw new Error(`无法获取阵容${formationId}数据`);
          }

          const teamSetParams = {
            lordWeaponId,
            petUId: "",
            battleTeam,
          };

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 使用阵容${formationId}: ${Object.values(battleTeam).join(", ")}`,
            type: "info",
          });

          // 切换存档阵容到配置槽位（club_attackmonster 实际使用存档阵容，teamSetParams 不生效）
          const currentUseTeamId = String(
            presetTeamResult?.presetTeamInfo?.useTeamId ?? "1",
          );
          if (currentUseTeamId !== formationId) {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "presetteam_saveteam",
              { teamId: Number(formationId) },
              5000,
            );
            switchedFormation = true;
            originalTeamId = currentUseTeamId;
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 已切换存档阵容: 阵容${currentUseTeamId} → 阵容${formationId}`,
              type: "info",
            });
          }

          // 挑战宠物
          const attackRes = await tokenStore.sendMessageWithPromise(
            tokenId,
            "club_attackmonster",
            {
              useItem: false,
              teamSetParams,
            },
            8000,
          );

          const battleResult =
            attackRes?.battleData?.result?.accept?.ext?.curHP;
          const isWin = battleResult === 0;
          const rewardCount = attackRes?.reward?.length || 0;

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 挑战宠物${isWin ? "胜利" : "失败"}${rewardCount > 0 ? ` (获得${rewardCount}个奖励)` : ""}`,
            type: isWin ? "success" : "error",
          });

          tokenStatus.value[tokenId] = "completed";
        } catch (error) {
          console.error(error);
          tokenStatus.value[tokenId] = "failed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 营地挑战宠物失败: ${error.message || "未知错误"}`,
            type: "error",
          });
        } finally {
          // 还原存档阵容（必须在关闭连接前）
          if (switchedFormation && originalTeamId) {
            try {
              await tokenStore.sendMessageWithPromise(
                tokenId,
                "presetteam_saveteam",
                { teamId: Number(originalTeamId) },
                5000,
              );
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 已还原存档阵容: 阵容${originalTeamId}`,
                type: "info",
              });
            } catch (e) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 还原存档阵容失败: ${e?.message || "未知错误"}`,
                type: "warning",
              });
            }
          }
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
    }

    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量营地挑战宠物结束");

    // 领取任务奖励
    await batchCampClaimTasks();
  };

  /**
   * 领取营地挑战任务奖励
   * 通过 role_getroleinfo 获取 siege.taskProgress 和 siege.taskClaimedMap
   * taskProgress: 1/2/3 是3个区域(值为1可领取), 4是挑战3次(值>=3可领取)
   * taskClaimedMap 中已有的 key 表示已领取
   */
  const batchCampClaimTasks = async () => {
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
          message: `=== 开始领取营地任务奖励: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        if (shouldStop.value) return;

        await tokenStore.sendMessageWithPromise(
          tokenId,
          "club_getinfo",
          {},
          15000,
        );

        let claimedCount = 0;
        for (const confId of [1, 2, 3, 4]) {
          if (shouldStop.value) break;
          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "club_taskclaim",
              { confId },
              5000,
            );
            claimedCount++;
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 成功领取任务 ${confId} 奖励`,
              type: "success",
            });
          } catch (err) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 领取任务 ${confId} 失败: ${err.message || "未知错误"}`,
              type: "error",
            });
          }
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 营地任务奖励领取完成，共领取 ${claimedCount} 个`,
          type: "info",
        });

        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 领取营地任务奖励失败: ${error.message || "未知错误"}`,
          type: "error",
        });
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
    message.success("批量领取营地任务奖励结束");
  };

  return {
    batchCampChallenge,
    batchCampChallengePet,
    batchCampClaimTasks,
  };
}
