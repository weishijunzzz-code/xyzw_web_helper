const configsByVersion = new Map();

/**
 * Load task targets from the official data version returned by the game server.
 * Only immutable configuration is cached; role progress is never cached here.
 * @param {object} tokenStore Live command transport.
 * @param {string} tokenId Selected account identity.
 * @param {Function} [fetchConfig] Fetch implementation for the official CDN.
 * @returns {Promise<object>} Validated task definitions and point-reward thresholds.
 */
export async function loadDailyTaskConfig(
  tokenStore,
  tokenId,
  fetchConfig = globalThis.fetch,
) {
  const response = await tokenStore.sendMessageWithPromise(
    tokenId,
    "system_getdatabundlever",
    {},
    15000,
  );
  const version = response?.dataBundleVer;
  if (typeof version !== "string" || !/^[\w-]+$/.test(version))
    throw new Error("服务器未提供有效的任务配置版本");
  if (!configsByVersion.has(version)) {
    const loading = (async () => {
      const response = await fetchConfig(
        `https://xxz-xyzw-res.hortorgames.com/data/${version}/config.json`,
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error("官方任务配置读取失败");
      const config = await response.json();
      return validateDailyTaskConfig(config);
    })();
    configsByVersion.set(version, loading);
    loading.catch(() => {
      if (configsByVersion.get(version) === loading)
        configsByVersion.delete(version);
    });
    for (const key of configsByVersion.keys()) {
      if (key !== version) configsByVersion.delete(key);
    }
  }
  return configsByVersion.get(version);
}

/**
 * Validate official task IDs separately from their completion-condition IDs.
 * @param {object} config Official configuration response.
 * @returns {object} Minimal task and reward configuration.
 * @throws {Error} When targets or reward thresholds cannot be trusted.
 */
export function validateDailyTaskConfig(config) {
  const tasks = Object.values(config?.DailyTaskConf ?? {});
  const dailyRewards = Object.values(config?.DayLimitConf ?? {});
  const weeklyRewards = Object.values(config?.WeekLimitConf ?? {});
  if (
    !tasks.length ||
    !dailyRewards.length ||
    !weeklyRewards.length ||
    tasks.some(
      (task) =>
        !Number.isInteger(task.id) ||
        task.id <= 0 ||
        !Number.isInteger(task.completeCondition) ||
        task.completeCondition <= 0 ||
        !Number.isInteger(task.completeValue) ||
        task.completeValue <= 0,
    ) ||
    new Set(tasks.map((task) => task.id)).size !== tasks.length ||
    new Set(tasks.map((task) => task.completeCondition)).size !==
      tasks.length ||
    [dailyRewards, weeklyRewards].some(
      (rewards) =>
        new Set(rewards.map((reward) => reward.id)).size !== rewards.length,
    ) ||
    [...dailyRewards, ...weeklyRewards].some(
      (reward) =>
        !Number.isInteger(reward.id) ||
        reward.id <= 0 ||
        !Number.isFinite(reward.limit) ||
        reward.limit < 0,
    )
  )
    throw new Error("官方每日任务配置无效，停止执行");
  return { tasks, dailyRewards, weeklyRewards };
}

/**
 * Decode a freshly fetched role's daily progress, including unclaimed completion.
 * Missing counters in an otherwise valid server map represent zero progress.
 * @param {object} role Role returned by the live role_getroleinfo response.
 * @param {object} config Validated official definitions.
 * @returns {Array<object>} Pending, claimable or claimed tasks with remaining counts.
 * @throws {Error} When the server snapshot is incomplete or malformed.
 */
export function getDailyTaskStates(role, config) {
  const daily = role?.dailyTask;
  if (
    !Number.isFinite(daily?.dailyTime) ||
    daily.dailyTime <= 0 ||
    !daily.complete ||
    typeof daily.complete !== "object" ||
    Array.isArray(daily.complete)
  )
    throw new Error("服务器任务列表不完整，不能判断完成状态");
  return config.tasks.map((task) => {
    const value = Object.hasOwn(daily.complete, task.completeCondition)
      ? daily.complete[task.completeCondition]
      : 0;
    if (!Number.isInteger(value) || value < -1)
      throw new Error("服务器任务进度无效，停止执行");
    const claimed = value === -1;
    const progress = claimed ? task.completeValue : value;
    return {
      id: task.id,
      condition: task.completeCondition,
      required: task.completeValue,
      progress,
      remaining: Math.max(task.completeValue - progress, 0),
      status: claimed
        ? "claimed"
        : progress >= task.completeValue
          ? "claimable"
          : "pending",
    };
  });
}

/**
 * Determine point rewards from the server's point total and claimed-reward map.
 * @param {object} daily Server dailyTask data.
 * @param {Array<object>} definitions Official reward IDs and thresholds.
 * @param {boolean} [weekly] Select weekPoint/weekReward instead of daily fields.
 * @returns {Array<number>} Only eligible, unclaimed server reward IDs.
 */
export function getClaimablePointRewards(daily, definitions, weekly = false) {
  const points = daily?.[weekly ? "weekPoint" : "dailyPoint"];
  const claimed = daily?.[weekly ? "weekReward" : "dailyReward"];
  if (
    !Number.isFinite(points) ||
    !claimed ||
    typeof claimed !== "object" ||
    Array.isArray(claimed) ||
    Object.values(claimed).some((value) => typeof value !== "boolean")
  )
    throw new Error("服务器积分奖励状态不完整");
  return definitions
    .filter((reward) => points >= reward.limit && claimed[reward.id] !== true)
    .map((reward) => reward.id);
}
