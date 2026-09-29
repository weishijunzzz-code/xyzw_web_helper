import { watch } from "vue";
import { useMobileGlobal } from "./useMobile";

/**
 * 紧凑模式唯一裁决：
 * - 视口 ≤768px 自动启用
 * - 或用户在 ThemeSettings 中手动开启（theme-compact）
 * 所有写入方（App 视口监听、ThemeSettings 用户开关）都必须经由本函数，
 * 避免互相覆盖（此前 ThemeSettings 挂载时会踩掉移动端自动加的 class）。
 */
export function applyCompactModeClass() {
  if (typeof window === "undefined") return;
  const mobile = window.innerWidth <= 768;
  const userPref = localStorage.getItem("theme-compact") === "true";
  document.documentElement.classList.toggle(
    "compact-mode",
    mobile || userPref,
  );
}

/** 在组件中使用：视口变化时自动重算紧凑模式 */
export function useCompactMode() {
  const { isMobile } = useMobileGlobal();
  watch(isMobile, applyCompactModeClass, { immediate: true });
}
