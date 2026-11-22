import { isRetiredTreasureTask } from "../../src/utils/batch/constants.js";
import { acquireAccount, createAccountSession } from './accountSessions.js';
import { canClaim, countRacingRefreshTickets, gradeLabel, isBigPrize, normalizeCars, shouldSendCar } from './batch/carUtils.js';
/**
 * 后端任务执行器 - 将前端 createTaskDeps + 9个任务模块整合
 * 定时任务触发时调用此模块执行用户选择的任务
 */

import { calculateMonthProgress, getActivityStatus, getTodayStartSec, isTodayAvailable, pickArenaTargetId } from './batch/connectionManager.js';
import { createTasksApex } from './batch/tasksApex.js';
import { createTasksArena } from './batch/tasksArena.js';
import { createTasksBottle } from './batch/tasksBottle.js';
import { createTasksCampChallenge } from './batch/tasksCampChallenge.js';
import { createTasksCar } from './batch/tasksCar.js';
import { createTasksDungeon } from './batch/tasksDungeon.js';
import { createTasksFootball } from './batch/tasksFootball.js';
import { createTasksHangUp } from './batch/tasksHangUp.js';
import { createTasksItem } from './batch/tasksItem.js';
import { createTasksLegacy } from './batch/tasksLegacy.js';
import { createTasksStore } from './batch/tasksStore.js';
import { createTasksTower } from './batch/tasksTower.js';
import { createTasksXuanwuBlessing } from './batch/tasksXuanwuBlessing.js';
import { accountSummary, aggregateStatus } from './executionResults.js';
import { gameLogger } from './logger.js';
import { createServerDeps } from './serverDeps.js';

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
  batchUseAndMergeItems: { module: 'tower', fn: 'batchUseAndMergeItems' },
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
  batchApexClaimTasks: { module: 'apex', fn: 'batchApexClaimTasks' },
  batchApexVote: { module: 'apex', fn: 'batchApexVote' },
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
function createTaskEnvironment(task, userId, db, gameManager, session) {
  const tokenIds = task.tokenIds || [];
  const settings = task.settings || {};
  const selectedTasks = settings.selectedTasks || [];

  if (tokenIds.length === 0 || selectedTasks.length === 0) {
    return { status: 'skip', reason: '未选择账号或任务', results: [] };
  }

  gameLogger.info(`[定时任务] 开始执行: ${task.name}, 账号: ${tokenIds.length}, 任务: ${selectedTasks.length}`);

  // Configuration is frozen when queued; connection credentials remain live for renewal.
  const settingsDb = Object.create(db);
  settingsDb.getKV = (key, owner) => {
    if (key === 'batchSettings' && task.batchSettings !== undefined) return task.batchSettings;
    if (key.startsWith('daily-settings:') && task.dailySettings) return task.dailySettings[key.slice('daily-settings:'.length)] ?? null;
    return db.getKV?.(key, owner);
  };
  // 构建 serverDeps
  const deps = createServerDeps(gameManager, settingsDb, userId, {
    session,
    pushService: gameManager.push,
    tokenIds,
    maxActive: settings.maxActive || 3,
    commandDelay: settings.commandDelay || 500,
    taskDelay: settings.taskDelay || 1000,
  });

  deps.dailyRetrySteps = task.retrySteps?.[tokenIds[0]];

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

  return { deps, modules };
}

