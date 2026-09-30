/**
 * 后端任务执行器 - 将前端 createTaskDeps + 9个任务模块整合
 * 定时任务触发时调用此模块执行用户选择的任务
 */

import { createServerDeps } from './serverDeps.js';
import { createTasksHangUp } from './batch/tasksHangUp.js';
import { createTasksBottle } from './batch/tasksBottle.js';
import { createTasksTower } from './batch/tasksTower.js';
import { createTasksCar } from './batch/tasksCar.js';
import { createTasksItem } from './batch/tasksItem.js';
import { createTasksDungeon } from './batch/tasksDungeon.js';
import { createTasksArena } from './batch/tasksArena.js';
import { createTasksStore } from './batch/tasksStore.js';
import { createTasksLegacy } from './batch/tasksLegacy.js';
import { createTasksXuanwuBlessing } from './batch/tasksXuanwuBlessing.js';
import { createTasksApex } from './batch/tasksApex.js';
import { createTasksFootball } from './batch/tasksFootball.js';
import { createTasksCampChallenge } from './batch/tasksCampChallenge.js';
import { getActivityStatus, getTodayStartSec, isTodayAvailable, calculateMonthProgress, pickArenaTargetId } from './batch/connectionManager.js';
import { normalizeCars, gradeLabel, shouldSendCar, canClaim, isBigPrize, countRacingRefreshTickets } from './batch/carUtils.js';
import { gameLogger } from './logger.js';

