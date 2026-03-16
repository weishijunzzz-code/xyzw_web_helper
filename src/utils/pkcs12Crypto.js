/**
 * PKCS12 加密实现 (JavaScript 版本)
 * 基于 Dart pkcs12.dart 的转换
 * 用于生成与抓包文件兼容的 bin 文件
 */

import CryptoJS from "crypto-js";

/**
 * 格式化 PKCS12 密码 (RFC 7292 Appendix B.1)
 * @param {string} password - 原始密码
 * @returns {Uint8Array} - 格式化后的密码
 */
export function formatPkcs12Password(password) {
  if (!password || password.length === 0) {
    return new Uint8Array(0);
  }

  // +1 for extra 2 pad bytes
  const bytes = new Uint8Array((password.length + 1) * 2);
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  for (let i = 0; i < password.length; i++) {
    bytes[i * 2] = passwordBytes[i] >>> 8;
    bytes[i * 2 + 1] = passwordBytes[i];
  }

  return bytes;
}

/**
 * 生成随机盐值
 * @param {number} length - 盐值长度（默认8字节）
 * @returns {Uint8Array} - 随机盐值
 */
export function generateSalt(length = 8) {
  const salt = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    salt[i] = Math.floor(Math.random() * 256);
  }
  return salt;
}

/**
 * PKCS12 密钥派生 (PBKDF)
 * @param {Uint8Array} password - 格式化后的密码
 * @param {Uint8Array} salt - 盐值
 * @param {number} iterations - 迭代次数
 * @param {number} keyLength - 密钥长度
 * @param {string} hashAlgorithm - 哈希算法（默认SHA1）
 * @returns {Uint8Array} - 派生密钥
 */
export function deriveKey(password, salt, iterations, keyLength, hashAlgorithm = "SHA-1") {
  // 使用 CryptoJS 的 PBKDF2
  const passwordWordArray = CryptoJS.lib.WordArray.create(password);
  const saltWordArray = CryptoJS.lib.WordArray.create(salt);

  const derivedKey = CryptoJS.PBKDF2(passwordWordArray, saltWordArray, {
    keySize: keyLength / 4, // WordArray 使用 32-bit words
    iterations: iterations,
    hasher: CryptoJS.algo.SHA1,
  });

  // 转换回 Uint8Array
  const keyHex = derivedKey.toString(CryptoJS.enc.Hex);
  const keyBytes = new Uint8Array(keyLength);
  for (let i = 0; i < keyLength; i++) {
    keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
  }

  return keyBytes;
}

/**
 * RC4 加密/解密
 * @param {Uint8Array} data - 要加密/解密的数据
 * @param {Uint8Array} key - 密钥
 * @returns {Uint8Array} - 加密/解密后的数据
 */
export function rc4Crypt(data, key) {
  // 使用 CryptoJS 的 RC4
  const dataWordArray = CryptoJS.lib.WordArray.create(data);
  const keyWordArray = CryptoJS.lib.WordArray.create(key);

  const encrypted = CryptoJS.RC4.encrypt(dataWordArray, keyWordArray);
  const encryptedHex = encrypted.toString();

  // 转换回 Uint8Array
  const result = new Uint8Array(encryptedHex.length / 2);
  for (let i = 0; i < encryptedHex.length; i += 2) {
    result[i / 2] = parseInt(encryptedHex.substr(i, 2), 16);
  }

  return result;
}

/**
 * 3DES 加密
 * @param {Uint8Array} data - 要加密的数据
 * @param {Uint8Array} key - 密钥（24字节）
 * @param {Uint8Array} iv - 初始化向量（8字节）
 * @returns {Uint8Array} - 加密后的数据
 */
