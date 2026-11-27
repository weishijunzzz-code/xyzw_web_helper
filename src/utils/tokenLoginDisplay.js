const labels = {
  connected: "已连接",
  connecting: "连接中",
  verifying: "验证角色中",
  refreshing: "刷新凭据中",
  disconnecting: "断开中",
  error: "连接失败",
  cancelled: "已取消",
  disconnected: "未连接",
};

const pendingPhases = new Set(["connecting", "verifying", "refreshing"]);

export function getTokenLoginDisplay(login, socketStatus) {
  const phase = login?.phase;
  const canCancel = pendingPhases.has(phase);
  const status = canCancel || phase === "error" || phase === "cancelled"
    ? phase
    : socketStatus || "disconnected";

  return {
    status,
    label: labels[status] || labels.disconnected,
    canCancel,
    canRetry: status === "error" || status === "cancelled",
    pending: canCancel || status === "connecting" || status === "disconnecting",
    error: phase === "error" ? login.message : "",
  };
}