// 任务名 → 模块+函数名 映射
const TASK_MAP = {
  // tasksHangUp
  claimHangUpRewards: { module: 'hangUp', fn: 'claimHangUpRewards' },
  batchAddHangUpTime: { module: 'hangUp', fn: 'batchAddHangUpTime' },
  batchStudy: { module: 'hangUp', fn: 'batchStudy' },
  batchclubsign: { module: 'hangUp', fn: 'batchclubsign' },
  batchWarGuessCheer: { module: 'hangUp', fn: 'batchWarGuessCheer' },
  // tasksBottle
  resetBottles: { module: 'bottle', fn: 'resetBottles' },
  batchlingguanzi: { module: 'bottle', fn: 'batchlingguanzi' },
  // tasksTower
  climbTower: { module: 'tower', fn: 'climbTower' },
  climbWeirdTower: { module: 'tower', fn: 'climbWeirdTower' },
  batchClaimFreeEnergy: { module: 'tower', fn: 'batchClaimFreeEnergy' },
  skinChallenge: { module: 'tower', fn: 'skinChallenge' },
  batchUseItems: { module: 'tower', fn: 'batchUseItems' },
  batchMergeItems: { module: 'tower', fn: 'batchMergeItems' },
  // tasksCar
  batchSmartSendCar: { module: 'car', fn: 'batchSmartSendCar' },
  batchClaimCars: { module: 'car', fn: 'batchClaimCars' },
  // tasksItem
  batchOpenBox: { module: 'item', fn: 'batchOpenBox' },
  batchOpenBoxByPoints: { module: 'item', fn: 'batchOpenBoxByPoints' },
  batchClaimBoxPointReward: { module: 'item', fn: 'batchClaimBoxPointReward' },
  batchFish: { module: 'item', fn: 'batchFish' },
  batchRecruit: { module: 'item', fn: 'batchRecruit' },
  batchHeroUpgrade: { module: 'item', fn: 'batchHeroUpgrade' },
  batchBookUpgrade: { module: 'item', fn: 'batchBookUpgrade' },
  batchClaimStarRewards: { module: 'item', fn: 'batchClaimStarRewards' },
  batchClaimPeachTasks: { module: 'item', fn: 'batchClaimPeachTasks' },
  batchGenieSweep: { module: 'item', fn: 'batchGenieSweep' },
  batchOpenFragmentPacks: { module: 'item', fn: 'batchOpenFragmentPacks' },
  batchClaimBoxWeeklyRewards: { module: 'item', fn: 'batchClaimBoxWeeklyRewards' },
  // tasksDungeon
  batchbaoku13: { module: 'dungeon', fn: 'batchbaoku13' },
  batchbaoku45: { module: 'dungeon', fn: 'batchbaoku45' },
  batchmengjing: { module: 'dungeon', fn: 'batchmengjing' },
  batchBuyDreamItems: { module: 'dungeon', fn: 'batchBuyDreamItems' },
  // tasksArena
  batcharenafight: { module: 'arena', fn: 'batcharenafight' },
  batchTopUpFish: { module: 'arena', fn: 'batchTopUpFish' },
  batchTopUpArena: { module: 'arena', fn: 'batchTopUpArena' },
  // tasksStore
  legion_storebuygoods: { module: 'store', fn: 'legion_storebuygoods' },
  legionStoreBuySkinCoins: { module: 'store', fn: 'legionStoreBuySkinCoins' },
  store_purchase: { module: 'store', fn: 'store_purchase' },
  collection_claimfreereward: { module: 'store', fn: 'collection_claimfreereward' },
  weeklyFreeGift: { module: 'store', fn: 'weeklyFreeGift' },
  mondayFreeGift: { module: 'store', fn: 'mondayFreeGift' },
  gachaFreeDrawWeekly: { module: 'store', fn: 'gachaFreeDrawWeekly' },
  batchPkRoomAppoint: { module: 'store', fn: 'batchPkRoomAppoint' },
  blackMarketPurchaseList: { module: 'store', fn: 'blackMarketPurchaseList' },
  charge_claimaddup_rewards: { module: 'store', fn: 'charge_claimaddup_rewards' },
  claim_recruit_welfare: { module: 'store', fn: 'claim_recruit_welfare' },
  claim_weird_tower_all: { module: 'store', fn: 'claim_weird_tower_all' },
  // tasksLegacy
  batchLegacyClaim: { module: 'legacy', fn: 'batchLegacyClaim' },
  batchLegacyGiftSendEnhanced: { module: 'legacy', fn: 'batchLegacyGiftSendEnhanced' },
  // tasksHangUp 补充
  batchWarGuessCheer: { module: 'hangUp', fn: 'batchWarGuessCheer' },
  batchLegionWarSignUp: { module: 'hangUp', fn: 'batchLegionWarSignUp' },
  batchJoinClub: { module: 'hangUp', fn: 'batchJoinClub' },
  // tasksItem 补充
  batchTopUpBoxWeekWithoutClaim: { module: 'item', fn: 'batchTopUpBoxWeekWithoutClaim' },
  batchTopUpBoxWeekWithClaim: { module: 'item', fn: 'batchTopUpBoxWeekWithClaim' },
  batchClaimRollUpPack: { module: 'item', fn: 'batchClaimRollUpPack' },
  batchGachaDrawReward: { module: 'item', fn: 'batchGachaDrawReward' },
  // tasksStore 补充
  activity_claimrolluppack: { module: 'store', fn: 'activity_claimrolluppack' },
  activityShopBuy: { module: 'store', fn: 'activityShopBuy' },
  executeWarguessStoreBuy: { module: 'store', fn: 'executeWarguessStoreBuy' },
  // tasksLegacy 补充
  batchLegacyBeginHangup: { module: 'legacy', fn: 'batchLegacyBeginHangup' },
  // tasksXuanwuBlessing
  batchXuanwuBlessing: { module: 'xuanwuBlessing', fn: 'batchXuanwuBlessing' },
  // tasksApex
  batchApexGuess: { module: 'apex', fn: 'batchApexGuess' },
  // tasksFootball
  batchFootballBet: { module: 'football', fn: 'batchFootballBet' },
  // tasksCampChallenge
  batchCampChallenge: { module: 'campChallenge', fn: 'batchCampChallenge' },
  batchCampChallengePet: { module: 'campChallenge', fn: 'batchCampChallengePet' },
  batchCampClaimTasks: { module: 'campChallenge', fn: 'batchCampClaimTasks' },
  // 日常任务（特殊处理）
  startBatch: { module: 'special', fn: 'startBatch' },
};

