export const TOKEN_LOGIN_TIMEOUT = 20000;
export const TOKEN_RECOVERY_TIMEOUT = 40000;

export function credentialWasRejected(error) {
  // Network failures and a bare WebSocket close code do not identify an expired token.
  const text = String(error?.rawMessage || error?.errorDesc || error?.hint || error?.message || error?.reason || error || "");
  return /check\s+(?:role\s*)?token\s+error|\b(?:role|game)?token\s*(?:is\s+|[:：]\s*)?(?:(?:expired|invalid)\b|已?(?:过期|失效|无效))|\b(?:expired|invalid)\s+(?:(?:role|game|login)\s+)?token\b|凭证已?(?:过期|失效|无效)/i.test(text);
}

/** Only expose fixed descriptions and validated numeric codes, never a raw URL or error. */
export function describeTokenLoginFailure(error, phase, code) {
  const rawCode = code ?? error?.code ?? error?.response?.status;
  const reportedCode = /^\d{3,8}$/.test(String(rawCode ?? "")) ? Number(rawCode) : undefined;
  if (error?.kind === "timeout") return "登录超时，请检查网络后重试";
  if (error?.kind === "crossTab") return "此账号已在其他标签页连接，请先断开后重试";
  if (error?.kind === "missingBin") return "找不到可刷新的 BIN，请重新导入后重试";
  if (error?.kind === "missingCredential") return "登录凭证无效，请重新导入后重试";
  if (error?.kind === "roleMissing") return "已建立连接，但角色信息不完整，请重试";
  if ([400340, 200400, 400312, 429].includes(reportedCode)) return "请求过于频繁，请稍后重试";
  if (credentialWasRejected(error)) return "登录凭证已失效，请刷新或重新导入 BIN";

  const message = phase === "refreshing"
    ? "凭证刷新失败，请检查网络或重新导入 BIN"
    : phase === "verifying"
      ? "角色信息校验失败，请检查网络后重试"
      : "无法连接游戏服务，请检查网络后重试";
  return reportedCode ? `${message}（错误码：${reportedCode}）` : message;
}
