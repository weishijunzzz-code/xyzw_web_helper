/**
 * 游戏加密算法
 * 从wxqrcode.vue中提取的加密/解密逻辑
 */

// 加密表 - 必须与游戏客户端一致
const CIPHER_TABLE =
  "BYLWeIPgSMOI2VsgfNGDHSilLpVgxgzIjqMiW0bJqX2HafZDOWZOcJyLTMSn66O6s86nnbXY0BWsEcDsINuxmPlwjx8nAsqKysGnWhwrceWZ8QPZNXPcj21uRFo3QvHrzBh4mb4ug426VRYoqERUWNOv7Xov7qBqfkZA7AnHQsWw4ABzX5e4vLOWzYhsQVHpoOE48lQivLYyxqvszdrxMCuFNNHu0eAE5i3tQlMtnciAsuyRnPUxIcGLb47GV6L9Vhu1vDpICktscWatrZlx3eypnNlWA4K8TU7sia19xAeN2yl7Y2H1LvrdWfrOES0QPB5XidvTJs6mvk0eC94jPr5WhG3AQZu649O5PY2XhToswKN5OhKxHELeFcgkPHy7ZqdEbG8tgJBIbVFf7E3MHzAkVauOvqeXA2qJpQHnZi9RQzJPlXkGKOllalIBlJXhVdUVBIEQ8z2qBTz0DZRah1CcdCAIvY5rSsK6pkDYPfeuwF2jN4zYxp0W2bVIY6RHCTYRLL2iyG6tmCnZwuQrucHbYa0hyADhBu1y8eYldlj3Biv6qbXjSpxRAv59qTQDqgtyNRgWw3VnbFkzyutdjFcToJjpYu2P59ASngIIMb0Z9P8E4SdFQcPtD3XdvFO3HrlOzHIX2ivxkonGrHz8EmnqDOVGjxixSQzgX6dM1fU2jxciZ9o6C0FjETnZrzvB5wdby1oaQLXTzc0G1tTPnIEdHamdj1kJM3mkFDvlMYGrQZZzVE6ALELT0aEkPOeL5Op6AStjjwxEPGG3dHqKQzL5ItJrZipYk8Kb8lIqJ7gVKPeAc1EtmQTGNSHV4DvySDQMiGPNzrPleg8qKOv66fwlD9Dt1DuiTL0OpotakaN0lntPPb09yBTMZpyonJ8cHTpyUmAXi0MytClcOm2cT9VkpsYBeW4ULOyZbN5m4OIii9rNDFFsOsZzBHzDtGdXEi2bje2gDOAtStYqAfHVD8S8WIEi5UsiROVje6lwaJ3BSilgSY3A2BtR7tSuqei22UX6fCDWzi7DkYdepE2NlCji9FR0YQCFZ9JXpSY2BCKayNslEYKX4sAgedoRpKihSTGL8PeTOkYRofOI7MnWJ770m0PmzEewNigjrPloxmJyjiLG53zQbck4kwhUS4l0YmME77hLen7NFayWweAAWHdwOCf0atzW9U9AgUzRM2eptP4nGTmCsGnocULKy7X6CqIj9uD0yi6sirebNN3O1C2NXkVS17gPTUDtLHVO9ddejoglg6H2P8L0pZtzurpRI9yudDFXyPVSYr7fF7114n4R69g1zwGCFzVvzuH7N4ArzJcgjkQOJywJfeWWD6oIIqlx55sSV4nKGsIWr6UNmjFIC5ZFG3hCUoRgO7AiIZOP22B2JjStsWJU5y7eOMyA4Km82ivotGGL4iQqJyhs03dOh5s9mbPjISLvRJhDfaVtZ5HMhoMBnOfZNw13eRqiNCcTchxvUpVd6vpMf9SNOiYuiJvkGOujw9jVjVXLn8RSo3eq0ZyGdNXbggVEqkWMV4xkGc2KLQPkTIWUgzUCFz3RzkNaLfPChW0ZSw7yeqIeZ1XvEZ3f2O1Q4ztXqrufoqKv7KVVEf2T5MkD2fqVVGBjizxP5kK5Tn6lNR3y1L44cCHOBmDaxT9mpK8BGmxp9Pw7vqIG4Gz7JRn4eG1w7e5w9rJprXsO5WLEM6JYWTThlv6N4FlyJsBSiKgzTyOuPlAlu6Nz8dCnLdyyHe52Ta6PLzPOcFn0gk5Hk30nymrV25NSFiUfo1gEseT4D4RjQfxHJUSgIx3vbcJcgUpLn3joK1K1PwBH5PqhAbS7r4TN6DHpE7dMbkeH876FSWJEG9nZ3s3Gelg0UNG7Y8fb16PZQaP5b38tJGZxVUkUkL2KM6bQUBmNGs8h6J9wUxLWIThPhOv4w0wuiwZBcwrBn4SdwXkafE0wX5GF5vnjuhTl3TL3QGnc5GxdWCctHp1LdImc9mHMVAV";