/**
 * 执行定时任务
 * @param {Object} task - 定时任务配置 { tokenIds, settings: { selectedTasks, ... } }
 * @param {string} userId
 * @param {Object} db
 * @param {Object} gameManager
 * @returns {Object} 执行结果
 */
export async function executeScheduledTask(task, userId, db, gameManager) {
  const tokenIds = task.tokenIds || [];
  const settings = task.settings || {};
  const selectedTasks = settings.selectedTasks || [];

  if (tokenIds.length === 0 || selectedTasks.length === 0) {
    return { status: 'skip', reason: 'no tokens or tasks selected' };
  }

  gameLogger.info(`[定时任务] 开始执行: ${task.name}, 账号: ${tokenIds.length}, 任务: ${selectedTasks.length}`);

  // 构建 serverDeps
  const deps = createServerDeps(gameManager, db, userId, {
    pushService: gameManager.push,
    tokenIds,
    maxActive: settings.maxActive || 3,
    commandDelay: settings.commandDelay || 500,
    taskDelay: settings.taskDelay || 1000,
  });

  // 注入活动状态辅助函数
  deps.getActivityStatus = getActivityStatus;
  deps.getTodayStartSec = getTodayStartSec;
  deps.isTodayAvailable = isTodayAvailable;
  deps.calculateMonthProgress = calculateMonthProgress;
  deps.pickArenaTargetId = pickArenaTargetId;

  // 注入车辆工具函数
  deps.normalizeCars = normalizeCars;
  deps.gradeLabel = gradeLabel;
  deps.shouldSendCar = shouldSendCar;
  deps.canClaim = canClaim;
  deps.isBigPrize = isBigPrize;
  deps.countRacingRefreshTickets = countRacingRefreshTickets;

  // 初始化所有任务模块
  const modules = {
    hangUp: createTasksHangUp(deps),
    bottle: createTasksBottle(deps),
    tower: createTasksTower(deps),
    car: createTasksCar(deps),
    item: createTasksItem(deps),
    dungeon: createTasksDungeon(deps),
    arena: createTasksArena(deps),
    store: createTasksStore(deps),
    legacy: createTasksLegacy(deps),
    xuanwuBlessing: createTasksXuanwuBlessing(deps),
    apex: createTasksApex(deps),
    football: createTasksFootball(deps),
    campChallenge: createTasksCampChallenge(deps),
  };

  const results = [];

  // 从 tokenStatus 汇总本次任务各账号的真实成败。
  // 任务模块内部会 catch 每个账号的异常只写日志，外层函数几乎不会抛出，
  // 仅凭"没抛异常"标记 ok 会产生假成功（账号全挂也显示成功）。
  const summarizeAccounts = (ids) => {
    let completed = 0;
    let failed = 0;
    for (const id of ids) {
      const s = deps.tokenStatus.value[id];
      if (s === 'completed') completed++;
      else if (s === 'failed') failed++;
    }
    const tracked = completed + failed;
    return tracked === 0
      ? null
      : {
          total: ids.length,
          completed,
          failed,
          status: failed === 0 ? 'ok' : completed > 0 ? 'partial' : 'error',
        };
  };

  // 按顺序执行用户选择的任务
  for (const taskName of selectedTasks) {
    if (deps.shouldStop.value) break;

    const mapping = TASK_MAP[taskName];
    if (!mapping) {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `未知任务: ${taskName}`, type: 'warning' });
      results.push({ task: taskName, status: 'skip', reason: 'unknown task' });
      continue;
    }

    // 特殊处理 startBatch（日常任务）
    if (mapping.module === 'special' && mapping.fn === 'startBatch') {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `=== 开始执行日常任务 ===`, type: 'info' });
      try {
        const accounts = await executeStartBatch(deps, modules);
        results.push({ task: taskName, status: accounts ? accounts.status : 'ok', accounts: accounts || undefined });
      } catch (e) {
        results.push({ task: taskName, status: 'error', error: e.message });
      }
      continue;
    }

    const module = modules[mapping.module];
    const fn = module?.[mapping.fn];

    if (typeof fn !== 'function') {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `任务函数不存在: ${taskName}`, type: 'error' });
      results.push({ task: taskName, status: 'error', reason: 'function not found' });
      continue;
    }

    deps.addLog({ time: new Date().toLocaleTimeString(), message: `=== 开始执行: ${taskName} ===`, type: 'info' });

    try {
      // 参数型任务从定时任务 settings 透传配置
      if (taskName === 'batchFootballBet') {
        await fn(settings.footballPick || 3);
      } else if (taskName === 'batchJoinClub') {
        await fn(settings.joinClubId, settings.joinClubReason);
      } else if (taskName === 'executeWarguessStoreBuy') {
        await fn({ goodsIds: settings.warguessGoodsIds || [] });
      } else if (taskName === 'activityShopBuy') {
        await fn({ goodsIndices: settings.blackMarketGoodsIndices || [] });
      } else {
        await fn();
      }
      const accounts = summarizeAccounts(tokenIds);
      results.push({
        task: taskName,
        status: accounts ? accounts.status : 'ok',
        ...(accounts ? { accounts } : {}),
      });
    } catch (e) {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `任务失败: ${taskName} - ${e.message}`, type: 'error' });
      results.push({ task: taskName, status: 'error', error: e.message });
    }

    // 任务间延迟
    if (settings.taskDelay) {
      await new Promise(r => setTimeout(r, settings.taskDelay));
    }
  }

  gameLogger.info(`[定时任务] 执行完成: ${task.name}, 结果: ${JSON.stringify(results.map(r => `${r.task}:${r.status}`))}`);

  // 只保留最近 MAX_LOGS 条日志，防止 last_result 无限膨胀撑爆接口（曾出现日常1积累48MB导致列表加载超时）
  const MAX_LOGS = 300;
  const allLogs = deps.logs || [];
  const logs = allLogs.length > MAX_LOGS ? allLogs.slice(-MAX_LOGS) : allLogs;
  return { results, logs, totalLogs: allLogs.length, logsTruncated: allLogs.length > MAX_LOGS };
}

