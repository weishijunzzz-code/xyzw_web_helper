/**
 * Token转Bin文件工具
 * 将微信扫码获取的token转换为游戏服务器要求的bin文件格式
 */

import { bon, getEnc, encode, DataWriter } from "./bonProtocol";
import { MD5, lib, enc } from "crypto-js";
import { encryptBinData, generateBinWithPkcs12 } from "./pkcs12Crypto";

/**
 * Token转Bin文件配置
 */
export interface TokenToBinConfig {
  platform?: string;
  platformExt?: string;
  scene?: number;
  referrerInfo?: string;
  serverId?: number | null;
  usePkcs12?: boolean; // 是否使用PKCS12加密
  pkcs12Password?: string; // PKCS12加密密码
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
 * 构建BON尾部
 */
const buildBonTail = (deviceUniqueId: string): Uint8Array => {
  const writer = new DataWriter();

  // serverId（NULL值）
  writer.writeInt8(0x05);
  writer.writeInt8(0x08);
  writer.writeUint8Array(new TextEncoder().encode("serverId"));
  writer.writeInt8(0x00);

  // scene（int32，值为0）
  writer.writeInt8(0x05);
  writer.writeInt8(0x05);
  writer.writeUint8Array(new TextEncoder().encode("scene"));
  writer.writeInt8(0x01);
  writer.writeInt32(0);

  // referrerInfo（空字符串）
  writer.writeInt8(0x05);
  writer.writeInt8(0x0c);
  writer.writeUint8Array(new TextEncoder().encode("referrerInfo"));
  writer.writeInt8(0x05);
  writer.writeInt8(0x00);

  // deviceUniqueId（字符串）
  writer.writeInt8(0x05);
  writer.writeInt8(0x0e);
  writer.writeUint8Array(new TextEncoder().encode("deviceUniqueId"));
  writer.writeInt8(0x05);
  writer.writeInt8(deviceUniqueId.length);
  writer.writeUint8Array(new TextEncoder().encode(deviceUniqueId));

  return writer.getBytes();
};

/**
 * 将微信扫码获取的token转换为bin文件格式
 *
 * @param combUser 组合用户信息（从微信扫码登录响应中获取）
 * @param config 转换配置
 * @param deviceUniqueId 设备唯一ID（PKCS12加密时需要）
 * @returns Uint8Array bin文件数据
 */
export const convertTokenToBin = (
  combUser: CombUser,
  config: TokenToBinConfig = {},
  deviceUniqueId?: string
): Uint8Array => {
  const {
    platform = "hortor",
    platformExt = "mix",
    scene = 0,
    referrerInfo = "",
    serverId = null,
    usePkcs12 = false,
    pkcs12Password = "",
  } = config;

  // 构建bin文件内部数据结构
  // 注意：只加密核心用户信息，不包含 platform 等字段
  // 这些字段在 bin 文件的 BON 尾部中已包含
  const binData = {
    uid: combUser.uid,
    name: combUser.name,
    token: combUser.token || combUser.roleToken,
    openid: combUser.openid,
    unionid: combUser.unionid,
    avatar: combUser.avatar,
    sessId: combUser.sessId,
    connId: combUser.connId,
    isRestore: combUser.isRestore,
  };

  // 如果使用PKCS12加密
  if (usePkcs12) {
    const encrypted = encryptBinData(binData, pkcs12Password || "default_password");
    const timestamp = Math.floor(Date.now() / 1000);
    const signStr = `${encrypted.data}${timestamp}`;
    const sign = MD5(signStr).toString(enc.Hex);

    const jsonContent = {
      info: encrypted.data,
      sign: sign,
      timestamp: timestamp,
    };

    const jsonStr = JSON.stringify(jsonContent);
    const jsonBytes = new TextEncoder().encode(jsonStr);

    // 构建BON尾部
    const bonTail = buildBonTail(deviceUniqueId || "default_device");

    const result = new Uint8Array(jsonBytes.length + bonTail.length);
    result.set(jsonBytes, 0);
    result.set(bonTail, jsonBytes.length);

    return result;
  }

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
 * 使用参考文件的info内容生成bin文件（用于测试）
 * @param referenceInfo 参考文件的info字段（base64）
 * @param deviceUniqueId 设备ID
 * @param timestamp 时间戳
 * @returns Uint8Array bin文件数据
 */
export const buildBinFileFromReference = (
  referenceInfo: string,
  deviceUniqueId: string,
  timestamp?: number
): Uint8Array => {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  
  // 直接使用参考文件的info内容
  const encryptedBase64 = referenceInfo;
  
  // 生成签名
  const finalSign = generateSign(encryptedBase64, ts);
  
  // 构建bin文件
  return buildBinFileFromData(encryptedBase64, finalSign, ts, deviceUniqueId);
};

/**
 * 从已有数据构建bin文件
 */
const buildBinFileFromData = (
  encryptedBase64: string,
  sign: string,
  timestamp: number,
  deviceUniqueId: string
): Uint8Array => {
  // 参考文件格式：JSON字符串 + BON编码的尾部字段
  const jsonContent = {
    info: encryptedBase64,
    sign: sign,
    timestamp: timestamp,
  };

  const jsonStr = JSON.stringify(jsonContent);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 构建BON格式的尾部数据
  const writer = new DataWriter();

  writer.writeInt8(0x05);
  writer.writeInt8(0x08);
  writer.writeUint8Array(new TextEncoder().encode("serverId"));
  writer.writeInt8(0x00);

  writer.writeInt8(0x05);
  writer.writeInt8(0x05);
  writer.writeUint8Array(new TextEncoder().encode("scene"));
  writer.writeInt8(0x01);
  writer.writeInt32(0);

  writer.writeInt8(0x05);
  writer.writeInt8(0x0C);
  writer.writeUint8Array(new TextEncoder().encode("referrerInfo"));
  writer.writeInt8(0x05);
  writer.writeInt8(0x00);

  writer.writeInt8(0x05);
  writer.writeInt8(0x0E);
  writer.writeUint8Array(new TextEncoder().encode("deviceUniqueId"));
  writer.writeInt8(0x05);
  writer.writeInt8(deviceUniqueId.length);
  writer.writeUint8Array(new TextEncoder().encode(deviceUniqueId));

  const bonTail = writer.getBytes();

  const result = new Uint8Array(jsonBytes.length + bonTail.length);
  result.set(jsonBytes, 0);
  result.set(bonTail, jsonBytes.length);

  return result;
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

  // 参考文件格式：JSON字符串 + BON编码的尾部字段
  // 注意：JSON部分是纯文本，不是BON编码

  // 构建JSON对象
  const jsonContent = {
    info: encryptedBase64,
    sign: finalSign,
    timestamp: ts,
  };

  // 将JSON对象转为字符串
  const jsonStr = JSON.stringify(jsonContent);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 构建BON格式的尾部数据（serverId, scene, referrerInfo, deviceUniqueId）
  const writer = new DataWriter();

  // 根据参考文件分析，尾部格式为：
  // 0x05 + 字段名长度 + 字段名 + 类型标记 + 值

  // serverId（空值）
  writer.writeInt8(0x05); // 字段开始标记
  writer.writeInt8(0x08); // 字段名长度
  writer.writeUint8Array(new TextEncoder().encode("serverId"));
  writer.writeInt8(0x00); // NULL值

  // scene（int32，值为0）
  writer.writeInt8(0x05);
  writer.writeInt8(0x05);
  writer.writeUint8Array(new TextEncoder().encode("scene"));
  writer.writeInt8(0x01); // int32类型
  writer.writeInt32(0);   // 值0

  // referrerInfo（空字符串）
  writer.writeInt8(0x05);
  writer.writeInt8(0x0C);
  writer.writeUint8Array(new TextEncoder().encode("referrerInfo"));
  writer.writeInt8(0x05); // 空字符串类型
  writer.writeInt8(0x00); // 长度0

  // deviceUniqueId（字符串）
  writer.writeInt8(0x05);
  writer.writeInt8(0x0E);
  writer.writeUint8Array(new TextEncoder().encode("deviceUniqueId"));
  writer.writeInt8(0x05); // 字符串类型（带1字节长度）
  writer.writeInt8(deviceUniqueId.length);
  writer.writeUint8Array(new TextEncoder().encode(deviceUniqueId));

  const bonTail = writer.getBytes();

  // 合并JSON和BON尾部
  const result = new Uint8Array(jsonBytes.length + bonTail.length);
  result.set(jsonBytes, 0);
  result.set(bonTail, jsonBytes.length);

  return result;
};

// 导出内部函数供测试使用
export { buildBinFileFromData };

/**
 * 使用PKCS12加密生成完整的bin文件
 * @param combUser 组合用户信息
 * @param deviceUniqueId 设备唯一ID
 * @param password PKCS12加密密码
 * @param config 其他配置
 * @returns bin文件数据
 */
export const generateBinWithPkcs12Crypto = (
  combUser: CombUser,
  deviceUniqueId: string,
  password: string,
  config?: TokenToBinConfig
): Uint8Array => {
  // 构建用户数据结构
  const userData = {
    uid: combUser.uid,
    name: combUser.name,
    token: combUser.token || combUser.roleToken,
    openid: combUser.openid,
    unionid: combUser.unionid,
    avatar: combUser.avatar,
    sessId: combUser.sessId,
    connId: combUser.connId,
    isRestore: combUser.isRestore,
  };

  // 使用PKCS12加密
  const timestamp = Math.floor(Date.now() / 1000);
  return generateBinWithPkcs12(userData, password, deviceUniqueId, timestamp);
};

/**
 * 生成签名
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
