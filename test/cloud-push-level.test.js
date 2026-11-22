import assert from "node:assert/strict";
import test from "node:test";
import { PushLevelService } from "../server/lib/pushLevelService.js";

test("cloud pushing retains win and loss results across phases and stopping", { timeout: 2000 }, async () => {
  const snapshots = [];
  const responses = [
    { body: { isWin: true, currLevel: 81, nextTime: 0 } },
    { currLevel: 81, nextTime: 0 },
  ];
  let finished;
  const stopped = new Promise((resolve) => { finished = resolve; });
  const service = new PushLevelService({
    getConnectionStatus: () => "connected",
    sendMessageWithPromise: async (_id, cmd) => cmd === "fight_calcleveltime"
      ? { currLevel: 80, battleTime: 0 }
      : responses.shift(),
  }, {
    broadcast(_event, { status }) {
      snapshots.push(status);
      if (!status.running) finished(status);
    },
  });

  assert.equal((await service.start("account-a", "owner", { maxFail: 1 })).ok, true);
  const status = await stopped;
  assert.ok(snapshots.some((item) => item.phase === "waiting" && item.lastBattle?.won === true && item.lastBattle.level === 80));
  assert.ok(snapshots.some((item) => item.phase === "settling"));
  assert.equal(status.passed, 1);
  assert.equal(status.failed, 1);
  assert.equal(status.failStreak, 1);
  assert.equal(status.lastBattle.won, false);
  assert.equal(status.lastBattle.level, 81);
  assert.equal(status.phase, "stopped");
  assert.equal(status.stopReason, "连续失败1次");
});

test("an unconfirmed battle result is shown as a retry without counting a loss", { timeout: 2000 }, async () => {
  let reported;
  const retrying = new Promise((resolve) => { reported = resolve; });
  const service = new PushLevelService({
    getConnectionStatus: () => "connected",
    sendMessageWithPromise: async (_id, cmd) => cmd === "fight_calcleveltime"
      ? { currLevel: 80, battleTime: 0 }
      : {},
  }, {
    broadcast(_event, { status }) {
      if (status.phase === "retrying") {
        service.stop("account-a");
        reported(status);
      }
    },
  });

  await service.start("account-a", "owner");
  const status = await retrying;
  assert.equal(status.lastError, "服务端未返回可确认的战斗结果");
  assert.equal(status.failed, 0);
  assert.equal(status.failStreak, 0);
  assert.equal(status.lastBattle, null);
});

test("a result arriving after stop cannot update a newly started run", { timeout: 2000 }, async () => {
  let settleBattle;
  const pendingBattle = new Promise((resolve) => { settleBattle = resolve; });
  let battleRequested;
  const submitted = new Promise((resolve) => { battleRequested = resolve; });
  const service = new PushLevelService({
    getConnectionStatus: () => "connected",
    sendMessageWithPromise: async (_id, cmd) => {
      if (cmd === "fight_calcleveltime") return { currLevel: 80, battleTime: 0 };
      battleRequested();
      return pendingBattle;
    },
  });

  await service.start("account-a", "owner");
  await submitted;
  service.stop("account-a");
  await service.start("account-a", "owner");
  service.stop("account-a");
  settleBattle({ success: true, currLevel: 81 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getStatus("account-a").passed, 0);
  assert.equal(service.getStatus("account-a").lastBattle, null);
});
