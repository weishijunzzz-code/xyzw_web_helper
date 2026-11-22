const FREE_LIMIT = 3;
const ARENA_STAT = "area:arena:last";

function freeAttemptsUsed(role) {
  const reset = Number(role?.dailyTask?.dailyTime);
  if (!Number.isFinite(reset) || reset <= 0) {
    throw new Error("无法确认竞技场每日重置时间");
  }
  const stamp = Number(role.statisticsTime?.[ARENA_STAT] ?? 0);
  const count = Number(role.statistics?.[ARENA_STAT] ?? 0);
  if (stamp < reset) return 0;
  if (!Number.isFinite(stamp) || !Number.isInteger(count) || count < 0) {
    throw new Error("竞技场免费次数无效");
  }
  return count;
}

export function getDailyFreeArenaRemaining(role) {
  return Math.max(0, FREE_LIMIT - freeAttemptsUsed(role));
}

function pickTarget(targets) {
  const candidate = Array.isArray(targets)
    ? targets[0]
    : targets?.rankList?.[0] ??
      targets?.roleList?.[0] ??
      targets?.targets?.[0] ??
      targets?.targetList?.[0] ??
      targets?.list?.[0] ??
      targets;
  return candidate?.roleId || candidate?.id || candidate?.targetId;
}

export async function runDailyFreeArena({ readRole, command, prepare, pause }) {
  const initial = await readRole();
  const reset = Number(initial?.dailyTask?.dailyTime);
  let used = freeAttemptsUsed(initial);
  if (used >= FREE_LIMIT) return true;

  await prepare();
  await command("arena_startarea", {}, "进入竞技场");
  while (used < FREE_LIMIT) {
    const targets = await command("arena_getareatarget", {}, "获取竞技场对手");
    const targetId = pickTarget(targets);
    if (!targetId) return false;
    await command(
      "fight_startareaarena",
      { targetId },
      `竞技场免费战斗 ${used + 1}/${FREE_LIMIT}`,
      10000,
    );
    await pause(1000);
    const current = await readRole();
    if (Number(current?.dailyTask?.dailyTime) !== reset) return false;
    const confirmed = freeAttemptsUsed(current);
    if (confirmed <= used) return false;
    used = confirmed;
  }
  return true;
}
