import "@arco-design/web-vue/dist/arco.css";
import "virtual:uno.css";
import "./assets/styles/design-tokens.scss";
import "./assets/styles/enhanced-design-system.scss";
import "./assets/styles/micro-interactions.scss";
import "./assets/styles/modern-cards.scss";
import "./assets/styles/compact-mode.scss";
import "./assets/styles/interactions.scss";
import "./assets/styles/mobile-optimized.scss";
import "./assets/styles/page-transitions.scss";
import "./assets/styles/button-effects.scss";
import "./assets/styles/global.scss";
import "./assets/styles/mobile.scss";
import "./styles/mobile-fix.scss";
import "./assets/styles/task-scheduler-theme.scss";

// 加载游戏加密模块（用于微信扫码导入功能）
// 注意：加载顺序很重要，必须先加载 game-defines.js，然后是 cocos2d-js-min.js，最后是 index.js
import "./xyzw/game-defines.js";
import "./xyzw/cocos2d-js-min.js";
import "./xyzw/index.js";

import { createApp } from "vue";
import { createPinia } from "pinia";
import naive from "naive-ui";
import router from "./router";
import App from "./App.vue";
// import { i18n } from './locales';

// 创建应用实例
const app = createApp(App);

// 使用插件
app.use(createPinia());
app.use(router);
app.use(naive);
// app.use(i18n)

// 全局主题应用：从 localStorage 读取并设置 data-theme 属性
// 优先读取 ThemeSettings 组件写入的 theme-mode，兼容旧 theme 键
const getSavedTheme = () => {
  return localStorage.getItem("theme-mode") || localStorage.getItem("theme") || "auto";
};

const applyTheme = () => {
  const saved = getSavedTheme();
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (saved === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark)
      document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");

    // 跟随系统变更
    if (window.matchMedia) {
      window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", (e) => {
            const t = getSavedTheme();
            if (t !== "dark" && t !== "light") {
              if (e.matches)
                document.documentElement.setAttribute("data-theme", "dark");
              else document.documentElement.removeAttribute("data-theme");
            }
          });
    }
  }
};

applyTheme();

// 挂载应用
app.mount("#app");

// 检测是否是 Capacitor (APK) 环境
const isCapacitor = () => {
  return typeof (window).Capacitor !== 'undefined' && (window).Capacitor.isNativePlatform();
};

// 如果是 Capacitor 环境，添加类名到 body
// 使用 nextTick 确保 DOM 已准备好
import { nextTick } from 'vue';
nextTick(() => {
  if (isCapacitor()) {
    document.body.classList.add('capacitor-app');
  }
});