// All trigger paths use this scheduler. Account leases are held outside module cleanup.
export async function executeScheduledTask(task, userId, db, gameManager) {
  const ids = [...new Set(task.tokenIds || [])];
  const selected = task.settings?.selectedTasks || [];
  if (!ids.length || !selected.length) return { status: 'skip', reason: '未选择账号或任务', results: [] };
  const mode = task.settings?.executionMode === 'account' ? 'account' : 'task';
  const maxActive = Math.max(1, Math.floor(Number(task.batchSettings?.maxActive ?? task.settings?.maxActive) || 3));
  const results = new Map(selected.map(name => [name, []]));
  const logs = [];
  const tokens = db.getAllTokens(userId);
  const runAccount = async (id, names) => {
    const release = await acquireAccount(gameManager, userId, id);
    const session = createAccountSession(gameManager, userId, id);
    let unavailable = null;
    let sessionUsed = false;
    try {
      for (const name of names) {
        if (task.retrySelection && !task.retrySelection.some(item => item.tokenId === id && item.task === name)) continue;
        const token = tokens.find(t => t.id === id);
        if (isRetiredTreasureTask(name)) {
          const reason = '咸王宝库玩法已下线';
          results.get(name).push({ id, name: token?.name || id, status: 'skip', reason });
          logs.push({ time: new Date().toLocaleTimeString(), message: reason, type: 'warning' });
          continue;
        }
        session.beginTask();
        sessionUsed = true;
        let detail;
        try {
          if (unavailable) { const error = new Error(`账号未就绪，未执行：${unavailable}`); error.stage = 'preflight'; throw error; }
          if (!token) { const error = new Error('账号不存在'); error.permanent = true; throw error; }
          await session.ensure();
          const single = { ...task, tokenIds: [id], settings: { ...task.settings, selectedTasks: [name] } };
          const { deps, modules } = createTaskEnvironment(single, userId, db, gameManager, session);
          const outcome = await executeSelectedTasks(single, deps, modules);
          detail = outcome.results[0]?.accounts?.details?.[0] || { id, name: token.name, status: outcome.status, reason: outcome.results[0]?.reason || outcome.results[0]?.error };
          logs.push(...(outcome.logs || []));
          if (logs.length > 300) logs.splice(0, logs.length - 300);
        } catch (error) {
          detail = { id, name: token?.name || id, status: 'error', reason: error.message, stage: error.stage || 'preflight', retryEligible: error.retryEligible === true };
          if (detail.stage === 'preflight') unavailable = unavailable || error.message;
        }
        const metadata = session.metadata();
        Object.assign(detail, metadata, { stage: detail.stage || 'execution', retryEligible: detail.retryEligible === true && !metadata.submitted });
        if (metadata.unacknowledged && detail.status === 'ok') { detail.status = 'unverified'; detail.reason = '部分命令未等待响应，无法确认结果'; }
        results.get(name).push(detail);
      }
    } finally { try { if (sessionUsed) session.close(); } finally { release(); } }
  };
  const pool = async names => {
    const eligibleIds = ids.filter(id => !task.retrySelection || task.retrySelection.some(item => item.tokenId === id && names.includes(item.task)));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(maxActive, eligibleIds.length) }, async () => {
      while (cursor < eligibleIds.length) { const id = eligibleIds[cursor++]; await runAccount(id, names); }
    }));
  };
  if (mode === 'account') await pool(selected);
  else for (const name of selected) await pool([name]);
  const list = selected.map(name => ({ task: name, accounts: accountSummary(results.get(name)), status: aggregateStatus(results.get(name)) }));
  return { status: aggregateStatus(list), executionMode: mode, results: list, logs, totalLogs: logs.length };
}

