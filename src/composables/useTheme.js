import { onMounted, onUnmounted, ref } from "vue";
import { listenForThemeChanges } from "@/utils/themeListener.js";

// 全局响应式主题状态
const isDark = ref(false);

// 检查当前主题状态
const checkCurrentTheme = () => {
  return (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
  );
};

// 更新响应式状态
const updateReactiveState = () => {
  isDark.value = checkCurrentTheme();
};

/**
 * Share reactive theme state while owning each instance's DOM and media listeners.
 * @returns {object} Theme state, setters, initialization and listener setup functions.
 */
export function useTheme() {
  let mutationObserver = null;
  let removeSystemThemeListener = null;

  // 初始化主题
  const initTheme = () => {
    // 优先读取 ThemeSettings 组件写入的 theme-mode，兼容旧 theme 键
    const savedTheme =
      localStorage.getItem("theme-mode") || localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    if (savedTheme === "dark") {
      setDarkTheme();
    } else if (savedTheme === "light") {
      setLightTheme();
    } else if (prefersDark) {
      // 无保存值或为 system 时跟随系统
      setDarkTheme();
    } else {
      setLightTheme();
    }

    // 立即更新响应式状态
    updateReactiveState();
  };

  // 设置深色主题
  const setDarkTheme = () => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("dark");
    document.body.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");

    // 立即更新响应式状态
    isDark.value = true;

    // 触发主题更新事件
    window.dispatchEvent(
      new CustomEvent("theme-change", { detail: { isDark: true } }),
    );
  };

  // 设置浅色主题
  const setLightTheme = () => {
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("dark");
    document.body.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");

    // 立即更新响应式状态
    isDark.value = false;

    // 触发主题更新事件
    window.dispatchEvent(
      new CustomEvent("theme-change", { detail: { isDark: false } }),
    );
  };

  // 切换主题
  const toggleTheme = () => {
    if (isDark.value) {
      setLightTheme();
    } else {
      setDarkTheme();
    }
  };

  // 监听系统主题变化
  /** Register one system-theme listener per composable instance. */
  const setupSystemThemeListener = () => {
    removeSystemThemeListener?.();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!localStorage.getItem("theme")) initTheme();
    };
    removeSystemThemeListener = listenForThemeChanges(mediaQuery, onChange);
  };

  // 设置DOM变化监听器（确保响应式状态同步）
  const setupDOMObserver = () => {
    if (typeof window !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        updateReactiveState();
      });

      // 监听documentElement和body的变化
      mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });

      mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }
  };

  // 清理监听器
  const cleanup = () => {
    removeSystemThemeListener?.();
    removeSystemThemeListener = null;
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  };

  // 获取当前主题
  const getCurrentTheme = () => {
    return isDark.value ? "dark" : "light";
  };

  // 组件挂载时初始化
  onMounted(() => {
    setupDOMObserver();
    updateReactiveState();
  });

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup();
  });

  return {
    isDark,
    initTheme,
    toggleTheme,
    setDarkTheme,
    setLightTheme,
    setupSystemThemeListener,
    getCurrentTheme,
    updateReactiveState,
  };
}
