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
              <DebugPanel v-if="isNativePlatform" />
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

// Naive UI 主题覆盖配置
const themeOverrides = computed(() => {
  const isDarkMode = isDark.value;
  return {
    common: {
      primaryColor: isDarkMode ? '#667eea' : '#667eea',
      primaryColorHover: isDarkMode ? '#5a67d8' : '#5a67d8',
      primaryColorPressed: isDarkMode ? '#4c51bf' : '#4c51bf',
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
    Input: {
      color: isDarkMode ? 'rgba(255,255,255,0.1)' : '#ffffff',
      colorFocus: isDarkMode ? 'rgba(255,255,255,0.15)' : '#ffffff',
      textColor: isDarkMode ? '#ffffff' : '#333333',
      placeholderColor: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
      borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      borderColorFocus: isDarkMode ? '#667eea' : '#667eea',
    },
    Select: {
      color: isDarkMode ? 'rgba(255,255,255,0.1)' : '#ffffff',
      colorActive: isDarkMode ? 'rgba(255,255,255,0.15)' : '#f5f7fa',
      textColor: isDarkMode ? '#ffffff' : '#333333',
      placeholderColor: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
      borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      borderColorFocus: isDarkMode ? '#667eea' : '#667eea',
    },
    Card: {
      color: isDarkMode ? '#374151' : '#ffffff',
      colorModal: isDarkMode ? '#374151' : '#ffffff',
      textColor: isDarkMode ? '#ffffff' : '#333333',
      titleTextColor: isDarkMode ? '#ffffff' : '#333333',
      borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
    },
    Modal: {
      color: isDarkMode ? '#374151' : '#ffffff',
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Drawer: {
      color: isDarkMode ? '#374151' : '#ffffff',
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Dropdown: {
      color: isDarkMode ? '#374151' : '#ffffff',
      textColor: isDarkMode ? '#ffffff' : '#333333',
      optionColorHover: isDarkMode ? 'rgba(102, 126, 234, 0.2)' : '#e6f7ff',
    },
    Tooltip: {
      color: isDarkMode ? '#1f2937' : '#333333',
      textColor: isDarkMode ? '#ffffff' : '#ffffff',
    },
    Button: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
      textColorPrimary: '#ffffff',
      textColorGhostPrimary: isDarkMode ? '#667eea' : '#667eea',
    },
    Form: {
      labelTextColor: isDarkMode ? '#ffffff' : '#333333',
      asteriskColor: '#d03050',
    },
    Menu: {
      textColor: isDarkMode ? '#d1d5db' : '#666666',
      textColorHover: isDarkMode ? '#ffffff' : '#333333',
      textColorActive: isDarkMode ? '#667eea' : '#667eea',
      textColorActiveHover: isDarkMode ? '#667eea' : '#667eea',
    },
    Tag: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Collapse: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
      arrowColor: isDarkMode ? '#d1d5db' : '#666666',
    },
    Radio: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
      buttonTextColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Checkbox: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Switch: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Tabs: {
      tabTextColor: isDarkMode ? '#d1d5db' : '#666666',
      tabTextColorActive: isDarkMode ? '#667eea' : '#667eea',
      tabTextColorHover: isDarkMode ? '#ffffff' : '#333333',
    },
    Pagination: {
      textColor: isDarkMode ? '#d1d5db' : '#666666',
      textColorHover: isDarkMode ? '#ffffff' : '#333333',
      textColorActive: isDarkMode ? '#ffffff' : '#ffffff',
      itemColorActive: isDarkMode ? '#667eea' : '#667eea',
    },
    DatePicker: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    TimePicker: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Tree: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    List: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Empty: {
      textColor: isDarkMode ? '#9ca3af' : '#999999',
    },
    Progress: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Slider: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Transfer: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Avatar: {
      textColor: isDarkMode ? '#ffffff' : '#ffffff',
    },
    Statistic: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Timeline: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Steps: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Result: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Descriptions: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Anchor: {
      textColor: isDarkMode ? '#d1d5db' : '#666666',
      textColorActive: isDarkMode ? '#667eea' : '#667eea',
    },
    BackTop: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Breadcrumb: {
      textColor: isDarkMode ? '#d1d5db' : '#666666',
      itemTextColorHover: isDarkMode ? '#ffffff' : '#333333',
      itemTextColorActive: isDarkMode ? '#667eea' : '#667eea',
    },
    Calendar: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Carousel: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    ColorPicker: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    DataTable: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
      thTextColor: isDarkMode ? '#ffffff' : '#333333',
      tdTextColor: isDarkMode ? '#ffffff' : '#333333',
    },
    DynamicInput: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    DynamicTags: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    GlobalStyle: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    GradientText: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Grid: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Icon: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    LegacyTransfer: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    LoadingBar: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Log: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Mention: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Notification: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Popconfirm: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Popover: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Popselect: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Rate: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Spin: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
    },
    Upload: {
      textColor: isDarkMode ? '#ffffff' : '#333333',
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
/* 主题变量 - 使用 design-system 变量 */
:root {
  --app-background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 深色主题变量 */
.dark,
[data-theme="dark"] {
  --app-background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%);
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
    "SF Pro Display",
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
  transition: color 0.3s ease;
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
