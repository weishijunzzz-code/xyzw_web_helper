import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const request = axios.create({
  baseURL: API_BASE_URL + "/api/v1",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const clearAuthAndRedirect = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("gameRoles");
  if (window.location.pathname !== '/login' && window.location.pathname !== '/register' && window.location.pathname !== '/unauthorized') {
    window.location.href = "/login";
  }
};

const redirectToUnauthorized = () => {
  if (window.location.pathname === '/unauthorized') {
    return;
  }
  window.location.href = "/unauthorized";
};

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const data = error.response?.data;
    const requestUrl = originalRequest?.url || '';

    const isAuthCheckRequest = requestUrl.includes('/auth/check-authorization') ||
                                requestUrl.includes('/auth/me');

    if (status === 422 && data?.error === 'invalid_token') {
      if (!isAuthCheckRequest) {
        clearAuthAndRedirect();
      }
      return Promise.reject({
        success: false,
        message: data?.message || "登录凭证无效，请重新登录",
        unauthorized: true,
      });
    }

    const isStatusCheckRequest = requestUrl.includes('/auth/status');

    if (status === 404 && isStatusCheckRequest) {
      redirectToUnauthorized();
      return Promise.reject({
        success: false,
        message: data?.message || "用户不存在或授权已失效",
        notFound: true,
        shouldRedirect: true,
      });
    }

    if (status === 401 && !originalRequest._retry) {
      if (isAuthCheckRequest) {
        return Promise.reject({
          success: false,
          message: "请重新登录",
          unauthorized: true,
        });
      }

      originalRequest._retry = true;

      const refreshToken = localStorage.getItem("refreshToken");
      if (refreshToken) {
        try {
          const response = await axios.post(
            API_BASE_URL + "/api/v1/auth/refresh",
            {},
            {
              headers: {
                Authorization: `Bearer ${refreshToken}`,
              },
            }
          );

          const newAccessToken = response.data.data.accessToken;
          localStorage.setItem("accessToken", newAccessToken);

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return request(originalRequest);
        } catch (refreshError) {
          const refreshStatus = refreshError.response?.status;
          const refreshData = refreshError.response?.data;

          if (refreshStatus === 403 && refreshData?.forbidden === true) {
            redirectToUnauthorized();
          } else {
            clearAuthAndRedirect();
          }
          return Promise.reject(refreshError);
        }
      } else {
        clearAuthAndRedirect();
      }
    }

    if (error.response) {
      switch (status) {
        case 401:
          return Promise.reject({
            success: false,
            message: data?.message || "登录已过期，请重新登录",
            unauthorized: true,
          });
        case 403:
          if (data?.forbidden === true) {
            redirectToUnauthorized();
            return Promise.reject({
              success: false,
              message: data?.message || "账户已被禁用或授权已过期",
              forbidden: true,
            });
          }
          return Promise.reject({
            success: false,
            message: data?.message || "没有权限访问",
            forbidden: true,
          });
        case 404:
          if (data?.forbidden === true || data?.message?.includes('用户不存在')) {
            redirectToUnauthorized();
            return Promise.reject({
              success: false,
              message: data?.message || "用户不存在或授权已失效",
              notFound: true,
              shouldRedirect: true,
            });
          }
          return Promise.reject({
            success: false,
            message: data?.message || "请求的资源不存在",
            notFound: true,
          });
        case 422:
          return Promise.reject({
            success: false,
            message: data?.message || "请求参数错误",
          });
        case 500:
          return Promise.reject({
            success: false,
            message: data?.message || "服务器内部错误",
          });
        default:
          return Promise.reject({
            success: false,
            message: data?.message || "请求失败",
          });
      }
    } else if (error.request) {
      return Promise.reject({
        success: false,
        message: "网络连接失败，请检查网络",
      });
    } else {
      return Promise.reject({
        success: false,
        message: error.message || "未知错误",
      });
    }
  }
);

