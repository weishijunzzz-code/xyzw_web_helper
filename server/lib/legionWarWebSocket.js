import WebSocket from 'ws';
import { wsLogger, gameLogger } from './logger.js';

/**
 * 盐场（军团战）命令注册器
 * 与主服不同点：每条命令带 hint(battlefieldId)，心跳为 war_ping
 */
export class LegionWarCommandRegistry {
  constructor(encoder, enc, hint) {
    this.encoder = encoder;
    this.enc = enc;
    this.hint = hint;
    this.commands = new Map();
  }

  register(cmd, defaultBody = {}) {
    this.commands.set(cmd, (ack = 0, seq = 0, params = {}) => ({
      cmd,
      ack,
      seq,
      hint: this.hint,
      time: Date.now(),
      body: this.encoder?.bon?.encode
        ? this.encoder.bon.encode({ ...defaultBody, ...params })
        : { ...defaultBody, ...params },
    }));
    return this;
  }

  registerHeartbeat() {
    this.commands.set('heart_beat', (ack, seq) => ({
      cmd: 'war_ping',
      ack,
      seq,
      hint: this.hint,
      time: Date.now(),
      body: { battlefieldId: this.hint },
    }));
    return this;
  }

  encodePacket(raw) {
    if (this.encoder?.encode && this.enc) {
      return this.encoder.encode(raw, this.enc);
    }
    return JSON.stringify(raw);
  }

  build(cmd, ack, seq, params) {
    const fn = this.commands.get(cmd);
    if (!fn) throw new Error(`Unknown cmd: ${cmd}`);
    return fn(ack, seq, params);
  }
}

export function registerLegionWarCommands(reg) {
  return reg
    .registerHeartbeat()
    .register('war_getbattlefieldinfo')
    .register('war_enterbattlefield')
    .register('war_teamsetbattleteam')
    .register('war_setbattleteam')
    .register('war_startmarch')
    .register('war_speedup')
    .register('war_startattackbuilding');
}

