import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "@/api";
import { setSyncEnabled } from "@/services/tokenSync";
import { useTokenStore } from "./tokenStore";

const normalizeUser = (userData) => {
  if (!userData) return null;
  return {
    ...userData,
    isAdmin: userData.isAdmin ?? false,
    isAuthorized: userData.isAuthorized ?? false,
    isActive: userData.isActive ?? true,
    authorizedUntil: userData.authorizedUntil ?? null,
    maxTokens: userData.maxTokens ?? 3,
    canScheduleTasks: userData.canScheduleTasks ?? false,
    canUseScheduledTasks: userData.canUseScheduledTasks ?? false,
    createdAt: userData.createdAt ?? null,
  };
};

export const useAuthStore = defineStore("auth", () => {
  const user = ref(null);
  const accessToken = ref(localStorage.getItem("accessToken") || null);
  const refreshToken = ref(localStorage.getItem("refreshToken") || null);
  const isLoading = ref(false);
  const isAuthorized = ref(false);
  const authorizationChecked = ref(false);

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value);
  const isAdmin = computed(() => user.value?.isAdmin === true);
  const userInfo = computed(() => user.value);

  const login = async (credentials) => {
    console.log("=== authStore.login 开始 ===");

    try {
      isLoading.value = true;

      const response = await api.auth.login({
        username: credentials.username,
        password: credentials.password,
      });

      console.log("API 响应:", response);

      if (response && response.success) {
        const { accessToken: at, refreshToken: rt, user: userData } = response.data;

        const normalizedUser = normalizeUser(userData);

        console.log("normalizedUser:", normalizedUser);

        accessToken.value = at;
        refreshToken.value = rt;
        user.value = normalizedUser;
        isAuthorized.value = normalizedUser.isAuthorized;
        authorizationChecked.value = true;

        localStorage.setItem("accessToken", at);
        localStorage.setItem("refreshToken", rt);
        localStorage.setItem("user", JSON.stringify(normalizedUser));

        if (normalizedUser.isAuthorized || normalizedUser.isAdmin) {
          setSyncEnabled(true);
        }

        const tokenStore = useTokenStore();
        await tokenStore.reinitIfNeeded();

        startUserStatusCheck();

        console.log("登录成功，isAdmin:", isAdmin.value, "isAuthorized:", isAuthorized.value);

        return { success: true };
      } else {
        return { success: false, message: response?.message || "登录失败" };
      }
    } catch (error) {
      console.error("登录错误:", error);
      return { success: false, message: error.message || "登录失败" };
    } finally {
      isLoading.value = false;
    }
  };

  const register = async (userInfo) => {
    try {
      isLoading.value = true;

      const response = await api.auth.register({
        username: userInfo.username,
        password: userInfo.password,
      });

      if (response.success) {
        return { success: true, message: response.message || "注册成功，请等待管理员授权" };
      } else {
        return { success: false, message: response.message || "注册失败" };
      }
    } catch (error) {
      console.error("注册错误:", error);
      return { success: false, message: error.message || "注册失败" };
    } finally {
      isLoading.value = false;
    }
  };

  const logout = async () => {
    stopUserStatusCheck();

    try {
      await api.auth.logout();
    } catch (error) {
      console.error("退出错误:", error);
    }

    setSyncEnabled(false);

    user.value = null;
    accessToken.value = null;
    refreshToken.value = null;
    isAuthorized.value = false;
    authorizationChecked.value = false;

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("gameRoles");
  };

  const checkAuthorization = async () => {
    if (!accessToken.value) {
      isAuthorized.value = false;
      authorizationChecked.value = true;
      return false;
    }

    try {
      const response = await api.auth.checkAuthorization();

      if (response.success) {
        isAuthorized.value = response.authorized === true;
        if (response.data) {
          user.value = normalizeUser(response.data);
          localStorage.setItem("user", JSON.stringify(user.value));
        }

        if (response.authorized) {
          setSyncEnabled(true);
        } else {
          setSyncEnabled(false);
        }
      } else {
        isAuthorized.value = false;
        setSyncEnabled(false);
      }
    } catch (error) {
      console.error("检查授权失败:", error);
      isAuthorized.value = false;
      setSyncEnabled(false);
    }

    authorizationChecked.value = true;
    return isAuthorized.value;
  };

  const fetchUserInfo = async () => {
    if (!accessToken.value) return false;

    try {
      const response = await api.auth.getCurrentUser();

      if (response.success) {
        user.value = normalizeUser(response.data);
        isAuthorized.value = user.value.isAuthorized;
        localStorage.setItem("user", JSON.stringify(user.value));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("获取用户信息失败:", error);
      return false;
    }
  };

  const initAuth = async () => {
    console.log("initAuth 被调用");
    const savedToken = localStorage.getItem("accessToken");

    console.log("savedToken:", savedToken ? "存在" : "不存在");

    if (savedToken) {
      accessToken.value = savedToken;

      if (window.location.pathname === '/unauthorized') {
        console.log("用户在待授权页面，保留本地状态");
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
          try {
            const parsedUser = JSON.parse(savedUser);
            user.value = normalizeUser(parsedUser);
            isAuthorized.value = false;
          } catch (parseError) {
            console.error("解析本地用户数据失败:", parseError);
          }
        }
        authorizationChecked.value = true;
        return;
      }

      try {
        console.log("从服务器获取最新用户状态...");
        const response = await api.auth.checkAuthorization();
        console.log("服务器返回的用户状态:", response);

        if (response.forbidden === true) {
          console.log("用户已被禁用，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (response.success === false) {
          console.log("授权检查失败，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (response.data) {
          const normalizedUser = normalizeUser(response.data);
          if (normalizedUser.isActive === false) {
            console.log("用户已被禁用，跳转到待授权页面");
            if (window.location.pathname !== '/unauthorized') {
              window.location.href = '/unauthorized';
            }
          } else {
            user.value = normalizedUser;
            isAuthorized.value = response.authorized ?? normalizedUser.isAuthorized;
            localStorage.setItem("user", JSON.stringify(normalizedUser));

            if (normalizedUser.isAuthorized || normalizedUser.isAdmin) {
              setSyncEnabled(true);
            }

            console.log("initAuth 完成，user:", user.value);

            const tokenStore = useTokenStore();
            await tokenStore.reinitIfNeeded();

            startUserStatusCheck();
          }
        }
      } catch (error) {
        console.error("从服务器获取用户状态失败:", error);

        if (error.forbidden === true) {
          console.log("用户被禁用，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (error.notFound === true || error.shouldRedirect === true) {
          console.log("用户状态异常，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else {
          const savedUser = localStorage.getItem("user");
          if (savedUser) {
            try {
              const parsedUser = JSON.parse(savedUser);
              user.value = normalizeUser(parsedUser);
              isAuthorized.value = user.value.isAuthorized;

              if (user.value.isAuthorized || user.value.isAdmin) {
                setSyncEnabled(true);
              }

              startUserStatusCheck();
            } catch (parseError) {
              console.error("解析本地用户数据失败:", parseError);
            }
          }
        }
      }
    }

    authorizationChecked.value = true;
  };

  let statusCheckInterval = null;

  const startUserStatusCheck = () => {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
    }

    if (window.location.pathname === '/unauthorized') {
      console.log("用户在待授权页面，不启动状态检查");
      return;
    }

    statusCheckInterval = setInterval(async () => {
      if (!accessToken.value) {
        clearInterval(statusCheckInterval);
        return;
      }

      if (window.location.pathname === '/unauthorized') {
        clearInterval(statusCheckInterval);
        return;
      }

      try {
        const response = await api.auth.checkAuthorization();
        console.log("用户状态检查响应:", response);

        if (response.forbidden === true) {
          console.log("用户状态检查: 用户已被禁用，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (response.authorized === false) {
          console.log("用户状态检查: 授权已过期或未授权");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (response.success === false) {
          console.log("用户状态检查: 请求失败");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (response.data) {
          const normalizedData = normalizeUser(response.data);
          if (normalizedData.isActive === false) {
            console.log("用户状态检查: 用户已被禁用，跳转到待授权页面");
            if (window.location.pathname !== '/unauthorized') {
              window.location.href = '/unauthorized';
            }
          } else {
            user.value = normalizedData;
            isAuthorized.value = normalizedData.isAuthorized;
            localStorage.setItem("user", JSON.stringify(normalizedData));
          }
        }
      } catch (error) {
        console.error("用户状态检查失败:", error);
        if (error.forbidden === true) {
          console.log("用户状态检查catch: 用户被禁用，跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        } else if (error.notFound === true || error.shouldRedirect === true) {
          console.log("用户状态检查catch: 需要跳转到待授权页面");
          if (window.location.pathname !== '/unauthorized') {
            window.location.href = '/unauthorized';
          }
        }
      }
    }, 30000);
  };

  const stopUserStatusCheck = () => {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
      statusCheckInterval = null;
    }
  };

  const refreshAccessToken = async () => {
    if (!refreshToken.value) {
      logout();
      return false;
    }

    try {
      const response = await api.auth.refreshToken();

      if (response.success) {
        accessToken.value = response.data.accessToken;
        localStorage.setItem("accessToken", response.data.accessToken);
        return true;
      } else {
        logout();
        return false;
      }
    } catch (error) {
      console.error("刷新Token失败:", error);
      logout();
      return false;
    }
  };

  return {
    user,
    accessToken,
    refreshToken,
    isLoading,
    isAuthorized,
    authorizationChecked,

    isAuthenticated,
    isAdmin,
    userInfo,

    login,
    register,
    logout,
    checkAuthorization,
    fetchUserInfo,
    initAuth,
    refreshAccessToken,
    startUserStatusCheck,
    stopUserStatusCheck,
  };
});
