import { XyzwWebSocketClient, CommandRegistry } from './xyzwWebSocket.js';
import { registerDefaultCommands } from './commandRegistry.js';
import { wsLogger, gameLogger, tokenLogger } from './logger.js';
import { getGUtils } from './bonProtocol.js';
import axios from 'axios';
import fs from 'fs';

const XOR_A = 2118920861;
const XOR_B = 797788954;
const XOR_C = 1513922175;

// ==================== 临时协议抓包（默认关闭，按需用环境变量开启）====================
// 用法：PROTO_CAPTURE=activity_startactegame,activity_actegamestageclaim pm2 restart xyzw-server --update-env
// 匹配到的命令会把 请求参数 + 完整响应 追加写入 server/data/proto-capture.log（JSON行）。
// 不设置环境变量时完全不生效，零开销、不影响线上。
// 默认抓换皮抽奖相关命令（想抓别的就改这个列表；不想抓了把列表清空成 [] 即可）
const DEFAULT_CAPTURE_CMDS = ['activity_startactegame', 'activity_actegamestageclaim', 'activity_commonbuygoods', 'towers_getinfo', 'towers_start', 'towers_fight'];
const PROTO_CAPTURE_CMDS = (process.env.PROTO_CAPTURE
  ? process.env.PROTO_CAPTURE.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : DEFAULT_CAPTURE_CMDS.map(s => s.toLowerCase()));
const PROTO_CAPTURE_FILE = process.env.PROTO_CAPTURE_FILE || './data/proto-capture.log';
function protoCapture(tokenId, cmd, params, response, error) {
  if (PROTO_CAPTURE_CMDS.length === 0) return;
  const lc = String(cmd || '').toLowerCase();
  if (!PROTO_CAPTURE_CMDS.includes(lc)) return;
  try {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      tokenId, cmd,
      params,
      response: response !== undefined ? response : null,
      error: error ? String(error.message || error) : undefined,
    }) + '\n';
    fs.appendFile(PROTO_CAPTURE_FILE, line, () => {});
  } catch {}
}

function generateRandomSeed(lastLoginTime) {
  if (lastLoginTime === undefined || lastLoginTime === null) return 0;
  const numericTime = Number(lastLoginTime);
  if (Number.isNaN(numericTime)) return 0;
  let seed = numericTime | 0;
  seed ^= XOR_A;
  seed = ((seed << 16) | (seed >>> 16)) >>> 0;
  seed ^= XOR_B;
  seed ^= XOR_C;
  return seed >>> 0;
}

export class GameManager {
  constructor(db, pushService) {
    this.db = db;
    this.push = pushService;
    this.connections = new Map();
    this.gameData = new Map();
    this.g_utils = null;
    this.ready = false;
    this.onDisconnectHook = null; // 断线钩子(强制在线服务注册)：(tokenId, evt) => void
  }

  async init() {
    this.g_utils = await getGUtils();
    this.ready = true;
    tokenLogger.info('GameManager 初始化完成');
  }

  getConnectionStatus(tokenId) {
    const conn = this.connections.get(tokenId);
    if (!conn) return 'disconnected';
    return conn.status;
  }

