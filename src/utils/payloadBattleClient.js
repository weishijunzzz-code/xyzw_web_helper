import { XyzwWebSocketClient } from "./xyzwWebSocket.js";
import { buildBattlefieldUrl, openBattlefieldSocket } from "./battlefieldConnection.js";

const PING_INTERVAL_MS = 30_000;

export class PayloadBattleClient {
  /**
   * @param {object} opts
   * @param {string} opts.credential 已建立的主服会话凭证
   * @param {object} opts.bfInfo legion_getpayloadbf 的 info 字段（domainName/sid/bfId）
   * @param {(level: string, msg: string) => void} [opts.onLog]
   * @param {(msg: object) => void} [opts.onMessage] 战场服推送回调
   * @param {() => void} [opts.onDisconnect] 非人为断线回调（用于自动重连）
   */
  constructor({ credential, bfInfo, onLog, onMessage, onDisconnect }) {
    this.credential = credential;
    this.bfInfo = bfInfo;
    this.onLog = onLog || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onDisconnectCb = onDisconnect || null;
    this.client = null;
    this.pingTimer = null;
    this.closed = false;
  }

  _log(msg, level = "info") {
    this.onLog(level, msg);
  }

  /** 连接战场服并进场。成功返回 enter 响应；战场未开放抛出 12100036 错误 */
  async connect(signal) {
    if (!this.bfInfo?.bfId) throw new Error("缺少蟠桃战场 ID");
    const url = buildBattlefieldUrl(this.bfInfo, this.credential);
    const client = new XyzwWebSocketClient({ url, heartbeatMs: 5000 });
    this.client = client;
    client.setMessageListener(this.onMessage);
    let entered = false;
    try {
      await openBattlefieldSocket(client, { signal, onLost: () => {
        if (this.closed) return;
        this.close();
        if (entered) this.onDisconnectCb?.();
      } });
      const snapshot = await client.sendWithPromise("payload_enterbf", { bfId: this.bfInfo.bfId }, 10000);
      signal?.throwIfAborted();
      if (this.closed) throw new Error("战场连接已关闭");
      entered = true;
      this.pingTimer = setInterval(() => this.sendAction("ping"), PING_INTERVAL_MS);
      return snapshot;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** 实时命令透传，自动带 bfId；action 不含前缀时自动补 payload_（方法名小写化） */
  sendAction(action, params = {}) {
    if (!this.client || this.closed) return;
    const cmd = action.startsWith("payload_") ? action : `payload_${action.toLowerCase()}`;
    try {
      this.client.send(cmd, { ...params, bfId: this.bfInfo.bfId });
    } catch (e) {
      this._log(`发送 ${cmd} 失败: ${e.message}`, "warning");
    }
  }

  /**
   * 带 Promise 回调的实时命令请求
   */
  async requestAction(action, params = {}, timeoutMs = 10000) {
    if (!this.client || this.closed) throw new Error("战场服连接已关闭");
    const cmd = action.startsWith("payload_") ? action : `payload_${action.toLowerCase()}`;
    return await this.client.sendWithPromise(
      cmd,
      { ...params, bfId: this.bfInfo.bfId },
      timeoutMs,
    );
  }

  /** 发起单挑开战 */
  async startBattle(targetId) {
    return await this.requestAction("payload_startbattle", { targetId: Number(targetId) });
  }

  /** 行军移动 / 护送运粮车 */
  async startMarch(path, carId = 0) {
    return await this.requestAction("payload_startmarch", { carId: Number(carId), path });
  }

  /** 取消行军 */
  async cancelMarch() {
    return await this.requestAction("payload_cancelmarch");
  }

  /** 同步出战阵容（出战前置依赖） */
  async setBattleTeam(teamData = {}) {
    return await this.requestAction("payload_setbattleteam", {
      battleTeam: teamData.battleTeam || [],
      lordWeaponId: teamData.lordWeaponId ?? 0,
      petUId: teamData.petUId || "",
    });
  }

  /** 使用技能（落雷 / 花盆） */
  async useSkill(point, skillId) {
    return await this.requestAction("payload_useskill", { point, skillId });
  }

  /** 使用道具 */
  async useItem(carId) {
    return await this.requestAction("payload_useitem", { carId });
  }

  changeCarPath(carId, path) {
    return this.requestAction("startchangecarpath", { carId, path });
  }

  pickItem(itemId) {
    return this.requestAction("startpickitem", { itemId });
  }

  updateFlag(flag) {
    return this.requestAction("updateflag", { flag });
  }

  /** 获取队伍详情 */
  async getTeamInfo(roleId) {
    return await this.requestAction("payload_getteaminfo", { roleId: Number(roleId) });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._stopPing();
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
    this._log("战场连接已关闭");
  }
}