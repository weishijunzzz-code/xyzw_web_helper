import { onMounted, onUnmounted, ref } from "vue";
import { listenForThemeChanges } from "@/utils/themeListener.js";

const isDark = ref(false);
const themeMode = ref("system");
const normalizeMode = (mode) => ["light", "dark"].includes(mode) ? mode : "system";

/** Read the authoritative mode, with compatibility for the legacy key. */
export function initTheme() {
  themeMode.value = normalizeMode(localStorage.getItem("theme-mode") || localStorage.getItem("theme"));
  applyTheme();
}

const updateReactiveState = () => {
  isDark.value = document.documentElement.classList.contains("dark") ||
    document.documentElement.dataset.theme === "dark";
};

const applyTheme = () => {
  const dark = themeMode.value === "dark" || (themeMode.value === "system" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches);
  for (const element of [document.documentElement, document.body]) {
    element.classList.toggle("dark", dark);
    if (dark) element.dataset.theme = "dark";
    else delete element.dataset.theme;
  }
  isDark.value = dark;
  window.dispatchEvent(new CustomEvent("theme-change", { detail: { isDark: dark } }));
};

/** Persist user intent separately from the resolved system appearance. */
export function setThemeMode(mode) {
  themeMode.value = normalizeMode(mode);
  localStorage.setItem("theme-mode", themeMode.value);
  localStorage.setItem("theme", themeMode.value);
  applyTheme();
}

/** Share theme state; each consumer cleans up its own listeners. */
export function useTheme() {
  let observer;
  let removeSystemListener;
  const setupSystemThemeListener = () => {
    removeSystemListener?.();
    removeSystemListener = listenForThemeChanges(
      window.matchMedia("(prefers-color-scheme: dark)"),
      () => { if (themeMode.value === "system") applyTheme(); },
    );
  };
  onMounted(() => {
    updateReactiveState();
    observer = new MutationObserver(updateReactiveState);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  });
  onUnmounted(() => {
    observer?.disconnect();
    removeSystemListener?.();
  });
  return {
    isDark, themeMode, initTheme, setThemeMode, updateReactiveState, setupSystemThemeListener,
    setDarkTheme: () => setThemeMode("dark"),
    setLightTheme: () => setThemeMode("light"),
    toggleTheme: () => setThemeMode(isDark.value ? "light" : "dark"),
    getCurrentTheme: () => isDark.value ? "dark" : "light",
  };
}
