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
  };

  const results = [];

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
        await executeStartBatch(deps, modules);
        results.push({ task: taskName, status: 'ok' });
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
      await fn();
      results.push({ task: taskName, status: 'ok' });
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

  for (const tokenId of selectedTokens.value) {
    if (shouldStop.value) break;

    const token = tokens.value.find(t => t.id === tokenId);
    if (!token) continue;

    try {
      await ensureConnection(tokenId, tokens);
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
    } catch (e) {
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 日常任务失败: ${e.message}`, type: 'error' });
    } finally {
      tokenStore.closeWebSocketConnection(tokenId);
      releaseConnectionSlot();
    }
  }
}
