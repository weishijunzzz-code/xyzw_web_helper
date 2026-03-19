/**
 * 参考文件格式 (BON+JSON+BON混合格式) 的编码和解码
 * 参考文件结构:
 * 1. X加密头部 (4字节)
 * 2. BON编码前缀 (包含platform, platformExt, info字段)
 * 3. JSON数据 (包含sign, timestamp)
 * 4. BON编码尾部 (包含serverId, scene, referrerInfo, deviceUniqueId)
 */

import { g_utils, bon } from './bonProtocol';

// X加密函数
const xEncrypt = (data: Uint8Array): Uint8Array => {
  const rnd = ~~(Math.random() * 0xffffffff) >>> 0;
  const r = 2 + ~~(Math.random() * 248);
  const result = new Uint8Array(data.length + 4);

  // 随机前缀
  result[0] = rnd & 0xff;
  result[1] = (rnd >>> 8) & 0xff;
  result[2] = (rnd >>> 16) & 0xff;
  result[3] = (rnd >>> 24) & 0xff;

  // 复制数据
  result.set(data, 4);

  // XOR加密
  for (let i = result.length; --i >= 4; ) {
    result[i] ^= r;
  }

  // 写入标识和混淆位
  result[0] = 112; // 'p'
  result[1] = 120; // 'x'
  result[2] =
    (result[2] & 0b10101010) |
    (((r >> 7) & 1) << 6) |
    (((r >> 6) & 1) << 4) |
    (((r >> 5) & 1) << 2) |
    ((r >> 4) & 1);
  result[3] =
    (result[3] & 0b10101010) |
    (((r >> 3) & 1) << 6) |
    (((r >> 2) & 1) << 4) |
    (((r >> 1) & 1) << 2) |
    (r & 1);

  return result;
};

// X解密函数
const xDecrypt = (data: Uint8Array): Uint8Array => {
  const t =
    (((data[2] >> 6) & 1) << 7) |
    (((data[2] >> 4) & 1) << 6) |
    (((data[2] >> 2) & 1) << 5) |
    ((data[2] & 1) << 4) |
    (((data[3] >> 6) & 1) << 3) |
    (((data[3] >> 4) & 1) << 2) |
    (((data[3] >> 2) & 1) << 1) |
    (data[3] & 1);

  const result = new Uint8Array(data.length);
  result.set(data);

  for (let i = result.length; --i >= 4; ) {
    result[i] ^= t;
  }

  return result.subarray(4);
};

// MD5哈希函数
const md5 = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 构建BON编码的字段
const buildBonField = (name: string, value: any): Uint8Array => {
  const writer: number[] = [];
  const encoder = new TextEncoder();

  // 字段名 (0x05 + 长度 + 字符串)
  const nameBytes = encoder.encode(name);
  writer.push(0x05, nameBytes.length);
  writer.push(...nameBytes);

  // 字段值
  if (value === null) {
    writer.push(0x00); // NULL
  } else if (typeof value === 'number') {
    writer.push(0x01); // int32
    writer.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
  } else if (typeof value === 'string') {
    const strBytes = encoder.encode(value);
    writer.push(0x05, strBytes.length); // string
    writer.push(...strBytes);
  }

  return new Uint8Array(writer);
};

// 构建BON前缀
const buildBonPrefix = (platform: string, platformExt: string, info: string): Uint8Array => {
  const writer: number[] = [];
  const encoder = new TextEncoder();

  // BON对象开始标记 (0x08 + 字段数量)
  writer.push(0x08, 0x03); // 3个字段

  // platform
  const platformBytes = encoder.encode('platform');
  writer.push(0x05, platformBytes.length);
  writer.push(...platformBytes);
  const platformValueBytes = encoder.encode(platform);
  writer.push(0x05, platformValueBytes.length);
  writer.push(...platformValueBytes);

  // platformExt
  const platformExtBytes = encoder.encode('platformExt');
  writer.push(0x05, platformExtBytes.length);
  writer.push(...platformExtBytes);
  const platformExtValueBytes = encoder.encode(platformExt);
  writer.push(0x05, platformExtValueBytes.length);
  writer.push(...platformExtValueBytes);

  // info
  const infoNameBytes = encoder.encode('info');
  writer.push(0x05, infoNameBytes.length);
  writer.push(...infoNameBytes);
  const infoValueBytes = encoder.encode(info);
  writer.push(0x05, infoValueBytes.length);
  writer.push(...infoValueBytes);

  return new Uint8Array(writer);
};

