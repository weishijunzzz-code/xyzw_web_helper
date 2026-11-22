if (new URLSearchParams(window.location.search).get("showTools") !== "1" && window.parent !== window) {
  const style = document.createElement("style");
  style.textContent = "#binTool,#binToast,#script-tool-toggle,#script-tool-container,#script-confirm{display:none!important}";
  document.head.appendChild(style);
}
