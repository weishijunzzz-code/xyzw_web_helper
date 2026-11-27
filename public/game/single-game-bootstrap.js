(function bootstrapSingleGame() {
  "use strict";

  const splash = document.getElementById("splash");
  let settled = false;

  function settle(type, code) {
    if (settled) return;
    settled = true;
    if (type === "ready") {
      splash.style.display = "none";
    } else {
      splash.style.backgroundImage = "none";
      splash.textContent = "游戏资源加载失败，请重新打开游戏。";
    }
    if (window.parent !== window) {
      window.parent.postMessage({ channel: "single-game", version: 1, type, code }, window.location.origin);
    }
  }

  window.HtmlIsLoaded = true;
  Promise.resolve().then(() => window.boot({
    autoFullscreen: new URLSearchParams(window.location.search).get("android_no_scripts") !== "1",
    onReady: () => settle("ready"),
    onFailure: () => settle("failed", "resource-load-failed"),
  })).catch(() => settle("failed", "resource-load-failed"));
})();
