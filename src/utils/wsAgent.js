/**
 * WebSocket客户端 - 基于mirror代码的完整实现
 * 支持BON协议编解码、加密通道、心跳保活、消息队列等
 */

import { g_utils } from "./bonProtocol.js";

export class WsAgent {
  /**
   * @param {object} options 配置选项
   */
  constructor(options = {}) {
    const {
      heartbeatInterval = 2000, // 心跳间隔(ms)
      queueInterval = 50, // 发送队列轮询间隔(ms)
      heartbeatCmd = "heart_beat", // 心跳命令
      channel = "x", // 加密通道
      autoReconnect = true, // 自动重连
      maxReconnectAttempts = 5, // 最大重连次数
      reconnectDelay = 3000, // 重连延迟(ms)
    } = options;

    // 配置参数
    this.heartbeatInterval = heartbeatInterval;
    this.queueInterval = queueInterval;
    this.heartbeatCmd = heartbeatCmd;
    this.channel = channel;
    this.autoReconnect = autoReconnect;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectDelay = reconnectDelay;

    // 连接状态
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;

    // 协议状态
    this.ack = 0;
    this.seq = 1;

    // 定时器
    this._heartbeatTimer = null;
    this._queueTimer = null;
    this._reconnectTimer = null;

    // 发送队列
    this.sendQueue = [];

    // Promise等待队列 respKey -> {resolve, reject, timeoutId}
    this.waitingPromises = new Map();

    // 事件监听器
    this.onOpen = () => {};
    this.onClose = () => {};
    this.onError = () => {};
    this.onMessage = () => {};
    this.onReconnect = () => {};
  }

