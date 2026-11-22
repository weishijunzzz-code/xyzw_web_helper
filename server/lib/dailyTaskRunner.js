import { runDailyFreeArena } from "../../src/utils/dailyArena.js";
import { aggregateStatus } from './executionResults.js';
/**
 * 后端版 DailyTaskRunner - 完整搬运前端 dailyTaskRunner.js
 */

const isTodayAvailable = (statisticsTime) => {
  if (!statisticsTime) return true;
  const today = new Date().toDateString();
  const recordDate = new Date(statisticsTime * 1000).toDateString();
  return today !== recordDate;
};

const getTodayBossId = () => {
  const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905];
  return DAY_BOSS_MAP[new Date().getDay()];
};

export class DailyTaskRunner {
  constructor(tokenStore, delaySettings = null) {
    this.tokenStore = tokenStore;
    this.delaySettings = delaySettings || { commandDelay: 500, taskDelay: 500 };
  }

  log(message, type = "info") {
    if (type === "error" && this.stepErrors) this.stepErrors.push(message);
    if (this.callbacks?.onLog) {
      this.callbacks.onLog({ time: new Date().toLocaleTimeString(), message, type });
    }
  }

  async executeGameCommand(tokenId, cmd, params = {}, description = "", timeout = 8000) {
    try {
      if (description) this.log(`执行: ${description}`);
      this.stepCommands = (this.stepCommands || 0) + 1;
      const result = await this.tokenStore.sendMessageWithPromise(tokenId, cmd, params, timeout);
      await new Promise(r => setTimeout(r, this.delaySettings.commandDelay));
      if (description) this.log(`${description} - 成功`, "success");
      return result;
    } catch (error) {
      if (description) this.log(`${description} - 失败: ${error.message}`, "error");
      throw error;
    }
  }

  async switchToFormationIfNeeded(tokenId, targetFormation, formationName) {
    try {
      this.log(`检查${formationName}配置...`);
      const teamInfo = await this.executeGameCommand(tokenId, "presetteam_getinfo", {}, "获取阵容信息");
      const currentFormation = teamInfo?.presetTeamInfo?.useTeamId;
      this.log(`当前阵容: ${currentFormation}`);
      if (currentFormation === targetFormation) {
        this.log(`当前已是${formationName}${targetFormation}，无需切换`, "success");
        return false;
      }
      this.log(`当前阵容: ${currentFormation}, 目标阵容: ${targetFormation}，开始切换...`);
      await this.executeGameCommand(tokenId, "presetteam_saveteam", { teamId: targetFormation }, `切换到${formationName}${targetFormation}`);
      this.log(`成功切换到${formationName}${targetFormation}`, "success");
      return true;
    } catch (error) {
      this.log(`阵容检查失败，尝试强制切换: ${error.message}`, "warning");
      try {
        await this.executeGameCommand(tokenId, "presetteam_saveteam", { teamId: targetFormation }, `强制切换到${formationName}${targetFormation}`);
        return true;
      } catch (fallbackError) {
        this.log(`强制切换也失败: ${fallbackError.message}`, "error");
        throw fallbackError;
      }
    }
  }

