import { PayloadBattleClient } from "./payloadBattleClient.js";

const RECONNECT_DELAYS = [10000, 20000, 40000, 60000, 60000];

export function createPayloadBattleSession(tokenStore, tokenId, { onState = () => {}, onMessage } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  let client;
  let timer;
  let attempts = 0;
  let pending;

  async function enter() {
    signal.throwIfAborted();
    if (tokenStore.selectedToken?.id !== tokenId) throw new Error("当前账号已切换");
    const response = await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadbf", {}, 10000);
    signal.throwIfAborted();
    if (tokenStore.selectedToken?.id !== tokenId) throw new Error("当前账号已切换");
    if (response?.ended || !response?.info?.sid || !response.info.bfId) {
      onState(response?.ended ? "ended" : "not-open");
      return null;
    }
    const candidate = new PayloadBattleClient({
      bfInfo: response.info,
      credential: tokenStore.getBattlefieldCredential(tokenId),
      onMessage,
      onDisconnect: () => {
        if (client !== candidate) return;
        client = null;
        scheduleReconnect();
      },
    });
    client = candidate;
    try {
      const snapshot = await candidate.connect(signal);
      attempts = 0;
      onState("entered");
      return snapshot;
    } catch (error) {
      if (client === candidate) client = null;
      if (Number(error.code) === 12100036 || /\b12100036\b/.test(error.message)) {
        onState("not-open");
        return null;
      }
      throw error;
    }
  }

  function start() {
    if (pending) return pending;
    pending = enter().finally(() => { pending = null; });
    return pending;
  }

  function scheduleReconnect() {
    if (signal.aborted || timer) return;
    if (attempts >= RECONNECT_DELAYS.length) {
      onState("failed");
      return;
    }
    onState("reconnecting");
    timer = setTimeout(() => {
      timer = null;
      start().catch(scheduleReconnect);
    }, RECONNECT_DELAYS[attempts++]);
  }

  return {
    start,
    get client() { return client; },
    close() {
      controller.abort();
      clearTimeout(timer);
      client?.close();
      client = null;
    },
  };
}
