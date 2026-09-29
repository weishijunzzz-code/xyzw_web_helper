<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-loading-bar-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <div id="app">
              <ErrorBoundary>
                <router-view />
              </ErrorBoundary>
              <GlobalLoading />
              <BackToTop />
              <SuccessAnimation
                :visible="showSuccess"
                :message="successMessage"
                @complete="showSuccess = false"
              />
              <CommandPalette ref="commandPaletteRef" />
              <DebugPanel v-if="isNativePlatform()" />
            </div>
          </n-dialog-provider>
        </n-notification-provider>
      </n-loading-bar-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, provide } from "vue";
import { darkTheme } from "naive-ui";
import { useTheme } from "@/composables/useTheme";
import { useCompactMode } from "@/composables/useCompactMode";
import { initCapacitor, isNativePlatform } from "@/utils/capacitor";
import { initUpdateChecker } from "@/utils/updateChecker";
import GlobalLoading from "@/components/Common/GlobalLoading.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import ErrorBoundary from "@/components/Common/ErrorBoundary.vue";
import BackToTop from "@/components/Common/BackToTop.vue";
import SuccessAnimation from "@/components/Common/SuccessAnimation.vue";
import CommandPalette from "@/components/Common/CommandPalette.vue";

const { isDark, initTheme, setupSystemThemeListener, updateReactiveState } =
  useTheme();

// 移动端自动启用紧凑模式（≤768px），桌面端按 ThemeSettings 手动设置；
// 裁决逻辑统一在 useCompactMode 中，ThemeSettings 的开关也走它，避免互相覆盖
useCompactMode();

// 成功动画
const showSuccess = ref(false);
const successMessage = ref('操作成功');

const showSuccessAnimation = (message = '操作成功') => {
  successMessage.value = message;
  showSuccess.value = true;
};

// 命令面板
const commandPaletteRef = ref(null);

const openCommandPalette = () => {
  commandPaletteRef.value?.open();
};

// 提供给全局使用
provide('showSuccessAnimation', showSuccessAnimation);
provide('openCommandPalette', openCommandPalette);

// Naive UI 主题
const naiveTheme = computed(() => {
  return isDark.value ? darkTheme : null;
});

// Naive UI 主题覆盖：只保留 common 全局项，组件级配色交给 darkTheme 默认值
// （common 的 textColor1~3 / bodyColor / cardColor 等会被绝大多数组件继承）
const themeOverrides = computed(() => {
  const isDarkMode = isDark.value;
  return {
    common: {
      primaryColor: '#667eea',
      primaryColorHover: '#5a67d8',
      primaryColorPressed: '#4c51bf',
      // 语义色与 CSS 令牌定稿一致（variables.scss）
      successColor: '#10b981',
      successColorHover: '#34d399',
      successColorPressed: '#059669',
      successColorSuppl: '#34d399',
      errorColor: '#ef4444',
      errorColorHover: '#f87171',
      errorColorPressed: '#dc2626',
      errorColorSuppl: '#f87171',
      warningColor: '#f59e0b',
      warningColorHover: '#fbbf24',
      warningColorPressed: '#d97706',
      warningColorSuppl: '#fbbf24',
      textColorBase: isDarkMode ? '#ffffff' : '#333333',
      textColor1: isDarkMode ? '#ffffff' : '#333333',
      textColor2: isDarkMode ? '#d1d5db' : '#666666',
      textColor3: isDarkMode ? '#9ca3af' : '#999999',
      bodyColor: isDarkMode ? '#1f2937' : '#ffffff',
      cardColor: isDarkMode ? '#374151' : '#ffffff',
      modalColor: isDarkMode ? '#374151' : '#ffffff',
      popoverColor: isDarkMode ? '#374151' : '#ffffff',
      borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      dividerColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      placeholderColor: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
      disabledOpacity: 0.5,
    },
    Form: {
      asteriskColor: '#d03050',
    },
  };
});

// 监听主题变化事件
const handleThemeChange = () => {
  updateReactiveState();
  setTimeout(() => {
    updateReactiveState();
  }, 50);
};

onMounted(() => {
  initTheme();
  setupSystemThemeListener();
  window.addEventListener("theme-change", handleThemeChange);
  updateReactiveState();

  // 初始化 Capacitor（仅在原生应用中生效）
  initCapacitor();

  // 初始化热更新检查（仅在原生应用中生效）
  initUpdateChecker();
});

onUnmounted(() => {
  window.removeEventListener("theme-change", handleThemeChange);
});
</script>

<style>
/* 主题变量 - 现代 SaaS 风格：中性底色，品牌色只做点缀 */
:root {
  --app-background: #f5f7fa;
}

/* 深色主题变量 */
.dark,
[data-theme="dark"] {
  --app-background: #111827;
  color-scheme: dark;
}

#app {
  min-height: 100vh;
  background: var(--app-background);
  transition: background 0.3s ease;
}

/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Helvetica Neue",
    Helvetica,
    Arial,
    sans-serif;
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
}

/* 键盘导航焦点环（可达性） */
:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* 深色模式滚动条 */
.dark ::-webkit-scrollbar-track,
[data-theme="dark"] ::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}

.dark ::-webkit-scrollbar-thumb,
[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.dark ::-webkit-scrollbar-thumb:hover,
[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
