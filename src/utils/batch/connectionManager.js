/**
 * WebSocket连接管理器
 */

// 全局连接队列控制 - 限制并发连接数
export const connectionQueue = { active: 0 };

// 槽位等待超时时间（毫秒）
const SLOT_WAIT_TIMEOUT = 30000; // 30秒

/**
 * 创建连接管理器
 * @param {object} options - 配置选项
 * @param {object} options.tokenStore - Token存储
 * @param {object} options.batchSettings - 批量设置
 * @param {function} options.addLog - 日志添加函数
 * @returns {object} - 连接管理器对象
 */
export function createConnectionManager({ tokenStore, batchSettings, addLog }) {
  /**
   * 等待连接槽位（带超时机制）
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<boolean>} - 是否成功获取槽位
   */
  const waitForConnectionSlot = async (timeout = SLOT_WAIT_TIMEOUT) => {
    const start = Date.now();
    while (connectionQueue.active >= batchSettings.maxActive) {
      if (Date.now() - start > timeout) {
        throw new Error(`等待连接槽位超时（${timeout}ms），当前活跃连接: ${connectionQueue.active}/${batchSettings.maxActive}`);
      }
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `等待连接槽位... (${connectionQueue.active}/${batchSettings.maxActive})`,
        type: "info",
      });
      await new Promise((r) => setTimeout(r, 1000));
    }
    connectionQueue.active++;
    return true;
  };

  /**
   * 释放连接槽位
   */
  const releaseConnectionSlot = () => {
    if (connectionQueue.active > 0) {
      connectionQueue.active--;
    }
  };

  /**
   * 等待连接建立（增强版，带状态检测）
   * @param {string} tokenId - Token ID
   * @param {number} timeout - 超时时间
   * @param {string} tokenName - Token名称（用于日志）
   */
  const waitForConnection = async (tokenId, timeout = batchSettings.connectionTimeout, tokenName = "") => {
    const start = Date.now();
    let lastStatus = "";
    let sameStatusCount = 0;
    const MAX_SAME_STATUS_COUNT = 20; // 最多允许连续20次（10秒）相同状态
    
    while (Date.now() - start < timeout) {
      const status = tokenStore.getWebSocketStatus(tokenId);
      
      // 检测连接状态是否长时间无变化（可能是卡住了）
      if (status === lastStatus) {
        sameStatusCount++;
        if (sameStatusCount >= MAX_SAME_STATUS_COUNT) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${tokenName} 连接状态长时间未变化 (${status})，可能卡住了`,
            type: "warning",
          });
          return false;
        }
      } else {
        sameStatusCount = 0;
        lastStatus = status;
      }
      
      if (status === "connected") return true;
      
      // 如果状态是 error 或 disconnected，直接返回失败
      if (status === "error" || status === "disconnected") {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `${tokenName} 连接状态异常: ${status}`,
          type: "warning",
        });
        return false;
      }
      
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  /**
   * 确保连接建立（增强版）
   * @param {string} tokenId - Token ID
   * @param {object} tokens - Tokens列表
   * @param {number} maxRetries - 最大重试次数
   */
  const ensureConnection = async (tokenId, tokens, maxRetries = 2) => {
    const latestToken = tokens.find((t) => t.id === tokenId);
    if (!latestToken) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    let status = tokenStore.getWebSocketStatus(tokenId);
    let connected = status === "connected";
    let slotAcquired = false;

    if (!connected) {
      try {
        // 等待连接槽位，限制并发连接数（带超时）
        await waitForConnectionSlot();
        slotAcquired = true;
      } catch (slotError) {
        throw new Error(`获取连接槽位失败: ${slotError.message}`);
      }

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `${latestToken.name} 正在连接... (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
        type: "info",
      });

      let retryCount = 0;
      let lastError = null;

      while (retryCount <= maxRetries && !connected) {
        try {
          // 关闭现有连接（如果有）
          tokenStore.closeWebSocketConnection(tokenId);
          
          // 等待一小段时间确保连接完全关闭
          await new Promise((r) => setTimeout(r, 500));

          // 获取最新的token数据（可能已被刷新）
          const currentToken = tokens.find((t) => t.id === tokenId);
          if (!currentToken) {
            throw new Error(`Token不存在: ${tokenId}`);
          }

          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${currentToken.name} ${retryCount > 0 ? `第${retryCount}次重试` : "发起连接"}...`,
            type: "info",
          });

          await tokenStore.createWebSocketConnection(
            tokenId,
            currentToken.token,
            currentToken.wsUrl
          );
          
          // 等待连接建立
          connected = await waitForConnection(
            tokenId, 
            batchSettings.connectionTimeout,
            currentToken.name
          );

          if (connected) {
            break; // 连接成功，跳出重试循环
          }

          lastError = new Error("连接超时");
          retryCount++;

          if (retryCount <= maxRetries) {
            addLog({
              time: new Date().toLocaleTimeString(),
              message: `${currentToken.name} 连接失败，${batchSettings.reconnectDelay}ms后重试...`,
              type: "warning",
            });
            await new Promise((r) => setTimeout(r, batchSettings.reconnectDelay));
          }
        } catch (error) {
          lastError = error;
          retryCount++;
          
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${latestToken.name} 连接异常: ${error.message}${retryCount <= maxRetries ? "，准备重试..." : ""}`,
            type: "warning",
          });

          if (retryCount <= maxRetries) {
            await new Promise((r) => setTimeout(r, batchSettings.reconnectDelay));
          }
        }
      }

      if (!connected) {
        // 连接失败，释放槽位
        if (slotAcquired) {
          releaseConnectionSlot();
        }
        throw new Error(`连接失败: ${lastError?.message || "重试后仍无法连接"}`);
      }
    }

    // 连接成功，槽位保持占用，直到任务完成后手动释放

    // Initialize Game Data (Critical for Battle Version and Session)
    try {
      // Fetch Role Info first (Standard flow)
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "role_getroleinfo",
        {},
        5000
      );

      // Fetch Battle Version
      const res = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_startlevel",
        {},
        5000
      );
      if (res?.battleData?.version) {
        tokenStore.setBattleVersion(res.battleData.version);
      }
    } catch (e) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `初始化数据失败: ${e.message}`,
        type: "warning",
      });
    }

    return true;
  };

  /**
   * 关闭连接并释放槽位
   * @param {string} tokenId - Token ID
   * @param {string} tokenName - Token名称
   */
  const closeConnection = (tokenId, tokenName) => {
    tokenStore.closeWebSocketConnection(tokenId);
    releaseConnectionSlot();
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `${tokenName} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
      type: "info",
    });
  };

  /**
   * 强制重置连接队列（用于紧急停止）
   */
  const forceResetQueue = () => {
    const oldActive = connectionQueue.active;
    connectionQueue.active = 0;
    return oldActive;
  };

  /**
   * 获取当前队列状态
   */
  const getQueueStatus = () => ({
    active: connectionQueue.active,
    maxActive: batchSettings.maxActive,
  });

  return {
    connectionQueue,
    waitForConnectionSlot,
    releaseConnectionSlot,
    waitForConnection,
    ensureConnection,
    closeConnection,
    forceResetQueue,
    getQueueStatus,
  };
}

/**
 * 活动状态辅助函数
 * @returns {object} - 活动状态
 */
export const getActivityStatus = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // 计算当前活动周
  // 校准后的起始日期：2025-12-12是黑市周开始
  // 根据用户反馈，2026-04-03应该是招募周
  const start = new Date("2025-12-12T12:00:00"); // 起始时间：黑市周开始
  const weekDuration = 7 * 24 * 60 * 60 * 1000; // 一周毫秒数
  const cycleDuration = 3 * weekDuration; // 三周期毫秒数

  const elapsed = now - start;
  let currentActivityWeek = null;
  
  if (elapsed >= 0) {
    const cyclePosition = elapsed % cycleDuration;
    if (cyclePosition < weekDuration) {
      currentActivityWeek = "黑市周";
    } else if (cyclePosition < 2 * weekDuration) {
      currentActivityWeek = "招募周";
    } else {
      currentActivityWeek = "宝箱周";
    }
  }

  return {
    // 梦境活动开放 (周日、周一、周三、周四)
    ismengjingActivityOpen: day === 0 || day === 1 || day === 3 || day === 4,
    // 宝库活动开放 (非周一、周二)
    isbaokuActivityOpen: day !== 1 && day !== 2,
    // 竞技场活动开放 (6点到22点)
    isarenaActivityOpen: hour >= 6 && hour < 22,
    // 当前活动周
    currentActivityWeek,
    // 怪异塔活动开放 (黑市周)
    isWeirdTowerActivityOpen: currentActivityWeek === "黑市周",
  };
};

/**
 * 日期辅助函数
 * @returns {number} - 今日开始时间戳（秒）
 */
export const getTodayStartSec = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

/**
 * 检查今日是否可用
 * @param {number} lastTimeSec - 上次使用时间戳（秒）
 * @returns {boolean} - 今日是否可用
 */
export const isTodayAvailable = (lastTimeSec) => {
  if (!lastTimeSec || typeof lastTimeSec !== "number") return true;
  return lastTimeSec < getTodayStartSec();
};

/**
 * 计算月度任务进度
 * @returns {number} - 进度百分比（0-1）
 */
export const calculateMonthProgress = () => {
  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const dayOfMonth = now.getDate();
  return Math.min(1, Math.max(0, dayOfMonth / daysInMonth));
};

/**
 * 竞技场目标ID选择 - 选择排名最低（最容易打）的对手
 * @param {object} targets - 目标列表
 * @returns {number|null} - 目标ID
 */
export const pickArenaTargetId = (targets) => {
  if (!targets) return null;

  // 获取角色列表
  const getRoleList = () => {
    if (Array.isArray(targets)) return targets;
    return targets?.roleList || targets?.rankList || targets?.targets || targets?.targetList || targets?.list || [];
  };

  const roleList = getRoleList();

  if (roleList.length === 0) {
    return targets?.roleId || targets?.id || targets?.targetId;
  }

  // 选择排名最低（数值最大）的对手
  const sortedByRank = [...roleList].sort((a, b) => (b.rank || 0) - (a.rank || 0));
  const target = sortedByRank[0];

  return target?.roleId || target?.id || target?.targetId;
};
