import naive from "naive-ui";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";

import { initAccent } from "./composables/useAccent";
import { initTheme } from "./composables/useTheme";
import router from "./router";
import { initRuntimePlatform } from "./utils/runtimePlatform";
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

import "./assets/styles/theme-foundation.scss";
import "./assets/styles/mobile-shell.scss";
// 加载游戏加密模块（用于微信扫码导入功能）
// 注意：加载顺序很重要，必须先加载 game-defines.js，然后是 cocos2d-js-min.js，最后是 index.js
import "./xyzw/game-defines.js";
import "./xyzw/cocos2d-js-min.js";

import "./xyzw/index.js";

// Set the platform and appearance before the first route is resolved.
initRuntimePlatform();
initTheme();
initAccent();
document.documentElement.classList.toggle("reduce-motion", localStorage.getItem("theme-animations") === "false");

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(naive);
app.mount("#app");
