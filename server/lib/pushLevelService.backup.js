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
      currLevel: r.currLevel,
      passed: r.passed,
      failStreak: r.failStreak,
      maxFail: r.maxFail,
      startedAt: r.startedAt,
      lastMsg: r.lastMsg,
      stopReason: r.stopReason || null,
    };
  }

  getAllStatus() {
    const out = {};
    for (const [tokenId] of this.runners) out[tokenId] = this.getStatus(tokenId);
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

    const runner = {
      running: true,
      tokenId,
      userId: userId || '',
      maxFail,
      failStreak: 0,
      passed: 0,
      currLevel: null,
      startedAt: new Date().toISOString(),
      lastMsg: '已启动',
      stopReason: null,
    };
    this.runners.set(tokenId, runner);

    this._log(tokenId, 'info', `开始推关（连续失败${maxFail}次自动停止）`);
    this._broadcast(tokenId);

    // 异步跑循环，不阻塞接口返回
    this._loop(tokenId).catch(e => {
      gameLogger.error(`推关循环异常 [${tokenId}]: ${e.message}`);
      this._stopInternal(tokenId, '循环异常: ' + e.message);
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
    r.stopReason = reason;
    r.lastMsg = '已停止: ' + reason;
    this._log(tokenId, 'info', '推关停止: ' + reason);
    this._broadcast(tokenId);
  }

  // 核心循环
  async _loop(tokenId) {
    const r = this.runners.get(tokenId);
    if (!r) return;

    while (r.running) {
      // 1. 算这一关要打多久
      let battleTime;
      try {
        const calcResp = await this.gm.sendMessageWithPromise(tokenId, 'fight_calcleveltime', {}, 8000);
        battleTime = pick(calcResp, 'battleTime');
        const cl = pick(calcResp, 'currLevel');
        if (cl != null) r.currLevel = cl;
      } catch (e) {
        // 发送失败：可能掉线
        this._log(tokenId, 'warn', 'calcleveltime失败: ' + e.message);
        if (!await this._ensureConnected(tokenId)) {
          this._stopInternal(tokenId, r._kicked ? '账号被顶号，已停止（未抢号）' : '掉线且重连失败');
          return;
        }
        continue; // 重连成功，重试本关
      }

      if (battleTime == null) {
        this._log(tokenId, 'warn', 'calcleveltime没返回battleTime，停止');
        this._stopInternal(tokenId, 'battleTime为空');
        return;
      }

      // battleTime < 0 表示打不过，按超时处理（等一个保护时长再试level，看success）
      let waitSec = battleTime < 0 ? 30 : battleTime;
      if (waitSec > 300) waitSec = 300; // 安全上限5分钟

      r.lastMsg = `第${r.currLevel || '?'}关 战斗中(${waitSec}s)`;
      this._broadcast(tokenId);

      // 2. 等待（分段等待，便于及时响应停止）
      const ok = await this._interruptibleWait(tokenId, waitSec * 1000);
      if (!ok || !r.running) return; // 被停止

      // 3. 提交过关
      let success, nextTime, currLevel;
      try {
        const levelResp = await this.gm.sendMessageWithPromise(tokenId, 'fight_level', {}, 8000);
        success = pick(levelResp, 'success');
        nextTime = pick(levelResp, 'nextTime');
        currLevel = pick(levelResp, 'currLevel');
      } catch (e) {
        this._log(tokenId, 'warn', 'level失败: ' + e.message);
        if (!await this._ensureConnected(tokenId)) {
          this._stopInternal(tokenId, r._kicked ? '账号被顶号，已停止（未抢号）' : '掉线且重连失败');
          return;
        }
        continue;
      }

      if (currLevel != null) r.currLevel = currLevel;

      if (success === true || success === 1) {
        r.passed++;
        r.failStreak = 0;
        r.lastMsg = `✅ 过关 -> 第${currLevel}关 (累计${r.passed})`;
        this._log(tokenId, 'info', r.lastMsg);
      } else {
        r.failStreak++;
        r.lastMsg = `❌ 失败 第${r.currLevel}关 (连续${r.failStreak}/${r.maxFail})`;
        this._log(tokenId, 'info', r.lastMsg);
        if (r.failStreak >= r.maxFail) {
          this._stopInternal(tokenId, `连续失败${r.maxFail}次`);
          return;
        }
      }
      this._broadcast(tokenId);

      // 4. 下一关等待时间：优先用 nextTime
      let nextWait = (typeof nextTime === 'number' && nextTime >= 0) ? nextTime : 2;
      if (nextWait > 300) nextWait = 300;
      const ok2 = await this._interruptibleWait(tokenId, nextWait * 1000);
      if (!ok2 || !r.running) return;
    }
  }

  // 可中断的等待（每500ms检查是否被停止）
  async _interruptibleWait(tokenId, ms) {
    const r = this.runners.get(tokenId);
    let waited = 0;
    while (waited < ms) {
      if (!r || !r.running) return false;
      const step = Math.min(500, ms - waited);
      await sleep(step);
      waited += step;
    }
    return true;
  }

  // 确保连接。掉线处理策略：让（不抢号）
  // 网络抖动 -> 重连1次继续；疑似被顶号（重连后又立刻断 / 短时间内反复掉线）-> 停止不抢
  async _ensureConnected(tokenId) {
    if (this.gm.getConnectionStatus(tokenId) === 'connected') return true;
    const r = this.runners.get(tokenId);
    if (!r) return false;

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
