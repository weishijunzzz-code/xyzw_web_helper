import { gameLogger } from './logger.js';

/**
 * 纯协议后端推关服务
 *
 * 原理（已实测验证）：
 *   1. fight_calcleveltime {} -> { battleTime, currLevel }  battleTime是要等的秒数
 *   2. 等待 battleTime 秒
 *   3. fight_level {} -> { success, nextTime, currLevel }
 *   4. 用 nextTime 作为下一关等待时间，循环
 *
 * 停止条件：连续失败达到阈值 / 掉线无法重连 / 手动停止
 */

function pick(resp, name) {
  if (!resp || typeof resp !== 'object') return undefined;
  if (resp[name] !== undefined) return resp[name];
  for (const k of ['body', '_rawData', 'rawData', 'decodedBody', 'data']) {
    if (resp[k] && resp[k][name] !== undefined) return resp[k][name];
  }
  if (typeof resp.getData === 'function') {
    try { const d = resp.getData(); if (d && d[name] !== undefined) return d[name]; } catch {}
  }
  return undefined;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class PushLevelService {
  constructor(gameManager, pushService) {
    this.gm = gameManager;
    this.push = pushService;
    // tokenId -> 运行状态
    this.runners = new Map();
  }

  // 是否正在推关
  isRunning(tokenId) {
    const r = this.runners.get(tokenId);
    return !!(r && r.running);
  }

  // 获取状态
  getStatus(tokenId) {
    const r = this.runners.get(tokenId);
    if (!r) return { running: false };
    return {
      running: r.running,
      phase: r.phase,
      currLevel: r.currLevel,
      passed: r.passed,
      failed: r.failed,
      failStreak: r.failStreak,
      maxFail: r.maxFail,
      startedAt: r.startedAt,
      lastMsg: r.lastMsg,
      lastBattle: r.lastBattle,
      lastError: r.lastError,
      stopReason: r.stopReason || null,
    };
  }

  getAllStatus(userId) {
    const out = {};
    for (const [tokenId, runner] of this.runners) {
      if (runner.userId === userId) out[tokenId] = this.getStatus(tokenId);
    }
    return out;
  }

  // 开始推关
  async start(tokenId, userId, options = {}) {
    if (this.isRunning(tokenId)) {
      return { ok: false, msg: '该账号已在推关中' };
    }

    const maxFail = Math.max(1, parseInt(options.maxFail) || 20);

    // 确保已连接
    let status = this.gm.getConnectionStatus(tokenId);
    if (status !== 'connected') {
      this._log(tokenId, 'info', '账号未连接，正在连接...');
      try {
        await this.gm.connectWithRetry(tokenId, userId || '', 3);
        await sleep(2000);
      } catch (e) {
        return { ok: false, msg: '连接失败: ' + e.message };
      }
      status = this.gm.getConnectionStatus(tokenId);
      if (status !== 'connected') {
        return { ok: false, msg: '连接失败，状态: ' + status };
      }
    }

    if (this.isRunning(tokenId)) return { ok: false, msg: "该账号已在推关中" };
    const runner = {
      running: true,
      phase: 'preparing',
      tokenId,
      userId: userId || '',
      maxFail,
      failStreak: 0,
      passed: 0,
      failed: 0,
      currLevel: null,
      startedAt: new Date().toISOString(),
      lastMsg: '已启动',
      lastBattle: null,
      lastError: null,
      stopReason: null,
    };
    this.runners.set(tokenId, runner);

    this._log(tokenId, 'info', `开始推关（连续失败${maxFail}次自动停止）`);
    this._broadcast(tokenId);

    // 异步跑循环，不阻塞接口返回
    this._loop(runner).catch(() => {
      if (runner.running) this._stopInternal(tokenId, '推关循环异常');
    });

    return { ok: true, msg: '已开始推关' };
  }

  // 停止推关（手动）
  stop(tokenId) {
    const r = this.runners.get(tokenId);
    if (!r || !r.running) return { ok: false, msg: '该账号未在推关' };
    this._stopInternal(tokenId, '手动停止');
    return { ok: true, msg: '已停止' };
  }

  stopAll() {
    for (const [tokenId, r] of this.runners) {
      if (r.running) this._stopInternal(tokenId, '全部停止');
    }
  }

  _stopInternal(tokenId, reason) {
    const r = this.runners.get(tokenId);
    if (!r) return;
    r.running = false;
    r.phase = 'stopped';
    r.stopReason = reason;
    r.lastMsg = '已停止: ' + reason;
    this._log(tokenId, 'info', '推关停止: ' + reason);
    this._broadcast(tokenId);
  }

  // 核心循环（优化版：开头calc一次定时间，之后只发level + 用nextTime等待）
  async _loop(r) {
    const { tokenId } = r;
    let waitSec = null;
    while (r.running) {
      if (waitSec === null) {
        r.phase = 'preparing';
        r.lastMsg = '计算战斗时间';
        this._broadcast(tokenId);
        try {
          const calcResp = await this.gm.sendMessageWithPromise(tokenId, 'fight_calcleveltime', {}, 8000);
          if (!r.running) return;
          const bt = pick(calcResp, 'battleTime');
          const cl = pick(calcResp, 'currLevel');
          if (cl != null) r.currLevel = cl;
          waitSec = bt == null ? 2 : bt < 0 ? 30 : bt;
        } catch {
          if (!await this._recover(r, '计算战斗时间失败')) return;
          continue;
        }
      }
      if (waitSec > 300) waitSec = 300; // 安全上限

      r.phase = 'waiting';
      r.lastMsg = `第${r.currLevel || '?'}关 等待结算(${waitSec}s)`;
      this._broadcast(tokenId);

      // 等待（可中断）
      const ok = await this._interruptibleWait(r, waitSec * 1000);
      if (!ok || !r.running) return;

      // 提交过关
      r.phase = 'settling';
      r.lastMsg = '正在获取战斗结果';
      this._broadcast(tokenId);
      const battleLevel = r.currLevel;
      let success, nextTime, currLevel;
      try {
        const levelResp = await this.gm.sendMessageWithPromise(tokenId, 'fight_level', {}, 8000);
        if (!r.running) return;
        success = pick(levelResp, 'success') ?? pick(levelResp, 'isWin');
        nextTime = pick(levelResp, 'nextTime');
        currLevel = pick(levelResp, 'currLevel');
      } catch {
        if (!await this._recover(r, '获取战斗结果失败')) return;
        waitSec = null;
        continue;
      }

      // 旧响应可能省略默认的 false，此时用同一关卡的服务端回执确认。
      if (success == null && Number(battleLevel) > 0 && Number(currLevel) >= Number(battleLevel)) {
        success = Number(currLevel) > Number(battleLevel);
      }
      if (![true, false, 0, 1].includes(success)) {
        if (!await this._recover(r, '服务端未返回可确认的战斗结果')) return;
        waitSec = null;
        continue;
      }

      if (currLevel != null) r.currLevel = currLevel;
      const won = success === true || success === 1;
      r.lastError = null;
      r.lastBattle = { won, level: battleLevel, completedAt: new Date().toISOString() };
      if (won) {
        r.passed++;
        r.failStreak = 0;
        r.lastMsg = `✅ 过关 -> 第${currLevel}关 (累计${r.passed})`;
        this._log(tokenId, 'info', r.lastMsg);
      } else {
        r.failed++;
        r.failStreak++;
        r.lastMsg = `❌ 失败 第${r.currLevel}关 (连续${r.failStreak}/${r.maxFail})`;
        this._log(tokenId, 'info', r.lastMsg);
        if (r.failStreak >= r.maxFail) {
          this._stopInternal(tokenId, `连续失败${r.maxFail}次`);
          return;
        }
      }
      this._broadcast(tokenId);

      // 下一关等待时间：用 level 返回的 nextTime
      waitSec = (typeof nextTime === 'number' && nextTime >= 0) ? nextTime : 2;
    }
  }

  async _recover(runner, message) {
    if (!runner.running) return false;
    const { tokenId } = runner;
    runner.lastError = message;
    runner.phase = this.gm.getConnectionStatus(tokenId) === 'connected' ? 'retrying' : 'reconnecting';
    runner.lastMsg = message;
    this._log(tokenId, 'warn', message);
    this._broadcast(tokenId);
    if (!await this._ensureConnected(runner)) {
      if (runner.running) {
        this._stopInternal(tokenId, runner._kicked ? '账号被顶号，已停止（未抢号）' : '掉线且重连失败');
      }
      return false;
    }
    // 连接正常但命令失败时稍后重试，避免紧密循环。
    if (!runner.running) return false;
    if (runner.phase !== 'retrying') {
      runner.phase = 'retrying';
      this._broadcast(tokenId);
    }
    return (await this._interruptibleWait(runner, 2000)) && runner.running;
  }

  // 可中断的等待（每500ms检查是否被停止）
  async _interruptibleWait(r, ms) {
    let waited = 0;
    while (waited < ms) {
      if (!r.running) return false;
      const step = Math.min(500, ms - waited);
      await sleep(step);
      waited += step;
    }
    return true;
  }

  // 确保连接。掉线处理策略：让（不抢号）
  // 网络抖动 -> 重连1次继续；疑似被顶号（重连后又立刻断 / 短时间内反复掉线）-> 停止不抢
  async _ensureConnected(r) {
    const { tokenId } = r;
    if (!r.running) return false;
    if (this.gm.getConnectionStatus(tokenId) === 'connected') return true;

    const now = Date.now();
    // 记录掉线时间点
    r._disconnectTimes = (r._disconnectTimes || []).filter(t => now - t < 60000);
    r._disconnectTimes.push(now);

    // 1分钟内掉线 >= 2 次，判定为被顶号，停止不抢
    if (r._disconnectTimes.length >= 2) {
      this._log(tokenId, 'warn', '短时间内反复掉线，疑似被顶号，停止（不抢号）');
      r._kicked = true;
      return false;
    }

    // 否则当作网络抖动，重连1次
    this._log(tokenId, 'warn', '检测到掉线，尝试重连1次...');
    try {
      await this.gm.connectWithRetry(tokenId, r.userId || '', 1);
      await sleep(2000);
      return this.gm.getConnectionStatus(tokenId) === 'connected';
    } catch (e) {
      return false;
    }
  }

  _log(tokenId, level, msg) {
    gameLogger.info(`[推关][${tokenId}] ${msg}`);
    try { this.push.log(tokenId, level, '[推关] ' + msg); } catch {}
  }

  _broadcast(tokenId) {
    try {
      this.push.broadcast('pushLevel', { tokenId, status: this.getStatus(tokenId) });
    } catch {}
  }
}