// 构建BON尾部
const buildBonTail = (serverId: null, scene: number, referrerInfo: string, deviceUniqueId: string): Uint8Array => {
  const writer: number[] = [];
  const encoder = new TextEncoder();

  // serverId (NULL)
  const serverIdBytes = encoder.encode('serverId');
  writer.push(0x05, serverIdBytes.length);
  writer.push(...serverIdBytes);
  writer.push(0x00); // NULL

  // scene (int32)
  const sceneBytes = encoder.encode('scene');
  writer.push(0x05, sceneBytes.length);
  writer.push(...sceneBytes);
  writer.push(0x01, scene & 0xff, (scene >> 8) & 0xff, (scene >> 16) & 0xff, (scene >> 24) & 0xff);

  // referrerInfo (string)
  const referrerBytes = encoder.encode('referrerInfo');
  writer.push(0x05, referrerBytes.length);
  writer.push(...referrerBytes);
  const referrerValueBytes = encoder.encode(referrerInfo);
  writer.push(0x05, referrerValueBytes.length);
  writer.push(...referrerValueBytes);

  // deviceUniqueId (string)
  const deviceIdBytes = encoder.encode('deviceUniqueId');
  writer.push(0x05, deviceIdBytes.length);
  writer.push(...deviceIdBytes);
  const deviceIdValueBytes = encoder.encode(deviceUniqueId);
  writer.push(0x05, deviceIdValueBytes.length);
  writer.push(...deviceIdValueBytes);

  return new Uint8Array(writer);
};

// 用户数据接口
export interface UserData {
  uid: number;
  name: string;
  token: string;
  openid?: string;
  unionid?: string;
  avatar?: string;
  sessId: number;
  connId: number;
  isRestore?: number;
}

// 生成参考文件格式的bin文件
export const generateRefBin = async (userData: UserData): Promise<Uint8Array> => {
  // 步骤1: 加密用户数据生成info字段
  const userDataJson = JSON.stringify(userData);
  const userDataBytes = new TextEncoder().encode(userDataJson);

  // 使用X加密用户数据
  const encryptedInfo = xEncrypt(userDataBytes);

  // 转为Base64
  const infoBase64 = btoa(String.fromCharCode(...encryptedInfo));

  // 步骤2: 生成sign和timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const signText = `${infoBase64}${timestamp}`;
  const sign = await md5(signText);

  // 步骤3: 构建JSON部分
  const jsonObj = {
    info: infoBase64,
    sign: sign,
    timestamp: timestamp,
  };
  const jsonStr = JSON.stringify(jsonObj);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 步骤4: 生成设备ID
  const deviceUniqueId = `DID-${crypto.randomUUID()}`;

  // 步骤5: 构建BON前缀
  const bonPrefix = buildBonPrefix('hortor', 'mix', infoBase64);

  // 步骤6: 构建BON尾部
  const bonTail = buildBonTail(null, 0, '', deviceUniqueId);

  // 步骤7: 组合所有部分
  const combined = new Uint8Array(bonPrefix.length + jsonBytes.length + bonTail.length);
  combined.set(bonPrefix, 0);
  combined.set(jsonBytes, bonPrefix.length);
  combined.set(bonTail, bonPrefix.length + jsonBytes.length);

  // 步骤8: 整体X加密
  const encrypted = xEncrypt(combined);

  return encrypted;
};

// 解析参考文件格式的bin文件
export interface ParsedRefBin {
  platform: string;
  platformExt: string;
  info: string;
  sign: string;
  timestamp: number;
  serverId: null;
  scene: number;
  referrerInfo: string;
  deviceUniqueId: string;
  userData?: UserData;
}

