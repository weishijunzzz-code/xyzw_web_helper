import type { ProtoMsg } from "@/utils/bonProtocol";
import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";

import { computed, markRaw, ref } from "vue";
import useIndexedDB from "@/hooks/useIndexedDB";
import { g_utils } from "@/utils/bonProtocol";
import { isGameAccountReserved } from "@/utils/gameAccountLease";
import { hasIOSAccountSocket, openIOSAccountSocket } from "@/utils/iosAccountSocket";

import { gameLogger, tokenLogger, wsLogger } from "@/utils/logger";
import { generateRandomSeed } from "@/utils/randomSeed";
import { isNativeGameApp } from "@/utils/runtimePlatform";
import {
  scheduleAuthUserRequest,
  setAuthUserRateLimiterCallback,
  transformToken,
} from "@/utils/token";
import {
  credentialWasRejected,
  describeTokenLoginFailure,
  TOKEN_LOGIN_TIMEOUT,
  TOKEN_RECOVERY_TIMEOUT,
} from "@/utils/tokenConnectionState.js";
import {
  refreshTokenFromCombUser,
  roleIndexFromServerId,
} from "@/utils/wechatForceLogout";
import { XyzwWebSocketClient } from "@/utils/xyzwWebSocket";
import { $emit, emitPlus } from "./events/index.js";

const { getArrayBuffer, storeArrayBuffer, deleteArrayBuffer, clearAll } =
  useIndexedDB();

declare interface TokenData {
  id: string;
  name: string;
  token: string; // 原始Base64 token
  wsUrl: string | null; // 可选的自定义WebSocket URL
  server: string;
  remark?: string; // 备注信息
  importMethod?:
    "manual" | "bin" | "url" | "wxQrcode" | "mobile" | "wxForceLogout";
  sourceUrl?: string; // 当importMethod为url时，存储url链接
  avatar?: string; // 用户头像URL
  upgradedToPermanent?: boolean; // 是否升级为长期有效
  upgradedAt?: string; // 升级时间
  updatedAt?: string; // 更新时间
  combUser?: Record<string, unknown>;
  serverId?: string | number;
  roleId?: string | number;
  roleIndex?: number;
}

declare interface WebSocketConnection {
  status:
    "connecting" | "connected" | "disconnecting" | "disconnected" | "error";
  client: XyzwWebSocketClient | null;
  actualToken?: string;
  lastError: { timestamp: string; error: string } | null;
  tokenId: string;
  sessionId: string;
  createdAt: string;
  lastMessageAt: string | null;
  connectedAt?: string | null;
  lastMessage?: { timestamp: string; data: ProtoMsg; cmd: string };
  wsUrl?: string;
  reconnectAttempts?: number;
  randomSeedSynced?: boolean;
  lastRandomSeedSource?: number | null;
  lastRandomSeed?: number | null;
}

declare type WebCtx = Record<string, Partial<WebSocketConnection>>;

type TokenLoginPhase =
  | "idle" | "connecting" | "verifying" | "refreshing" | "connected" | "error" | "cancelled";

interface TokenLoginState {
  phase: TokenLoginPhase;
  message: string;
  startedAt?: number;
  deadlineAt?: number;
  transport?: "direct" | "relay";
}

interface TokenLoginAttempt {
  tokenId: string;
  startedAt: number;
  deadlineAt: number;
  controller: AbortController;
  refreshUsed: boolean;
  ownsCrossTabState: boolean;
  timer?: ReturnType<typeof setTimeout>;
  transport?: XyzwWebSocketClient;
  transportKind: "direct" | "relay";
  customWsUrl: string | null;
  opened?: Promise<XyzwWebSocketClient | null>;
}

// 分组接口定义
declare interface TokenGroup {
  id: string;
  name: string;
  color: string; // 分组颜色，用于UI显示
  tokenIds: string[]; // 属于该分组的token ID列表
  createdAt?: string;
  updatedAt?: string;
}

export const gameTokens = useLocalStorage<TokenData[]>("gameTokens", []);
export const hasTokens = computed(() => gameTokens.value.length > 0);
export const selectedTokenId = useLocalStorage("selectedTokenId", "");
export const selectedToken = computed(() => {
  return gameTokens.value?.find((token) => token.id === selectedTokenId.value);
});
export const selectedRoleInfo = useLocalStorage<any>("selectedRoleInfo", null);

// 跨标签页连接协调
const activeConnections = useLocalStorage("activeConnections", {});

// Token分组管理
export const tokenGroups = useLocalStorage<TokenGroup[]>("tokenGroups", []);

/**
 * 重构后的Token管理存储
 * 以名称-token列表形式管理多个游戏角色
 */