// Separated from transport construction so ordering and reporting can be tested without game connections.
export async function executeSelectedTasks(task, deps, modules) {
  const tokenIds = task.tokenIds || [];
  const settings = task.settings || {};
  const selectedTasks = settings.selectedTasks || [];
  const results = [];
  // Missing/deleted accounts remain in the report, but must not crash a module's parallel batch.
  if (deps.selectedTokens) deps.selectedTokens.value = tokenIds.filter(id => deps.tokens.value.some(t => t.id === id));

  // Reset for each selected task; absent terminal status must never inherit success.
  let commandErrors = {};
  const send = deps.tokenStore.sendMessageWithPromise.bind(deps.tokenStore);
  deps.tokenStore.sendMessageWithPromise = async (id, ...args) => {
    try { return await send(id, ...args); }
    catch (error) {
      const failures = commandErrors[id] ||= [];
      if (failures.length < 30) failures.push({ name: args[0], status: 'error', reason: error.message });
      throw error;
    }
  };
  const summarizeAccounts = (error) => accountSummary(tokenIds.map(id => {
    const token = deps.tokens.value.find(t => t.id === id);
    const state = deps.tokenStatus.value[id];
    const reported = deps.accountOutcomes?.[id];
    if (token && reported) return { id, name: token.name, ...reported, ...(error ? { status: reported.status === 'ok' ? 'partial' : reported.status, reason: `${reported.reason || ''}；${error.message}` } : {}) };
    const failures = commandErrors[id] || [];
    const status = !token || failures.length || state === 'failed' ? 'error'
      : state === 'completed' ? 'ok' : error ? 'error' : state === 'skipped' ? 'skip' : 'unverified';
    return { id, name: token?.name || id, status,
      reason: status === 'ok' ? undefined : !token ? '账号不存在' : error?.message || failures.map(f => f.reason).join('；') || (status === 'error' ? '任务模块报告失败' : status === 'unverified' ? '未收到本轮明确完成结果' : status === 'skip' ? '任务模块跳过' : undefined),
      ...(failures.length ? { steps: failures } : {}) };
  }));

  // 按顺序执行用户选择的任务
  for (const taskName of selectedTasks) {
    deps.tokenStatus.value = {};
    deps.accountOutcomes = {};
    commandErrors = {};
    if (deps.shouldStop.value) { results.push({ task: taskName, status: 'skip', reason: '执行提前停止' }); continue; }

    const mapping = TASK_MAP[taskName];
    if (!mapping) {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `未知任务: ${taskName}`, type: 'warning' });
      results.push({ task: taskName, status: 'skip', reason: '未知任务，未执行', accounts: accountSummary(tokenIds.map(id => ({ id, name: deps.tokens.value.find(t => t.id === id)?.name || id, status: 'skip', reason: '未知任务，未执行' }))) });
      continue;
    }

    // 特殊处理 startBatch（日常任务）
    if (mapping.module === 'special' && mapping.fn === 'startBatch') {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `=== 开始执行日常任务 ===`, type: 'info' });
      try {
        const accounts = await executeStartBatch(deps, modules);
        results.push({ task: taskName, status: accounts.status, accounts });
      } catch (e) {
        const accounts = summarizeAccounts(e);
        results.push({ task: taskName, status: accounts.status === 'ok' ? 'partial' : accounts.status, error: e.message, accounts });
      }
      continue;
    }

    const module = modules[mapping.module];
    const fn = module?.[mapping.fn];

    if (typeof fn !== 'function') {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `任务函数不存在: ${taskName}`, type: 'error' });
      results.push({ task: taskName, status: 'error', reason: '任务函数不存在', accounts: summarizeAccounts(new Error('任务函数不存在')) });
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
      const accounts = summarizeAccounts();
      results.push({
        task: taskName,
        status: accounts.status,
        ...(accounts ? { accounts } : {}),
      });
    } catch (e) {
      deps.addLog({ time: new Date().toLocaleTimeString(), message: `任务失败: ${taskName} - ${e.message}`, type: 'error' });
      const accounts = summarizeAccounts(e);
        results.push({ task: taskName, status: accounts.status === 'ok' ? 'partial' : accounts.status, error: e.message, accounts });
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
  return { status: aggregateStatus(results), results, logs, totalLogs: allLogs.length, logsTruncated: allLogs.length > MAX_LOGS };
}

import { DailyTaskRunner } from './dailyTaskRunner.js';

/**
 * startBatch - 日常任务（使用完整的 DailyTaskRunner）
 */
async function executeStartBatch(deps, modules) {
  const { selectedTokens, tokens, tokenStore, addLog, ensureConnection, releaseConnectionSlot, shouldStop, loadSettings } = deps;

  const details = [];

  for (const tokenId of selectedTokens.value) {
    if (shouldStop.value) { details.push({ id: tokenId, name: tokenId, status: 'skip', reason: '执行提前停止' }); continue; }

    const token = tokens.value.find(t => t.id === tokenId);
    if (!token) { details.push({ id: tokenId, name: tokenId, status: 'error', reason: '账号不存在' }); continue; }

    try {
      await ensureConnection(tokenId);
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 开始日常任务`, type: 'info' });

      const settings = await loadSettings(tokenId);

      const runner = new DailyTaskRunner(tokenStore, {
        commandDelay: settings?.commandDelay || 500,
        taskDelay: settings?.taskDelay || 500,
      });

      const outcome = await runner.run(tokenId, {
        onLog: (entry) => addLog({ time: entry.time, message: `[${token.name}] ${entry.message}`, type: entry.type }),
        onProgress: () => {},
      }, deps.dailyRetrySteps ? { ...settings, retryStepNames: deps.dailyRetrySteps } : settings);

      details.push({ id: tokenId, name: token.name, ...outcome });
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 日常任务结束：${outcome.status}`, type: outcome.status === 'ok' ? 'success' : 'warning' });
    } catch (e) {
      addLog({ time: new Date().toLocaleTimeString(), message: `[${token.name}] 日常任务失败: ${e.message}`, type: 'error' });
      details.push({ id: tokenId, name: token.name, status: 'error', reason: e.message });
    } finally {
      tokenStore.closeWebSocketConnection(tokenId);
      releaseConnectionSlot();
    }
  }

  return accountSummary(details);
}
