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
      let switchedFormation = false;
      let originalTeamId = null;
      try {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始营地挑战: ${token.name} ===`,
          type: "info",
        });
        await ensureConnection(tokenId);
        if (shouldStop.value) return;

        // 1. 获取我方阵容配置（参考 QuenchAnalysisCard.refreshHeroes）
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
        const tokenSettings = loadSettings ? loadSettings(tokenId) : {};
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

        // 切换存档阵容到配置槽位（club_attack 实际使用存档阵容，teamSetParams 不生效）
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

        // 2. 获取营地信息和挑战目标
        const res = await tokenStore.sendMessageWithPromise(
          tokenId,
          "club_getinfo",
          {},
          8000,
        );

        // 检查今日挑战次数
        const now = new Date();
        const todayKey =
          String(now.getFullYear() % 100).padStart(2, "0") +
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getDate()).padStart(2, "0");
        const siege = res?.siege || {};
        const attackMap = siege.attackMap || {};
        const todayAttack = attackMap[todayKey] || {};
        const attackCnt = todayAttack.attackCnt || 0;
        const maxAttacks = 10;

        if (attackCnt >= maxAttacks) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 今日挑战次数已达上限(${attackCnt}/${maxAttacks})`,
            type: "warning",
          });
          tokenStatus.value[tokenId] = "completed";
          return;
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 今日已挑战 ${attackCnt}/${maxAttacks} 次`,
          type: "info",
        });

        // ===== 目标选择：今日限定 + 区域优先（区2→区1→区3）+ 切磋模拟择敌 =====
        const AREA_PRIORITY = tokenSettings.campAreaPriority || [2, 1, 3];
        const areaOf = (nodeId) => Math.ceil(Number(nodeId) / 10); // 区1=1-10 区2=11-20 区3=21-30
        const remainingAttacks = Math.min(maxAttacks - attackCnt, 3);
        let attackCount = 0;
        const triedRoleIds = new Set(); // 防止攻击异常时重复选同一目标造成死循环
        const simCache = new Map(); // roleId → { winRate, ourDie } | null(模拟失败)，本次运行内复用

        // 单局切磋（免费，不消耗营地挑战次数），限频 400340 等 11s 重试一次
        const RATE_LIMIT_CODE = 400340;
        const doOneSpar = async (roleId) => {
          try {
            const result = await tokenStore.sendMessageWithPromise(
              tokenId,
              "fight_startpvp",
              { targetId: Number(roleId) },
              10000,
            );
            if (result && result.code === RATE_LIMIT_CODE) {
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} 切磋限频，等待11s后重试`,
                type: "warning",
              });
              await new Promise((r) => setTimeout(r, 11000));
              const retry = await tokenStore.sendMessageWithPromise(
                tokenId,
                "fight_startpvp",
                { targetId: Number(roleId) },
                10000,
              );
              if (retry && retry.code === RATE_LIMIT_CODE) return null;
              return retry;
            }
            return result;
          } catch (e) {
            const msg = e?.message || String(e);
            if (msg.includes(String(RATE_LIMIT_CODE))) {
              await new Promise((r) => setTimeout(r, 11000));
              try {
                return await tokenStore.sendMessageWithPromise(
                  tokenId,
                  "fight_startpvp",
                  { targetId: Number(roleId) },
                  10000,
                );
              } catch {
                return null;
              }
            }
            return null;
          }
        };

        // 对单个候选切磋 SIM_ROUNDS 局，记录胜率与我方损员数
        const SIM_CANDIDATES = 3;
        const SIM_ROUNDS = 2;
        const simOne = async (roleId) => {
          let wins = 0;
          let done = 0;
          let ourDie = 0;
          for (let i = 0; i < SIM_ROUNDS; i++) {
            const r = await doOneSpar(roleId);
            if (!r || !r.battleData) break;
            done++;
            if (r.battleData.result?.isWin) {
              wins++;
              const team = r.battleData.result?.sponsor?.teamInfo || [];
              let die = 0;
              for (const item of team) {
                if (Number(item?.hp) === 0) die++;
              }
              ourDie = Math.max(ourDie, die);
            }
            if (i < SIM_ROUNDS - 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          simCache.set(
            String(roleId),
            done > 0
              ? { winRate: Math.round((wins / done) * 100), ourDie }
              : null,
          );
        };

        // 每打一刀前重新选目标：今日比赛日对手 → 区域优先 → 未试过 → 切磋模拟择敌
        const selectTarget = async () => {
          const todayWeekday = String(now.getDay());
          const todayOppLocal = res?.club?.oppoMap?.[todayWeekday];
          if (!todayOppLocal) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 今日无营地对战（非比赛日），跳过挑战`,
              type: "warning",
            });
            return null;
          }
          const oppName = todayOppLocal.name || "对手公会";
          const byArea = {};
          for (const [nodeId, defender] of Object.entries(
            todayOppLocal.defenders || {},
          )) {
            if (defender.defeated) continue;
            const area = areaOf(nodeId);
            if (!byArea[area]) byArea[area] = [];
            byArea[area].push({ nodeId, defender });
          }
          let candidates = null;
          let chosenArea = null;
          for (const area of AREA_PRIORITY) {
            const pool = (byArea[area] || []).filter(
              (c) => !triedRoleIds.has(String(c.defender.roleId)),
            );
            if (pool.length > 0) {
              candidates = pool;
              chosenArea = area;
              break;
            }
          }
          if (!candidates) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 优先区域(${AREA_PRIORITY.join("→")})均已击败或无可挑战目标`,
              type: "warning",
            });
            return null;
          }
          // 区域内随机打乱
          for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
          }
          // 切磋模拟前 3 个候选（缓存复用，模拟过的不再重复切磋）
          for (const c of candidates.slice(0, SIM_CANDIDATES)) {
            if (!simCache.has(String(c.defender.roleId))) {
              await simOne(c.defender.roleId);
            }
          }
          const scored = candidates
            .slice(0, SIM_CANDIDATES)
            .map((c) => ({
              ...c,
              sim: simCache.get(String(c.defender.roleId)) || null,
            }))
            .filter((c) => c.sim)
            .sort(
              (a, b) =>
                b.sim.winRate - a.sim.winRate || a.sim.ourDie - b.sim.ourDie,
            );
          if (scored.length > 0) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 区域${chosenArea} 候选模拟: ${scored
                .map(
                  (c) =>
                    `${c.defender.name}(胜率${c.sim.winRate}%损员${c.sim.ourDie})`,
                )
                .join(", ")}`,
              type: "info",
            });
            return {
              nodeId: scored[0].nodeId,
              defender: scored[0].defender,
              opponentName: oppName,
            };
          }
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 区域${chosenArea} 切磋模拟不可用，随机选择`,
            type: "warning",
          });
          return {
            nodeId: candidates[0].nodeId,
            defender: candidates[0].defender,
            opponentName: oppName,
          };
        };

        while (attackCount < remainingAttacks && !shouldStop.value) {
          const target = await selectTarget();
          if (!target) break;
          const { opponentName, nodeId, defender } = target;
          triedRoleIds.add(String(defender.roleId));

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 挑战目标(${attackCount + 1}/${remainingAttacks}): 区域${areaOf(nodeId)} ${opponentName} - ${defender.name} (节点${nodeId})`,
            type: "info",
          });

          try {
            // 获取目标阵容
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "club_gettargetteam",
              { targetId: defender.roleId },
              5000,
            );

            // 发起挑战
            const attackRes = await tokenStore.sendMessageWithPromise(
              tokenId,
              "club_attack",
              {
                nodeId: Number(nodeId),
                targetId: defender.roleId,
                challengeCnt: defender.challengeCnt || 0,
                failCnt: defender.failCnt || 0,
                useItem: false,
                teamSetParams,
              },
              8000,
            );

            // 判断战斗结果
            const battleResult =
              attackRes?.battleData?.result?.accept?.ext?.curHP;
            const isWin = battleResult === 0;
            const rewardCount = attackRes?.reward?.length || 0;

            attackCount++;
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} ${isWin ? "胜利" : "失败"}: ${opponentName} - ${defender.name}${rewardCount > 0 ? ` (获得${rewardCount}个奖励)` : ""}`,
              type: isWin ? "success" : "error",
            });

            if (isWin) {
              defender.defeated = true;
            }
          } catch (err) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} 挑战 ${defender.name} 失败: ${err.message || "未知错误"}`,
              type: "error",
            });
          }
        }

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 营地挑战完成，共挑战 ${attackCount} 次`,
          type: "info",
        });

        tokenStatus.value[tokenId] = "completed";
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 营地挑战失败: ${error.message || "未知错误"}`,
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
    isRunning.value = false;
    currentRunningTokenId.value = null;
    message.success("批量营地挑战结束");

    // 领取任务奖励
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
          const tokenSettings = loadSettings ? loadSettings(tokenId) : {};
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