export class LegionWarWebSocketClient {
  constructor({ url, utils, hint, heartbeatMs = 5000 }) {
    this.url = url;
    this.utils = utils;
    this.enc = this.utils?.getEnc ? this.utils.getEnc('auto') : undefined;
    this.hint = hint;
    this.socket = null;
    this.ack = 0;
    this.seq = 0;
    this.sendQueue = [];
    this.sendQueueTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatInterval = heartbeatMs;
    this.connected = false;
    this.messageListener = null;
    this.promises = Object.create(null);
    this.registry = registerLegionWarCommands(new LegionWarCommandRegistry(this.utils, this.enc, this.hint));
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  setMessageListener(fn) { this.messageListener = fn; }

  init() {
    wsLogger.info(`盐场连接: ${this.url.split('?')[0]}`);
    this.socket = new WebSocket(this.url);

    this.socket.on('open', () => {
      wsLogger.info('盐场连接成功');
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
          packet = this.utils?.parse ? this.utils.parse(buf, 'auto') : buf;
        } else if (typeof data === 'string') {
          packet = JSON.parse(data);
        } else {
          packet = data;
        }
        const actualPacket = packet?._raw || packet;
        const incomingSeq = typeof actualPacket?.seq === 'number' ? actualPacket.seq
          : typeof packet?.seq === 'number' ? packet.seq : undefined;
        if (typeof incomingSeq === 'number' && incomingSeq >= 0) this.ack = incomingSeq;

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
          } catch (e) { gameLogger.error('盐场BON解码失败:', e.message); }
        }

        if (this.messageListener) this.messageListener(packet);
        this._handlePromiseResponse(packet);
      } catch (e) {
        gameLogger.error('盐场消息处理失败:', e.message);
      }
    });

    this.socket.on('close', (code, reason) => {
      this.connected = false;
      this._clearTimers();
      if (this.onDisconnect) this.onDisconnect({ code, reason: reason ? reason.toString() : '' });
    });

    this.socket.on('error', (error) => {
      this.connected = false;
      this._clearTimers();
      if (this.onError) this.onError(error);
    });
  }

  shouldDecodeBody(body) {
    if (!body) return false;
    if (body instanceof Uint8Array || Array.isArray(body)) return true;
    if (typeof body === 'object' && body.constructor === Object) {
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
    if (typeof body === 'object' && body.constructor === Object) {
      const keys = Object.keys(body).map((k) => parseInt(k)).sort((a, b) => a - b);
      if (keys.length > 0) {
        const maxIndex = Math.max(...keys);
        const arr = new Array(maxIndex + 1).fill(0);
        for (const [key, value] of Object.entries(body)) {
          const index = parseInt(key);
          if (!isNaN(index) && typeof value === 'number') arr[index] = value;
        }
        return new Uint8Array(arr);
      }
    }
    return null;
  }

  send(cmd, params = {}, options = {}) {
    const assignedSeq = options.seq !== undefined ? options.seq : (cmd === 'heart_beat' ? 0 : ++this.seq);
    const task = { cmd, params, seq: assignedSeq };
    this.sendQueue.push(task);
    return task;
  }

  sendWithPromise(cmd, params = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (!this.connected && !this.socket) return reject(new Error('盐场连接已关闭'));
      const requestSeq = ++this.seq;
      this.promises[requestSeq] = { resolve, reject, originalCmd: cmd };
      setTimeout(() => {
        if (this.promises[requestSeq]) {
          delete this.promises[requestSeq];
          reject(new Error(`盐场请求超时: ${cmd} (${timeoutMs}ms)`));
        }
      }, timeoutMs);
      this.send(cmd, params, { seq: requestSeq });
    });
  }

  _processQueueLoop() {
    if (this.sendQueueTimer) clearInterval(this.sendQueueTimer);
    this.sendQueueTimer = setInterval(() => {
      if (!this.sendQueue.length) return;
      if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
      const task = this.sendQueue.shift();
      if (!task) return;
      try {
        const raw = this.registry.build(task.cmd, this.ack, task.seq, task.params);
        if (raw && raw.cmd !== 'war_ping') {
          wsLogger.info('盐场发送', { cmd: raw.cmd, ack: raw.ack ?? 0, seq: raw.seq ?? 0 });
        }
        const bin = this.registry.encodePacket(raw);
        this.socket?.send(bin);
      } catch (error) {
        wsLogger.error(`盐场发送失败: ${task.cmd}`, error.message);
      }
    }, 50);
  }

  _setupHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.send('heart_beat', {}, { seq: 0 });
      }
    }, this.heartbeatInterval);
  }

  _handlePromiseResponse(packet) {
    if (packet?.resp !== undefined && this.promises[packet.resp]) {
      const promiseData = this.promises[packet.resp];
      delete this.promises[packet.resp];
      const body = packet.rawData !== undefined ? packet.rawData
        : packet.decodedBody !== undefined ? packet.decodedBody : packet.body;
      if (packet.code === 0 || packet.code === undefined) promiseData.resolve(body || packet);
      else promiseData.reject(new Error(`盐场错误: ${packet.code}`));
      return;
    }
    const cmd = packet?.cmd;
    if (!cmd) return;
    const respKey = typeof cmd === 'string' ? cmd.toLowerCase() : cmd;
    const map = {
      war_enterbattlefieldresp: 'war_enterbattlefield',
      war_getbattlefieldinforesp: 'war_getbattlefieldinfo',
      war_teamsetbattleteamresp: 'war_teamsetbattleteam',
      war_setbattleteamresp: 'war_setbattleteam',
      war_startmarchresp: 'war_startmarch',
      war_speedupresp: 'war_speedup',
      war_startattackbuildingresp: 'war_startattackbuilding',
    };
    const origCmd = map[respKey];
    if (!origCmd) return;
    for (const seq of Object.keys(this.promises)) {
      const pd = this.promises[seq];
      if (pd.originalCmd === origCmd) {
        delete this.promises[seq];
        const body = packet.rawData !== undefined ? packet.rawData
          : packet.decodedBody !== undefined ? packet.decodedBody : packet.body;
        if (packet.code === 0 || packet.code === undefined) pd.resolve(body || packet);
        else pd.reject(new Error(`盐场错误: ${packet.code}`));
        break;
      }
    }
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.connected = false;
    this._clearTimers();
  }

  _clearTimers() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.sendQueueTimer) { clearInterval(this.sendQueueTimer); this.sendQueueTimer = null; }
  }
}

export default LegionWarWebSocketClient;