  async run(tokenId, callbacks = {}, customSettings = null) {
    this.callbacks = callbacks;
    this.stepErrors = [];
    const settings = customSettings || {
      arenaFormation: 1, bossFormation: 1, bossTimes: 2,
      claimBottle: true, payRecruit: true, openBox: true,
      arenaEnable: true, claimHangUp: true, claimEmail: true, blackMarketPurchase: true,
    };

    this.log("正在获取角色信息...");
    let roleInfoResp;
    try {
      roleInfoResp = await this.tokenStore.sendGetRoleInfo(tokenId);
      if (!roleInfoResp) throw new Error("返回为空");
      this.log("角色信息获取成功", "success");
    } catch (error) {
      this.log(`获取角色信息失败，尝试重连: ${error.message}`, "warning");
      try {
        this.tokenStore.closeWebSocketConnection(tokenId);
        await new Promise(r => setTimeout(r, 2000));
        await this.tokenStore.createWebSocketConnection(tokenId);
        await new Promise(r => setTimeout(r, 5000));
        roleInfoResp = await this.tokenStore.sendGetRoleInfo(tokenId);
        if (!roleInfoResp) throw new Error("重连后仍返回为空");
        this.log("重连后角色信息获取成功", "success");
      } catch (retryError) {
        this.log(`重连后仍失败: ${retryError.message}`, "error");
        throw retryError;
      }
    }

    const roleData = roleInfoResp?.role || roleInfoResp?.body?.role || roleInfoResp?.data?.role;
    if (!roleData) {
      this.log(`角色数据解析失败，原始数据keys: ${Object.keys(roleInfoResp || {}).join(',')}`, "error");
      throw new Error("角色数据不存在");
    }

    this.log("开始执行每日任务补差");

    let originalFormation = null;
    try {
      this.log("读取当前阵容信息...");
      const teamInfo = await this.executeGameCommand(tokenId, "presetteam_getinfo", {}, "获取当前阵容信息");
      originalFormation = teamInfo?.presetTeamInfo?.useTeamId;
      this.log(`当前阵容: ${originalFormation}`);
    } catch (error) {
      this.log(`读取当前阵容失败: ${error.message}`, "warning");
    }

    const completedTasks = roleData.dailyTask?.complete ?? {};
    const isTaskCompleted = (taskId) => completedTasks[taskId] === -1;
    const statistics = roleData.statistics ?? {};
    const statisticsTime = roleData.statisticsTime ?? {};

    const taskList = [];

    // 1. 基础任务
    if (!isTaskCompleted(2)) {
      taskList.push({ name: "分享一次游戏", execute: () => this.executeGameCommand(tokenId, "system_mysharecallback", { isSkipShareCard: true, type: 2 }, "分享游戏") });
    }
    if (!isTaskCompleted(3)) {
      taskList.push({ name: "赠送好友金币", execute: () => this.executeGameCommand(tokenId, "friend_batch", {}, "赠送好友金币") });
    }
    if (!isTaskCompleted(4)) {
      taskList.push({ name: "免费招募", execute: () => this.executeGameCommand(tokenId, "hero_recruit", { recruitType: 3, recruitNumber: 1 }, "免费招募") });
      if (settings.payRecruit) {
        taskList.push({ name: "付费招募", execute: () => this.executeGameCommand(tokenId, "hero_recruit", { recruitType: 1, recruitNumber: 1 }, "付费招募") });
      }
    }
    if (!isTaskCompleted(6) && isTodayAvailable(statisticsTime["buy:gold"])) {
      for (let i = 0; i < 3; i++) {
        taskList.push({ name: `免费点金 ${i + 1}/3`, execute: () => this.executeGameCommand(tokenId, "system_buygold", { buyNum: 1 }, `免费点金 ${i + 1}`) });
      }
    }
    if (!isTaskCompleted(5) && settings.claimHangUp) {
      taskList.push({ name: "领取挂机奖励", execute: () => this.executeGameCommand(tokenId, "system_claimhangupreward", {}, "领取挂机奖励") });
      for (let i = 0; i < 4; i++) {
        taskList.push({ name: `挂机加钟 ${i + 1}/4`, execute: () => this.executeGameCommand(tokenId, "system_mysharecallback", { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`) });
      }
    }
    if (!isTaskCompleted(7) && settings.openBox) {
      taskList.push({ name: "开启木质宝箱", execute: () => this.executeGameCommand(tokenId, "item_openbox", { itemId: 2001, number: 10 }, "开启木质宝箱10个") });
    }

    taskList.push({ name: "停止盐罐计时", execute: () => this.executeGameCommand(tokenId, "bottlehelper_stop", {}, "停止盐罐计时") });
    taskList.push({ name: "开始盐罐计时", execute: () => this.executeGameCommand(tokenId, "bottlehelper_start", {}, "开始盐罐计时") });

    if (!isTaskCompleted(14) && settings.claimBottle) {
      taskList.push({ name: "领取盐罐奖励", execute: () => this.executeGameCommand(tokenId, "bottlehelper_claim", {}, "领取盐罐奖励") });
    }

    if (settings.arenaEnable) {
      taskList.push({
        name: "竞技场免费战斗",
        execute: async () => {
          const hour = new Date(Date.now() + 8 * 3600000).getUTCHours();
          if (!settings.ignoreTimeCheck && (hour < 6 || hour >= 22)) {
            this.log("竞技场未开放，跳过免费战斗", "info");
            return;
          }
          const confirmed = await runDailyFreeArena({
            readRole: async () => {
              const response = await this.tokenStore.sendGetRoleInfo(tokenId);
              return response?.role ?? response?.body?.role ?? response?.data?.role;
            },
            command: (...args) => this.executeGameCommand(tokenId, ...args),
            prepare: () => this.switchToFormationIfNeeded(tokenId, settings.arenaFormation, "竞技场阵容"),
            pause: ms => new Promise(resolve => setTimeout(resolve, ms)),
          });
          if (!confirmed) this.log("服务器未确认竞技场免费次数进展，已停止补打", "error");
        },
      });
    }

    // 3. BOSS
    if (settings.bossEnable !== false && settings.bossTimes > 0) {
      let alreadyLegionBoss = statistics["legion:boss"] ?? 0;
      if (isTodayAvailable(statisticsTime["legion:boss"])) alreadyLegionBoss = 0;
      const remainingLegionBoss = Math.max(settings.bossTimes - alreadyLegionBoss, 0);
      if (remainingLegionBoss > 0) {
        taskList.push({ name: "军团BOSS阵容检查", execute: () => this.switchToFormationIfNeeded(tokenId, settings.bossFormation, "BOSS阵容") });
        for (let i = 0; i < remainingLegionBoss; i++) {
          taskList.push({ name: `军团BOSS ${i + 1}/${remainingLegionBoss}`, execute: () => this.executeGameCommand(tokenId, "fight_startlegionboss", {}, `军团BOSS ${i + 1}`, 12000) });
        }
      }
    }

    const todayBossId = getTodayBossId();
    taskList.push({ name: "每日BOSS阵容检查", execute: () => this.switchToFormationIfNeeded(tokenId, settings.bossFormation, "BOSS阵容") });
    for (let i = 0; i < 3; i++) {
      taskList.push({ name: `每日BOSS ${i + 1}/3`, execute: () => this.executeGameCommand(tokenId, "fight_startboss", { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000) });
    }

    // 4. 固定奖励
    const fixedRewards = [
      { name: "福利签到", cmd: "system_signinreward" },
      { name: "俱乐部", cmd: "legion_signin" },
      { name: "领取每日礼包", cmd: "discount_claimreward" },
      { name: "领取每日免费奖励", cmd: "collection_claimfreereward" },
      { name: "领取免费礼包", cmd: "card_claimreward" },
      { name: "领取永久卡礼包", cmd: "card_claimreward", params: { cardId: 4003 } },
    ];
    if (settings.claimEmail) {
      fixedRewards.push({ name: "领取邮件奖励", cmd: "mail_claimallattachment" });
    }
    fixedRewards.forEach(reward => {
      taskList.push({ name: reward.name, execute: () => this.executeGameCommand(tokenId, reward.cmd, reward.params || {}, reward.name) });
    });

    taskList.push({ name: "开始领取珍宝阁礼包", execute: () => this.executeGameCommand(tokenId, "collection_goodslist", {}, "开始领取珍宝阁礼包") });
    taskList.push({ name: "领取珍宝阁免费礼包", execute: () => this.executeGameCommand(tokenId, "collection_claimfreereward", {}, "领取珍宝阁免费礼包") });

    // 5. 免费活动
    if (isTodayAvailable(statistics["artifact:normal:lottery:time"])) {
      for (let i = 0; i < 3; i++) {
        taskList.push({ name: `免费钓鱼 ${i + 1}/3`, execute: () => this.executeGameCommand(tokenId, "artifact_lottery", { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`) });
      }
    }

    // 免费扭蛋
    if (settings.freeGachaEnable !== false && isTodayAvailable(statisticsTime["gacha:free"])) {
      taskList.push({ name: "免费扭蛋", execute: () => this.executeGameCommand(tokenId, "gacha_drawreward", { num: 1, isGroup: false }, "免费扭蛋") });
    }

    const kingdoms = ["魏国", "蜀国", "吴国", "群雄"];
    for (let gid = 1; gid <= 4; gid++) {
      if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
        taskList.push({ name: `${kingdoms[gid - 1]}灯神免费扫荡`, execute: () => this.executeGameCommand(tokenId, "genie_sweep", { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`) });
      }
    }
    for (let i = 0; i < 3; i++) {
      taskList.push({ name: `领取免费扫荡卷 ${i + 1}/3`, execute: () => this.executeGameCommand(tokenId, "genie_buysweep", {}, `领取免费扫荡卷 ${i + 1}`) });
    }

    // 6. 黑市
    if (!isTaskCompleted(12) && settings.blackMarketPurchase) {
      taskList.push({ name: "黑市购买1次物品", execute: () => this.executeGameCommand(tokenId, "store_purchase", { goodsId: 1 }, "黑市购买1次物品") });
    }

    // 咸王梦境
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 4) {
      const mjbattleTeam = { 0: 107 };
      taskList.push({ name: "咸王梦境", execute: () => this.executeGameCommand(tokenId, "dungeon_selecthero", { battleTeam: mjbattleTeam }, "咸王梦境") });
    }

    // 深海灯神
    if (dayOfWeek === 1 && isTodayAvailable(statisticsTime["genie:daily:free:5"])) {
      taskList.push({ name: "深海灯神", execute: () => this.executeGameCommand(tokenId, "genie_sweep", { genieId: 5, sweepCnt: 1 }, "深海灯神") });
    }

    // 阵容还原
    if (originalFormation) {
      taskList.push({ name: "阵容还原", execute: () => this.switchToFormationIfNeeded(tokenId, originalFormation, "初始阵容") });
    }

    // 7. 任务奖励
    for (let taskId = 1; taskId <= 10; taskId++) {
      taskList.push({ name: `领取任务奖励${taskId}`, execute: () => this.executeGameCommand(tokenId, "task_claimdailypoint", { taskId }, `领取任务奖励${taskId}`, 5000) });
    }
    taskList.push({ name: "领取日常任务奖励", execute: () => this.executeGameCommand(tokenId, "task_claimdailyreward", {}, "领取日常任务奖励") });
    taskList.push({ name: "领取周常任务奖励", execute: () => this.executeGameCommand(tokenId, "task_claimweekreward", {}, "领取周常任务奖励") });
    taskList.push({ name: "领取通行证奖励", execute: () => this.executeGameCommand(tokenId, "activity_recyclewarorderrewardclaim", { actId: 1 }, "领取通行证奖励") });

    if (Array.isArray(customSettings?.retryStepNames)) {
      const allowed = new Set(customSettings.retryStepNames);
      taskList.splice(0, taskList.length, ...taskList.filter(task => allowed.has(task.name)));
    }

    // 执行
    const totalTasks = taskList.length;
    this.log(`共有 ${totalTasks} 个任务待执行`);

    const steps = [];
    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      const status = this.tokenStore.getWebSocketStatus(tokenId);
      if (status !== 'connected') {
        this.log(`连接已断开，尝试重连...`, "warning");
        try {
          await this.tokenStore.createWebSocketConnection(tokenId);
          await new Promise(r => setTimeout(r, 3000));
          if (this.tokenStore.getWebSocketStatus(tokenId) !== 'connected') throw new Error('重连失败');
          this.log(`重连成功`, "success");
        } catch (e) {
          this.log(`重连失败，剩余任务跳过: ${e.message}`, "error");
          steps.push(...taskList.slice(i).map(t => ({ name: t.name, status: 'error', reason: `重连失败，未执行：${e.message}` })));
          break;
        }
      }
      this.stepErrors = [];
      this.stepCommands = 0;
      try {
        await task.execute();
        steps.push({ name: task.name, status: this.stepErrors.length ? 'error' : this.stepCommands ? 'ok' : 'skip', reason: this.stepErrors.join('；') || (this.stepCommands ? undefined : '无需执行或条件不满足') });
        if (this.callbacks?.onProgress) this.callbacks.onProgress(Math.floor(((i + 1) / totalTasks) * 100));
        await new Promise(r => setTimeout(r, this.delaySettings.taskDelay));
      } catch (error) {
        steps.push({ name: task.name, status: "error", reason: error.message });
        this.log(`任务执行失败: ${task.name} - ${error.message}`, "error");
      }
    }

    const status = aggregateStatus(steps);
    this.log(`日常任务结束：${steps.filter(s => s.status === 'ok').length}/${totalTasks} 项成功`, status === 'ok' ? 'success' : 'warning');
    return { status, steps };
  }
}
