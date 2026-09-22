/**
 * 逐鹿盐山竞猜任务
 * 包含: 一键批量竞猜（自动选助威最高队伍）
 *
 * 开放判定复用 utils/apexRules.js（1:1 移植客户端规则）：
 *   · 仅淘汰赛阶段（stage 4~10）且状态为 Unlocked / Locked 的场次可押；
 *   · 每阶段可押队伍数上限 = 该阶段 advanceNum（季军赛恒为 1）；
 *   · 分页 idx = 已加载条数，以响应 last 终止。
 */

import {
  ApexScheduleStatus,
  calibrateServerTime,
  getAdvanceNum,
  getCurrentRounds,
  getCurrentSeason,
  getGuessTabs,
} from "@/utils/apexRules";
import {
  ApexAction,
  apexCooldownLeft,
  isApexRateLimited,
  runApexAction,
} from "@/utils/apexRateLimit";

/** 单次请求超时（ms） */
const TIMEOUT_MS = 8000;

/** 单阶段分页拉取的最大页数（防御 last 异常导致死循环） */
const MAX_PAGES = 12;

/** 只读拉取遇到 200400 时的自动重试次数 */
const READ_MAX_RETRY = 1;

/**
 * 经自适应限流器发送一条 apex 命令。
 *
 * 服务器对 apex_* 有频控（200400「操作太快」），固定 sleep 无法适配真实冷却，
 * 统一走 utils/apexRateLimit.js：串行排队 + AIMD 自适应间隔。
 * @param {string} action 动作类型（ApexAction）
 * @param {Function} task 实际发送函数；入参为排队耗时（ms），应叠加到响应超时上
 * @param {number} [maxRetry] 200400 自动重试次数
 * @returns {Promise<*>} 命令响应
 */
const sendApex = (action, task, maxRetry) => runApexAction(action, task, { maxRetry });

/**
 * 解析当前赛季「竞猜开放中」的阶段页签。
 *
 * 逐期扫描所有「进行中」的期（历史期已全部结束，不含开放场次）：
 * 报名期与淘汰赛期在时间上是重叠的，只取默认一期会漏掉另一期已开押的阶段
 * （例：第 5 期报名中、第 4 期淘汰赛已开押）。期号与阶段全部由配置推导。
 *
 * @param {number} nowMs 服务端时间
 * @returns {{season: number, round: number, tabs: Array}|null} 无开放场次时为 null
 */
const resolveOpenGuesses = (nowMs) => {
  const season = getCurrentSeason(nowMs);
  if (season <= 0) return null;
  for (const round of getCurrentRounds(season, nowMs)) {
    const tabs = getGuessTabs(round, season, nowMs).filter(
      (t) =>
        t.state === ApexScheduleStatus.Unlocked ||
        t.state === ApexScheduleStatus.Locked,
    );
    if (tabs.length) return { season, round, tabs };
  }
  return null;
};

/**
 * 创建逐鹿盐山竞猜任务执行器
 * @param {object} deps - 依赖项
 * @returns {object} 任务函数集合
 */
