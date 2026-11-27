import axios from "axios";
import { enc, lib, MD5 } from "crypto-js";
import { g_utils } from "@/utils/bonProtocol";
import { getAuthUserData } from "@/utils/tokenLogin.js";
import { throwIfAborted } from "./abortSignal.js";
import { nativeHttp, isNativePlatform } from "./capacitor";
import BinaryHttp from "./binaryHttp";

/**
 * Derive the existing storage identity from the exact credential bytes.
 * @param {string|ArrayBuffer|Uint8Array} token Credential data used by the token store.
 * @returns {string} Hexadecimal digest used as the stable local token key.
 */
export const getTokenId = (token: string | ArrayBuffer | Uint8Array) => {
  const binHash = MD5(lib.WordArray.create(token)).toString(enc.Hex);
  return binHash;
};

type WaitCallback = (waitTimeMs: number, queueSize: number) => void;

class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private requests: number[] = [];
  private queueSize: number = 0;
  private onWaitCallback: WaitCallback | null = null;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  onWait(callback: WaitCallback): void {
    this.onWaitCallback = callback;
  }

  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((time) => time > cutoff);
  }

  private async waitForSlot(): Promise<void> {
    this.cleanOldRequests();

    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return;
    }

    const oldestRequest = this.requests[0];
    const waitTime = oldestRequest + this.windowMs - Date.now();

    if (waitTime > 0) {
      // 每秒更新一次剩余时间
      const updateInterval = 1000;
      const totalWaitTime = waitTime + 100;
      const startTime = Date.now();

      const updateCallback = () => {
        if (this.onWaitCallback) {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, totalWaitTime - elapsed);
          this.onWaitCallback(remaining, this.queueSize);
        }
      };

      // 初始通知
      updateCallback();

      // 设置定时更新
      const intervalId = setInterval(updateCallback, updateInterval);

      try {
        await new Promise((resolve) => setTimeout(resolve, totalWaitTime));
      } finally {
        clearInterval(intervalId);
      }
    }

    return this.waitForSlot();
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.queueSize++;
    try {
      await this.waitForSlot();
      return fn();
    } finally {
      this.queueSize--;
    }
  }
}

const authUserRateLimiter = new RateLimiter(25, 60000);

export const setAuthUserRateLimiterCallback = (
  callback: WaitCallback,
): void => {
  authUserRateLimiter.onWait(callback);
};

/**
 * Schedule a login operation within the shared authentication rate window.
 * @template T
 * @param {Function} fn Asynchronous login operation.
 * @returns {Promise<T>} Resolves with the operation result, or rejects with its error.
 */
export const scheduleAuthUserRequest = <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  return authUserRateLimiter.schedule(fn);
};

/**
 * Exchange credential bytes through the shared login limiter and create session metadata.
 * @param {ArrayBuffer} arrayBuffer Imported credential bytes.
 * @param {object} options Optional cancellation of the authentication request.
 * @param {AbortSignal} [options.signal] Cancels file authentication.
 * @returns {Promise<string>} Serialized role token for the WebSocket connection.
 */
export const transformToken = async (
  arrayBuffer: ArrayBuffer,
  { signal }: { signal?: AbortSignal } = {},
) => {
  return authUserRateLimiter.schedule(async () => {
    throwIfAborted(signal);
    const url = "https://xxz-xyzw.hortorgames.com/login/authuser?_seq=1";
    const headers = {
      "Content-Type": "application/octet-stream",
      "Referer": "https://xxz-xyzw.hortorgames.com/",
    };

    let responseData: ArrayBuffer;

    if (isNativePlatform()) {
      // 移动端使用自定义插件发送请求
      console.log("[transformToken] Mobile request using BinaryHttp plugin, length=" + arrayBuffer.byteLength);
      
      // 将 ArrayBuffer 转换为 base64
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binaryString);
      
      const response = await BinaryHttp.post({
        url,
        data: base64Data,
        headers,
      });
      
      if (response.status !== 200) {
        throw new Error("HTTP " + response.status);
      }
      
      // 将 base64 响应解码为 ArrayBuffer
      const responseBinaryString = atob(response.data);
      const responseUint8Array = new Uint8Array(responseBinaryString.length);
      for (let i = 0; i < responseBinaryString.length; i++) {
        responseUint8Array[i] = responseBinaryString.charCodeAt(i);
      }
      responseData = responseUint8Array.buffer;
    } else {
      // 网页端使用 axios
      const res = await axios.post(url, arrayBuffer, {
        headers,
        responseType: "arraybuffer",
        timeout: 30000,
        signal,
      });
      responseData = res.data;
    }

    throwIfAborted(signal);
    const msg = g_utils.parse(responseData);
    const data = getAuthUserData(msg);
    const currentTime = Date.now();
    const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
    const connId = currentTime + Math.floor(Math.random() * 10);

    return JSON.stringify({
      ...data,
      sessId,
      connId,
      isRestore: 0,
    });
  });
};

export const getServerList = async (arrayBuffer: ArrayBuffer) => {
  const url = "https://xxz-xyzw.hortorgames.com/login/serverlist?_seq=3";
  const headers = {
    "Content-Type": "application/octet-stream",
    "Referer": "https://xxz-xyzw.hortorgames.com/",
  };

  let responseData: ArrayBuffer;
  let status: number;
  try {
    if (isNativePlatform()) {
      let bytes = "";
      for (const byte of new Uint8Array(arrayBuffer)) {
        bytes += String.fromCharCode(byte);
      }
      const response = await BinaryHttp.post({ url, data: btoa(bytes), headers });
      status = response.status;
      responseData = status === 200
        ? Uint8Array.from(atob(response.data), (character) => character.charCodeAt(0)).buffer
        : new ArrayBuffer(0);
    } else {
      const response = await axios.post<ArrayBuffer>(url, arrayBuffer, {
        headers,
        responseType: "arraybuffer",
        timeout: 30000,
        validateStatus: () => true,
      });
      status = response.status;
      responseData = response.data;
    }
  } catch {
    throw new Error("无法请求角色列表，请检查网络后重新选择文件");
  }

  if (status === 429) throw new Error("查询过于频繁，请稍后重试（HTTP 429）");
  if (status !== 200) throw new Error(`角色列表请求失败，请稍后重试（HTTP ${status}）`);

  let roles: unknown;
  const messageFormatError = "角色列表响应无法读取，请稍后重试";
  let message;
  try {
    message = g_utils.parse(responseData);
  } catch {
    throw new Error(messageFormatError);
  }
  if (message.code || message.error) {
    const code = message.code ? `（错误码：${message.code}）` : "";
    throw new Error(`服务端拒绝读取角色列表，请检查 BIN 是否有效${code}`);
  }
  try {
    roles = message.getData()?.roles;
  } catch {
    throw new Error(messageFormatError);
  }
  if (!roles || typeof roles !== "object") throw new Error(messageFormatError);
  return JSON.stringify({ ...roles });
};
