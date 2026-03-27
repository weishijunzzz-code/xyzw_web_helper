import axios from "axios";
import { MD5, lib, enc } from "crypto-js";
import { g_utils } from "@/utils/bonProtocol";
import { nativeHttp, isNativePlatform } from "./capacitor";
import BinaryHttp from "./binaryHttp";

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

export const scheduleAuthUserRequest = <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  return authUserRateLimiter.schedule(fn);
};

export const transformToken = async (arrayBuffer: ArrayBuffer) => {
  return authUserRateLimiter.schedule(async () => {
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
      });
      responseData = res.data;
    }

    const msg = g_utils.parse(responseData);
    const data = msg.getData();
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

  if (isNativePlatform()) {
    // 移动端使用自定义插件发送请求
    console.log("[getServerList] Mobile request using BinaryHttp plugin, length=" + arrayBuffer.byteLength);
    
    try {
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
      
      console.log("[getServerList] BinaryHttp status=" + response.status);
      
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
      
      console.log("[getServerList] BinaryHttp response length:", responseData.byteLength);
      
      // 检查数据前10个字节
      if (responseData && responseData.byteLength > 0) {
        const u8 = new Uint8Array(responseData);
        const bytes = Array.from(u8.slice(0, 10));
        console.log("[getServerList] Bytes=" + JSON.stringify(bytes));
        console.log("[getServerList] Chars=" + String.fromCharCode(u8[0], u8[1]));
      }
    } catch (httpError: any) {
      console.error("[getServerList] BinaryHttp failed: " + httpError.message);
      throw new Error("HTTP: " + httpError.message);
    }
  } else {
    // 网页端使用 axios
    console.log("[getServerList] Using axios for web");
    const res = await axios.post(url, arrayBuffer, {
      headers,
      responseType: "arraybuffer",
      timeout: 30000,
    });
    responseData = res.data;
    console.log("[getServerList] Axios response length:", responseData.byteLength);
    const u8 = new Uint8Array(responseData);
    console.log("[getServerList] Axios response first 10 bytes:", Array.from(u8.slice(0, 10)));
  }

  try {
    console.log("[getServerList] Parsing response data...");
    console.log("[getServerList] Creating Uint8Array from response...");
    const u8Response = new Uint8Array(responseData);
    console.log("[getServerList] Uint8Array length:", u8Response.length);
    console.log("[getServerList] First 4 bytes:", u8Response[0], u8Response[1], u8Response[2], u8Response[3]);
    
    // 检查是否是 'px' 加密格式
    if (u8Response.length > 4 && u8Response[0] === 112 && u8Response[1] === 120) {
      console.log("[getServerList] Detected 'px' encryption format");
    } else {
      console.log("[getServerList] Unknown encryption format, expected 'px' (112, 120)");
    }
    
    const msg = g_utils.parse(responseData);
    console.log("[getServerList] Parsed msg:", msg);
    console.log("[getServerList] msg._raw:", msg._raw);
    console.log("[getServerList] msg.body:", msg.body);
    
    const data = msg.getData();
    console.log("[getServerList] 数据内容:", data);
    return JSON.stringify({
      ...data.roles,
    });
  } catch (parseError: any) {
    console.error("[getServerList] 解析响应数据失败:", parseError);
    console.error("[getServerList] 解析错误详情:", parseError.message);
    console.error("[getServerList] 解析错误堆栈:", parseError.stack);
    throw new Error(`解析服务器列表失败: ${parseError.message}`);
  }
};
