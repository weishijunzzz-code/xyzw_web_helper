/**
 * Token转Bin文件工具
 * 将微信扫码获取的token转换为游戏服务器要求的bin文件格式
 */

import { bon, getEnc, encode, DataWriter } from "./bonProtocol";
import { MD5, lib, enc } from "crypto-js";

/**
 * Token转Bin文件配置
 */
export interface TokenToBinConfig {
  platform?: string;
  platformExt?: string;
  scene?: number;
  referrerInfo?: string;
  serverId?: number | null;
}

/**
 * 组合用户信息结构
 */
export interface CombUser {
  uid: string | number;
  name: string;
  avatar?: string;
  [key: string]: any;
}

/**
 * 将微信扫码获取的token转换为bin文件格式
 *
 * @param combUser 组合用户信息（从微信扫码登录响应中获取）
 * @param config 转换配置
 * @returns Uint8Array bin文件数据
 */
export const convertTokenToBin = (
  combUser: CombUser,
  config: TokenToBinConfig = {}
): Uint8Array => {
  const {
    platform = "hortor",
    platformExt = "mix",
    scene = 0,
    referrerInfo = "",
    serverId = null,
  } = config;

  // 构建bin文件内部数据结构
  const binData = {
    platform,
    platformExt,
    info: combUser, // 用户信息
    serverId,
    scene,
    referrerInfo,
  };

  // 使用游戏加密模块加密数据
  const o4e = (window as any).o4e;
  const dm = o4e || (window as any).__require?.("13");

  if (!dm?.encMsg || !dm?.lz4XorEncode) {
    throw new Error("游戏加密模块未加载，不能生成 bin");
  }

  // 加密数据
  const encryptedBuffer = dm.encMsg(binData, {
    decrypt: dm.lz4XorDecode,
    encrypt: dm.lz4XorEncode,
  });

  return new Uint8Array(encryptedBuffer);
};

/**
 * 生成签名
 */
const generateSign = (
  data: string,
  timestamp: number,
  secret: string = ""
): string => {
  const signStr = `${data}${timestamp}${secret}`;
  return MD5(signStr).toString(enc.Hex);
};

/**
 * 构建完整的bin文件内容（参考 request_body.bin 格式）
 * 格式：JSON字符串 + BON二进制标记
 */
export const buildBinFile = (
  encryptedData: Uint8Array,
  deviceUniqueId: string,
  timestamp?: number,
  sign?: string
): Uint8Array => {
  const ts = timestamp || Math.floor(Date.now() / 1000);

  // 将加密数据转为base64
  const encryptedBase64 = btoa(String.fromCharCode(...encryptedData));

  // 生成签名（如果没有提供）
  const finalSign = sign || generateSign(encryptedBase64, ts);

  // 使用BON编码整个对象（与参考文件格式一致）
  // 参考文件格式：BON编码的对象，包含所有字段

  // 创建BON写入器
  const writer = new DataWriter();

  // 写入对象开始标记（类型6表示对象）
  writer.writeInt8(0x06);

  // 写入字段数量（5个字段：info, sign, timestamp, serverId, scene, referrerInfo, deviceUniqueId）
  writer.writeInt8(0x07);

  // 1. 写入info字段（字符串）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x04); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("info"));
  // 值：长字符串（类型0x0B表示带长度的字符串）
  writer.writeInt8(0x0B);
  writer.writeInt32(encryptedBase64.length);
  writer.writeUint8Array(new TextEncoder().encode(encryptedBase64));

  // 2. 写入sign字段（字符串）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x04); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("sign"));
  // 值：字符串
  writer.writeInt8(0x05); // 类型：字符串（带7位长度编码）
  writer.writeUTF(finalSign);

  // 3. 写入timestamp字段（int64）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x09); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("timestamp"));
  // 值：int64（类型0x03）
  writer.writeInt8(0x03);
  writer.writeInt64(ts);

  // 4. 写入serverId字段（空字符串）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x08); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("serverId"));
  // 值：空字符串
  writer.writeInt8(0x05);

  // 5. 写入scene字段（int32）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x05); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("scene"));
  // 值：int32（类型0x01）
  writer.writeInt8(0x01);
  writer.writeInt32(1);

  // 6. 写入referrerInfo字段（空字符串）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x0C); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("referrerInfo"));
  // 值：空字符串
  writer.writeInt8(0x05);

  // 7. 写入deviceUniqueId字段（字符串）
  writer.writeInt8(0x05); // 类型标记：空字符串（字段名）
  writer.writeInt8(0x0E); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("deviceUniqueId"));
  // 值：字符串
  writer.writeInt8(0x05);
  writer.writeUTF(deviceUniqueId);

  return writer.getBytes();
};

/**
 * 完整的token转bin流程
 */
export const tokenToBinComplete = async (
  combUser: CombUser,
  deviceUniqueId: string,
  config?: TokenToBinConfig
): Promise<{
  binData: Uint8Array;
  filename: string;
  downloadUrl: string;
}> => {
  // 1. 转换token为加密bin数据
  const encryptedBin = convertTokenToBin(combUser, config);

  // 2. 构建完整bin文件
  const fullBin = buildBinFile(encryptedBin, deviceUniqueId);

  // 3. 生成文件名
  const timestamp = Date.now();
  const roleId = combUser.uid || "unknown";
  const roleName = combUser.name || "unknown";
  const serverId = config?.serverId || "default";
  const filename = `bin-${serverId}-0-${roleId}-${roleName}.bin`;

  // 4. 创建下载URL
  const blob = new Blob([fullBin], { type: "application/octet-stream" });
  const downloadUrl = URL.createObjectURL(blob);

  return {
    binData: fullBin,
    filename,
    downloadUrl,
  };
};

/**
 * 下载bin文件
 */
export const downloadBinFile = (binData: Uint8Array, filename: string): void => {
  const blob = new Blob([binData], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/**
 * 将bin文件保存到本地存储
 */
export const saveBinToLocal = async (
  filename: string,
  binData: Uint8Array
): Promise<void> => {
  // 使用IndexedDB存储
  const DB_NAME = "xyzw_bin_files";
  const STORE_NAME = "binFiles";

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "filename" });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const data = {
        filename,
        binData,
        createdAt: new Date().toISOString(),
      };

      const addRequest = store.put(data);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * 从本地存储获取bin文件
 */
export const getBinFromLocal = async (
  filename: string
): Promise<Uint8Array | null> => {
  const DB_NAME = "xyzw_bin_files";
  const STORE_NAME = "binFiles";

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      const getRequest = store.get(filename);
      getRequest.onsuccess = () => {
        const result = getRequest.result;
        resolve(result ? result.binData : null);
      };
      getRequest.onerror = () => reject(getRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
};
