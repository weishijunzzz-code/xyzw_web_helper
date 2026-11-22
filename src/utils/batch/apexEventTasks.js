import { ApexAction, runApexAction } from "../apexRateLimit.js";
import {
  ApexStageType,
  calibrateServerTime,
  checkSupportInTime,
  getCurrentRounds,
  getCurrentSeason,
  getScheduleIdByStage,
  getStageInfoByRound,
  getSupportGroupId,
} from "../apexRules.js";

// [configuration ID, progress counter, required value]
const CLAIM_RULES = [
  [1, 1, 1], [2, 1, 2], [3, 1, 4], [4, 2, 50],
  [5, 2, 100], [6, 3, 1], [7, 4, 1],
];

const skip = (reason) => ({ status: "skip", reason });

export async function appointPkRoom({ send, stopped }) {
  if (stopped()) return skip("已停止");
  try {
    const response = await send("pkroom_appoint");
    if (!response || response.error) throw new Error(response?.error || "服务器未确认预约");
  } catch (error) {
    // The game reports a successful appointment as a business notification.
    const code = Number(error.code ?? error.message?.match(/服务器错误:\s*(\d+)/)?.[1]);
    if (code !== 11900050) throw error;
  }
  return { status: "ok", reason: "已预约当前赛事" };
}

function eventCommand(send, stopped, rateLimit, action, cmd, params = {}) {
  return rateLimit(action, (queuedMs) => {
    if (stopped()) return null;
    return send(cmd, params, 8000 + queuedMs);
  }, { maxRetry: action === ApexAction.READ ? 1 : 0 });
}

export async function claimApexEventTasks({
  send, stopped, log, rateLimit = runApexAction,
}) {
  const command = (...args) => eventCommand(send, stopped, rateLimit, ...args);
  const response = await command(ApexAction.READ, "apex_getroleinfo");
  const info = response?.apexRoleInfo;
  if (stopped()) return skip("已停止");
  if (!info) throw new Error("无法读取赛事任务进度");
  const pending = CLAIM_RULES.filter(
    ([id, counter, minimum]) =>
      !info.taskClaimedMap?.[id] && Number(info.taskProgress?.[counter]) >= minimum,
  );
  if (!pending.length) return skip("没有可领取的赛事任务");
  let claimed = 0;
  try {
    for (const [id] of pending) {
      if (stopped()) break;
      const result = await command(ApexAction.VOTE, "apex_taskclaim", { confId: id });
      if (!result && stopped()) break;
      if (!result?.apexRoleInfo?.taskClaimedMap?.[id] && !result?.reward?.length) {
        throw new Error(`服务器未确认赛事任务 ${id} 的奖励`);
      }
      claimed++;
      log(`已领取赛事任务 ${id}`);
    }
  } catch (error) {
    if (!claimed) throw error;
    return { status: "partial", reason: `已领取 ${claimed} 项，后续领取失败：${error.message}` };
  }
  if (!claimed) return skip("已停止");
  return {
    status: claimed === pending.length ? "ok" : "partial",
    reason: `已领取 ${claimed}/${pending.length} 项赛事奖励`,
  };
}

export async function voteInApexEvent({
  send, stopped, now = Date.now(), rateLimit = runApexAction, rank = 1,
}) {
  const command = (...args) => eventCommand(send, stopped, rateLimit, ...args);
  const response = await command(ApexAction.READ, "apex_getroleinfo");
  const info = response?.apexRoleInfo;
  if (stopped()) return skip("已停止");
  if (!info) throw new Error("无法读取赛事角色数据");
  const votes = Number(info.voteItemCnt);
  if (!Number.isInteger(votes) || votes <= 0) return skip("没有可用助威票");
  const serverNow = calibrateServerTime(now, info.resetTime?.day);
  const season = getCurrentSeason(serverNow);
  const round = getCurrentRounds(season, serverNow).find(
    (candidate) => checkSupportInTime(candidate, season, serverNow),
  );
  if (!round) return skip("赛事助威尚未开放");
  if (Object.values(info.voteMap?.[round] ?? {}).some((entry) => Number(entry?.cnt) > 0)) {
    return skip("本期已有助威记录");
  }
  const stages = getStageInfoByRound(round, season, serverNow);
  const stage = stages?.[ApexStageType.TaoTai]?.isEnable
    ? ApexStageType.TaoTai : ApexStageType.ZhengShi;
  const scheduleId = getScheduleIdByStage(stage, round, season);
  const groupId = getSupportGroupId(info.group, scheduleId);
  const entries = await command(ApexAction.READ, "apex_getvotelist", { groupId, idx: 0, round });
  if (stopped()) return skip("已停止");
  const teams = entries?.apexVoteList;
  if (!Array.isArray(teams)) throw new Error("无法读取赛事助威榜");
  // The server returns ranking order, including eliminated entries. Never
  // spend tickets on a replacement when the first-place team is ineligible.
  if (!Number.isInteger(rank) || rank < 1) throw new Error("助威排名无效");
  const ranked = [...teams].sort((left, right) => (Number(right?.cheerCnt) || 0) - (Number(left?.cheerCnt) || 0));
  const target = ranked[rank - 1];
  if (!target?.teamId || target.isOut) return skip(rank === 1 ? "榜首队伍当前不可助威" : "所选排名当前不可助威");
  const result = await command(ApexAction.VOTE, "apex_vote", {
    round, teamId: target.teamId, voteCnt: votes,
  });
  if (!result && stopped()) return skip("已停止");
  const before = Number(info.voteMap?.[round]?.[target.teamId]?.cnt) || 0;
  const after = Number(result?.apexRoleInfo?.voteMap?.[round]?.[target.teamId]?.cnt) || 0;
  if (after - before < votes) {
    return { status: "unverified", reason: "服务器未确认助威票已到账" };
  }
  return { status: "ok", reason: `已为 ${target.name || target.teamId} 助威 ${votes} 次` };
}
