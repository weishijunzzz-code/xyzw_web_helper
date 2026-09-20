/**
 * 云端账号登录态管理（仅作用于"云端任务"功能，不影响本地 Token 模式）
 */
import { ref, computed } from "vue";
import { authApi } from "@/api/serverApi";

const user = ref(authApi.getUser());
const isLoggedIn = computed(() => !!user.value && authApi.isLoggedIn());

// 跨页面同步登录态
window.addEventListener("storage", (e) => {
  if (e.key === "auth_user") {
    user.value = authApi.getUser();
  }
});

// 401 过期事件
window.addEventListener("cloud-auth-expired", () => {
  user.value = null;
});

export function useCloudAuth() {
  async function login(username, password) {
    const data = await authApi.login(username, password);
    authApi.saveAuth(data);
    user.value = authApi.getUser();
    return user.value;
  }

  async function register(username, password) {
    const data = await authApi.register(username, password);
    authApi.saveAuth(data);
    user.value = authApi.getUser();
    return user.value;
  }

  function logout() {
    authApi.logout();
    user.value = null;
  }

  return { user, isLoggedIn, login, register, logout };
}
