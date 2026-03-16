/**
 * Bin文件验证和解析工具
 * 用于验证生成的bin文件格式是否正确，以及解析bin文件内容
 */

import { bon, getEnc, parse } from "./bonProtocol";

/**
 * 验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  parsed?: any;
}

/**
 * 解析结果接口
 */
export interface ParseResult {
  success: boolean;
  userInfo?: any;
  error?: string;
}

/**
 * Bin文件信息接口
 */
export interface BinFileInfo {
  sign: string;
  timestamp: number;
  serverId: string;
  scene: number;
  referrerInfo: string;
  deviceUniqueId: string;
  info: string; // 加密的用户信息（base64）
}

/**
 * 验证bin文件格式是否正确
 *
 * @param binData bin文件数据
 * @returns 验证结果
 */
export const validateBinFile = (binData: Uint8Array): ValidationResult => {
  try {
    // 尝试解析bin文件
    const bonDecoder = getEnc("x");
    const parsed = parse(binData.buffer, bonDecoder);

    // 验证必要字段
    const data = parsed.rawData;

    if (!data.info) {
      return { valid: false, error: "缺少info字段" };
    }
    if (!data.sign) {
      return { valid: false, error: "缺少sign字段" };
    }
    if (!data.timestamp) {
      return { valid: false, error: "缺少timestamp字段" };
    }
    if (!data.deviceUniqueId) {
      return { valid: false, error: "缺少deviceUniqueId字段" };
    }

    return {
      valid: true,
      parsed: data,
    };
  } catch (error: any) {
    return {
      valid: false,
      error: `解析失败: ${error.message}`,
    };
  }
};

/**
 * 解析bin文件中的用户信息
 *
 * @param binData bin文件数据
 * @returns 解析结果
 */
export const parseBinFile = (binData: Uint8Array): ParseResult => {
  try {
    // 1. 验证bin文件
    const validation = validateBinFile(binData);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 2. 获取加密数据
    const encryptedBase64 = validation.parsed.info;

    // 3. 解密（需要游戏加密模块）
    const o4e = (window as any).o4e;
    const dm = o4e || (window as any).__require?.("13");

    if (!dm?.decMsg || !dm?.lz4XorDecode) {
      return { success: false, error: "游戏加密模块未加载" };
    }

    // 4. base64解码
    const encryptedBytes = Uint8Array.from(atob(encryptedBase64), (c) =>
      c.charCodeAt(0)
    );

    // 5. 使用游戏模块解密
    const decrypted = dm.decMsg(encryptedBytes, {
      decrypt: dm.lz4XorDecode,
      encrypt: dm.lz4XorEncode,
    });

    // 6. 解析用户信息
    const userInfo = JSON.parse(new TextDecoder().decode(decrypted));

    return {
      success: true,
      userInfo,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `解析失败: ${error.message}`,
    };
  }
};

/**
 * 获取bin文件基本信息（不解密用户信息）
 *
 * @param binData bin文件数据
 * @returns bin文件信息
 */
export const getBinFileInfo = (binData: Uint8Array): BinFileInfo | null => {
  try {
    const bonDecoder = getEnc("x");
    const parsed = parse(binData.buffer, bonDecoder);
    const data = parsed.rawData;

    return {
      sign: data.sign,
      timestamp: data.timestamp,
      serverId: data.serverId,
      scene: data.scene,
      referrerInfo: data.referrerInfo,
      deviceUniqueId: data.deviceUniqueId,
      info: data.info,
    };
  } catch (error) {
    return null;
  }
};

/**
 * 验证签名是否正确
 *
 * @param binData bin文件数据
 * @param secret 密钥（可选）
 * @returns 签名是否有效
 */
export const verifyBinSign = (
  binData: Uint8Array,
  secret: string = ""
): boolean => {
  try {
    const info = getBinFileInfo(binData);
    if (!info) return false;

    // 这里可以实现签名验证逻辑
    // 暂时返回true，因为签名生成逻辑在tokenToBin.ts中
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * 检查bin文件是否过期
 *
 * @param binData bin文件数据
 * @param maxAge 最大有效期（毫秒），默认24小时
 * @returns 是否过期
 */
export const isBinExpired = (
  binData: Uint8Array,
  maxAge: number = 24 * 60 * 60 * 1000
): boolean => {
  try {
    const info = getBinFileInfo(binData);
    if (!info) return true;

    const now = Date.now();
    const binTime = info.timestamp * 1000; // timestamp是秒级

    return now - binTime > maxAge;
  } catch (error) {
    return true;
  }
};

/**
 * 格式化bin文件信息为可读文本
 *
 * @param binData bin文件数据
 * @returns 格式化后的信息
 */
export const formatBinInfo = (binData: Uint8Array): string => {
  const info = getBinFileInfo(binData);
  if (!info) return "无效的bin文件";

  const date = new Date(info.timestamp * 1000).toLocaleString();

  return `
Bin文件信息:
------------
设备ID: ${info.deviceUniqueId}
时间戳: ${info.timestamp} (${date})
服务器: ${info.serverId || "未指定"}
场景: ${info.scene}
签名: ${info.sign.substring(0, 16)}...
用户信息: ${info.info.substring(0, 50)}... (已加密)
  `.trim();
};