export function encrypt3DES(data, key, iv) {
  // 使用 CryptoJS 的 TripleDES
  const dataWordArray = CryptoJS.lib.WordArray.create(data);
  const keyWordArray = CryptoJS.lib.WordArray.create(key);
  const ivWordArray = CryptoJS.lib.WordArray.create(iv);

  const encrypted = CryptoJS.TripleDES.encrypt(dataWordArray, keyWordArray, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const encryptedHex = encrypted.toString();
  const result = new Uint8Array(encryptedHex.length / 2);
  for (let i = 0; i < encryptedHex.length; i += 2) {
    result[i / 2] = parseInt(encryptedHex.substr(i, 2), 16);
  }

  return result;
}

/**
 * PKCS12 PBE 加密
 * @param {Uint8Array} data - 要加密的数据
 * @param {string} algorithm - 算法（PBE-SHA1-RC4-128, PBE-SHA1-3DES等）
 * @param {Uint8Array} password - 格式化后的密码
 * @param {Uint8Array} salt - 盐值
 * @param {number} iterations - 迭代次数
 * @returns {Uint8Array} - 加密后的数据
 */
export function pkcs12Encrypt(data, algorithm, password, salt, iterations) {
  let keyLength;
  let ivLength = 0;

  switch (algorithm) {
    case "PBE-SHA1-RC4-40":
      keyLength = 5;
      break;
    case "PBE-SHA1-RC4-128":
      keyLength = 16;
      break;
    case "PBE-SHA1-2DES":
      keyLength = 16;
      ivLength = 8;
      break;
    case "PBE-SHA1-3DES":
      keyLength = 24;
      ivLength = 8;
      break;
    default:
      throw new Error(`不支持的算法: ${algorithm}`);
  }

  // 派生密钥
  const derivedKey = deriveKey(password, salt, iterations, keyLength + ivLength);

  // 分离密钥和 IV
  const key = derivedKey.slice(0, keyLength);
  const iv = ivLength > 0 ? derivedKey.slice(keyLength, keyLength + ivLength) : null;

  // 加密
  switch (algorithm) {
    case "PBE-SHA1-RC4-40":
    case "PBE-SHA1-RC4-128":
      return rc4Crypt(data, key);
    case "PBE-SHA1-2DES":
    case "PBE-SHA1-3DES":
      return encrypt3DES(data, key, iv);
    default:
      throw new Error(`不支持的算法: ${algorithm}`);
  }
}

/**
 * 使用 PKCS12 算法加密 bin 数据
 * @param {Object} userData - 用户数据对象
 * @param {string} password - 加密密码
 * @param {string} algorithm - 加密算法（默认 PBE-SHA1-RC4-128）
 * @returns {Object} - 包含加密数据和参数的对象
 */
export function encryptBinData(userData, password, algorithm = "PBE-SHA1-RC4-128") {
  // 格式化密码
  const formattedPassword = formatPkcs12Password(password);

  // 生成盐值
  const salt = generateSalt(8);

  // 迭代次数
  const iterations = 2048;

  // 将用户数据转为 JSON 字符串
  const jsonData = JSON.stringify(userData);
  const dataBytes = new TextEncoder().encode(jsonData);

  // 加密数据
  const encryptedData = pkcs12Encrypt(dataBytes, algorithm, formattedPassword, salt, iterations);

  // 转为 base64
  const base64Data = btoa(String.fromCharCode(...encryptedData));

  return {
    data: base64Data,
    salt: Array.from(salt),
    iterations: iterations,
    algorithm: algorithm,
  };
}

/**
 * 生成完整的 bin 文件（使用 PKCS12 加密）
 * @param {Object} userData - 用户数据
 * @param {string} password - 加密密码
 * @param {string} deviceUniqueId - 设备唯一ID
 * @param {number} timestamp - 时间戳
 * @returns {Uint8Array} - bin 文件数据
 */
export function generateBinWithPkcs12(userData, password, deviceUniqueId, timestamp) {
  // 加密用户数据
  const encrypted = encryptBinData(userData, password);

  // 生成签名
  const signStr = `${encrypted.data}${timestamp}`;
  const sign = CryptoJS.MD5(signStr).toString();

  // 构建 JSON 内容
  const jsonContent = {
    info: encrypted.data,
    sign: sign,
    timestamp: timestamp,
  };

  const jsonStr = JSON.stringify(jsonContent);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 构建 BON 尾部
  const bonTail = buildBonTail(deviceUniqueId);

  // 合并
  const result = new Uint8Array(jsonBytes.length + bonTail.length);
  result.set(jsonBytes, 0);
  result.set(bonTail, jsonBytes.length);

  return result;
}

/**
 * 构建 BON 尾部
 * @param {string} deviceUniqueId - 设备唯一ID
 * @returns {Uint8Array} - BON 尾部数据
 */
function buildBonTail(deviceUniqueId) {
  const writer = [];

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
}
