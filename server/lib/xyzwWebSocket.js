import WebSocket from 'ws';
import { $CacheManager } from './cache.js';
import { wsLogger, gameLogger } from './logger.js';

const errorCodeMap = {
  700010: "任务未达成完成条件",
  1400010: "没有购买该月卡,不能领取每日奖励",
  12000116: "今日已领取免费奖励",
  3300060: "扫荡条件不满足",
  1300050: "请修改您的采购次数",
  200020: "出了点小问题，请尝试重启游戏解决～",
  200160: "模块未开启",
  7500140: "请先输入密码",
  7500100: "密码输入错误",
  7500120: "密码输入错误次数已达上限",
  200400: "操作太快，请稍后再试",
  200760: "您当前看到的界面已发生变化，请重新登录",
  2300190: "今天已经签到过了",
  2300370: "俱乐部商品购买数量超出上限",
  400000: "物品不存在",
  1500020: "能量不足",
  2300070: "未加入俱乐部",
  3500020: "没有可领取的奖励",
  12000050: "今日发车次数已达上限",
  12000060: "不在发车时间内",
  400190: "没有可领取的签到奖励",
  1000020: "今天已经领取过奖励了",
  3300050: "购买数量超出限制",
  700020: "已经领取过这个任务",
  12400000: "挂机奖励领取过于频繁",
  2300250: "俱乐部BOSS今日攻打次数已用完",
  400010: "物品数量不足",
  7900023: "已达到使用次数上限",
  12300040: "没有空格子了",
  12300080: "未达到解锁条件",
  200330: "无效的ID",
  1500040: "上座塔的奖励未领取",
  1500010: "已经全部通关",
};

const CmdDebounceMap = {
  role_getroleinfo: 1000,
  system_claimhangupreward: 1000,
  system_getdatabundlever: 1000,
};

const formatBodyForLog = (body) => {
  if (!body) return "";
  if (body instanceof Uint8Array) return `[BON:${body.length}b]`;
  if (Array.isArray(body)) return `[Array:${body.length}]`;
  if (typeof body === "object") {
    const isNumericObject = Object.keys(body).every((key) => !Number.isNaN(parseInt(key)));
    if (isNumericObject) return `[BON:Object:${Object.keys(body).length}]`;
    try { return JSON.stringify(body); } catch { return "[Object]"; }
  }
  return String(body);
};

import { CommandRegistry } from './commandRegistryBase.js';

export { CommandRegistry };

export class XyzwWebSocketClient {
  constructor({ url, utils, heartbeatMs = 5000 }) {
    this.url = url;
    this.utils = utils;
    this.enc = this.utils?.getEnc ? this.utils.getEnc("auto") : undefined;

    this.socket = null;
    this.ack = 0;
    this.seq = 0;
    this.sendQueue = [];
    this.sendQueueTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatInterval = heartbeatMs;
    this.sendCache = $CacheManager.getCache(this.url, { timeout: 1000 });

    this.dialogStatus = false;
    this.messageListener = null;
    this.showMsg = false;
    this.connected = false;
    this.isReconnecting = false;

    this.promises = Object.create(null);
    this.registry = null; // set externally after construction
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  setRegistry(registry) {
    this.registry = registry;
  }

  init() {
    wsLogger.info(`连接: ${this.url.split("?")[0]}`);

    this.socket = new WebSocket(this.url);

    this.socket.on('open', () => {
      wsLogger.info("连接成功");
      this.connected = true;
      this._setupHeartbeat();
      this._processQueueLoop();
      if (this.onConnect) this.onConnect();
    });

    this.socket.on('message', (data) => {
      try {
        let packet;
        if (data instanceof Buffer || data instanceof ArrayBuffer) {
          const buf = data instanceof Buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
          packet = this.utils?.parse ? this.utils.parse(buf, "auto") : buf;
        } else if (typeof data === 'string') {
          packet = JSON.parse(data);
        } else {
          packet = data;
        }

        if (packet instanceof Object && packet.rawData !== undefined) {
          // ProtoMsg
        } else {
          const actualPacket = packet._raw || packet;
          const incomingSeq = typeof actualPacket?.seq === "number" ? actualPacket.seq
            : typeof packet?.seq === "number" ? packet.seq : undefined;
          if (typeof incomingSeq === "number" && incomingSeq >= 0) {
            this.ack = incomingSeq;
          }

          if (actualPacket?.body && this.shouldDecodeBody(actualPacket.body)) {
            try {
              if (this.utils?.bon?.decode) {
                const bodyBytes = this.convertToUint8Array(actualPacket.body);
                if (bodyBytes) {
                  const decodedBody = this.utils.bon.decode(bodyBytes);
                  packet.decodedBody = decodedBody;
                  if (packet._raw) packet._raw.decodedBody = decodedBody;
                }
              }
            } catch (error) {
              gameLogger.error("BON消息体解码失败:", error.message);
            }
          }
        }

        if (this.messageListener) this.messageListener(packet);
        this._handlePromiseResponse(packet);
      } catch (error) {
        gameLogger.error("消息处理失败:", error.message);
      }
    });

    this.socket.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : '';
      wsLogger.info(`WebSocket 连接关闭: ${code} ${reasonStr}`);
      this.connected = false;
      this._clearTimers();
      if (this.onDisconnect) this.onDisconnect({ code, reason: reasonStr });
      $CacheManager.delCache(this.url);
    });

