/**
 * 参考文件格式 (BON+JSON+BON混合格式) 的编码和解码
 * 支持两种格式:
 * 1. X加密 + info字段 (旧格式)
 * 2. LX加密 + encryptCombUser字段 (新格式)
 */

import { g_utils, bon } from './bonProtocol';

// X加密函数
const xEncrypt = (data: Uint8Array): Uint8Array => {
  const rnd = ~~(Math.random() * 0xffffffff) >>> 0;
  const r = 2 + ~~(Math.random() * 248);
  const result = new Uint8Array(data.length + 4);

  result[0] = rnd & 0xff;
  result[1] = (rnd >>> 8) & 0xff;
  result[2] = (rnd >>> 16) & 0xff;
  result[3] = (rnd >>> 24) & 0xff;

  result.set(data, 4);

  for (let i = result.length; --i >= 4; ) {
    result[i] ^= r;
  }

  result[0] = 112;
  result[1] = 120;
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

// LX加密函数
const lxEncrypt = (data: Uint8Array): Uint8Array => {
  const rnd = ~~(Math.random() * 0xffffffff) >>> 0;
  const r = 2 + ~~(Math.random() * 248);
  const result = new Uint8Array(data.length + 4);

  result[0] = rnd & 0xff;
  result[1] = (rnd >>> 8) & 0xff;
  result[2] = (rnd >>> 16) & 0xff;
  result[3] = (rnd >>> 24) & 0xff;

  result.set(data, 4);

  for (let i = result.length; --i >= 4; ) {
    result[i] ^= r;
  }

  result[0] = 112;
  result[1] = 108; // 'l'
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

// LX解密函数
const lxDecrypt = (data: Uint8Array): Uint8Array => {
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

  for (let n = Math.min(100, result.length); --n >= 2; ) {
    result[n] ^= t;
  }

  result[0] = 4;
  result[1] = 34;
  result[2] = 77;
  result[3] = 24;

  return result;
};

// 检测加密类型
const detectEncryption = (data: Uint8Array): 'x' | 'lx' | 'unknown' => {
  if (data[0] === 112 && data[1] === 120) return 'x';
  if (data[0] === 112 && data[1] === 108) return 'lx';
  return 'unknown';
};

// MD5哈希函数
const md5 = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 构建BON前缀
const buildBonPrefix = (platform: string, platformExt: string, info: string): Uint8Array => {
  const writer: number[] = [];
  const encoder = new TextEncoder();

  writer.push(0x08, 0x03);

  const platformBytes = encoder.encode('platform');
  writer.push(0x05, platformBytes.length);
  writer.push(...platformBytes);
  const platformValueBytes = encoder.encode(platform);
  writer.push(0x05, platformValueBytes.length);
  writer.push(...platformValueBytes);

  const platformExtBytes = encoder.encode('platformExt');
  writer.push(0x05, platformExtBytes.length);
  writer.push(...platformExtBytes);
  const platformExtValueBytes = encoder.encode(platformExt);
  writer.push(0x05, platformExtValueBytes.length);
  writer.push(...platformExtValueBytes);

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

  const serverIdBytes = encoder.encode('serverId');
  writer.push(0x05, serverIdBytes.length);
  writer.push(...serverIdBytes);
  writer.push(0x00);

  const sceneBytes = encoder.encode('scene');
  writer.push(0x05, sceneBytes.length);
  writer.push(...sceneBytes);
  writer.push(0x01, scene & 0xff, (scene >> 8) & 0xff, (scene >> 16) & 0xff, (scene >> 24) & 0xff);

  const referrerBytes = encoder.encode('referrerInfo');
  writer.push(0x05, referrerBytes.length);
  writer.push(...referrerBytes);
  const referrerValueBytes = encoder.encode(referrerInfo);
  writer.push(0x05, referrerValueBytes.length);
  writer.push(...referrerValueBytes);

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

// 生成参考文件格式的bin文件 (使用LX加密 + encryptCombUser字段)
export const generateRefBin = async (userData: UserData): Promise<Uint8Array> => {
  const userDataJson = JSON.stringify(userData);
  const userDataBytes = new TextEncoder().encode(userDataJson);

  const encryptedInfo = xEncrypt(userDataBytes);
  const infoBase64 = btoa(String.fromCharCode(...encryptedInfo));

  const timestamp = Math.floor(Date.now() / 1000);
  const signText = `${infoBase64}${timestamp}`;
  const sign = await md5(signText);

  const jsonObj = {
    encryptCombUser: infoBase64,
    sign: sign,
    timestamp: timestamp,
  };
  const jsonStr = JSON.stringify(jsonObj);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  const deviceUniqueId = `DID-${crypto.randomUUID()}`;

  const bonPrefix = buildBonPrefix('hortor', 'mix', infoBase64);
  const bonTail = buildBonTail(null, 0, '', deviceUniqueId);

  const combined = new Uint8Array(bonPrefix.length + jsonBytes.length + bonTail.length);
  combined.set(bonPrefix, 0);
  combined.set(jsonBytes, bonPrefix.length);
  combined.set(bonTail, bonPrefix.length + jsonBytes.length);

  const encrypted = lxEncrypt(combined);

  return encrypted;
};

// 解析参考文件格式的bin文件
export interface ParsedRefBin {
  encryption: 'x' | 'lx' | 'unknown';
  platform: string;
  platformExt: string;
  info: string;
  encryptCombUser?: string;
  sign: string;
  timestamp: number;
  serverId: null;
  scene: number;
  referrerInfo: string;
  deviceUniqueId: string;
  userData?: UserData;
  rawJson?: any;
}

export const parseRefBin = (binData: Uint8Array | ArrayBuffer): ParsedRefBin => {
  const data = binData instanceof ArrayBuffer ? new Uint8Array(binData) : binData;

  const encryption = detectEncryption(data);

  let decrypted: Uint8Array;
  if (encryption === 'lx') {
    decrypted = lxDecrypt(data);
  } else {
    decrypted = xDecrypt(data);
  }

  let jsonStart = -1;
  for (let i = 0; i < decrypted.length - 10; i++) {
    if (decrypted[i] === 0x7b && decrypted[i + 1] === 0x22) {
      jsonStart = i;
      break;
    }
  }

  if (jsonStart === -1) {
    throw new Error('无法找到JSON开始位置');
  }

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

  const jsonBytes = decrypted.slice(jsonStart, jsonEnd);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const jsonObj = JSON.parse(jsonStr);

  const platform = 'hortor';
  const platformExt = 'mix';

  const tailBytes = decrypted.slice(jsonEnd);
  let serverId: null = null;
  let scene = 0;
  let referrerInfo = '';
  let deviceUniqueId = '';

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
      }
    } else {
      i++;
    }
  }

  let parsedUserData: UserData | undefined;

  const infoField = jsonObj.encryptCombUser || jsonObj.info;
  if (infoField) {
    try {
      const infoBytes = Uint8Array.from(atob(infoField), c => c.charCodeAt(0));
      const decryptedInfo = xDecrypt(infoBytes);
      const userDataJson = new TextDecoder().decode(decryptedInfo);
      parsedUserData = JSON.parse(userDataJson);
    } catch (e) {
      console.warn('解密info字段失败:', e);
    }
  }

  return {
    encryption,
    platform,
    platformExt,
    info: jsonObj.info || '',
    encryptCombUser: jsonObj.encryptCombUser || '',
    sign: jsonObj.sign,
    timestamp: jsonObj.timestamp,
    serverId,
    scene,
    referrerInfo,
    deviceUniqueId,
    userData: parsedUserData,
    rawJson: jsonObj,
  };
};

// 验证生成的bin文件
export const validateRefBin = (binData: Uint8Array | ArrayBuffer): { valid: boolean; message?: string } => {
  try {
    const parsed = parseRefBin(binData);

    const infoField = parsed.encryptCombUser || parsed.info;
    if (!infoField) {
      return { valid: false, message: '缺少info字段' };
    }
    if (!parsed.sign) {
      return { valid: false, message: '缺少sign字段' };
    }
    if (!parsed.timestamp) {
      return { valid: false, message: '缺少timestamp字段' };
    }

    if (!parsed.userData) {
      return { valid: false, message: '无法解密info字段' };
    }

    const userData = parsed.userData;
    if (!userData.uid) {
      return { valid: false, message: '用户数据缺少uid' };
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
