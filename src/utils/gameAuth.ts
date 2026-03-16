/**
 * 游戏认证模块
 * 实现完整的登录流程，不依赖抓包生成bin文件
 */

import axios from "axios";
import { MD5, lib, enc } from "crypto-js";
import { g_utils } from "./bonProtocol";
import { encryptBinData } from "./pkcs12Crypto";

// 游戏服务器配置
const GAME_SERVERS = {
  auth: "https://xxz-xyzw.hortorgames.com",
  websocket: "wss://xxz-xyzw.hortorgames.com/ws",
};

/**
 * 登录凭证接口
 */
export interface LoginCredentials {
  uid: string | number;
  name: string;
  token: string;
  openid?: string;
  unionid?: string;
  avatar?: string;
  platform?: string;
  platformExt?: string;
}

/**
 * 认证响应接口
 */
export interface AuthResponse {
  roleId: number;
  roleToken: string;
  sessId: number;
  connId: number;
  isRestore: number;
  serverInfo?: any;
}

/**
 * 构建认证请求数据（bin文件格式）
 */
export const buildAuthRequest = (
  credentials: LoginCredentials,
  deviceUniqueId: string,
  usePkcs12: boolean = false,
  pkcs12Password: string = ""
): Uint8Array => {
  const timestamp = Math.floor(Date.now() / 1000);

  // 构建用户数据结构
  const userData = {
    uid: credentials.uid,
    name: credentials.name,
    token: credentials.token,
    openid: credentials.openid || "",
    unionid: credentials.unionid || "",
    avatar: credentials.avatar || "",
    platform: credentials.platform || "hortor",
    platformExt: credentials.platformExt || "mix",
  };

  let encryptedBase64: string;

  if (usePkcs12) {
    // 使用PKCS12加密
    const encrypted = encryptBinData(userData, pkcs12Password || "default_password");
    encryptedBase64 = encrypted.data;
  } else {
    // 使用简单的Base64编码（实际应该用游戏的加密方式）
    const jsonStr = JSON.stringify(userData);
    encryptedBase64 = btoa(jsonStr);
  }

  // 生成签名
  const signStr = `${encryptedBase64}${timestamp}`;
  const sign = MD5(signStr).toString(enc.Hex);

  // 构建JSON内容
  const jsonContent = {
    info: encryptedBase64,
    sign: sign,
    timestamp: timestamp,
  };

  const jsonStr = JSON.stringify(jsonContent);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 构建BON尾部
  const bonTail = buildBonTail(deviceUniqueId);

  // 合并
  const result = new Uint8Array(jsonBytes.length + bonTail.length);
  result.set(jsonBytes, 0);
  result.set(bonTail, jsonBytes.length);

  return result;
};

/**
 * 构建BON尾部
 */
const buildBonTail = (deviceUniqueId: string): Uint8Array => {
  const writer: number[] = [];

  // serverId（NULL值）
  writer.push(0x05, 0x08);
  writer.push(...new TextEncoder().encode("serverId"));
  writer.push(0x00);

  // scene（int32，值为0）
  writer.push(0x05, 0x05);
  writer.push(...new TextEncoder().encode("scene"));
  writer.push(0x01, 0x00, 0x00, 0x00, 0x00);

  // referrerInfo（空字符串）
  writer.push(0x05, 0x0c);
  writer.push(...new TextEncoder().encode("referrerInfo"));
  writer.push(0x05, 0x00);

  // deviceUniqueId（字符串）
  writer.push(0x05, 0x0e);
  writer.push(...new TextEncoder().encode("deviceUniqueId"));
  writer.push(0x05, deviceUniqueId.length);
  writer.push(...new TextEncoder().encode(deviceUniqueId));

  return new Uint8Array(writer);
};

/**
 * 发送认证请求获取会话信息
 */