import { DailyTaskRunner } from './dailyTaskRunner.js';

/**
 * startBatch - 日常任务（使用完整的 DailyTaskRunner）
 */
async function executeStartBatch(deps, modules) {
  const { selectedTokens, tokens, tokenStore, addLog, ensureConnection, releaseConnectionSlot, shouldStop, loadSettings } = deps;

  let completed = 0;
  let failed = 0;
  const total = selectedTokens.value.length;

  for (const tokenId of selectedTokens.value) {
    if (shouldStop.value) break;

    const token = tokens.value.find(t => t.id === tokenId);
    if (!token) continue;

    try {
      await ensureConnection(tokenId);
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 开始日常任务`, type: 'info' });

      const settings = await loadSettings(tokenId);

      const runner = new DailyTaskRunner(tokenStore, {
        commandDelay: settings?.commandDelay || 500,
        taskDelay: settings?.taskDelay || 500,
      });

      await runner.run(tokenId, {
        onLog: (entry) => addLog({ time: entry.time, message: `[${token.name}] ${entry.message}`, type: entry.type }),
        onProgress: () => {},
      }, settings);

      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 日常任务完成`, type: 'success' });
      completed++;
    } catch (e) {
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 日常任务失败: ${e.message}`, type: 'error' });
      failed++;
    } finally {
      tokenStore.closeWebSocketConnection(tokenId);
      releaseConnectionSlot();
    }
  }

  // 与普通任务保持同一口径：按账号真实成败给出状态（无账号则沿用旧 ok 行为）
  if (completed + failed === 0) return null;
  return {
    total,
    completed,
    failed,
    status: failed === 0 ? 'ok' : completed > 0 ? 'partial' : 'error',
  };
}
