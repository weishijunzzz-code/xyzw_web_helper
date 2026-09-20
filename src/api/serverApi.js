/**
 * 云端后端 API 客户端
 * 移植自 code06 项目，适配增量共存模式：
 * - 401 不再跳转独立 /login 页，改为清除登录态并派发事件（CloudTasks 页监听后显示登录表单）
 * - baseURL 用相对路径 /api（开发走 vite 代理，生产由 Express 同源托管）
 */
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.dispatchEvent(new CustomEvent("cloud-auth-expired"));
    }
    return Promise.reject(err);
  },
);

export const authApi = {
  register: (username, password) =>
    api.post("/auth/register", { username, password }).then((r) => r.data),
  login: (username, password) =>
    api.post("/auth/login", { username, password }).then((r) => r.data),
  isLoggedIn: () => !!localStorage.getItem("auth_token"),
  saveAuth: (data) => {
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ userId: data.userId, username: data.username }),
    );
  },
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem("auth_user"));
    } catch {
      return null;
    }
  },
  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  },
};

export const tokenApi = {
  getAll: () => api.get("/token").then((r) => r.data),
  get: (id) => api.get(`/token/${id}`).then((r) => r.data),
  add: (data) => api.post("/token", data).then((r) => r.data),
  update: (id, data) => api.put(`/token/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/token/${id}`).then((r) => r.data),
  connect: (id) => api.post(`/token/${id}/connect`).then((r) => r.data),
  disconnect: (id) => api.post(`/token/${id}/disconnect`).then((r) => r.data),
  send: (id, cmd, params, timeout) =>
    api.post(`/token/${id}/send`, { cmd, params, timeout }).then((r) => r.data),
  importTokens: (tokens) =>
    api.post("/token/import", { tokens }).then((r) => r.data),
  uploadBin: (id, buffer) =>
    api
      .post(`/token/${id}/bin`, buffer, {
        headers: { "Content-Type": "application/octet-stream" },
      })
      .then((r) => r.data),
  getBin: (id) =>
    api
      .get(`/token/${id}/bin`, { responseType: "arraybuffer" })
      .then((r) => r.data),
};

export const taskApi = {
  connectAll: () => api.post("/task/connect-all").then((r) => r.data),
  disconnectAll: () => api.post("/task/disconnect-all").then((r) => r.data),
  batchSend: (tokenIds, cmd, params, timeout) =>
    api
      .post("/task/batch-send", { tokenIds, cmd, params, timeout })
      .then((r) => r.data),
  runDaily: (tokenId) => api.post(`/task/daily/${tokenId}`).then((r) => r.data),
};

export const statusApi = {
  getAll: () => api.get("/status").then((r) => r.data),
  get: (tokenId) => api.get(`/status/${tokenId}`).then((r) => r.data),
  getRoleInfo: (tokenId) =>
    api.get(`/status/${tokenId}/roleinfo`).then((r) => r.data),
};

export const scheduledTasksApi = {
  getAll: () => api.get("/scheduled-tasks").then((r) => r.data),
  create: (data) => api.post("/scheduled-tasks", data).then((r) => r.data),
  update: (id, data) =>
    api.put(`/scheduled-tasks/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/scheduled-tasks/${id}`).then((r) => r.data),
  run: (id) => api.post(`/scheduled-tasks/${id}/run`).then((r) => r.data),
};

export class ServerPushClient {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
    this.reconnectTimer = null;
    this.intentionalClose = false;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 30000;
  }

  connect() {
    this.intentionalClose = false;
    this.reconnectDelay = 3000;

    let wsUrl;
    if (API_BASE) {
      wsUrl = API_BASE.replace(/^http/, "ws") + "/ws";
    } else {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${proto}//${location.host}/ws`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.onMessage(msg);
      } catch (e) {
        console.warn("[ServerPush] 消息解析失败:", e);
      }
    };

    this.ws.onopen = () => {
      this.reconnectDelay = 3000;
    };

    this.ws.onclose = () => {
      if (this.intentionalClose) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(
        (this.reconnectDelay * 1.5) | 0,
        this.maxReconnectDelay,
      );
    };

    this.ws.onerror = (e) => {
      console.warn("[ServerPush] WebSocket 错误:", e);
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default api;
