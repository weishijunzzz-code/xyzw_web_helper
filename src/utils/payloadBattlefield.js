import {
  buildBattlefieldUrl,
  getPayloadOpponent,
  openBattlefieldSocket,
} from "./battlefieldConnection.js";
import { XyzwWebSocketClient } from "./xyzwWebSocket.js";

export async function getLivePayloadOpponent(tokenStore, tokenId, ownId) {
  const response = await tokenStore.sendMessageWithPromise(
    tokenId, "legion_getpayloadbf", {}, 10000,
  );
  const opponent = getPayloadOpponent(response, ownId);
  const info = response?.info;
  if (opponent || response?.ended || !info?.domainName || !info.sid || !info.bfId) {
    return opponent;
  }
  if (tokenStore.selectedToken?.id !== tokenId) return null;

  const client = new XyzwWebSocketClient({
    url: buildBattlefieldUrl(info, tokenStore.getBattlefieldCredential(tokenId)),
    heartbeatMs: 5000,
  });
  try {
    await openBattlefieldSocket(client);
    if (tokenStore.selectedToken?.id !== tokenId) return null;
    const snapshot = await client.sendWithPromise("payload_enterbf", { bfId: info.bfId }, 8000);
    return getPayloadOpponent(snapshot, ownId);
  } finally {
    client.disconnect();
  }
}
