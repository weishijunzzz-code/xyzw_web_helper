const MERGE_BOX = { actType: 1 };
const BOARD_FULL = 12300040;
const CLOSED_ACTIVITY_CODES = new Set([200160, 2100010]);
const NO_REWARD = 3500020;
const MAX_ROUNDS = 50;

const errorCode = (error) =>
  Number(error.code ?? error.message?.match(/服务器错误:\s*(\d+)/)?.[1]);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getMergeBoxOpenPosition(used) {
  if (used < 2) return { gridX: 4, gridY: 5 };
  if (used < 102) return { gridX: 7, gridY: 3 };
  return { gridX: 6, gridY: 3 };
}

function findMergePairs(grid) {
  const byItem = new Map();
  const pairs = [];
  for (const [x, column] of Object.entries(grid)) {
    for (const [y, item] of Object.entries(column ?? {})) {
      if (!item || Number(item.gridConfId) !== 0 || item.gridItemId <= 0 || item.isLock) continue;
      const position = { gridX: Number(x), gridY: Number(y) };
      if (byItem.has(item.gridItemId)) {
        pairs.push([byItem.get(item.gridItemId), position]);
        byItem.delete(item.gridItemId);
      } else byItem.set(item.gridItemId, position);
    }
  }
  return pairs;
}

async function readBoard(send, stopped, wait) {
  let lastError;
  for (let attempt = 0; attempt < 3 && !stopped(); attempt++) {
    try {
      const response = await send("mergebox_getinfo", MERGE_BOX);
      const board = response?.mergeBox ?? response?.data?.mergeBox;
      if (!board || !board.gridMap || typeof board.gridMap !== "object") {
        throw new Error("无法读取合成棋盘");
      }
      return board;
    } catch (error) {
      if (CLOSED_ACTIVITY_CODES.has(errorCode(error))) throw error;
      lastError = error;
      if (attempt < 2) await wait(500);
    }
  }
  if (!stopped()) throw lastError;
  return null;
}

async function claimReward(send, command, params = MERGE_BOX) {
  try {
    await send(command, params);
  } catch (error) {
    if (errorCode(error) !== NO_REWARD) throw error;
  }
}

export async function runWeirdTowerItems({ send, stopped, log, wait = pause }) {
  let used = 0;
  let mergedRounds = 0;
  let noProgress = 0;
  let boardChanged = false;
  let checkedCost = 0;
  const stoppedResult = () => ({
    status: used || boardChanged ? "partial" : "skip",
    reason: `已停止，使用 ${used} 个道具，合成 ${mergedRounds} 轮`,
  });
  try {
    let board = await readBoard(send, stopped, wait);
    for (let round = 0; round < MAX_ROUNDS && !stopped(); round++) {
      if (Number(board.freeEnergy) > 0) {
        await send("mergebox_claimfreeenergy", MERGE_BOX);
        boardChanged = true;
        board = await readBoard(send, stopped, wait);
        if (stopped()) return stoppedResult();
      }

      const tower = await send("evotower_getinfo");
      const keys = Number(tower?.evoTower?.lotteryLeftCnt);
      const total = Number(board.costTotalCnt ?? 0);
      if (!Number.isInteger(keys) || keys < 0 || !Number.isInteger(total) || total < 0) {
        throw new Error("无法确认怪异塔道具数量");
      }
      let opened = 0;
      for (; opened < Math.min(keys, 100) && !stopped(); opened++) {
        try {
          await send("mergebox_openbox", {
            ...MERGE_BOX,
            pos: getMergeBoxOpenPosition(total + opened),
          });
          used++;
          await wait(500);
        } catch (error) {
          if (errorCode(error) !== BOARD_FULL) throw error;
          break;
        }
      }
      if (stopped()) return stoppedResult();
      if (total + opened > checkedCost) {
        await claimReward(send, "mergebox_claimcostprogress");
        checkedCost = total + opened;
      }
      if (opened) {
        board = await readBoard(send, stopped, wait);
        if (stopped()) return stoppedResult();
      }

      for (const [id, progress] of Object.entries(board.taskMap ?? {})) {
        if (stopped()) return stoppedResult();
        if (Number(progress) > 0 && !board.taskClaimMap?.[id]) {
          await claimReward(send, "mergebox_claimmergeprogress", {
            ...MERGE_BOX,
            taskId: Number(id),
          });
        }
      }
      if (stopped()) return stoppedResult();
      const pairs = findMergePairs(board.gridMap);
      if (!pairs.length && opened === keys) {
        return { status: "ok", reason: `使用 ${used} 个道具，合成 ${mergedRounds} 轮` };
      }
      const priorGrid = JSON.stringify(board.gridMap);
      if (pairs.length) {
        if (Number(board.taskMap?.["251212208"]) > 0) {
          await send("mergebox_automergeitem", MERGE_BOX, 10000);
          boardChanged = true;
          await wait(1500);
        } else {
          for (const [source, target] of pairs) {
            if (stopped()) return stoppedResult();
            await send("mergebox_mergeitem", {
              ...MERGE_BOX,
              sourcePos: source,
              targetPos: target,
            });
            boardChanged = true;
            await wait(300);
          }
        }
      }
      board = await readBoard(send, stopped, wait);
      if (stopped()) return stoppedResult();
      const merged = JSON.stringify(board.gridMap) !== priorGrid;
      if (merged) mergedRounds++;
      noProgress = opened || merged ? 0 : noProgress + 1;
      if (noProgress >= 3) {
        return { status: "partial", reason: "棋盘已满或连续三轮无进展，保留剩余道具" };
      }
      log(`已使用 ${used} 个道具，完成 ${mergedRounds} 轮合成`);
    }
    if (stopped()) return stoppedResult();
    return { status: "partial", reason: `达到 ${MAX_ROUNDS} 轮上限，保留剩余道具` };
  } catch (error) {
    if (stopped()) return stoppedResult();
    if (CLOSED_ACTIVITY_CODES.has(errorCode(error))) {
      return { status: used || boardChanged ? "partial" : "skip", reason: "怪异塔活动未开启或已结束" };
    }
    if (used || boardChanged) {
      return { status: "partial", reason: `已使用 ${used} 个道具，操作中止：${error.message}` };
    }
    throw error;
  }
}
