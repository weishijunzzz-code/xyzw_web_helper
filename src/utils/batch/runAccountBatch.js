export async function runAccountBatch(deps, name, operation) {
  const { selectedTokens, tokens, tokenStatus, isRunning, shouldStop, tokenStore } = deps;
  const ids = [...new Set(selectedTokens.value)];
  if (!ids.length) return;
  const wasRunning = isRunning.value;
  if (!wasRunning) shouldStop.value = false;
  isRunning.value = true;
  try {
    await Promise.all(ids.map(async (id) => {
      const token = tokens.value.find((entry) => entry.id === id);
      const log = (text, type = "info") => deps.addLog({
        time: new Date().toLocaleTimeString(),
        message: `[${token?.name || id}] ${name}：${text}`,
        type,
      });
      const stopped = () => shouldStop.value;
      let release;
      let outcome;
      tokenStatus.value[id] = "waiting";
      try {
        if (!token) throw new Error("账号不存在");
        if (!stopped()) release = await deps.ensureConnection(id, 2, { roleOnly: true });
        if (stopped()) outcome = { status: "skip", reason: "已停止" };
        else {
          tokenStatus.value[id] = "running";
          outcome = await operation({
            send: (cmd, params = {}, timeout = 8000) =>
              tokenStore.sendMessageWithPromise(id, cmd, params, timeout),
            log,
            stopped,
          });
        }
      } catch (error) {
        outcome = { status: "error", reason: error.message };
      } finally {
        if (typeof release === "function") release();
      }
      if (deps.accountOutcomes) deps.accountOutcomes[id] = outcome;
      tokenStatus.value[id] =
        outcome.status === "ok" ? "completed" : outcome.status === "skip" ? "skipped" : "failed";
      log(outcome.reason, outcome.status === "ok" ? "success" : outcome.status === "error" ? "error" : "warning");
    }));
  } finally {
    if (!wasRunning) isRunning.value = false;
  }
}
