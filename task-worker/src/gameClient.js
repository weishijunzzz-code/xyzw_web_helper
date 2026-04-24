import WebSocket from 'ws';
import { randomBytes } from 'crypto';

/**
 * 游戏客户端 - 用于连接游戏WebSocket服务器并执行操作
 * 
 * 注意：这是一个简化版本，实际使用时需要集成完整的BON协议处理
 */
class GameClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.sessionId = null;
    this.messageHandlers = new Map();
    this.pendingPromises = new Map();
    this.messageId = 0;
  }

  // 连接到游戏服务器
  async connect(wsUrl, token) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[GameClient] 连接到: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        this.sessionId = randomBytes(16).toString('hex');

        this.ws.on('open', () => {
          console.log('[GameClient] WebSocket连接已打开');
          this.connected = true;
          resolve(true);
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('[GameClient] WebSocket错误:', error.message);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[GameClient] WebSocket连接已关闭');
          this.connected = false;
        });

        // 连接超时
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('连接超时'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      console.log('[GameClient] 已断开连接');
    }
  }

  // 处理收到的消息
  handleMessage(data) {
    try {
      // 这里需要实现BON协议解码
      // 暂时简单处理
      console.log('[GameClient] 收到消息:', data.length, 'bytes');
      
      // 触发消息处理器
      this.messageHandlers.forEach((handler, key) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[GameClient] 消息处理器错误:`, error.message);
        }
      });
    } catch (error) {
      console.error('[GameClient] 处理消息失败:', error.message);
    }
  }

  // 发送消息
  async sendMessage(cmd, params = {}) {
    if (!this.connected) {
      throw new Error('未连接到游戏服务器');
    }

    return new Promise((resolve, reject) => {
      try {
        // 这里需要实现BON协议编码
        // 暂时发送简单消息
        const message = JSON.stringify({ cmd, params, id: ++this.messageId });
        
        this.ws.send(message);
        
        // 设置超时
        const timeout = setTimeout(() => {
          reject(new Error('发送消息超时'));
        }, 10000);

        // 等待响应
        const handler = (data) => {
          clearTimeout(timeout);
          resolve(data);
        };

        this.pendingPromises.set(this.messageId, handler);

      } catch (error) {
        reject(error);
      }
    });
  }

  // 发送心跳
  sendHeartbeat() {
    return this.sendMessage('heart_beat');
  }

  // 发送签到请求
  sendSignIn() {
    return this.sendMessage('system_signinreward');
  }

  // 领取日常任务奖励
  claimDailyRewards() {
    return this.sendMessage('task_claimdailyreward');
  }

  // 挑战咸将塔
  challengeTower() {
    return this.sendMessage('fight_starttower');
  }

  // 竞技场挑战
  challengeArena() {
    return this.sendMessage('fight_startarena');
  }

  // 俱乐部签到
  clubSignin() {
    return this.sendMessage('legion_signin');
  }

  // 设置消息处理器
  onMessage(handler) {
    const id = randomBytes(8).toString('hex');
    this.messageHandlers.set(id, handler);
    return id;
  }

  // 移除消息处理器
  offMessage(id) {
    this.messageHandlers.delete(id);
  }

  // 获取连接状态
  getStatus() {
    return {
      connected: this.connected,
      sessionId: this.sessionId,
    };
  }
}

export default GameClient;
