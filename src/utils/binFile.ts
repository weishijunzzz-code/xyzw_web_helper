import { g_utils } from "@/utils/bonProtocol";

type BinaryData = ArrayBuffer | Uint8Array;

export interface RoleBinFileInfo {
  serverId: string | number;
  roleId?: string | number;
  name?: string;
}

function toArrayBuffer(data: BinaryData): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

/** Extract the login envelope carried by a BIN file. */
export function getBinPayload(data: BinaryData): Record<string, any> {
  const message = g_utils.parse(toArrayBuffer(data));
  const payload = message.getData() || (message as any)._raw;
  if (!payload || typeof payload !== "object") {
    throw new Error("BIN 登录凭据解析为空");
  }
  return payload;
}

/** Build the LZ4 (`pl`) BIN format used by the game client for one role. */
export function buildRoleBin(
  payload: Record<string, any>,
  serverId: string | number,
): ArrayBuffer {
  return g_utils.encode(
    { ...payload, serverId: Number(serverId) },
    "lx",
  ) as ArrayBuffer;
}

/** Re-encodes an existing BIN as the game-compatible LZ4 (`pl`) format. */
export function normalizeBinForDownload(data: BinaryData): ArrayBuffer {
  const payload = getBinPayload(data);
  return buildRoleBin(payload, payload.serverId);
}

export function getRoleBinFileName({
  serverId,
  roleId,
  name,
}: RoleBinFileInfo): string {
  let normalizedServerId = Number(serverId);
  let roleIndex = 0;
  if (normalizedServerId >= 2000000) {
    roleIndex = 2;
    normalizedServerId -= 2000000;
  } else if (normalizedServerId >= 1000000) {
    roleIndex = 1;
    normalizedServerId -= 1000000;
  }

  const server = Number.isFinite(normalizedServerId)
    ? normalizedServerId - 27
    : "未知";
  const safeName = String(name || "未命名角色").replace(/[\\/:*?"<>|]/g, "_");
  const safeRoleId = String(roleId || "未知").replace(/[\\/:*?"<>|]/g, "_");
  return `bin-${server}服-${roleIndex}-${safeRoleId}-${safeName}.bin`;
}

export function downloadBinFile(fileName: string, data: BinaryData) {
  const blob = new Blob([toArrayBuffer(data)], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