const XOR_SHIFT = 1;
const SHUFFLE_TIMES = 6;
const STEP = 3;

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {string} - 加密后的base64字符串
 */
export function encryptGameData(text) {
  if (!text) return null;

  const base64Text = encodeBase64(text);
  if (CIPHER_TABLE) {
    const shuffled = transCode(CIPHER_TABLE, SHUFFLE_TIMES);
    const key = getCodeKey(shuffled, STEP);
    return dealWithString(base64Text, key, XOR_SHIFT);
  }
  return null;
}

/**
 * 解密文本
 * @param {string} cipherText - 加密后的文本
 * @returns {string} - 解密后的原文
 */
export function decryptGameData(cipherText) {
  if (!cipherText) return null;

  const mid = atob(cipherText);
  const shuffled = transCode(CIPHER_TABLE, SHUFFLE_TIMES);
  const key = getCodeKey(shuffled, STEP);
  const base64Text = dealWithString(mid, key, XOR_SHIFT);
  return decodeURIComponent(escape(atob(base64Text)));
}

/**
 * Base64编码（支持Unicode）
 */
function encodeBase64(text) {
  if (!text) return null;
  return btoa(unescape(encodeURIComponent(text)));
}

/**
 * 递归打乱字符串
 */
function transCode(str, times) {
  if (times <= 0) return str;
  // 如果长度为奇数，直接返回原字符串（不进行分割）
  if (str.length % 2 !== 0) return str;

  const right = rightSide(str);
  const left = leftSide(str);
  // 如果分割失败，返回原字符串
  if (!right || !left) return str;
  return transCode(right, times - 1) + transCode(left, times - 1);
}

/**
 * 获取右半部分
 */
function rightSide(str) {
  if (str.length % 2 !== 0) return null;
  return str.substring(Math.floor(str.length / 2));
}

/**
 * 获取左半部分
 */
function leftSide(str) {
  if (str.length % 2 !== 0) return null;
  return str.substring(0, Math.floor(str.length / 2));
}

/**
 * 获取加密密钥
 */
function getCodeKey(str, step) {
  if (!str) return "";
  const chars = str.split("");
  const result = [];
  const count = Math.floor(str.length / step);
  for (let i = 0; i < count; i++) {
    result.push(chars[i * step]);
  }
  return result.join("");
}

/**
 * 处理字符串（XOR加密）
 */
function dealWithString(src, key, shift) {
  if (!src || !key) return null;

  const v = src.split("");
  const w = key.split("");
  const out = new Array(v.length);

  let idx = w.length >> shift;
  for (let i = 0; i < v.length; i++) {
    if (idx >= w.length) idx = 0;
    out[i] = String.fromCharCode(v[i].charCodeAt(0) ^ w[idx].charCodeAt(0));
    idx++;
  }
  return out.join("");
}

/**
 * 生成完整的加密bin文件
 * @param {Object} userData - 用户数据对象
 * @returns {Uint8Array} - 加密后的bin文件数据
 */
export function generateEncryptedBin(userData) {
  // 1. 将用户数据转为JSON
  const userDataJson = JSON.stringify(userData);

  // 2. 使用游戏加密算法加密
  const encryptedInfo = encryptGameData(userDataJson);

  // 3. 构建JSON内容
  const timestamp = Math.floor(Date.now() / 1000);
  const jsonContent = {
    info: encryptedInfo,
    timestamp: timestamp,
  };

  // 4. 转为JSON字符串
  const jsonStr = JSON.stringify(jsonContent);

  // 5. 编码为字节
  return new TextEncoder().encode(jsonStr);
}

export default {
  encryptGameData,
  decryptGameData,
  generateEncryptedBin,
};
