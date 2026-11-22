import { defineStore } from "pinia";
import { ref } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { buildBattlefieldUrl, enterSaltBattlefield, openBattlefieldSocket } from "@/utils/battlefieldConnection.js";
import { getCurrentTimeByFormat } from "@/utils/DateTimeUtils";
import { extractValidData } from "@/utils/legionWar";
import { XyzwLegionWarWebSocketClient } from "@/utils/xyzwLegionWarWebSocket";

export const useLegionWarStore = defineStore("legionWar", () => {
  const tokenStore = useTokenStore();

  // 状态
  const isConnected = ref(false);
  const connecting = ref(false);
  const battlefieldId = ref(null);
  const validData = ref(null);
  const legionDetails = ref({});
  const lastUpdateTime = ref("");
  const isJoined = ref(false); // 是否已进入战场

  // 引用计数，用于管理连接生命周期
  const subscribers = new Set();
  let disconnectTimer = null;

  // WebSocket 实例
  let legionWarWebSocket = null;
  let connectRequest;
  let connectionTokenId;
  let connectionAbort;

  const connect = async (subscriber) => {
    const token = tokenStore.selectedToken;
    if (!token) throw new Error("请先选择一个Token");

    subscribers.add(subscriber);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    if (connectionTokenId && connectionTokenId !== token.id) performDisconnect();
    if (isJoined.value) return;
    if (connectRequest) return connectRequest;

    const controller = new AbortController();
    connectionAbort = controller;
    connectionTokenId = token.id;
    connecting.value = true;
    connectRequest = connectToBattlefield(token, controller);
    return connectRequest;
  };

  const connectToBattlefield = async (token, controller) => {
    const { signal } = controller;
    try {
      const response = await tokenStore.sendMessageWithPromise(
        token.id,
        "legion_getbattlefield",
        {},
        10000,
      );
      signal.throwIfAborted();
      if (tokenStore.selectedToken?.id !== token.id) throw new Error("当前账号已切换");
      const info = response?.info;
      if (!info?.battlefieldId) throw new Error("无法获取战场信息");
      const credential = tokenStore.getBattlefieldCredential(token.id);
      const socket = new XyzwLegionWarWebSocketClient({
        url: buildBattlefieldUrl(info, credential),
        hint: info.battlefieldId,
        heartbeatMs: 5000,
      });
      battlefieldId.value = info.battlefieldId;
      legionWarWebSocket = socket;
      socket.setMessageListener((packet) => {
        if (legionWarWebSocket !== socket || signal.aborted || packet.code) return;
        if (!/^war_(?:getbattlefieldinfo|enterbattlefieldresp)/i.test(packet.cmd || "")) return;
        const extracted = extractValidData(packet.rawData);
        if (!extracted) return;
        validData.value = extracted;
        lastUpdateTime.value = getCurrentTimeByFormat("HH:mm:ss");
        for (const legion of Object.values(extracted.legionInfo)) {
          if (!legionDetails.value[legion.id]) fetchLegionDetail(legion.id);
        }
      });
      await openBattlefieldSocket(socket, {
        signal,
        onLost: () => {
          if (legionWarWebSocket !== socket) return;
          socket.disconnect();
          legionWarWebSocket = null;
          isConnected.value = false;
          isJoined.value = false;
        },
      });
      await enterSaltBattlefield(socket, info.battlefieldId);
      signal.throwIfAborted();
      if (legionWarWebSocket !== socket) throw new Error("战场连接已断开");
      isConnected.value = true;
      isJoined.value = true;
    } catch (error) {
      if (connectionAbort === controller) performDisconnect();
      throw error;
    } finally {
      if (connectionAbort === controller) {
        connecting.value = false;
        connectRequest = null;
      }
    }
  };

  const disconnect = (subscriber, force = false) => {
    if (force) {
      performDisconnect();
      return;
    }
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      // 延迟断开，防止页面切换时频繁断连
      if (disconnectTimer) clearTimeout(disconnectTimer);

      disconnectTimer = setTimeout(() => {
        if (subscribers.size === 0) {
          performDisconnect();
        }
      }, 3000); // 3秒缓冲期
    }
  };

  const performDisconnect = () => {
    clearTimeout(disconnectTimer);
    connectionAbort?.abort();
    connectionAbort = null;
    connectRequest = null;
    connectionTokenId = null;
    if (legionWarWebSocket) {
      legionWarWebSocket.disconnect();
      legionWarWebSocket = null;
    }
    isConnected.value = false;
    isJoined.value = false;
    connecting.value = false;
    // validData.value = null; // 可选：是否清空数据
    battlefieldId.value = null;
    disconnectTimer = null;
  };

  const refreshData = () => {
    if (!isConnected.value || !legionWarWebSocket) {
      // 如果未连接，尝试连接
      // 但 refreshData 通常由用户手动触发，这里还是抛错比较合适，或者静默失败
      console.warn("请先连接到战场");
      return;
    }

    if (!battlefieldId.value) {
      console.warn("未获取到战场ID");
      return;
    }

    legionWarWebSocket.send("war_getbattlefieldinfo", {
      battlefieldId: battlefieldId.value,
    });
  };

  const sendBattleAction = (command, params = {}) => {
    if (!isJoined.value || !battlefieldId.value || connectionTokenId !== tokenStore.selectedToken?.id) {
      throw new Error("当前账号尚未进入盐场");
    }
    return legionWarWebSocket.send(command, { ...params, battlefieldId: battlefieldId.value });
  };

  const fetchLegionDetail = async (legionId) => {
    const tokenId = connectionTokenId;
    if (!tokenId) return;
    try {
      const response = await tokenStore.sendMessageWithPromise(
        tokenId,
        "legion_getinfobyid",
        { legionId },
      );

      if (tokenId === connectionTokenId && response && (response.legionData || response.info)) {
        legionDetails.value[legionId] = response.legionData || response.info;
      }
    } catch (error) {
      console.error(`获取俱乐部[${legionId}]详情失败`, error);
    }
  };

  /**
   * 发送各俱乐部免费复活信息到战队频道
   * @param {Function} message - naive-ui 的 message 实例
   */
  const sendReviveInfoToLegion = async (message) => {
    if (!validData.value || !validData.value.legionInfo) {
      throw new Error("暂无战场数据，请先获取数据");
    }

    if (!tokenStore.selectedToken) {
      throw new Error("请先选择一个Token");
    }

    const legions = Object.values(validData.value.legionInfo);
    if (legions.length === 0) {
      throw new Error("未获取到俱乐部信息");
    }

    // 构建消息列表（每10个俱乐部一条消息，分两条发送）
    const messageList = [];
    for (let i = 0; i < 2; i++) {
      let msg = "";
      for (let j = 0; j < 10; j++) {
        const index = j + i * 10;
        if (index >= legions.length) break;
        
        const legion = legions[index];
        if (j !== 0) msg += "\n";
        msg += `${legion.name}:剩${150 - (legion.reviveCount || 0)}`;
      }
      if (msg) messageList.push(msg);
    }

    const tokenId = tokenStore.selectedToken.id;
    const sendInterval = 1500;

    for (let i = 0; i < messageList.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, sendInterval));
      
      try {
        await tokenStore.sendMessageToLegion(tokenId, messageList[i]);
        message.success(`第${i + 1}条消息发送成功`);
      } catch (error) {
        console.error(`发送第${i + 1}条消息失败`, error);
        // 如果是频繁发送错误，等待更长时间后重试一次
        if (error.message && error.message.includes("频繁")) {
          await new Promise((resolve) => setTimeout(resolve, sendInterval * 2));
          try {
            await tokenStore.sendMessageToLegion(tokenId, messageList[i]);
            message.success(`第${i + 1}条消息重试成功`);
          } catch (retryError) {
            message.error(`第${i + 1}条消息发送失败`);
          }
        } else {
          message.error(`第${i + 1}条消息发送失败: ${error.message || "未知错误"}`);
        }
      }
    }

    return messageList.length;
  };

  return {
    // State
    isConnected,
    connecting,
    battlefieldId,
    validData,
    legionDetails,
    lastUpdateTime,
    isJoined,

    // Actions
    connect,
    disconnect,
    refreshData,
    startBattle: (targetCodeId) => sendBattleAction("war_startbattle", { targetCodeId: Number(targetCodeId) }),
    attackBuilding: (buildingId) => sendBattleAction("war_startattackbuilding", { buildingId: String(buildingId) }),
    startMarch: (target) => sendBattleAction("war_startmarch", { target: String(target) }),
    setBattleTeam: (team) => sendBattleAction("war_setbattleteam", team),
    suicide: () => sendBattleAction("war_suicide"),
    speedUp: (marchId) => sendBattleAction("war_speedup", { marchId }),
    async getTeamInfo(roleCodeId) {
      const socket = legionWarWebSocket;
      if (!socket || !isJoined.value || connectionTokenId !== tokenStore.selectedToken?.id) throw new Error("当前账号尚未进入盐场");
      const response = socket.waitForPush("war_getteaminforesp");
      try {
        sendBattleAction("war_getteaminfo", { roleCodeId: Number(roleCodeId) });
      } catch (error) {
        response.catch(() => {});
        throw error;
      }
      return response;
    },
    fetchLegionDetail,
    sendReviveInfoToLegion,
  };
});
