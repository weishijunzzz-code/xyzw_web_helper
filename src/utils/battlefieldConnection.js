const DEFAULT_BATTLEFIELD = "wss://xxz-xyzw-new.hortorgames.com/agent";
const SALT_ENTRY = ["war_enterbattlefieldresp", "war_getbattlefieldinfo", "war_getbattlefieldinforesp"];

export function buildBattlefieldUrl(info, credential) {
  if (!info?.sid || !credential) throw new Error("战场凭证不完整");
  const address = info.domainName || DEFAULT_BATTLEFIELD;
  if (typeof address !== "string") throw new Error("战场域名无效");
  const url = new URL(
    address.includes("://") ? address : `wss://${address}`,
  );
  if (url.protocol === "https:") url.protocol = "wss:";
  if (
    url.protocol !== "wss:" ||
    !url.hostname.endsWith(".hortorgames.com") ||
    url.username || url.password || url.port || url.hash
  ) {
    throw new Error("战场连接地址不是受信任的官方 WebSocket");
  }
  if (url.pathname === "/") url.pathname = "/agent";
  url.searchParams.set("p", credential);
  url.searchParams.set("e", "x");
  url.searchParams.set("sid2", String(info.sid));
  url.searchParams.set("lang", "chinese");
  return url.href;
}

export function openBattlefieldSocket(client, { signal, onLost, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) {
        client.disconnect();
        reject(error);
      } else resolve();
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error("战场连接超时")), timeout);
    signal?.addEventListener("abort", abort, { once: true });
    client.onConnect = () => finish();
    const lost = (reason) => {
      if (settled) onLost?.(reason);
      else finish(reason);
    };
    client.onError = () => lost(new Error("战场 WebSocket 连接失败"));
    client.onDisconnect = () => lost(new Error("战场 WebSocket 已断开"));
    try {
      client.init();
    } catch (error) {
      finish(error);
    }
  });
}

export async function enterSaltBattlefield(client, battlefieldId) {
  if (!battlefieldId || !client.connected) throw new Error("战场连接尚未就绪");
  const entry = client.waitForPush(SALT_ENTRY);
  // Initial snapshot often arrives as an unsolicited push rather than a response.
  try {
    client.send("war_enterbattlefield", { battlefieldId, useGzip: true });
  } catch (error) {
    client.disconnect();
    await entry.catch(() => {});
    throw error;
  }
  const packet = await entry;
  if (packet.cmd === "war_enterbattlefieldresp") {
    client.send("war_getbattlefieldinfo", { battlefieldId });
  }
  return packet;
}

export function getPayloadOpponent(response, ownId) {
  if (response?.ended || !ownId) return null;
  const legions = response?.legions ?? response?.info?.legions ?? response?.battlefield?.legions;
  if (!legions || typeof legions !== "object") return null;
  return Object.values(legions).find(
    (legion) => legion?.id && String(legion.id) !== String(ownId),
  )?.id ?? null;
}
