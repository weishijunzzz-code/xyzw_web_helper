import { SaltFieldRunner } from './saltFieldRunner.js';
import { gameLogger } from '../logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 时间窗：周六 20:00-20:30（北京时间，服务器已是CST） */
export function inSaltWindow(now = new Date()) {
  const isSat = now.getDay() === 6;
  const mins = now.getHours() * 60 + now.getMinutes();
  return isSat && mins >= 20 * 60 && mins <= 20 * 60 + 30;
}

const KV_KEY = 'saltfield-enabled-tokens';

/**
 * 盐场创地服务：管理多账号 runner + 参与账号配置 + 定时触发
 */
export class SaltFieldService {
  constructor(gameManager, pushService, db) {
    this.gm = gameManager;
    this.push = pushService;
    this.db = db;
    this.runners = new Map(); // tokenId -> SaltFieldRunner
  }

  _log(type, message) {
    try { this.push.log('saltfield', type || 'info', message); } catch {}
    gameLogger.info(`[盐场] ${message}`);
  }

  /** 读取参与盐场的 tokenId 列表（按 userId 存） */
  getEnabledTokens(userId) {
    try {
      const raw = this.db.getKV(KV_KEY, userId || '');
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') return JSON.parse(raw);
    } catch {}
    return [];
  }

  setEnabledTokens(userId, tokenIds) {
    const list = Array.isArray(tokenIds) ? tokenIds : [];
    this.db.setKV(KV_KEY, list, userId || '');
    return list;
  }

  getStatus(tokenId) {
    const r = this.runners.get(tokenId);
    if (!r) return { running: false, status: 'idle' };
    return r.getStatus();
  }

  getAllStatus() {
    const out = {};
    for (const [tokenId, r] of this.runners) out[tokenId] = r.getStatus();
    return out;
  }

  /** 启动单个账号创地 */
  async start(tokenId, userId, tokenName) {
    const exist = this.runners.get(tokenId);
    if (exist && exist.running) return { ok: false, msg: '该账号盐场创地已在运行' };

    let status = this.gm.getConnectionStatus(tokenId);
    if (status !== 'connected') {
      this._log('info', `${tokenName || tokenId} 未连接，正在连接...`);
      try {
        await this.gm.connectWithRetry(tokenId, userId || '', 3);
        await sleep(2000);
      } catch (e) {
        return { ok: false, msg: '连接失败: ' + e.message };
      }
      status = this.gm.getConnectionStatus(tokenId);
      if (status !== 'connected') return { ok: false, msg: '连接失败，状态: ' + status };
    }

    const runner = new SaltFieldRunner({
      gameManager: this.gm,
      tokenId,
      tokenName,
      userId,
      addLog: (entry) => { try { this.push.log('saltfield', entry.type || 'info', entry.message); } catch {} },
      isInWindow: () => inSaltWindow(),
    });
    this.runners.set(tokenId, runner);
    runner.start().catch((e) => this._log('error', `${tokenName || tokenId} 异常: ${e.message}`));
    return { ok: true, msg: '已启动盐场创地' };
  }

  stop(tokenId) {
    const r = this.runners.get(tokenId);
    if (r) r.stop();
    return { ok: true };
  }

  stopAll() {
    for (const [, r] of this.runners) { try { r.stop(); } catch {} }
  }

  /** 定时入口：对所有用户的参与账号启动 */
  /** 盐场报名：对勾选的号轮流发一次 legion_signup */
  async runSignup() {
    this._log('info', '盐场报名开始');
    const users = this.db.getAllUsers ? this.db.getAllUsers() : [];
    const userList = users.length ? users : [{ id: '' }];
    for (const u of userList) {
      const tokenIds = this.getEnabledTokens(u.id);
      for (const tokenId of tokenIds) {
        const tk = this.db.getToken(tokenId, u.id || '');
        const name = tk?.name || tokenId;
        try {
          let status = this.gm.getConnectionStatus(tokenId);
          if (status !== 'connected') {
            await this.gm.connectWithRetry(tokenId, u.id || '', 3);
            await sleep(1500);
          }
          await this.gm.sendMessageWithPromise(tokenId, 'legion_signup', {}, 8000);
          this._log('success', `${name} 报名成功`);
        } catch (e) {
          this._log('warning', `${name} 报名失败: ${e.message}`);
        }
        await sleep(1500);
      }
    }
    this._log('info', '盐场报名结束');
  }

  async runScheduled() {
    if (!inSaltWindow()) return;
    this._log('info', '盐场时间窗到达，开始批量创地');
    const users = this.db.getAllUsers ? this.db.getAllUsers() : [];
    const userList = users.length ? users : [{ id: '' }];
    for (const u of userList) {
      const tokenIds = this.getEnabledTokens(u.id);
      for (const tokenId of tokenIds) {
        const tk = this.db.getToken(tokenId, u.id || '');
        await this.start(tokenId, u.id, tk?.name);
        await sleep(1500); // 控制并发节奏，避免同IP大量连接
      }
    }
  }
}

export default SaltFieldService;
