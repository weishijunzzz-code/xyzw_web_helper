const iosGameWindow = window.location.protocol === "xyzw-game:" &&
  window.location.hostname === "runtime" && window.location.pathname === "/android-single.html";
if (iosGameWindow || (new URLSearchParams(window.location.search).get("showTools") !== "1" && window.parent !== window)) {
  const style = document.createElement("style");
  const selectors = iosGameWindow ? "#binTool,#binToast" : "#binTool,#binToast,#script-tool-toggle,#script-tool-container,#script-confirm";
  style.textContent = selectors + "{display:none!important}";
  document.head.appendChild(style);
}