  /**
   * 连接WebSocket
   * @param {string} url WebSocket URL
   * @param {object} connectionParams 连接参数
   */
  connect(url, connectionParams = {}) {
    if (this.connecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.warn("WebSocket已连接或正在连接中");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.connecting = true;
        console.log(`🔗 连接WebSocket: ${url}`);

        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";

        // 连接打开
        this.ws.onopen = () => {
          this.connecting = false;
          this.connected = true;
          this.reconnectAttempts = 0;

          console.log("✅ WebSocket连接已建立");

          // 重置协议状态
          this.seq = 1;

          // 启动心跳和队列处理
          this._startHeartbeat();
          this._startQueueProcessor();

          this.onOpen();
          resolve();
        };

        // 消息接收
        this.ws.onmessage = (event) => {
          this._handleMessage(event.data);
        };

        // 连接关闭
        this.ws.onclose = (event) => {
          this.connecting = false;
          this.connected = false;
          this._cleanup();

          console.log(`🔌 WebSocket连接已关闭: ${event.code} ${event.reason}`);

          this.onClose(event);

          // 自动重连
          if (
            this.autoReconnect &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this._scheduleReconnect(url, connectionParams);
          }
        };

        // 连接错误
        this.ws.onerror = (error) => {
          console.error("❌ WebSocket错误:", error);
          this.onError(error);

          if (this.connecting) {
            this.connecting = false;
            reject(error);
          }
        };
      } catch (error) {
        this.connecting = false;
        reject(error);
      }
    });
  }

  /**
   * 关闭连接
   * @param {number} code 关闭码
   * @param {string} reason 关闭原因
   */
  close(code = 1000, reason = "normal") {
    this.autoReconnect = false;
    if (this.ws) {
      this.ws.close(code, reason);
    }
    this._cleanup();
  }

  /**
   * 发送消息
   * @param {object | Array} payload 消息载荷
   */
  send(payload) {
    if (Array.isArray(payload)) {
      this.sendQueue.push(...payload);
    } else {
      this.sendQueue.push(payload);
    }
  }

  /**
   * 发送消息并等待响应
   * @param {object} options 请求选项
   * @returns {Promise} 响应Promise
   */
  sendWithPromise(options) {
    const { cmd, body = {}, respKey, timeout = 8000 } = options;
    const responseKey = respKey || `${cmd}resp`;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.waitingPromises.delete(responseKey);
        reject(new Error(`请求超时: ${cmd}`));
      }, timeout);

      // 注册Promise
      this.waitingPromises.set(responseKey, {
        resolve,
        reject,
        timeoutId,
      });

      // 发送消息
      this.send({ cmd, body, respKey: responseKey });
    });
  }

  /**
   * 处理接收到的消息
   * @private
   */
  _handleMessage(data) {
    try {
      // 使用g_utils解密和解码消息
      const message = g_utils.parse(data, this.channel);

      if (!message) {
        console.warn("消息解析失败");
        return;
      }

      console.log("📨 收到消息:", message);

      // 更新ack
      if (message.seq) {
        this.ack = message.seq;
      }

      // 检查是否有等待的Promise
      const cmd = message.cmd || message.c;
      const respKey = message.respKey || cmd;

      if (respKey && this.waitingPromises.has(respKey)) {
        const { resolve, timeoutId } = this.waitingPromises.get(respKey);
        clearTimeout(timeoutId);
        this.waitingPromises.delete(respKey);
        resolve(message);
        return;
      }

      // 派发给普通消息处理器
      this.onMessage(message);
    } catch (error) {
      console.error("消息处理失败:", error);
      this.onError(error);
    }
  }

  /**
   * 启动心跳
   * @private
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    if (!this.heartbeatInterval) return;

    this._heartbeatTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
        this._sendHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  /**
   * 停止心跳
   * @private
   */
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * 发送心跳消息
   * @private
   */
  _sendHeartbeat() {
    const heartbeatMsg = {
      ack: this.ack,
      body: {},
      cmd: "_sys/ack",
      seq: 0, // 心跳消息seq为0
      time: Date.now(),
    };

    this._rawSend(heartbeatMsg);
  }

  /**
   * 启动队列处理器
   * @private
   */
  _startQueueProcessor() {
    this._stopQueueProcessor();
    this._queueTimer = setInterval(() => {
      this._processQueue();
    }, this.queueInterval);
  }

  /**
   * 停止队列处理器
   * @private
   */
  _stopQueueProcessor() {
    if (this._queueTimer) {
      clearInterval(this._queueTimer);
      this._queueTimer = null;
    }
  }

  /**
   * 处理发送队列
   * @private
   */
  _processQueue() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.sendQueue.length === 0) {
      return;
    }

    const item = this.sendQueue.shift();
    const packet = this._buildPacket(item);
    this._rawSend(packet);
  }

  /**
   * 构建数据包
   * @private
   */
  _buildPacket(payload) {
    const { cmd, body = {} } = payload;

    // 生成随机RTT (0-500ms)
    Math.floor(Math.random() * 500);

    const packet = {
      ack: this.ack,
      seq: cmd === this.heartbeatCmd ? 0 : this.seq++,
      time: Date.now(),
      cmd,
      body,
    };

    return packet;
  }

  /**
   * 原始发送数据
   * @private
   */
  _rawSend(packet) {
    try {
      // 发送前日志（仅标准五段）
      if (packet?.cmd && packet.cmd !== "_sys/ack") {
        const bodyForLog =
          packet.body instanceof Uint8Array || Array.isArray(packet.body)
            ? "[BON]"
            : packet.body || {};
        console.info("📤 发送报文", {
          cmd: packet.cmd,
          ack: packet.ack ?? 0,
          seq: packet.seq ?? 0,
          time: packet.time,
          body: bodyForLog,
        });
      }
      // 使用g_utils编码和加密
      const data = g_utils.encode(packet, this.channel);
      this.ws.send(data);
    } catch (error) {
      console.error("发送消息失败:", error);
      this.onError(error);
    }
  }

  /**
   * 计划重连
   * @private
   */
  _scheduleReconnect(url, connectionParams) {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    this.reconnectAttempts++;
    console.log(
      `🔄 计划重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts}) 延迟: ${this.reconnectDelay}ms`,
    );

    this._reconnectTimer = setTimeout(() => {
      console.log(`🔄 开始第${this.reconnectAttempts}次重连...`);
      this.onReconnect(this.reconnectAttempts);
      this.connect(url, connectionParams).catch((error) => {
        console.error("重连失败:", error);
      });
    }, this.reconnectDelay);
  }

  /**
   * 清理资源
   * @private
   */
  _cleanup() {
    this._stopHeartbeat();
    this._stopQueueProcessor();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // 清理等待的Promise
    for (const [, { reject, timeoutId }] of this.waitingPromises) {
      clearTimeout(timeoutId);
      reject(new Error("连接已关闭"));
    }
    this.waitingPromises.clear();
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      readyState: this.ws?.readyState,
      ack: this.ack,
      seq: this.seq,
      queueLength: this.sendQueue.length,
      waitingPromises: this.waitingPromises.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * 构建WebSocket URL
   * @static
   */
  static buildUrl(baseUrl, params = {}) {
    const url = new URL(baseUrl);

    // 添加连接参数到p参数
    if (params.p && typeof params.p === "object") {
      url.searchParams.set("p", JSON.stringify(params.p));
    }

    // 添加其他参数
    Object.keys(params).forEach((key) => {
      if (key !== "p" && params[key] !== undefined) {
        url.searchParams.set(key, params[key]);
      }
    });

    return url.toString();
  }
}

export default WsAgent;
