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
              <GamePlayer
                v-if="nativeGame && (singleGameActive || singleGameSession)"
                :bin-id="singleGameRouteId"
                :workspace-active="singleGameActive"
                retained
              />
              <GameWorkspace v-if="gameWorkspaceMounted" v-show="gameWorkspaceActive" :workspace-active="gameWorkspaceActive" />
              <LocalGameScriptLibrary v-if="nativeGame" />
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
import { darkTheme } from "naive-ui";
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BackToTop from "@/components/Common/BackToTop.vue";
import CommandPalette from "@/components/Common/CommandPalette.vue";
import ErrorBoundary from "@/components/Common/ErrorBoundary.vue";
import GlobalLoading from "@/components/Common/GlobalLoading.vue";
import SuccessAnimation from "@/components/Common/SuccessAnimation.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import { useCompactMode } from "@/composables/useCompactMode";
import { closeSingleGame, leaveSingleGame, singleGameSession } from "@/composables/useSingleGameSession";
import { useTheme } from "@/composables/useTheme";
import { useTokenStore } from "@/stores/tokenStore";
import { initNativeUi } from "@/utils/androidUi";
import { initCapacitor, isNativePlatform } from "@/utils/capacitor";
import { initUpdateChecker } from "@/utils/updateChecker";
import { isNativeGameApp } from "@/utils/runtimePlatform";

const route = useRoute();
const router = useRouter();
const tokenStore = useTokenStore();
const nativeGame = isNativeGameApp();
let disposeNativeUi;
const GamePlayer = defineAsyncComponent(() => import("@/views/GamePlayer.vue"));
const LocalGameScriptLibrary = defineAsyncComponent(() => import("@/components/Game/LocalGameScriptLibrary.vue"));
const singleGameActive = computed(() => route.name === "GamePlayer");
const singleGameRouteId = computed(() => typeof route.query.bin_id === "string" ? route.query.bin_id : route.query.bin_id === undefined ? undefined : "");
watch(() => tokenStore.gameTokens.map(token => token.id), async (ids) => {
  const accountId = singleGameSession.value?.accountId;
  if (!accountId || ids.includes(accountId)) return;
  await closeSingleGame(accountId);
  if (singleGameActive.value) await router.replace('/mobile/tokens');
}, { flush: 'sync' });
const GameWorkspace = defineAsyncComponent(() => import("@/views/GameMultiPlayer.vue"));
const gameWorkspaceActive = computed(() => route.name === "GameMultiPlayer");
const gameWorkspaceMounted = ref(false);
watch(gameWorkspaceActive, (active) => {
  if (active) gameWorkspaceMounted.value = true;
}, { immediate: true });

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

const primaryTextColor = (color) => {
  const rgb = color.match(/[a-f\d]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) || [0, 0, 0];
  const linear = rgb.map((part) => part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
};
const accentPalette = ref({ primary: '', hover: '', pressed: '' });
let accentObserver;
const refreshAccentPalette = () => {
  const style = getComputedStyle(document.documentElement);
  // Arco owns body-level variables, so use distinct root tokens and body aliases.
  const channels = (color) => (color.match(/[a-f\d]{2}/gi) || []).map((part) => Number.parseInt(part, 16));
  const dark = document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark';
  if (dark) document.body.setAttribute('arco-theme', 'dark');
  else document.body.removeAttribute('arco-theme');
  const primary = style.getPropertyValue('--primary-color').trim();
  const surface = channels(style.getPropertyValue('--bg-primary').trim());
  for (let step = 1; step <= 10; step++) {
    const token = ({ 5: '--primary-color-hover', 6: '--primary-color', 7: '--primary-color-pressed' })[step];
    let rgb = channels(style.getPropertyValue(token || `--color-primary-${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900][step - 1]}`).trim());
    if (dark && step <= 4) {
      const opacity = [0.08, 0.12, 0.18, 0.24][step - 1];
      rgb = channels(primary).map((value, index) => Math.round(value * opacity + surface[index] * (1 - opacity)));
    }
    document.documentElement.style.setProperty(`--accent-arco-${step}`, rgb.join(', '));
    document.documentElement.style.setProperty(`--primary-${step}`, rgb.join(', '));
  }
  accentPalette.value = {
    primary: style.getPropertyValue('--primary-color').trim(),
    hover: style.getPropertyValue('--primary-color-hover').trim(),
    pressed: style.getPropertyValue('--primary-color-pressed').trim(),
  };
  for (const [state, color] of Object.entries(accentPalette.value)) {
    document.documentElement.style.setProperty(`--accent-on-${state}`, primaryTextColor(color));
  }
};
refreshAccentPalette();

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
      primaryColor: accentPalette.value.primary,
      primaryColorHover: accentPalette.value.hover,
      primaryColorPressed: accentPalette.value.pressed,
      primaryColorSuppl: accentPalette.value.hover,
      borderRadius: '12px',
      fontFamily: 'Inter, "PingFang SC", system-ui, sans-serif',
      fontSize: '14px',
      lineHeight: '1.6',
      cubicBezierEaseInOut: 'ease',
      cubicBezierEaseOut: 'ease',
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
      bodyColor: isDarkMode ? '#1f2937' : '#F9FAFB',
      cardColor: isDarkMode ? '#374151' : '#ffffff',
      modalColor: isDarkMode ? '#374151' : '#ffffff',
      popoverColor: isDarkMode ? '#374151' : '#ffffff',
      borderColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      dividerColor: isDarkMode ? '#4b5563' : '#e5e7eb',
      placeholderColor: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
      disabledOpacity: 0.5,
    },
    Card: { borderColor: 'transparent', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
    Button: {
      textColorPrimary: primaryTextColor(accentPalette.value.primary),
      textColorHoverPrimary: primaryTextColor(accentPalette.value.hover),
      textColorPressedPrimary: primaryTextColor(accentPalette.value.pressed),
      textColorFocusPrimary: primaryTextColor(accentPalette.value.hover),
    },
    Form: {
      asteriskColor: '#d03050',
    },
  };
});

// 监听主题变化事件
const handleThemeChange = () => {
  updateReactiveState();
  refreshAccentPalette();
};

onMounted(() => {
  initTheme();
  refreshAccentPalette();
  accentObserver = new MutationObserver(refreshAccentPalette);
  accentObserver.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-accent', 'data-theme', 'class'],
  });
  setupSystemThemeListener();
  window.addEventListener("theme-change", handleThemeChange);
  updateReactiveState();

  // 初始化 Capacitor（仅在原生应用中生效）
  initCapacitor();
  disposeNativeUi = initNativeUi(router, () => tokenStore.hasTokens ? '/mobile/dashboard' : '/mobile/tokens', () => leaveSingleGame(router));

  // 初始化热更新检查（仅在原生应用中生效）
  initUpdateChecker();
});

onUnmounted(() => {
  accentObserver?.disconnect();
  disposeNativeUi?.();
  void closeSingleGame();
  window.removeEventListener("theme-change", handleThemeChange);
});
</script>

<style>
/* 主题变量 - 现代 SaaS 风格：中性底色，品牌色只做点缀 */
:root {
  --app-background: #F9FAFB;
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
  font-family: var(--font-family-base);
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