export function createTasksApex(deps) {
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
   * 一键批量逐鹿盐山竞猜
   * 自动选每组对阵中助威数最高的队伍
   */
  const batchApexGuess = async () => {
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
        await ensureConnection(tokenId);

        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== 开始逐鹿盐山竞猜: ${token.name} ===`,
          type: "info",
        });

        // 1. 获取角色信息（resetTime.day 用于服务端时间校准）
        const roleResp = await sendApex(
          ApexAction.READ,
          // 排队耗时补偿进超时：本命令排在串行链尾时，冷却等待会吃掉预算，
          // 不补偿就会出现「还没等到响应先报超时」的假故障
          (queuedMs) =>
            tokenStore.sendMessageWithPromise(
              tokenId,
              "apex_getroleinfo",
              {},
              TIMEOUT_MS + queuedMs,
            ),
          READ_MAX_RETRY,
        );
        const apexInfo = roleResp?.apexRoleInfo || {};
        const guessMap = apexInfo.guessMap || {};

        // 2. 依据真实规则解析当前开放的竞猜阶段
        const open = resolveOpenGuesses(
          calibrateServerTime(Date.now(), apexInfo.resetTime?.day),
        );
        if (!open) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 当前无开放的竞猜阶段（竞猜仅在淘汰赛段开放）`,
            type: "warning",
          });
          tokenStatus.value[tokenId] = "completed";
          return;
        }
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 第${open.season}赛季 第${open.round}期，开放竞猜 ${open.tabs.length} 个阶段`,
          type: "info",
        });

        // 3. 逐阶段分页拉取对阵并竞猜
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;
        /** 连续被 200400 打回后置位：中止该账号剩余竞猜，避免持续轰炸服务器 */
        let abortedByRateLimit = false;

        for (const tab of open.tabs) {
          if (shouldStop.value) break;
          if (abortedByRateLimit) break;

          const advanceNum = getAdvanceNum(open.round, open.season, tab.stage);
          const guessedTeamIds = new Set(guessMap[tab.scheduleId] || []);
          if (advanceNum > 0 && guessedTeamIds.size >= advanceNum) {
            skipCount++;
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} ${tab.title} 已押满 ${advanceNum} 队，跳过`,
              type: "info",
            });
            continue;
          }

          // 分页拉取该阶段全部对阵：idx = 已加载条数，以 last 终止
          const allGroups = [];
          let last = false;
          for (let p = 0; p < MAX_PAGES && !last; p++) {
            if (shouldStop.value) break;
            const resp = await sendApex(
              ApexAction.READ,
              // 同上：分页循环每页都要重新等冷却，补偿后才不会误判超时
              (queuedMs) =>
                tokenStore.sendMessageWithPromise(
                  tokenId,
                  "apex_getguesslist",
                  { scheduleId: tab.scheduleId, idx: allGroups.length },
                  TIMEOUT_MS + queuedMs,
                ),
              READ_MAX_RETRY,
            );
            const groups = resp?.apexGuessList || [];
            if (groups.length === 0) break;
            allGroups.push(...groups);
            last = resp?.last === true;
          }

          if (allGroups.length === 0) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${token.name} ${tab.title} 没有对阵数据`,
              type: "warning",
            });
            continue;
          }
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} ${tab.title} 共 ${allGroups.length} 组对阵`,
            type: "info",
          });

          for (const group of allGroups) {
            if (shouldStop.value) break;
            if (abortedByRateLimit) break;
            if (advanceNum > 0 && guessedTeamIds.size >= advanceNum) break;

            const [team0, team1] = group;
            if (!team0 || !team1) continue;

            // 两队都已竞猜则跳过
            if (guessedTeamIds.has(team0.teamId) && guessedTeamIds.has(team1.teamId)) {
              skipCount++;
              continue;
            }

            // 选助威数更高的队伍
            let pick;
            if (guessedTeamIds.has(team0.teamId)) {
              pick = team1;
            } else if (guessedTeamIds.has(team1.teamId)) {
              pick = team0;
            } else {
              pick = team0.cheerCnt >= team1.cheerCnt ? team0 : team1;
            }

            try {
              await runApexAction(
                ApexAction.GUESS,
                (queuedMs) =>
                  tokenStore.sendMessageWithPromise(
                    tokenId,
                    "apex_guess",
                    { teamId: pick.teamId },
                    TIMEOUT_MS + queuedMs,
                  ),
                {
                  // 等待服务器冷却时给出可见反馈，避免界面像卡死
                  onWait: (ms) =>
                    addLog({
                      time: new Date().toLocaleTimeString(),
                      message: `${token.name} 竞猜遇到服务器限流，等待 ${Math.ceil(ms / 1000)}s 后重试`,
                      type: "warning",
                    }),
                },
              );
              guessedTeamIds.add(pick.teamId);
              successCount++;
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} ${tab.title} 竞猜 ${pick.name} (${pick.teamId}) 助威:${pick.cheerCnt} ✓`,
                type: "success",
              });
            } catch (err) {
              failCount++;
              addLog({
                time: new Date().toLocaleTimeString(),
                message: `${token.name} ${tab.title} 竞猜 ${pick.name} 失败: ${err.message}`,
                type: "error",
              });
              if (isApexRateLimited(err)) {
                // 重试仍被限流：停止该账号后续竞猜，等待自适应间隔恢复
                abortedByRateLimit = true;
                addLog({
                  time: new Date().toLocaleTimeString(),
                  message: `${token.name} 连续被服务器限流（200400），约 ${Math.ceil(apexCooldownLeft(ApexAction.GUESS) / 1000)}s 后可继续，本次中止剩余竞猜`,
                  type: "warning",
                });
              }
            }
          }
        }

        if (abortedByRateLimit) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 因服务器限流提前结束，未完成部分稍后重跑即可续押`,
            type: "warning",
          });
        }

        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `=== ${token.name} 竞猜完成: 成功${successCount} 跳过${skipCount} 失败${failCount} ===`,
          type: "success",
        });
      } catch (error) {
        console.error(error);
        tokenStatus.value[tokenId] = "failed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${token.name} 逐鹿盐山竞猜失败: ${error.message}`,
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
    message.success("批量逐鹿盐山竞猜结束");
  };

  return {
    batchApexGuess,
  };
}