export const authenticateUser = async (
  authData: Uint8Array
): Promise<AuthResponse> => {
  try {
    const response = await axios.post(
      `${GAME_SERVERS.auth}/login/authuser`,
      authData,
      {
        params: {
          _seq: 1,
        },
        headers: {
          "Content-Type": "application/octet-stream",
          Referer: "https://xxz-xyzw.hortorgames.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );

    // 解析响应
    const msg = g_utils.parse(response.data);
    const data = msg.getData();

    // 生成会话ID
    const currentTime = Date.now();
    const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
    const connId = currentTime + Math.floor(Math.random() * 10);

    return {
      roleId: data.uid || data.roleId,
      roleToken: data.token || data.roleToken,
      sessId,
      connId,
      isRestore: 0,
      serverInfo: data,
    };
  } catch (error) {
    console.error("认证请求失败:", error);
    throw new Error(`认证失败: ${error.message}`);
  }
};

/**
 * 获取服务器列表
 */
export const getServerList = async (authData: Uint8Array): Promise<any> => {
  try {
    const response = await axios.post(
      `${GAME_SERVERS.auth}/login/serverlist`,
      authData,
      {
        params: {
          _seq: 3,
        },
        headers: {
          "Content-Type": "application/octet-stream",
          Referer: "https://xxz-xyzw.hortorgames.com/",
        },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );

    const msg = g_utils.parse(response.data);
    const data = msg.getData();

    return data.roles || data;
  } catch (error) {
    console.error("获取服务器列表失败:", error);
    throw new Error(`获取服务器列表失败: ${error.message}`);
  }
};

/**
 * 完整的登录流程
 */
export const performGameLogin = async (
  credentials: LoginCredentials,
  options: {
    usePkcs12?: boolean;
    pkcs12Password?: string;
    deviceUniqueId?: string;
  } = {}
): Promise<{
  authResponse: AuthResponse;
  binFile: Uint8Array;
  tokenJson: string;
}> => {
  const {
    usePkcs12 = false,
    pkcs12Password = "",
    deviceUniqueId = `DID-${crypto.randomUUID()}`,
  } = options;

  // 1. 构建认证请求数据
  const authRequest = buildAuthRequest(
    credentials,
    deviceUniqueId,
    usePkcs12,
    pkcs12Password
  );

  // 2. 发送认证请求
  const authResponse = await authenticateUser(authRequest);

  // 3. 构建完整的token JSON
  const tokenJson = JSON.stringify({
    roleToken: authResponse.roleToken,
    roleId: authResponse.roleId,
    sessId: authResponse.sessId,
    connId: authResponse.connId,
    isRestore: authResponse.isRestore,
    ...authResponse.serverInfo,
  });

  return {
    authResponse,
    binFile: authRequest,
    tokenJson,
  };
};

/**
 * 验证bin文件是否有效
 */
export const validateBinFile = (binData: Uint8Array): {
  valid: boolean;
  jsonContent?: any;
  error?: string;
} => {
  try {
    // 查找JSON部分的结束位置（BON标记开始处）
    let jsonEndIndex = 0;
    for (let i = 0; i < binData.length - 1; i++) {
      // 查找BON标记 0x05 + 字段名长度
      if (binData[i] === 0x05 && binData[i + 1] === 0x08) {
        // 检查是否是serverId字段
        const fieldNameLen = binData[i + 1];
        if (i + 2 + fieldNameLen <= binData.length) {
          const fieldName = new TextDecoder().decode(
            binData.slice(i + 2, i + 2 + fieldNameLen)
          );
          if (fieldName === "serverId") {
            jsonEndIndex = i;
            break;
          }
        }
      }
    }

    if (jsonEndIndex === 0) {
      // 尝试直接解析整个数据为JSON
      const jsonStr = new TextDecoder().decode(binData);
      const jsonContent = JSON.parse(jsonStr);
      return { valid: true, jsonContent };
    }

    // 解析JSON部分
    const jsonBytes = binData.slice(0, jsonEndIndex);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const jsonContent = JSON.parse(jsonStr);

    // 验证必要字段
    if (!jsonContent.info || !jsonContent.sign || !jsonContent.timestamp) {
      return { valid: false, error: "缺少必要的字段(info/sign/timestamp)" };
    }

    return { valid: true, jsonContent };
  } catch (error) {
    return { valid: false, error: `解析失败: ${error.message}` };
  }
};

export default {
  buildAuthRequest,
  authenticateUser,
  getServerList,
  performGameLogin,
  validateBinFile,
};