export const useTokenStore = defineStore("tokens", () => {
  const wsConnections = ref<WebCtx>({}); // WebSocket连接状态
  const tokenLoginStates = ref<Record<string, TokenLoginState>>({});
  const tokenLoginAttempts = new Map<string, TokenLoginAttempt>();
  const closingSockets = new Map<string, WebSocket>();

  const getTokenLoginState = (tokenId: string): TokenLoginState =>
    tokenLoginStates.value[tokenId] ?? { phase: "idle", message: "" };

  // 游戏数据存储
  const gameData = ref({
    roleInfo: null,
    legionInfo: null,
    commonActivityInfo: null, // 消耗活动进度
    evoTowerInfo: null, //怪异塔
    presetTeam: null,
    battleVersion: null as number | null, // 战斗版本号
    studyStatus: {
      isAnswering: false,
      questionCount: 0,
      answeredCount: 0,
      status: "", // '', 'starting', 'answering', 'claiming_rewards', 'completed'
      timestamp: null,
    },
    lastUpdated: null as string | null,
  });

  // 获取当前选中token的角色信息
  const selectedTokenRoleInfo = computed(() => {
    return gameData.value.roleInfo;
  });

  const readStatisticsValue = (stats: any, key: string) => {
    if (!stats) return undefined;
    try {
      if (typeof stats.get === "function") {
        return stats.get(key);
      }
      if (Object.prototype.hasOwnProperty.call(stats, key)) {
        return stats[key];
      }
    } catch (error) {
      gameLogger.warn("读取统计数据失败:", error);
    }
    return undefined;
  };

  const extractLastLoginTimestamp = (payload: any) => {
    if (!payload) return null;

    const candidateSources = [
      payload?.role?.statistics,
      payload?.statistics,
      payload?.role?.statisticsTime,
      payload?.statisticsTime,
    ];

    const candidateKeys = [
      "last:login:time",
      "lastLoginTime",
      "last_login_time",
    ];

    for (const stats of candidateSources) {
      if (!stats) continue;
      for (const key of candidateKeys) {
        const value = readStatisticsValue(stats, key);
        if (value !== undefined && value !== null) {
          const numeric = Number(value);
          if (!Number.isNaN(numeric) && numeric > 0) {
            return numeric;
          }
        }
      }
    }
    return null;
  };

  const syncRandomSeedFromStatistics = (
    tokenId: string,
    rolePayload: any,
    client: XyzwWebSocketClient | null,
  ) => {
    if (!client) return;
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      return;
    }

    const lastLoginTime = extractLastLoginTimestamp(rolePayload);
    if (!lastLoginTime) {
      return;
    }

    if (
      connection.randomSeedSynced &&
      connection.lastRandomSeedSource === lastLoginTime
    ) {
      return;
    }

    const randomSeed = generateRandomSeed(lastLoginTime);

    try {
      client.send("system_custom", {
        key: "randomSeed",
        value: randomSeed,
      });
      connection.randomSeedSynced = true;
      connection.lastRandomSeedSource = lastLoginTime;
      connection.lastRandomSeed = randomSeed;
      wsLogger.info(`同步 randomSeed [${tokenId}]`, {
        lastLoginTime,
        randomSeed,
      });
    } catch (error) {
      wsLogger.error(`发送 randomSeed 失败 [${tokenId}]`, error);
    }
  };

  // Token管理
  /**
   * Persist a token record under its existing byte-derived identity.
   * @param {TokenData} tokenData Imported credential and role metadata.
   * @returns {TokenData} Stored token record.
   */
  const addToken = (tokenData: TokenData) => {
    const id =
      tokenData.id ||
      `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newToken = {
      id,
      name: tokenData.name,
      token: tokenData.token, // 保存原始Base64 token
      wsUrl: tokenData.wsUrl || null, // 可选的自定义WebSocket URL
      server: tokenData.server || "",
      remark: tokenData.remark || "", // 备注信息
      level: tokenData.level || 1,
      profession: tokenData.profession || "",
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      isActive: true,
      // URL获取相关信息
      sourceUrl: tokenData.sourceUrl || null, // Token来源URL（用于刷新）
      importMethod: tokenData.importMethod || "manual", // 导入方式：manual 或 url
      avatar: tokenData.avatar || "", // 用户头像
      combUser: tokenData.combUser || null,
      serverId: tokenData.serverId ?? null,
      roleId: tokenData.roleId ?? null,
      roleIndex: tokenData.roleIndex ?? null,
    };

    gameTokens.value.push(newToken);
    return newToken;
  };

  /**
   * Merge token metadata without replacing unrelated stored fields.
   * @param {string} tokenId Existing token identity.
   * @param {Partial<TokenData>} updates Fields to merge.
   * @returns {boolean} Whether the token was found and updated.
   */
  const updateToken = (tokenId: string, updates: Partial<TokenData>) => {
    const index = gameTokens.value.findIndex((token) => token.id === tokenId);
    if (index !== -1) {
      gameTokens.value[index] = {
        ...gameTokens.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return true;
    }
    return false;
  };

  /**
   * Remove token metadata, its active connection and associated persisted BIN data.
   * @param {string} tokenId Token to remove.
   * @returns {Promise<boolean>} Resolves to true when token cleanup finishes.
   */
  const removeToken = async (tokenId: string) => {
    gameTokens.value = gameTokens.value.filter((token) => token.id !== tokenId);

    // 关闭对应的WebSocket连接
    closeWebSocketConnection(tokenId);
    delete tokenLoginStates.value[tokenId];

    // 如果删除的是当前选中token，清除选中状态
    if (selectedTokenId.value === tokenId) {
      selectedTokenId.value = null;
    }

    // 同时删除IndexedDB中的数据
    await deleteArrayBuffer(tokenId);

    return true;
  };

  const selectTokenOnly = (tokenId: string) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (!token) {
      return null;
    }
    selectedTokenId.value = tokenId;
    return token;
  };

  const selectToken = (tokenId: string, forceReconnect = false) => {
    const isAlreadySelected = selectedTokenId.value === tokenId;
    const token = selectTokenOnly(tokenId);
    if (!token) {
      return null;
    }
    const existingConnection = wsConnections.value[tokenId];
    const isConnected = existingConnection?.status === "connected";
    const isConnecting = existingConnection?.status === "connecting";

    tokenLogger.debug(`选择Token: ${tokenId}`, {
      isAlreadySelected,
      isConnected,
      isConnecting,
      forceReconnect,
    });

    // 更新最后使用时间
    updateToken(tokenId, { lastUsed: new Date().toISOString() });
    //避免点击断开链接
    if (isConnected && !forceReconnect) {
      return token;
    }
    // 智能连接判断
    const shouldCreateConnection =
      forceReconnect || // 强制重连
      !isAlreadySelected || // 首次选择此token
      !existingConnection || // 没有现有连接
      existingConnection.status === "disconnected" || // 连接已断开
      existingConnection.status === "error"; // 连接出错

    if (shouldCreateConnection) {
      if (isAlreadySelected && !forceReconnect) {
        wsLogger.info(`Token已选中但无连接，创建新连接: ${tokenId}`);
      } else if (!isAlreadySelected) {
        wsLogger.info(`切换到新Token，创建连接: ${tokenId}`);
      } else if (forceReconnect) {
        wsLogger.info(`强制重连Token: ${tokenId}`);
      }

      // 创建WebSocket连接
      void createWebSocketConnection(tokenId, token.token, token.wsUrl, { force: forceReconnect });
    } else {
      if (isConnected) {
        wsLogger.debug(`Token已连接，跳过连接创建: ${tokenId}`);
      } else if (isConnecting) {
        wsLogger.debug(`Token连接中，跳过连接创建: ${tokenId}`);
      } else {
        wsLogger.debug(`Token已选中且有连接，跳过连接创建: ${tokenId}`);
      }
    }

    return token;
  };

  const binImportMethods = new Set(["bin", "wxQrcode", "mobile", "wxForceLogout"]);

  function canRefreshCredential(token?: TokenData) {
    return Boolean(token && (
      (token.importMethod === "url" && token.sourceUrl) ||
      (token.importMethod && binImportMethods.has(token.importMethod)) ||
      token.combUser
    ));
  }

  async function refreshLoginCredential(attempt: TokenLoginAttempt) {
    const { tokenId, controller } = attempt;
    const { signal } = controller;
    const current = gameTokens.value.find(token => token.id === tokenId);
    if (!current) throw loginFailure("missingCredential");

    let updates: Partial<TokenData> | undefined;
    if (current.importMethod === "url" && current.sourceUrl) {
      const token = await scheduleAuthUserRequest(async () => {
        if (signal.aborted) return null;
        const response = await fetch(current.sourceUrl, { signal });
        if (!response.ok) throw Object.assign(new Error("Credential HTTP request failed"), { code: response.status });
        return (await response.json()).token;
      });
      if (typeof token === "string" && token.trim()) updates = { token };
    } else {
      // Prefer the already saved, account-specific BIN. A name key supports older imports.
      let bin = await getArrayBuffer(tokenId);
      if (!bin && binImportMethods.has(current.importMethod || "")) {
        bin = await getArrayBuffer(current.name);
      }
      if (signal.aborted) return null;

      if (bin) {
        updates = { token: await transformToken(bin, { signal }) };
      } else if (current.combUser) {
        const refreshed = await refreshTokenFromCombUser(current.combUser as any, {
          serverId: current.serverId, roleIndex: current.roleIndex, roleId: current.roleId,
        });
        if (!isActiveLogin(attempt)) return null;
        if (!await storeArrayBuffer(tokenId, refreshed.bin)) throw loginFailure("missingBin");
        updates = {
          token: refreshed.token,
          serverId: refreshed.role.serverId,
          roleId: refreshed.role.roleId,
          roleIndex: roleIndexFromServerId(refreshed.role.serverId),
        };
      } else {
        throw loginFailure("missingBin");
      }
    }

    if (!isActiveLogin(attempt)) return null;
    const latest = gameTokens.value.find(token => token.id === tokenId);
    if (!latest || latest.token !== current.token) throw loginFailure("missingCredential");
    if (!updates || !updateToken(tokenId, updates)) throw loginFailure("missingCredential");
    return updates.token;
  }

  // 游戏消息处理
  const handleGameMessage = async (
    tokenId: string,
    message: ProtoMsg,
    client: any,
  ) => {
    try {
      if (!message) {
        gameLogger.warn(`消息处理跳过 [${tokenId}]: 无效消息`);
        return;
      }
      if (message.error || Number(message.code)) return;

      const cmd = message.cmd?.toLowerCase();
      const body = message.getData();

      if (cmd === "role_getroleinforesp") {
        syncRandomSeedFromStatistics(tokenId, body, client);

        // 保存角色信息到 gameData
        if (body) {
          gameData.value.roleInfo = body;
          gameData.value.lastUpdated = new Date().toISOString();
        }

        // 更新头像
        if (body?.role?.headImg) {
          const token = gameTokens.value.find((t) => t.id === tokenId);
          if (token && token.avatar !== body.role.headImg) {
            updateToken(tokenId, { avatar: body.role.headImg });
            wsLogger.debug(`更新头像 [${tokenId}]: ${body.role.headImg}`);
          }
        }
      }

      emitPlus(cmd, {
        tokenId,
        body,
        message,
        client,
        gameData,
      });

      gameLogger.gameMessage(tokenId, cmd, !!body);
    } catch (error) {
      gameLogger.error(`处理消息失败 [${tokenId}]:`, error);
    }
  };

  // 验证token有效性
  const validateToken = (token: any) => {
    if (!token) return false;
    if (typeof token !== "string") return false;
    if (token.trim().length === 0) return false;
    // 简单检查：token应该至少有一定长度
    if (token.trim().length < 10) return false;
    return true;
  };

  // Base64解析功能（增强版）
  const parseBase64Token = (base64String: string) => {
    try {
      // 输入验证
      if (!base64String || typeof base64String !== "string") {
        throw new Error("Token字符串无效");
      }

      // 移除可能的前缀和空格
      const cleanBase64 = base64String.replace(/^data:.*base64,/, "").trim();

      if (cleanBase64.length === 0) {
        throw new Error("Token字符串为空");
      }

      // 解码base64
      let decoded;
      try {
        decoded = atob(cleanBase64);
      } catch (decodeError) {
        // 如果不是有效的Base64，作为纯文本token处理
        decoded = base64String.trim();
      }

      // 尝试解析为JSON
      let tokenData;
      try {
        tokenData = JSON.parse(decoded);
      } catch {
        // 不是JSON格式，作为纯token处理
        tokenData = { token: decoded };
      }

      // 提取实际token
      const actualToken = tokenData.token || tokenData.gameToken || decoded;

      // 验证token有效性
      if (!validateToken(actualToken)) {
        throw new Error("提取的 Token 无效");
      }

      return {
        success: true,
        data: {
          ...tokenData,
          actualToken, // 添加提取出的实际token
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `解析失败：${error.message}`,
      };
    }
  };

  const importBase64Token = (
    name: string,
    base64String: string,
    additionalInfo = {},
  ) => {
    const parseResult = parseBase64Token(base64String);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
        message: `Token "${name}" 导入失败: ${parseResult.error}`,
      };
    }

    const tokenData = {
      name,
      token: parseResult.data.actualToken, // 使用验证过的实际token
      ...additionalInfo,
      ...parseResult.data, // 解析出的数据覆盖手动输入
    } as any;

    // 增强 Token：附带 bin（base64，lx/pl 格式原始 BIN）字段时恢复到 IndexedDB，
    // 使手动导入的 Token 也可"打开游戏/导出BIN"；bin 不入库 localStorage
    const binBase64: string | undefined =
      typeof tokenData.bin === "string" ? tokenData.bin : undefined;
    delete tokenData.bin;

    if (binBase64) {
      // token 字段存剔除 bin 后的 JSON，避免冗余 base64 大字段进入 localStorage
      const cleanJson = { ...parseResult.data };
      delete cleanJson.bin;
      delete cleanJson.actualToken;
      tokenData.token = JSON.stringify(cleanJson);
    }

    try {
      const newToken = addToken(tokenData);

      let binRestored = false;
      if (binBase64 && newToken?.id) {
        binRestored = true;
        Promise.resolve()
          .then(() => {
            const binary = atob(binBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return storeArrayBuffer(newToken.id, bytes.buffer);
          })
          .then((ok) => {
            if (ok) {
              tokenLogger.info(`Token "${name}" 附带BIN数据已恢复到IndexedDB`);
            } else {
              tokenLogger.warn(`Token "${name}" 附带BIN数据恢复失败`);
            }
          })
          .catch((binError) => {
            tokenLogger.warn(
              `Token "${name}" 附带BIN数据恢复异常: ${binError?.message || binError}`,
            );
          });
      }

      // 添加更多验证信息到成功消息
      const tokenInfo = parseResult.data.actualToken;
      const displayToken =
        tokenInfo.length > 20
          ? `${tokenInfo.substring(0, 10)}...${tokenInfo.substring(tokenInfo.length - 6)}`
          : tokenInfo;

      return {
        success: true,
        token: newToken,
        tokenName: name,
        message:
          `Token "${name}" 导入成功${
          binRestored
            ? "，已附带BIN数据（可直接打开游戏/导出BIN）"
            : ""}`,
        details: `实际Token: ${displayToken}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Token "${name}" 添加失败: ${error.message}`,
      };
    }
  };

  // 连接管理辅助函数
  const generateSessionId = () =>
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const currentSessionId = generateSessionId();

  function updateCrossTabConnectionState(tokenId: string, action: string) {
    const state = { action, sessionId: currentSessionId, timestamp: Date.now() };
    try {
      localStorage.setItem(`ws_connection_${tokenId}`, JSON.stringify(state));
      activeConnections.value[tokenId] = state;
    } catch {
      // A private or full storage partition must not block login.
    }
  }

  // 检查是否有其他标签页的活跃连接
  const checkCrossTabConnection = (tokenId: string) => {
    const storageKey = `ws_connection_${tokenId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        const isRecent = Date.now() - state.timestamp < 30000; // 30秒内的状态认为是活跃的
        const isDifferentSession = state.sessionId !== currentSessionId;

        if (
          isRecent &&
          isDifferentSession &&
          (state.action === "connecting" || state.action === "connected")
        ) {
          wsLogger.debug(`检测到其他标签页的活跃连接: ${tokenId}`);
          return state;
        }
      }
    } catch (error) {
      wsLogger.warn("检查跨标签页连接状态失败:", error);
    }
    return null;
  };

  function loginFailure(kind: string) {
    return Object.assign(new Error(kind), { kind });
  }

  function isActiveLogin(attempt: TokenLoginAttempt) {
    return tokenLoginAttempts.get(attempt.tokenId) === attempt && !attempt.controller.signal.aborted;
  }

  function setLoginPhase(attempt: TokenLoginAttempt, phase: TokenLoginPhase, message: string) {
    tokenLoginStates.value[attempt.tokenId] = {
      phase, message, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt,
      transport: attempt.transportKind,
    };
  }

  function detachTransport(tokenId: string, expected?: XyzwWebSocketClient) {
    const connection = wsConnections.value[tokenId];
    const client = connection?.client;
    if (!connection || (expected && expected !== client)) return;
    delete wsConnections.value[tokenId];
    const socket = client?.socket;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      closingSockets.set(tokenId, socket);
      // Cancellation may never be followed by a retry. Do not retain a detached socket.
      setTimeout(() => {
        if (closingSockets.get(tokenId) === socket) closingSockets.delete(tokenId);
      }, 2000);
    }
    try {
      client?.disconnect();
    } catch {
      // Detached sockets may still emit events. Their ownership checks ignore them.
    }
  }

  function waitForSocketClose(tokenId: string, signal?: AbortSignal) {
    const socket = closingSockets.get(tokenId);
    if (!socket) return Promise.resolve();
    return new Promise<void>(resolve => {
      const deadline = Date.now() + 2000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        if (closingSockets.get(tokenId) === socket) {
          closingSockets.delete(tokenId);
        }
        resolve();
      };
      const poll = () => {
        if (signal?.aborted || socket.readyState === WebSocket.CLOSED || Date.now() >= deadline) finish();
        else timer = setTimeout(poll, 50);
      };
      signal?.addEventListener("abort", finish, { once: true });
      poll();
    });
  }

  function finishLogin(attempt: TokenLoginAttempt, phase: "connected" | "error" | "cancelled", message: string) {
    if (!isActiveLogin(attempt)) return;
    const { tokenId } = attempt;
    clearTimeout(attempt.timer);
    tokenLoginAttempts.delete(tokenId);
    attempt.controller.abort();
    if (phase !== "connected") {
      if (attempt.transport) detachTransport(tokenId, attempt.transport);
      if (attempt.ownsCrossTabState) updateCrossTabConnectionState(tokenId, "disconnected");
      if (phase === "error" && !wsConnections.value[tokenId]?.client) {
        wsConnections.value[tokenId] = {
          tokenId,
          status: "error",
          lastError: { timestamp: new Date().toISOString(), error: message },
        };
      }
    }
    setLoginPhase(attempt, phase, message);
  }

  function armLoginDeadline(attempt: TokenLoginAttempt) {
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => {
      finishLogin(attempt, "error", describeTokenLoginFailure({ kind: "timeout" }, getTokenLoginState(attempt.tokenId).phase));
    }, Math.max(0, attempt.deadlineAt - Date.now()));
  }

  function cancelTokenLogin(tokenId: string) {
    const attempt = tokenLoginAttempts.get(tokenId);
    if (attempt) finishLogin(attempt, "cancelled", "已取消登录，可以重试");
  }

  async function recoverCredential(attempt: TokenLoginAttempt, error: unknown) {
    if (!isActiveLogin(attempt)) return null;
    const token = gameTokens.value.find(item => item.id === attempt.tokenId);
    if (attempt.refreshUsed || !canRefreshCredential(token)) {
      finishLogin(attempt, "error", describeTokenLoginFailure(error, getTokenLoginState(attempt.tokenId).phase));
      return null;
    }
    attempt.refreshUsed = true;
    attempt.deadlineAt = attempt.startedAt + TOKEN_RECOVERY_TIMEOUT;
    armLoginDeadline(attempt);
    if (attempt.transport) detachTransport(attempt.tokenId, attempt.transport);
    updateCrossTabConnectionState(attempt.tokenId, "connecting");
    setLoginPhase(attempt, "refreshing", "正在刷新登录凭证");
    try {
      const credential = await refreshLoginCredential(attempt);
      if (!credential || !isActiveLogin(attempt)) return null;
      return await openLoginTransport(attempt, credential);
    } catch (refreshError) {
      finishLogin(attempt, "error", describeTokenLoginFailure(refreshError, "refreshing"));
      return null;
    }
  }

  async function openLoginTransport(attempt: TokenLoginAttempt, credential: string) {
    const { tokenId } = attempt;
    await waitForSocketClose(tokenId, attempt.controller.signal);
    if (!isActiveLogin(attempt)) return null;
    if (Date.now() >= attempt.deadlineAt) throw loginFailure("timeout");
    const parsed = parseBase64Token(credential);
    const actualToken = parsed.success ? parsed.data.actualToken : validateToken(credential) ? credential : null;
    if (!actualToken) throw loginFailure("missingCredential");

    // Existing user-configured endpoints stay explicit. A refresh never silently submits
    // credentials through a different transport or replaces a supplied URL's parameters.
    const wsUrl = attempt.customWsUrl || `wss://xxz-xyzw.hortorgames.com/agent?p=${encodeURIComponent(actualToken)}&e=x&lang=chinese`;
    const createSocket = !attempt.customWsUrl && hasIOSAccountSocket() ? openIOSAccountSocket : undefined;
    const client = markRaw(new XyzwWebSocketClient({ url: wsUrl, utils: g_utils, heartbeatMs: 5000, createSocket }));
    attempt.transport = client;
    wsConnections.value[tokenId] = {
      client, status: "connecting", tokenId, actualToken, sessionId: currentSessionId,
      createdAt: new Date().toISOString(), lastMessageAt: null, connectedAt: null,
      lastError: null, reconnectAttempts: 0, randomSeedSynced: false,
    };
    const connection = wsConnections.value[tokenId];
    const ownsTransport = () => wsConnections.value[tokenId]?.client === client;
    setLoginPhase(attempt, "connecting", "正在连接游戏服务");

    const reportFailure = (error: unknown, code?: number) => {
      if (!ownsTransport()) return;
      const phase = getTokenLoginState(tokenId).phase;
      if (credentialWasRejected(error) && !attempt.customWsUrl) {
        if (isActiveLogin(attempt)) {
          void recoverCredential(attempt, error);
          return;
        }
        if (connection.status === "connected" && !attempt.refreshUsed) {
          const token = gameTokens.value.find(item => item.id === tokenId);
          if (token && canRefreshCredential(token)) {
            void createWebSocketConnection(tokenId, token.token, token.wsUrl, { refresh: true });
            return;
          }
        }
      }

      const message = describeTokenLoginFailure(error, phase, code);
      if (isActiveLogin(attempt)) {
        finishLogin(attempt, "error", message);
      } else if (connection.status === "connected") {
        detachTransport(tokenId, client);
        updateCrossTabConnectionState(tokenId, "disconnected");
        wsConnections.value[tokenId] = {
          tokenId, status: "error", lastError: { timestamp: new Date().toISOString(), error: message },
        };
        setLoginPhase(attempt, "error", message);
      }
    };

    client.onConnect = async () => {
      if (!ownsTransport() || !isActiveLogin(attempt)) return;
      connection.connectedAt = new Date().toISOString();
      setLoginPhase(attempt, "verifying", "已连接，正在校验角色信息");
      try {
        const response = await client.sendWithPromise("role_getroleinfo", {}, Math.max(1, attempt.deadlineAt - Date.now()));
        if (!ownsTransport() || !isActiveLogin(attempt)) return;
        if (Date.now() >= attempt.deadlineAt) throw loginFailure("timeout");
        const role = response?.role || response?.data?.role || response?.body?.role;
        if (!role || typeof role !== "object" || Array.isArray(role) || !Object.keys(role).length) {
          throw loginFailure("roleMissing");
        }
        connection.status = "connected";
        connection.reconnectAttempts = 0;
        syncRandomSeedFromStatistics(tokenId, response, client);
        updateCrossTabConnectionState(tokenId, "connected");
        finishLogin(attempt, "connected", "已连接，角色信息已就绪");
        try { localStorage.removeItem("xyzw_chat_msg_list"); } catch { /* optional cache */ }
        wsLogger.wsConnect(tokenId);
      } catch (error) {
        const timedOut = Date.now() >= attempt.deadlineAt;
        reportFailure(timedOut ? { kind: "timeout" } : error);
      }
    };
    client.onDisconnect = event => reportFailure(event?.reason || { kind: "transport" }, event?.code);
    client.onError = () => reportFailure({ kind: "transport" });
    client.setMessageListener((message: ProtoMsg) => {
      if (!ownsTransport()) return;
      if (credentialWasRejected(message?.error || message?.hint)) {
        reportFailure(message.error || message.hint, Number(message.code));
        return;
      }
      const cmd = message?.cmd || "unknown";
      connection.lastMessage = { timestamp: new Date().toISOString(), data: message, cmd };
      void handleGameMessage(tokenId, message, client);
    });
    client.init();
    return client;
  }

  const createWebSocketConnection = (
    tokenId: string,
    credential: string,
    customWsUrl: string | null = null,
    { force = false, refresh = false } = {},
  ): Promise<XyzwWebSocketClient | null> => {
    if (isNativeGameApp() && isGameAccountReserved(tokenId)) {
      tokenLoginStates.value[tokenId] = { phase: "error", message: "该账号的游戏窗口已打开，请先关闭游戏窗口。" };
      return Promise.resolve(null);
    }
    const inFlight = tokenLoginAttempts.get(tokenId);
    if (inFlight && !force) return inFlight.opened ?? Promise.resolve(null);
    if (inFlight) cancelTokenLogin(tokenId);

    // The deadline begins on the user's action, including wait for previous socket closure.
    const startedAt = Date.now();
    const attempt: TokenLoginAttempt = {
      tokenId, startedAt, deadlineAt: startedAt + TOKEN_LOGIN_TIMEOUT,
      controller: new AbortController(), refreshUsed: false, ownsCrossTabState: false,
      transportKind: "direct", customWsUrl,
    };
    tokenLoginAttempts.set(tokenId, attempt);
    setLoginPhase(attempt, "connecting", "正在连接游戏服务");
    armLoginDeadline(attempt);
    attempt.opened = Promise.resolve().then(async () => {
      if (!isActiveLogin(attempt)) return null;
      if (checkCrossTabConnection(tokenId)) throw loginFailure("crossTab");
      detachTransport(tokenId);
      attempt.ownsCrossTabState = true;
      updateCrossTabConnectionState(tokenId, "connecting");
      if (refresh) return recoverCredential(attempt, { kind: "missingCredential" });
      return openLoginTransport(attempt, credential);
    }).catch(error => {
      finishLogin(attempt, "error", describeTokenLoginFailure(error, getTokenLoginState(tokenId).phase));
      return null;
    });
    return attempt.opened;
  };

  const startTokenLogin = (tokenId: string, { force = false, refresh = false } = {}) => {
    const token = selectTokenOnly(tokenId);
    if (!token) return Promise.resolve(null);
    if (!force && !refresh && getWebSocketStatus(tokenId) === "connected") {
      return Promise.resolve(getWebSocketClient(tokenId));
    }
    updateToken(tokenId, { lastUsed: new Date().toISOString() });
    return createWebSocketConnection(tokenId, token.token, token.wsUrl, { force, refresh });
  };

  async function closeWebSocketConnectionAsync(tokenId: string) {
    cancelTokenLogin(tokenId);
    if (wsConnections.value[tokenId]) {
      detachTransport(tokenId);
      updateCrossTabConnectionState(tokenId, "disconnected");
      if (getTokenLoginState(tokenId).phase !== "cancelled") {
        tokenLoginStates.value[tokenId] = { phase: "idle", message: "" };
      }
    }
    await waitForSocketClose(tokenId);
  }

  const closeWebSocketConnection = closeWebSocketConnectionAsync;

  const getWebSocketStatus = (tokenId: string) => {
    if (["connecting", "verifying", "refreshing"].includes(getTokenLoginState(tokenId).phase)) return "connecting";
    return wsConnections.value[tokenId]?.status || "disconnected";
  };

  // 获取WebSocket客户端
  const getWebSocketClient = (tokenId: string) => {
    return wsConnections.value[tokenId]?.client || null;
  };

  // 设置消息监听器
  const setMessageListener = (listener: any) => {
    if (selectedToken.value) {
      const connection = wsConnections.value[selectedToken.value.id];
      if (connection && connection.client) {
        connection.client.setMessageListener(listener);
      }
    }
  };

  // 设置是否显示消息
  const setShowMsg = (show: any) => {
    if (selectedToken.value) {
      const connection = wsConnections.value[selectedToken.value.id];
      if (connection && connection.client) {
        connection.client.setShowMsg(show);
      }
    }
  };

  // 发送消息到WebSocket
  const sendMessage = (
    tokenId: string,
    cmd: string,
    params = {},
    options = {},
  ) => {
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      wsLogger.error(`WebSocket未连接，无法发送消息 [${tokenId}]`);
      return false;
    }

    try {
      const client = connection.client;
      if (!client) {
        wsLogger.error(`WebSocket客户端不存在 [${tokenId}]`);
        return false;
      }

      client.send(cmd, params, options);
      wsLogger.wsMessage(tokenId, cmd, false);

      return true;
    } catch (error) {
      wsLogger.error(`发送失败 [${tokenId}] ${cmd}:`, error.message);
      return false;
    }
  };

  // Promise版发送消息
  /**
   * Attach the current battle version where required and await a protocol response.
   * @param {string} tokenId Account connection to use.
   * @param {string} cmd Registered protocol command.
   * @param {object} params Command body supplied by the caller.
   * @param {number} timeout Request timeout in milliseconds.
   * @returns {Promise<unknown>} Server response; rejects for connection or command errors.
   */
  const sendMessageWithPromise = async (
    tokenId: string,
    cmd: string,
    params = {},
    timeout = 5000,
  ) => {
    const connection = wsConnections.value[tokenId];
    if (!connection || connection.status !== "connected") {
      return Promise.reject(new Error(`WebSocket未连接 [${tokenId}]`));
    }

    const client = connection.client;
    if (!client) {
      return Promise.reject(new Error(`WebSocket客户端不存在 [${tokenId}]`));
    }

    // 为战斗相关命令自动注入 battleVersion
    const battleCommands = [
      "fight_startareaarena",
      "fight_startpvp",
      "fight_starttower",
      "fight_startboss",
      "fight_startlegionboss",
      "fight_startdungeon",
      "fight_level",
    ];
    if (battleCommands.includes(cmd)) {
      const battleVersion = gameData.value.battleVersion;
      params = { battleVersion, ...params };
      wsLogger.info(
        `⚔️ [战斗命令] 注入 battleVersion: ${battleVersion} [${cmd}]`,
      );
    }

    try {
      const result = await client.sendWithPromise(cmd, params, timeout);

      // 特殊日志：fight_starttower 响应
      if (cmd === "fight_starttower") {
        wsLogger.info(`🗼 [咸将塔] 收到爬塔响应 [${tokenId}]:`, result);
      }

      return result;
    } catch (error) {
      // 特殊日志：fight_starttower 错误
      if (cmd === "fight_starttower") {
        wsLogger.error(`🗼 [咸将塔] 爬塔请求失败 [${tokenId}]:`, error.message);
      }
      return Promise.reject(error);
    }
  };

  // 发送心跳消息
  const sendHeartbeat = (tokenId: string) => {
    return sendMessage(tokenId, "heart_beat");
  };

  // 发送获取角色信息请求（异步处理）
  const sendGetRoleInfo = async (
    tokenId: string,
    params = {},
    retryCount = 0,
  ) => {
    try {
      // 增加超时时间到15秒，并添加重试机制
      const timeout = 15000;
      const roleInfo = await sendMessageWithPromise(
        tokenId,
        "role_getroleinfo",
        params,
        timeout,
      );

      // 手动更新游戏数据（因为响应可能不会自动触发消息处理）
      if (roleInfo) {
        gameData.value.roleInfo = roleInfo;
        gameData.value.lastUpdated = new Date().toISOString();
        gameLogger.verbose("角色信息已通过 Promise 更新");
      }

      return roleInfo;
    } catch (error) {
      gameLogger.error(`获取角色信息失败 [${tokenId}]:`, error.message);

      // 重试机制：最多重试2次，每次间隔1秒
      if (retryCount < 2) {
        gameLogger.info(
          `正在重试获取角色信息 [${tokenId}]，重试次数: ${retryCount + 1}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return sendGetRoleInfo(tokenId, params, retryCount + 1);
      }

      throw error;
    }
  };

  // 发送获取数据版本请求
  const sendGetDataBundleVersion = (tokenId: string, params = {}) => {
    return sendMessageWithPromise(tokenId, "system_getdatabundlever", params);
  };

  // 发送签到请求
  const sendSignIn = (tokenId: string) => {
    return sendMessageWithPromise(tokenId, "system_signinreward");
  };

  // 发送领取日常任务奖励
  const sendClaimDailyReward = (tokenId: string, rewardId = 0) => {
    return sendMessageWithPromise(tokenId, "task_claimdailyreward", {
      rewardId,
    });
  };

  // 发送获取队伍信息
  const sendGetTeamInfo = (tokenId: string, params = {}) => {
    return sendMessageWithPromise(tokenId, "presetteam_getinfo", params);
  };

  //发送消息到世界
  const sendMessageToWorld = (tokenId: string, message: string) => {
    return sendMessageWithPromise(tokenId, "system_sendchatmessage", {
      channel: 1,
      emojiId: 0,
      extra: null,
      msg: message,
      msgType: 1,
    });
  };
  //发送消息到俱乐部
  const sendMessageToLegion = (tokenId: string, message: string) => {
    return sendMessageWithPromise(tokenId, "system_sendchatmessage", {
      channel: 2,
      emojiId: 0,
      extra: null,
      msg: message,
      msgType: 1,
    });
  };

  // 发送自定义游戏消息
  const sendGameMessage = (
    tokenId: string,
    cmd: string,
    params = {},
    options = {},
  ) => {
    if (options.usePromise) {
      return sendMessageWithPromise(tokenId, cmd, params, options.timeout);
    } else {
      return sendMessage(tokenId, cmd, params, options);
    }
  };

  // 获取当前塔层数
  const getCurrentTowerLevel = () => {
    try {
      // 从游戏数据中获取塔信息
      const roleInfo = gameData.value.roleInfo;
      if (!roleInfo || !roleInfo.role) {
        gameLogger.warn("角色信息不存在");
        return null;
      }

      const tower = roleInfo.role.tower;
      if (!tower) {
        gameLogger.warn("塔信息不存在");
        return null;
      }

      // 可能的塔层数字段（根据实际数据结构调整）
      const level =
        tower.level || tower.currentLevel || tower.floor || tower.stage;

      // 当前塔层数
      return level;
    } catch (error) {
      gameLogger.error("获取塔层数失败:", error);
      return null;
    }
  };

  // 获取详细塔信息
  const getTowerInfo = () => {
    try {
      const roleInfo = gameData.value.roleInfo;
      if (!roleInfo || !roleInfo.role) {
        return null;
      }

      return roleInfo.role.tower || null;
    } catch (error) {
      gameLogger.error("获取塔信息失败:", error);
      return null;
    }
  };

  // 工具方法
  const exportTokens = () => {
    return {
      tokens: gameTokens.value,
      exportedAt: new Date().toISOString(),
      version: "2.0",
    };
  };

  const importTokens = (data: any) => {
    try {
      if (data.tokens && Array.isArray(data.tokens)) {
        gameTokens.value = data.tokens;
        return {
          success: true,
          message: `成功导入 ${data.tokens.length} 个Token`,
        };
      } else {
        return { success: false, message: "导入数据格式错误" };
      }
    } catch (error) {
      return { success: false, message: `导入失败：${error.message}` };
    }
  };

  const clearAllTokens = async () => {
    // 关闭所有WebSocket连接
    new Set([...Object.keys(wsConnections.value), ...tokenLoginAttempts.keys()]).forEach(closeWebSocketConnection);
    tokenLoginStates.value = {};

    gameTokens.value = [];
    selectedTokenId.value = null;

    // 清空IndexedDB
    await clearAll();
  };

  const cleanExpiredTokens = async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 找出需要清理的token
    const tokensToRemove = gameTokens.value.filter((token) => {
      // URL和bin文件导入的token设为长期有效，不会过期
      // 升级为长期有效的token也不会过期
      if (
        token.importMethod === "url" ||
        token.importMethod === "bin" ||
        token.importMethod === "wxQrcode" ||
        token.importMethod === "mobile" ||
        token.importMethod === "wxForceLogout" ||
        token.upgradedToPermanent
      ) {
        return false;
      }
      // 手动导入的token按原逻辑处理（24小时过期）
      const lastUsed = new Date(token.lastUsed || token.createdAt);
      return lastUsed <= oneDayAgo;
    });

    const cleanedCount = tokensToRemove.length;

    // 逐个删除，触发清理逻辑（WebSocket断开、IndexedDB删除等）
    for (const token of tokensToRemove) {
      await removeToken(token.id);
    }

    return cleanedCount;
  };

  // 将现有token升级为长期有效
  const upgradeTokenToPermanent = (tokenId: string) => {
    const token = gameTokens.value.find((t) => t.id === tokenId);
    if (
      token &&
      !token.upgradedToPermanent &&
      token.importMethod !== "url" &&
      token.importMethod !== "bin" &&
      token.importMethod !== "wxQrcode" &&
      token.importMethod !== "mobile" &&
      token.importMethod !== "wxForceLogout"
    ) {
      updateToken(tokenId, {
        upgradedToPermanent: true,
        upgradedAt: new Date().toISOString(),
      });
      return true;
    }
    return false;
  };

  // 连接唯一性验证和监控
  const validateConnectionUniqueness = (tokenId: string) => {
    const connections = Object.values(wsConnections.value).filter(
      (conn) =>
        conn.tokenId === tokenId &&
        (conn.status === "connecting" || conn.status === "connected"),
    );

    if (connections.length > 1) {
      wsLogger.warn(
        `检测到重复连接: ${tokenId}, 连接数: ${connections.length}`,
      );
      // 保留最新的连接，关闭旧连接
      const sortedConnections = connections.sort(
        (a, b) => new Date(b.connectedAt || 0) - new Date(a.connectedAt || 0),
      );

      for (let i = 1; i < sortedConnections.length; i++) {
        const oldConnection = sortedConnections[i];
        wsLogger.debug(`关闭重复连接: ${tokenId}`);
        closeWebSocketConnectionAsync(oldConnection.tokenId);
      }

      return false; // 检测到重复连接
    }

    return true; // 连接唯一
  };

  // 连接监控和清理
  const connectionMonitor = {
    // 定期检查连接状态
    startMonitoring: () => {
      setInterval(() => {
        const now = Date.now();

        // 检查连接超时（超过30秒未活动）
        Object.entries(wsConnections.value).forEach(([tokenId, connection]) => {
          const lastActivity =
            connection.lastMessage?.timestamp || connection.connectedAt;
          if (lastActivity) {
            const timeSinceActivity = now - new Date(lastActivity).getTime();
            if (
              timeSinceActivity > 30000 &&
              connection.status === "connected"
            ) {
              wsLogger.warn(`检测到连接可能已断开: ${tokenId}`);
              // 发送心跳检测
              if (connection.client) {
                connection.client.sendHeartbeat();
              }
            }
          }
        });

        // 清理过期的跨标签页状态（超过5分钟）
        Object.entries(activeConnections.value).forEach(([tokenId, state]) => {
          if (now - state.timestamp > 300000) {
            wsLogger.debug(`清理过期跨标签页状态: ${tokenId}`);
            delete activeConnections.value[tokenId];
            localStorage.removeItem(`ws_connection_${tokenId}`);
          }
        });
      }, 10000); // 每10秒检查一次
    },

    // 获取连接统计信息
    getStats: () => {
      const duplicateTokens: string[] = [];
      const stats = {
        totalConnections: Object.keys(wsConnections.value).length,
        connectedCount: 0,
        connectingCount: 0,
        disconnectedCount: 0,
        errorCount: 0,
        duplicateTokens,
        activeLocks: tokenLoginAttempts.size,
        crossTabStates: Object.keys(activeConnections.value).length,
      };

      // 统计连接状态
      const tokenCounts = new Map();
      Object.values(wsConnections.value).forEach((connection) => {
        stats[`${connection.status}Count`]++;

        // 检测重复token
        const count = tokenCounts.get(connection.tokenId) || 0;
        tokenCounts.set(connection.tokenId, count + 1);

        if (count > 0) {
          stats.duplicateTokens.push(connection.tokenId);
        }
      });

      return stats;
    },

    // 强制清理所有连接
    forceCleanup: async () => {
      wsLogger.info("开始强制清理所有连接...");

      const ids = new Set([...Object.keys(wsConnections.value), ...tokenLoginAttempts.keys()]);
      const cleanupPromises = [...ids].map(closeWebSocketConnectionAsync);

      await Promise.all(cleanupPromises);

      // 清理localStorage中的跨标签页状态
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("ws_connection_")) {
          localStorage.removeItem(key);
        }
      });

      wsLogger.info("强制清理完成");
    },
  };

  // 监听localStorage变化（跨标签页通信）
  const setupCrossTabListener = () => {
    window.addEventListener("storage", (event) => {
      if (event.key?.startsWith("ws_connection_")) {
        const tokenId = event.key.replace("ws_connection_", "");
        wsLogger.debug(
          `检测到跨标签页连接状态变化: ${tokenId}`,
          event.newValue,
        );

        // 如果其他标签页建立了连接，考虑关闭本标签页的连接
        if (event.newValue) {
          try {
            const newState = JSON.parse(event.newValue);
            const localConnection = wsConnections.value[tokenId];

            if (
              newState.action === "connected" &&
              newState.sessionId !== currentSessionId &&
              localConnection?.status === "connected"
            ) {
              wsLogger.info(
                `检测到其他标签页已连接同一token，关闭本地连接: ${tokenId}`,
              );
              closeWebSocketConnectionAsync(tokenId);
            }
          } catch (error) {
            wsLogger.warn("解析跨标签页状态失败:", error);
          }
        }
      }
    });
  };

  // 初始化
  const initTokenStore = () => {
    // // 恢复数据
    // const savedTokens = localStorage.getItem('gameTokens')
    // const savedSelectedId = localStorage.getItem('selectedTokenId')

    // if (savedTokens) {
    //   try {
    //     gameTokens.value = JSON.parse(savedTokens)
    //   } catch (error) {
    //     tokenLogger.error('解析Token数据失败:', error.message)
    //     gameTokens.value = []
    //   }
    // }

    // if (savedSelectedId) {
    //   selectedTokenId.value = savedSelectedId
    // }

    // 清理过期token
    cleanExpiredTokens();
    // 启动连接监控
    connectionMonitor.startMonitoring();

    // 设置跨标签页监听
    setupCrossTabListener();

    // 设置限流等待回调
    setAuthUserRateLimiterCallback((waitTimeMs: number, queueSize: number) => {
      const waitSeconds = Math.ceil(waitTimeMs / 1000);
      $emit.emit("token:refresh:waiting", {
        waitTimeMs,
        waitSeconds,
        queueSize,
        timestamp: Date.now(),
      });
    });

    tokenLogger.info("Token Store 初始化完成，连接监控已启动");
  };
  const setBattleVersion = (version: number | null) => {
    gameData.value.battleVersion = version;
    gameData.value.lastUpdated = new Date().toISOString();
  };

  const getBattleVersion = () => {
    return gameData.value.battleVersion;
  };

  // =====================
  // Token分组管理方法
  // =====================

  /**
   * 创建新的分组
   */
  const createTokenGroup = (name: string, color: string = "#1677ff") => {
    const group: TokenGroup = {
      id: `group_${Date.now()}${Math.random().toString(36).slice(2)}`,
      name,
      color,
      tokenIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tokenGroups.value.push(group);
    return group;
  };

  /**
   * 删除分组
   */
  const deleteTokenGroup = (groupId: string) => {
    const index = tokenGroups.value.findIndex((g) => g.id === groupId);
    if (index !== -1) {
      tokenGroups.value.splice(index, 1);
    }
  };

  /**
   * 更新分组信息
   */
  const updateTokenGroup = (groupId: string, updates: Partial<TokenGroup>) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      Object.assign(group, updates, {
        updatedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * 添加token到分组
   */
  const addTokenToGroup = (groupId: string, tokenId: string) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group && !group.tokenIds.includes(tokenId)) {
      group.tokenIds.push(tokenId);
      group.updatedAt = new Date().toISOString();
    }
  };

  /**
   * 从分组移除token
   */
  const removeTokenFromGroup = (groupId: string, tokenId: string) => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    if (group) {
      const index = group.tokenIds.indexOf(tokenId);
      if (index !== -1) {
        group.tokenIds.splice(index, 1);
        group.updatedAt = new Date().toISOString();
      }
    }
  };

  /**
   * 获取token所属的分组
   */
  const getTokenGroups = (tokenId: string): TokenGroup[] => {
    return tokenGroups.value.filter((g) => g.tokenIds.includes(tokenId));
  };

  /**
   * 获取分组中的所有token ID
   */
  const getGroupTokenIds = (groupId: string): string[] => {
    const group = tokenGroups.value.find((g) => g.id === groupId);
    return group ? group.tokenIds : [];
  };

  /**
   * 获取分组中有效的（存在于gameTokens中的）token ID
   */
  const getValidGroupTokenIds = (groupId: string): string[] => {
    const tokenIds = getGroupTokenIds(groupId);
    const validTokenIds = gameTokens.value.map((t) => t.id);
    return tokenIds.filter((id) => validTokenIds.includes(id));
  };

  /**
   * 移除不存在的token从所有分组
   */
  const cleanupInvalidTokens = () => {
    const validTokenIds = new Set(gameTokens.value.map((t) => t.id));
    tokenGroups.value.forEach((group) => {
      group.tokenIds = group.tokenIds.filter((id) => validTokenIds.has(id));
    });
  };

  return {
    // 状态
    gameTokens,
    selectedTokenId,
    wsConnections,
    gameData,

    // 计算属性
    hasTokens,
    selectedToken,
    selectedTokenRoleInfo,

    // Token管理方法
    addToken,
    updateToken,
    removeToken,
    selectToken,
    selectTokenOnly,

    // Base64解析方法
    parseBase64Token,
    importBase64Token,

    // WebSocket方法
    createWebSocketConnection,
    startTokenLogin,
    cancelTokenLogin,
    getTokenLoginState,
    closeWebSocketConnection,
    getWebSocketStatus,
    getWebSocketError: (tokenId: string) => wsConnections.value[tokenId]?.lastError?.error,
    getBattlefieldCredential: (tokenId: string) => wsConnections.value[tokenId]?.actualToken,
    getWebSocketClient,
    sendMessage,
    sendMessageWithPromise,
    setMessageListener,
    setShowMsg,
    sendHeartbeat,
    sendGetRoleInfo,
    sendGetDataBundleVersion,
    sendSignIn,
    sendClaimDailyReward,
    sendGetTeamInfo,
    sendGameMessage,

    // 工具方法
    exportTokens,
    importTokens,
    clearAllTokens,
    cleanExpiredTokens,
    upgradeTokenToPermanent,
    initTokenStore,

    //游戏内发送消息方法
    sendMessageToLegion,
    sendMessageToWorld,

    // 塔信息方法
    getCurrentTowerLevel,
    getTowerInfo,

    // battleVersion
    setBattleVersion,
    getBattleVersion,

    // 调试工具方法
    validateToken,
    debugToken: (tokenString: string) => {
      console.log("🔍 Token调试信息:");
      console.log("原始Token:", tokenString);
      const parseResult = parseBase64Token(tokenString);
      console.log("解析结果:", parseResult);
      if (parseResult.success) {
        console.log("实际Token:", parseResult.data.actualToken);
        console.log(
          "Token有效性:",
          validateToken(parseResult.data.actualToken),
        );
      }
      return parseResult;
    },

    // 连接管理增强功能
    validateConnectionUniqueness,
    connectionMonitor,
    currentSessionId: () => currentSessionId,

    // Token分组管理方法
    tokenGroups,
    createTokenGroup,
    deleteTokenGroup,
    updateTokenGroup,
    addTokenToGroup,
    removeTokenFromGroup,
    getTokenGroups,
    getGroupTokenIds,
    getValidGroupTokenIds,
    cleanupInvalidTokens,

    // 开发者工具
    devTools: {
      getConnectionStats: () => connectionMonitor.getStats(),
      forceCleanup: () => connectionMonitor.forceCleanup(),
      showConnectionLocks: () => [...tokenLoginAttempts.keys()],
      showCrossTabStates: () => Object.keys(activeConnections.value),
      testDuplicateConnection: (tokenId: string) => {
        // 降噪
        const token = gameTokens.value.find((t) => t.id === tokenId);
        if (token) {
          // 故意创建第二个连接进行测试
          createWebSocketConnection(`${tokenId}_test`, token.token);
        }
      },
    },
  };
});