export const parseRefBin = (binData: Uint8Array | ArrayBuffer): ParsedRefBin => {
  const data = binData instanceof ArrayBuffer ? new Uint8Array(binData) : binData;

  // 步骤1: X解密
  const decrypted = xDecrypt(data);

  // 步骤2: 查找JSON开始位置
  let jsonStart = -1;
  for (let i = 0; i < decrypted.length - 10; i++) {
    if (decrypted[i] === 0x7b && decrypted[i + 1] === 0x22) { // {""
      jsonStart = i;
      break;
    }
  }

  if (jsonStart === -1) {
    throw new Error('无法找到JSON开始位置');
  }

  // 步骤3: 查找JSON结束位置
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < decrypted.length; i++) {
    if (decrypted[i] === 0x7b) depth++;
    else if (decrypted[i] === 0x7d) {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  if (jsonEnd === -1) {
    throw new Error('无法找到JSON结束位置');
  }

  // 步骤4: 提取并解析JSON
  const jsonBytes = decrypted.slice(jsonStart, jsonEnd);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const jsonObj = JSON.parse(jsonStr);

  // 步骤5: 解析BON前缀 (提取platform, platformExt, info)
  const prefixBytes = decrypted.slice(0, jsonStart);
  const platform = 'hortor';
  const platformExt = 'mix';
  const info = jsonObj.info;

  // 步骤6: 解析BON尾部
  const tailBytes = decrypted.slice(jsonEnd);
  let serverId: null = null;
  let scene = 0;
  let referrerInfo = '';
  let deviceUniqueId = '';

  // 简单解析BON尾部
  const decoder = new TextDecoder();
  for (let i = 0; i < tailBytes.length - 2; ) {
    if (tailBytes[i] === 0x05) {
      const nameLen = tailBytes[i + 1];
      if (i + 2 + nameLen > tailBytes.length) break;

      const fieldName = decoder.decode(tailBytes.slice(i + 2, i + 2 + nameLen));
      i += 2 + nameLen;

      if (i >= tailBytes.length) break;

      const typeMarker = tailBytes[i];
      i++;

      switch (fieldName) {
        case 'serverId':
          if (typeMarker === 0x00) serverId = null;
          break;
        case 'scene':
          if (typeMarker === 0x01 && i + 4 <= tailBytes.length) {
            scene = tailBytes[i] | (tailBytes[i + 1] << 8) | (tailBytes[i + 2] << 16) | (tailBytes[i + 3] << 24);
            i += 4;
          }
          break;
        case 'referrerInfo':
          if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            if (i + strLen <= tailBytes.length) {
              referrerInfo = decoder.decode(tailBytes.slice(i, i + strLen));
              i += strLen;
            }
          }
          break;
        case 'deviceUniqueId':
          if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            if (i + strLen <= tailBytes.length) {
              deviceUniqueId = decoder.decode(tailBytes.slice(i, i + strLen));
              i += strLen;
            }
          }
          break;
        default:
          // 跳过未知字段
          if (typeMarker === 0x00) {
            // NULL
          } else if (typeMarker === 0x01 && i + 4 <= tailBytes.length) {
            i += 4;
          } else if (typeMarker === 0x05 && i < tailBytes.length) {
            const strLen = tailBytes[i];
            i++;
            i += strLen;
          }
          break;
      }
    } else {
      i++;
    }
  }

  // 步骤7: 解密info字段获取用户数据
  let parsedUserData: UserData | undefined;
  try {
    const infoBytes = Uint8Array.from(atob(info), c => c.charCodeAt(0));
    const decryptedInfo = xDecrypt(infoBytes);
    const userDataJson = new TextDecoder().decode(decryptedInfo);
    parsedUserData = JSON.parse(userDataJson);
  } catch (e) {
    console.warn('无法解密info字段:', e);
  }

  return {
    platform,
    platformExt,
    info,
    sign: jsonObj.sign,
    timestamp: jsonObj.timestamp,
    serverId,
    scene,
    referrerInfo,
    deviceUniqueId,
    userData: parsedUserData,
  };
};

// 验证生成的bin文件
export const validateRefBin = (binData: Uint8Array | ArrayBuffer): { valid: boolean; message?: string } => {
  try {
    const parsed = parseRefBin(binData);

    // 验证必要字段
    if (!parsed.info) {
      return { valid: false, message: '缺少info字段' };
    }
    if (!parsed.sign) {
      return { valid: false, message: '缺少sign字段' };
    }
    if (!parsed.timestamp) {
      return { valid: false, message: '缺少timestamp字段' };
    }

    // 验证info是否可以解密
    if (!parsed.userData) {
      return { valid: false, message: '无法解密info字段' };
    }

    // 验证用户数据必要字段
    const userData = parsed.userData;
    if (!userData.uid) {
      return { valid: false, message: '用户数据缺少uid' };
    }
    if (!userData.token) {
      return { valid: false, message: '用户数据缺少token' };
    }

    return { valid: true };
  } catch (e: any) {
    return { valid: false, message: `验证失败: ${e.message}` };
  }
};

export default {
  generateRefBin,
  parseRefBin,
  validateRefBin,
};