    this.socket.on('error', (error) => {
      wsLogger.error("WebSocket 错误:", error.message);
      this.connected = false;
      this._clearTimers();
      if (this.onError) this.onError(error);
    });
  }

  setMessageListener(fn) { this.messageListener = fn; }
  setShowMsg(val) { this.showMsg = !!val; }

  shouldDecodeBody(body) {
    if (!body) return false;
    if (body instanceof Uint8Array || Array.isArray(body)) return true;
    if (typeof body === "object" && body.constructor === Object) {
      const keys = Object.keys(body);
      return keys.length > 0 && keys.every((key) => !isNaN(parseInt(key)));
    }
    return false;
  }

  convertToUint8Array(body) {
    if (!body) return null;
    if (body instanceof Uint8Array) return body;
    if (Buffer.isBuffer(body)) return new Uint8Array(body);
    if (Array.isArray(body)) return new Uint8Array(body);
    if (typeof body === "object" && body.constructor === Object) {
      const keys = Object.keys(body).map((k) => parseInt(k)).sort((a, b) => a - b);
      if (keys.length > 0) {
        const maxIndex = Math.max(...keys);
        const arr = new Array(maxIndex + 1).fill(0);
        for (const [key, value] of Object.entries(body)) {
          const index = parseInt(key);
          if (!isNaN(index) && typeof value === "number") arr[index] = value;
        }
        return new Uint8Array(arr);
      }
    }
    return null;
  }

  decodeBodyForLog(body) {
    if (!body) return null;
    const decoder = this.utils?.bon?.decode;
    if (typeof decoder !== "function") return null;
    let bytes = null;
    if (body instanceof Uint8Array) bytes = body;
    else if (Buffer.isBuffer(body)) bytes = new Uint8Array(body);
    else if (Array.isArray(body)) bytes = new Uint8Array(body);
    else if (this.shouldDecodeBody(body)) bytes = this.convertToUint8Array(body);
    if (!bytes) return null;
    try { return decoder(bytes); } catch { return null; }
  }

  reconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    wsLogger.info("开始WebSocket重连...");
    this.disconnect();
    setTimeout(() => {
      try { this.init(); } finally {
        setTimeout(() => { this.isReconnecting = false; }, 2000);
      }
    }, 1000);
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.connected = false;
    this._clearTimers();
  }

  async debounceSend(cmd, ...args) {
    if (CmdDebounceMap[cmd]) {
      return this.sendCache.get(cmd, async (c) => {
        return await this.sendWithPromise(cmd, ...args);
      }, { timeout: CmdDebounceMap[cmd] });
    }
    return this.sendWithPromise(cmd, ...args);
  }

  send(cmd, params = {}, options = {}) {
    if (!this.connected) {
      wsLogger.warn(`WebSocket 未连接，消息已入队: ${cmd}`);
      if (!this.dialogStatus && !this.isReconnecting) {
        this.dialogStatus = true;
        this.reconnect();
        setTimeout(() => { this.dialogStatus = false; }, 2000);
      }
    }

    const assignedSeq = options.seq !== undefined ? options.seq
      : cmd === "heart_beat" ? 0 : ++this.seq;

    const task = {
      cmd, params, seq: assignedSeq,
      respKey: options.respKey || cmd,
      sleep: options.sleep || 0,
      onSent: options.onSent,
    };
    this.sendQueue.push(task);
    return task;
  }

  sendWithPromise(cmd, params = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.connected && !this.socket) {
        return reject(new Error("WebSocket 连接已关闭"));
      }
      const requestSeq = ++this.seq;
      this.promises[requestSeq] = { resolve, reject, originalCmd: cmd };
      setTimeout(() => {
        if (this.promises[requestSeq]) {
          delete this.promises[requestSeq];
          reject(new Error(`请求超时: ${cmd} (${timeoutMs}ms)`));
        }
      }, timeoutMs);
      this.send(cmd, params, { seq: requestSeq });
    });
  }

  sendHeartbeat() {
    this.send("heart_beat", {}, { respKey: "_sys/ack" });
  }

  getRoleInfo(params = {}) { return this.sendWithPromise("role_getroleinfo", params); }
  getDataBundleVersion(params = {}) { return this.sendWithPromise("system_getdatabundlever", params); }
  signIn() { return this.sendWithPromise("system_signinreward"); }
  claimDailyReward(rewardId = 0) { return this.sendWithPromise("task_claimdailyreward", { rewardId }); }

  _setupHeartbeat() {
    setTimeout(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, 3000);
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  _processQueueLoop() {
    if (this.sendQueueTimer) clearInterval(this.sendQueueTimer);
    this.sendQueueTimer = setInterval(async () => {
      if (!this.sendQueue.length) return;
      if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
      const task = this.sendQueue.shift();
      if (!task) return;
      try {
        const raw = this.registry.build(task.cmd, this.ack, task.seq, task.params);
        if (raw && raw.cmd !== "_sys/ack") {
          const decodedBody = this.decodeBodyForLog(raw.body);
          wsLogger.info("发送报文", { cmd: raw.cmd, ack: raw.ack ?? 0, seq: raw.seq ?? 0 });
        }
        const bin = this.registry.encodePacket(raw);
        this.socket?.send(bin);
        if (task.onSent) {
          try {
            task.onSent({ respKey: task.respKey, cmd: task.cmd, seq: raw?.seq ?? task.seq, ack: raw?.ack ?? this.ack, time: raw?.time ?? Date.now() });
          } catch {}
        }
        if (task.sleep) await new Promise(r => setTimeout(r, task.sleep));
      } catch (error) {
        wsLogger.error(`发送消息失败: ${task.cmd}`, error.message);
      }
    }, 50);
  }

  _handlePromiseResponse(packet) {
    if (packet.resp !== undefined && this.promises[packet.resp]) {
      const promiseData = this.promises[packet.resp];
      delete this.promises[packet.resp];
      const responseBody = packet.rawData !== undefined ? packet.rawData
        : packet.decodedBody !== undefined ? packet.decodedBody : packet.body;
      if (packet.code === 0 || packet.code === undefined) {
        promiseData.resolve(responseBody || packet);
      } else {
        const errorDesc = errorCodeMap[packet.code] || packet.hint || "未知错误";
        promiseData.reject(new Error(`服务器错误: ${packet.code} - ${errorDesc}`));
      }
      return;
    }

    const cmd = packet.cmd;
    if (!cmd) return;
    const respCmdKey = typeof cmd === "string" ? cmd.toLowerCase() : cmd;

    const responseToCommandMap = {
      fight_startpvpresp: "fight_startpvp",
      activity_getresp: "activity_get",
      role_getroleinforesp: "role_getroleinfo",
      hero_recruitresp: "hero_recruit",
      friend_batchresp: "friend_batch",
      system_claimhanguprewardresp: "system_claimhangupreward",
      item_openboxresp: ["item_openbox", "item_batchclaimboxpointreward"],
      bottlehelper_claimresp: "bottlehelper_claim",
      bottlehelper_startresp: "bottlehelper_start",
      bottlehelper_stopresp: "bottlehelper_stop",
      legion_signinresp: "legion_signin",
      fight_startbossresp: "fight_startboss",
      fight_startlegionbossresp: "fight_startlegionboss",
      fight_startareaarenaresp: "fight_startareaarena",
      arena_startarearesp: "arena_startarea",
      arena_getareatargetresp: "arena_getareatarget",
      presetteam_getinforesp: "presetteam_getinfo",
      mail_claimallattachmentresp: "mail_claimallattachment",
      store_buyresp: "store_purchase",
      system_getdatabundleverresp: "system_getdatabundlever",
      tower_claimrewardresp: "tower_claimreward",
      fight_starttowerresp: "fight_starttower",
      evotowerinforesp: "evotower_getinfo",
      evotower_fightresp: "evotower_fight",
      car_getrolecarresp: "car_getrolecar",
      car_detailresp: "car_detail",
      car_refreshresp: "car_refresh",
      car_claimresp: "car_claim",
      car_sendresp: "car_send",
      legion_getinforesp: "legion_getinfo",
      legacy_getinforesp: "legacy_getinfo",
      legacy_claimhangupresp: "legacy_claimhangup",
      task_claimdailyrewardresp: "task_claimdailyreward",
      task_claimweekrewardresp: "task_claimweekreward",
      bosstower_getinforesp: "bosstower_getinfo",
      bosstower_startbossresp: "bosstower_startboss",
      bosstower_startboxresp: "bosstower_startbox",
      hero_heroupgradestarresp: "hero_heroupgradestar",
      book_upgraderesp: "book_upgrade",
      towers_getinforesp: "towers_getinfo",
      towers_startresp: "towers_start",
      towers_fightresp: "towers_fight",
      activity_takeegamerewardresp: "activity_startactegame",
      activity_actegamestageclaimresp: "activity_actegamestageclaim",
      syncresp: ["system_mysharecallback", "task_claimdailypoint", "role_commitpassword", "hero_gointobattle", "hero_gobackbattle", "lordweapon_changedefaultweapon"],
      syncrewardresp: ["system_buygold", "discount_claimreward", "card_claimreward", "artifact_lottery", "genie_sweep", "genie_buysweep", "system_signinreward", "dungeon_selecthero", "artifact_exchange", "hero_exchange", "gacha_drawreward"],
    };

    let originalCmds = responseToCommandMap[respCmdKey];
    if (!originalCmds) originalCmds = [respCmdKey];
    else if (typeof originalCmds === "string") originalCmds = [originalCmds];

    for (const [requestId, promiseData] of Object.entries(this.promises)) {
      if (originalCmds.includes(promiseData.originalCmd)) {
        delete this.promises[requestId];
        const responseBody = packet.rawData !== undefined ? packet.rawData
          : packet.decodedBody !== undefined ? packet.decodedBody : packet.body;
        if (responseBody && typeof responseBody === "object") {
          responseBody._originalCmd = promiseData.originalCmd;
        }
        if (packet.code === 0 || packet.code === undefined) {
          promiseData.resolve(responseBody || packet);
        } else {
          const errorDesc = errorCodeMap[packet.code] || packet.hint || "未知错误";
          promiseData.reject(new Error(`服务器错误: ${packet.code} - ${errorDesc}`));
        }
        break;
      }
    }
  }

  _clearTimers() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.sendQueueTimer) { clearInterval(this.sendQueueTimer); this.sendQueueTimer = null; }
  }
}

export default XyzwWebSocketClient;
