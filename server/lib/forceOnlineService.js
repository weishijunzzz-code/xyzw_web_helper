import { gameLogger } from './logger.js';

const KV_KEY = 'force-online-tokens';
const MAX_FAIL = 3000;      // 累计重连失败上限，超过则自动关闭该号
const PATROL_MS = 3000;     // 巡检间隔

/**
 * 强制在线服务：让指定账号强制保持在线，被顶下线立即重连抢回（秒顶）。
 * - 每号独立开关，存 KV（按 userId）
 * - 事件驱动：onDisconnect 时若该号开启，立即重连
 * - 兜底巡检：每 PATROL_MS 扫一遍，掉线的补回
 * - 失败计数：连续/累计重连失败达 MAX_FAIL 次，自动关闭该号并清理其失败日志
 */
export class ForceOnlineService {
  constructor(gameManager, pushService, db) {
    this.gm = gameManager;
    this.push = pushService;
    this.db = db;
    this.failCount = new Map();   // tokenId -> 失败次数
    this.reconnecting = new Set();// tokenId -> 正在重连(防并发)
    this.userOf = new Map();      // tokenId -> userId(重连需要)
    this.patrolTimer = null;
  }

  _log(type, message) {
    try { this.push.log('forceonline', type || 'info', message); } catch {}
    gameLogger.info(`[强制在线] ${message}`);
  }

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
    // 记录每个号归属的 userId，供重连使用
    for (const id of list) this.userOf.set(id, userId || '');
    return list;
  }

  /** 是否所有用户的强制在线名单里都包含该号 */
  isEnabled(tokenId) {
    return this.userOf.has(tokenId) && this._allEnabledSet().has(tokenId);
  }

  _allEnabledSet() {
    const set = new Set();
    const users = this.db.getAllUsers ? this.db.getAllUsers() : [];
    for (const u of users) for (const id of this.getEnabledTokens(u.id)) set.add(id);
    return set;
  }

  /** 开/关单个号 */
  async setOne(tokenId, userId, enabled, tokenName) {
    const list = new Set(this.getEnabledTokens(userId));
    if (enabled) list.add(tokenId); else list.delete(tokenId);
    this.setEnabledTokens(userId, [...list]);
    if (enabled) {
      this.failCount.set(tokenId, 0);
      this.userOf.set(tokenId, userId || '');
      this._log('info', `${tokenName || tokenId} 已开启强制在线`);
      this.ensureOnline(tokenId).catch(() => {});
    } else {
      this.failCount.delete(tokenId);
      this.reconnecting.delete(tokenId);
      this._log('info', `${tokenName || tokenId} 已关闭强制在线`);
    }
    return { ok: true, enabled };
  }

  getAllStatus() {
    const out = {};
    for (const id of this._allEnabledSet()) {
      out[id] = { enabled: true, status: this.gm.getConnectionStatus(id), fail: this.failCount.get(id) || 0 };
    }
    return out;
  }

  /** 启动兜底巡检：定时扫描所有开启的号，掉线的补回 */
  startPatrol() {
    if (this.patrolTimer) return;
    // 启动时把已存名单的 userId 关系补上
    const users = this.db.getAllUsers ? this.db.getAllUsers() : [];
    for (const u of users) for (const id of this.getEnabledTokens(u.id)) this.userOf.set(id, u.id);
    this.patrolTimer = setInterval(() => {
      const set = this._allEnabledSet();
      for (const id of set) {
        if (this.gm.getConnectionStatus(id) !== 'connected') {
          this.ensureOnline(id).catch(() => {});
        }
      }
    }, PATROL_MS);
    this._log('info', `强制在线巡检已启动（每${PATROL_MS / 1000}秒）`);
  }

  /** 确保某号在线：不在线就立即重连一次。失败累计到上限则自动关闭。 */
  async ensureOnline(tokenId) {
    if (this.reconnecting.has(tokenId)) return;
    if (this.gm.getConnectionStatus(tokenId) === 'connected') return;
    const userId = this.userOf.get(tokenId) || '';
    this.reconnecting.add(tokenId);
    try {
      const ok = await this.gm.connectWithRetry(tokenId, userId, 1);
      if (ok) {
        this.failCount.set(tokenId, 0);
        this._log('success', `${tokenId} 重连成功，已抢回在线`);
      } else {
        await this._onFail(tokenId, userId);
      }
    } catch (e) {
      await this._onFail(tokenId, userId);
    } finally {
      this.reconnecting.delete(tokenId);
    }
  }

  async _onFail(tokenId, userId) {
    const n = (this.failCount.get(tokenId) || 0) + 1;
    this.failCount.set(tokenId, n);
    // 日志节流：每 50 次失败才记一条，避免刷屏
    if (n % 50 === 0) {
      this._log('warning', `${tokenId} 重连失败累计 ${n}/${MAX_FAIL} 次`);
    }
    if (n >= MAX_FAIL) {
      // 达到上限：关闭该号的强制在线，停止重连（不再刷日志）
      const uid = userId || this.userOf.get(tokenId) || '';
      const list = new Set(this.getEnabledTokens(uid));
      list.delete(tokenId);
      this.setEnabledTokens(uid, [...list]);
      this.failCount.delete(tokenId);
      this._log('error', `${tokenId} 重连失败已达 ${MAX_FAIL} 次，自动关闭强制在线（可能bin失效，请重新导入后再开启）`);
    }
  }

  /** 被 gameManager 的 onDisconnect 调用：若该号强制在线，立即抢回（秒顶） */
  onDisconnected(tokenId) {
    if (!this._allEnabledSet().has(tokenId)) return;
    this._log('warning', `${tokenId} 检测到掉线（可能被顶），立即重连抢回...`);
    this.ensureOnline(tokenId).catch(() => {});
  }
}