const api = {
  auth: {
    login: (credentials) => request.post("/auth/login", credentials),
    register: (userInfo) => request.post("/auth/register", userInfo),
    logout: () => request.post("/auth/logout"),
    getCurrentUser: () => request.get("/auth/me"),
    checkAuthorization: () => request.get("/auth/status"),
    refreshToken: () => request.post("/auth/refresh"),
    changePassword: (data) => request.post("/auth/change-password", data),
  },

  admin: {
    getUsers: (params) => request.get("/admin/users", { params }),
    getUser: (userId) => request.get(`/admin/users/${userId}`),
    authorizeUser: (userId, days) => request.post(`/admin/users/${userId}/authorize`, { days }),
    authorizeUserUntil: (userId, expireDate) => request.post(`/admin/users/${userId}/authorize-until`, { expireDate }),
    deauthorizeUser: (userId) => request.post(`/admin/users/${userId}/deauthorize`),
    toggleUserActive: (userId) => request.post(`/admin/users/${userId}/toggle-active`),
    updateUserMaxTokens: (userId, maxTokens) => request.post(`/admin/users/${userId}/max-tokens`, { maxTokens }),
    toggleUserScheduleTasks: (userId) => request.post(`/admin/users/${userId}/toggle-schedule-tasks`),
    deleteUser: (userId) => request.post(`/admin/users/${userId}/delete`),
    batchAuthorizeUsers: (userIds, days) => request.post("/admin/users/batch-authorize", { user_ids: userIds, days }),
    batchAuthorizeUsersUntil: (userIds, expireDate) => request.post("/admin/users/batch-authorize-until", { user_ids: userIds, expireDate }),
    getStats: () => request.get("/admin/stats"),
  },

  tokens: {
    getAll: () => request.get("/tokens"),
    add: (tokenData) => request.post("/tokens", tokenData),
    batchAdd: (tokens) => request.post("/tokens/batch", { tokens }),
    update: (tokenId, tokenData) => request.post(`/tokens/${tokenId}`, tokenData),
    delete: (tokenId) => request.post(`/tokens/${tokenId}/delete`),
    clear: () => request.post("/tokens/clear"),
    export: () => request.get("/tokens/export"),
    import: (data) => request.post("/tokens/import", data),
    updateOrder: (orders) => request.post("/tokens/update-order", { orders }),

    getGroups: () => request.get("/tokens/groups"),
    addGroup: (groupData) => request.post("/tokens/groups", groupData),
    updateGroup: (groupId, groupData) => request.post(`/tokens/groups/${groupId}`, groupData),
    deleteGroup: (groupId) => request.post(`/tokens/groups/${groupId}/delete`),
    syncGroups: (groups) => request.post("/tokens/groups/sync", { groups }),

    getConfig: () => request.get("/tokens/config"),
    saveConfig: (configData) => request.post("/tokens/config", configData),
  },

  tasks: {
    getScheduled: () => request.get("/scheduled-tasks"),
    createScheduled: (taskData) => request.post("/scheduled-tasks", taskData),
    updateScheduled: (taskId, taskData) => request.post(`/scheduled-tasks/${taskId}`, taskData),
    deleteScheduled: (taskId) => request.post(`/scheduled-tasks/${taskId}/delete`),
    executeScheduled: (taskId) => request.post(`/scheduled-tasks/${taskId}/execute`),
    executeScheduledForToken: (taskId, tokenId) => request.post(`/scheduled-tasks/${taskId}/execute-token`, { tokenId }),

    getExecutionLogs: (params) => request.get("/execution-logs", { params }),
    createExecutionLog: (logData) => request.post("/execution-logs", logData),
    cleanupLogs: () => request.post("/execution-logs/cleanup"),
    deleteExecutionLog: (logId) => request.delete(`/execution-logs/${logId}`),

    getTemplates: () => request.get("/task-templates"),
  },
};

export default api;