  getAllStatus(userId) {
    const tokens = this.db.getAllTokens(userId);
    return tokens.map(t => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      status: this.getConnectionStatus(t.id),
      gameData: this.gameData.get(t.id) || null,
    }));
  }

  async connect(tokenId, userId) {
    const token = userId ? this.db.getToken(tokenId, userId) : this.db.getToken(tokenId, '');
    if (!token) throw new Error(`Token not found: ${tokenId}`);

    if (this.connections.has(tokenId)) {
      const existing = this.connections.get(tokenId);
      if (existing.status === 'connected' || existing.status === 'connecting') {
        return;
      }
      this.disconnect(tokenId);
    }

    const parseResult = this._parseBase64Token(token.token);
    let actualToken = parseResult.success ? parseResult.data.actualToken : token.token;

    if (token.importMethod === 'bin' || token.importMethod === 'wxQrcode') {
      const binData = this.db.getBinData(tokenId, userId || '');
      if (binData) {
        try {
          actualToken = await this._transformBinToken(binData);
          this.db.updateToken(tokenId, { token: actualToken }, userId || '');
          wsLogger.info(`Bin token 刷新成功: ${token.name}`);
        } catch (e) {
          wsLogger.error(`Bin token 刷新失败: ${token.name}: ${e.message}`);
          throw new Error(`Bin token 认证失败: ${e.message}`);
        }
      } else {
        wsLogger.warn(`未找到 bin 数据: ${token.name}, 使用已有 token`);
      }
    }

    const wsUrl = token.wsUrl || `wss://xxz-xyzw.hortorgames.com/agent?p=${encodeURIComponent(actualToken)}&e=x&lang=chinese`;

    const client = new XyzwWebSocketClient({
      url: wsUrl,
      utils: this.g_utils,
      heartbeatMs: 5000,
    });

    const registry = registerDefaultCommands(new CommandRegistry(this.g_utils, "x"));
    client.setRegistry(registry);

    const connState = {
      client,
      status: 'connecting',
      tokenId,
      userId: userId || '',
      actualToken,
      connectedAt: null,
      randomSeedSynced: false,
      lastRandomSeedSource: null,
    };
    this.connections.set(tokenId, connState);

    if (!this.gameData.has(tokenId)) {
      this.gameData.set(tokenId, {
        roleInfo: null,
        legionInfo: null,
        commonActivityInfo: null,
        bossTowerInfo: null,
        evoTowerInfo: null,
        presetTeam: null,
        battleVersion: null,
        studyStatus: { isAnswering: false, questionCount: 0, answeredCount: 0, status: "", timestamp: null },
        lastUpdated: null,
      });
    }

    this.push.connectionStatus(tokenId, 'connecting');

    client.onConnect = () => {
      connState.status = 'connected';
      connState.connectedAt = new Date().toISOString();
      wsLogger.info(`已连接: ${token.name} [${tokenId}]`);
      this.push.connectionStatus(tokenId, 'connected');
      try { client.send("role_getroleinfo"); } catch {}
    };

    client.onDisconnect = (evt) => {
      connState.status = 'disconnected';
      wsLogger.info(`已断开: ${token.name} [${tokenId}] ${evt.code}`);
      this.push.connectionStatus(tokenId, 'disconnected', { code: evt.code, reason: evt.reason });
      if (typeof this.onDisconnectHook === 'function') {
        try { this.onDisconnectHook(tokenId, evt); } catch {}
      }
    };

    client.onError = (error) => {
      connState.status = 'error';
      wsLogger.error(`连接错误: ${token.name} [${tokenId}]`, error.message);
      this.push.connectionStatus(tokenId, 'error', { error: error.message });
    };

    client.setMessageListener((message) => {
      this._handleGameMessage(tokenId, message, client);
    });

    client.init();
    return connState;
  }

  disconnect(tokenId) {
    const conn = this.connections.get(tokenId);
    if (conn?.client) {
      conn.client.disconnect();
    }
    this.connections.delete(tokenId);
    this.push.connectionStatus(tokenId, 'disconnected');
  }

  disconnectAll() {
    for (const [tokenId] of this.connections) {
      this.disconnect(tokenId);
    }
  }

  sendMessage(tokenId, cmd, params = {}) {
    const conn = this.connections.get(tokenId);
    if (!conn || conn.status !== 'connected') {
      throw new Error(`未连接: ${tokenId}`);
    }
    return conn.client.send(cmd, params);
  }

  async sendMessageWithPromise(tokenId, cmd, params = {}, timeout = 5000) {
    const conn = this.connections.get(tokenId);
    if (!conn || conn.status !== 'connected') {
      return Promise.reject(new Error(`未连接: ${tokenId}`));
    }

    const battleCommands = ["fight_startareaarena", "fight_startpvp", "fight_starttower", "fight_startboss", "fight_startlegionboss", "fight_startdungeon"];
    if (battleCommands.includes(cmd)) {
      const gd = this.gameData.get(tokenId);
      if (gd?.battleVersion) {
        params = { battleVersion: gd.battleVersion, ...params };
      } else {
        try {
          const levelResp = await conn.client.sendWithPromise("fight_startlevel", {}, 8000);
          const ver = levelResp?.battleData?.version;
          if (ver && gd) {
            gd.battleVersion = ver;
            gameLogger.info(`获取战斗版本号 [${tokenId}]: ${ver}`);
          }
          if (ver) params = { battleVersion: ver, ...params };
        } catch {}
      }
    }

    try {
      const resp = await conn.client.sendWithPromise(cmd, params, timeout);
      protoCapture(tokenId, cmd, params, resp);
      return resp;
    } catch (e) {
      protoCapture(tokenId, cmd, params, undefined, e);
      // 超时后尝试断开重连再重试一次
      if (e.message && e.message.includes('超时')) {
        gameLogger.warn(`命令超时，尝试重连重试: ${cmd} [${tokenId}]`);
        try {
          this.disconnect(tokenId);
          await new Promise(r => setTimeout(r, 2000));
          // 从 connections 中找到 userId
          const token = this.db.getTokenById ? this.db.getTokenById(tokenId) : null;
          if (token) {
            const connected = await this.connectWithRetry(tokenId, token.user_id || '', 2);
            if (connected) {
              await new Promise(r => setTimeout(r, 2000));
              const retryConn = this.connections.get(tokenId);
              if (retryConn?.client) {
                return await retryConn.client.sendWithPromise(cmd, params, timeout);
              }
            }
          }
        } catch (retryErr) {
          gameLogger.warn(`重连重试失败: ${cmd} [${tokenId}]: ${retryErr.message}`);
        }
      }
      throw e;
    }
  }

  _handleGameMessage(tokenId, message, client) {
    try {
      if (!message) return;
      if (message.error) {
        gameLogger.warn(`消息错误 [${tokenId}]:`, String(message.error));
        return;
      }

      const cmd = message.cmd?.toLowerCase();
      const body = typeof message.getData === 'function' ? message.getData() : (message.rawData || message.decodedBody || message.body);
      const gd = this.gameData.get(tokenId);

      if (cmd === 'role_getroleinforesp' && body) {
        if (gd) {
          gd.roleInfo = body;
          gd.lastUpdated = new Date().toISOString();
        }
        this._syncRandomSeed(tokenId, body, client);
        if (body?.role?.headImg) {
          const conn = this.connections.get(tokenId);
          this.db.updateToken(tokenId, { avatar: body.role.headImg }, conn?.userId || '');
        }
        this.push.gameData(tokenId, 'roleInfo', body);
      } else if (cmd === 'legion_getinforesp' && body && gd) {
        gd.legionInfo = body;
        this.push.gameData(tokenId, 'legionInfo', body);
      } else if (cmd === 'activity_getresp' && body && gd) {
        gd.commonActivityInfo = body;
        this.push.gameData(tokenId, 'commonActivityInfo', body);
      } else if (cmd === 'bosstower_getinforesp' && body && gd) {
        gd.bossTowerInfo = body;
        this.push.gameData(tokenId, 'bossTowerInfo', body);
      } else if (cmd === 'evotowerinforesp' && body && gd) {
        gd.evoTowerInfo = body;
        this.push.gameData(tokenId, 'evoTowerInfo', body);
      } else if (cmd === 'presetteam_getinforesp' && body && gd) {
        gd.presetTeam = body;
        this.push.gameData(tokenId, 'presetTeam', body);
      } else if (cmd === 'system_getdatabundleverresp' && body && gd) {
        if (body.battleVersion) {
          gd.battleVersion = body.battleVersion;
        }
      } else if (cmd === 'fight_startlevelresp' && body && gd) {
        if (body.battleData?.version) {
          gd.battleVersion = body.battleData.version;
          gameLogger.info(`获取战斗版本号 [${tokenId}]: ${body.battleData.version}`);
          this.push.gameData(tokenId, 'battleVersion', body.battleData.version);
        }
      }

      this.push.log(tokenId, 'debug', `游戏消息: ${cmd}`);
    } catch (error) {
      gameLogger.error(`处理消息失败 [${tokenId}]:`, error.message);
    }
  }

  _syncRandomSeed(tokenId, rolePayload, client) {
    if (!client) return;
    const conn = this.connections.get(tokenId);
    if (!conn || conn.status !== 'connected') return;

    const lastLoginTime = this._extractLastLoginTimestamp(rolePayload);
    if (!lastLoginTime) return;
    if (conn.randomSeedSynced && conn.lastRandomSeedSource === lastLoginTime) return;

    const randomSeed = generateRandomSeed(lastLoginTime);
    try {
      client.send("system_custom", { key: "randomSeed", value: randomSeed });
      conn.randomSeedSynced = true;
      conn.lastRandomSeedSource = lastLoginTime;
      wsLogger.info(`同步 randomSeed [${tokenId}]`, { lastLoginTime, randomSeed });
    } catch (error) {
      wsLogger.error(`发送 randomSeed 失败 [${tokenId}]`, error.message);
    }
  }

  _extractLastLoginTimestamp(payload) {
    if (!payload) return null;
    const sources = [payload?.role?.statistics, payload?.statistics, payload?.role?.statisticsTime, payload?.statisticsTime];
    const keys = ["last:login:time", "lastLoginTime", "last_login_time"];
    for (const stats of sources) {
      if (!stats) continue;
      for (const key of keys) {
        let value;
        if (typeof stats.get === "function") value = stats.get(key);
        else if (Object.prototype.hasOwnProperty.call(stats, key)) value = stats[key];
        if (value !== undefined && value !== null) {
          const numeric = Number(value);
          if (!Number.isNaN(numeric) && numeric > 0) return numeric;
        }
      }
    }
    return null;
  }

  _parseBase64Token(base64String) {
    try {
      if (!base64String || typeof base64String !== "string") throw new Error("Token字符串无效");
      const cleanBase64 = base64String.replace(/^data:.*base64,/, "").trim();
      if (cleanBase64.length === 0) throw new Error("Token字符串为空");

      let decoded;
      try { decoded = Buffer.from(cleanBase64, 'base64').toString('utf-8'); } catch { decoded = base64String.trim(); }

      let tokenData;
      try { tokenData = JSON.parse(decoded); } catch { tokenData = { token: decoded }; }

      const actualToken = tokenData.token || tokenData.gameToken || decoded;
      if (!actualToken || typeof actualToken !== "string" || actualToken.trim().length < 10) {
        throw new Error(`提取的token无效`);
      }
      return { success: true, data: { ...tokenData, actualToken } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _transformBinToken(binData) {
    const res = await axios.post(
      'https://xxz-xyzw.hortorgames.com/login/authuser',
      binData,
      {
        params: { _seq: 1 },
        headers: { 'Content-Type': 'application/octet-stream' },
        responseType: 'arraybuffer',
      }
    );
    const msg = this.g_utils.parse(Buffer.from(res.data));
    const data = msg.getData();
    const currentTime = Date.now();
    const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
    const connId = currentTime + Math.floor(Math.random() * 10);
    return JSON.stringify({ ...data, sessId, connId, isRestore: 0 });
  }

  // === 以下为批量任务系统需要的补全方法 ===

  getWebSocketStatus(tokenId) {
    const conn = this.connections.get(tokenId);
    if (!conn) return 'disconnected';
    return conn.status;
  }

  setBattleVersion(tokenId, version) {
    const gd = this.gameData.get(tokenId);
    if (gd) gd.battleVersion = version;
  }

  async sendGetRoleInfo(tokenId) {
    const conn = this.connections.get(tokenId);
    if (!conn || conn.status !== 'connected') return null;
    try {
      const resp = await conn.client.sendWithPromise('role_getroleinfo', {}, 10000);
      return resp;
    } catch (e) {
      gameLogger.warn(`获取角色信息失败 [${tokenId}]: ${e.message}`);
      return null;
    }
  }

  /** 获取当前连接使用的实际登录 token（盐场连接 URL 需要） */
  getActualToken(tokenId) {
    const conn = this.connections.get(tokenId);
    return conn?.actualToken || null;
  }

  /** 获取 g_utils（盐场客户端 BON 编解码需要） */
  getGUtils() {
    return this.g_utils;
  }

  async createWebSocketConnection(tokenId, userId) {
    return this.connect(tokenId, userId);
  }

  closeWebSocketConnection(tokenId) {
    this.disconnect(tokenId);
  }

  async connectWithRetry(tokenId, userId, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 先确保旧连接断开
        this.disconnect(tokenId);
        await new Promise(r => setTimeout(r, 500));

        await this.connect(tokenId, userId);
        // 等待连接建立
        const start = Date.now();
        while (Date.now() - start < 30000) {
          if (this.getWebSocketStatus(tokenId) === 'connected') return true;
          await new Promise(r => setTimeout(r, 500));
        }
        this.disconnect(tokenId);
      } catch (e) {
        gameLogger.warn(`连接重试 ${i + 1}/${maxRetries} [${tokenId}]: ${e.message}`);
      }
      if (i < maxRetries - 1) {
        const delay = Math.min(2000 * Math.pow(2, i), 32000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return false;
  }

  /**
   * 发送命令，超时后自动重连重试
   */
  async sendWithReconnect(tokenId, userId, cmd, params = {}, timeout = 20000, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.sendMessageWithPromise(tokenId, cmd, params, timeout);
      } catch (e) {
        if (i < maxRetries && (e.message.includes('超时') || e.message.includes('timeout') || e.message.includes('未连接'))) {
          gameLogger.warn(`命令超时，重连重试 ${i + 1}/${maxRetries} [${tokenId}]: ${cmd}`);
          this.disconnect(tokenId);
          await new Promise(r => setTimeout(r, 2000));
          const reconnected = await this.connectWithRetry(tokenId, userId, 2);
          if (!reconnected) throw new Error(`重连失败: ${tokenId}`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw e;
      }
    }
  }
}
