import assert from "node:assert/strict";
import { test } from "node:test";
import { executeScheduledTask } from "../server/lib/taskExecutor.js";
import { appointPkRoom, claimApexEventTasks, voteInApexEvent } from "../src/utils/batch/apexEventTasks.js";
import { runWeirdTowerItems } from "../src/utils/batch/weirdTowerItems.js";
import { buildBattlefieldUrl, enterSaltBattlefield, getPayloadOpponent, openBattlefieldSocket } from "../src/utils/battlefieldConnection.js";
import { prepareBinToken, saveBinToken } from "../src/utils/binTokenImport.js";
import { runDailyFreeArena } from "../src/utils/dailyArena.js";
import { getAuthUserData, getTokenErrorMessage } from "../src/utils/tokenLogin.js";

test("daily arena uses the reset-day counter and waits for confirmation between free fights", async () => {
  const reset = 1760000000;
  for (const start of [0, 1, 2, 3, 4]) {
    let used = start;
    const commands = [];
    const success = await runDailyFreeArena({
      readRole: async () => ({
        dailyTask: { dailyTime: reset },
        statisticsTime: { "area:arena:last": reset + 1 },
        statistics: { "area:arena:last": used },
      }),
      prepare: async () => commands.push("prepare"),
      command: async (cmd) => {
        commands.push(cmd);
        if (cmd === "arena_getareatarget") return [{ roleId: 42 }];
        if (cmd === "fight_startareaarena") used++;
        return {};
      },
      pause: async () => {},
    });
    assert(success);
    assert.equal(commands.filter((cmd) => cmd === "arena_startarea").length, Number(start < 3));
    assert.equal(used, Math.max(3, start));
  }
});

test("daily arena stops after one acknowledged fight when the counter stays stale", async () => {
  let fought = 0;
  const success = await runDailyFreeArena({
    readRole: async () => ({
      dailyTask: { dailyTime: 100 },
      statistics: { "area:arena:last": 3 },
      statisticsTime: { "area:arena:last": 99 },
    }),
    prepare: async () => {},
    command: async (cmd) => {
      if (cmd === "arena_getareatarget") return { roleId: 42 };
      if (cmd === "fight_startareaarena") fought++;
      return {};
    },
    pause: async () => {},
  });
  assert.equal(success, false);
  assert.equal(fought, 1);
});

test("legacy cloud treasure-only plans skip without opening a game connection", async () => {
  const result = await executeScheduledTask({
    tokenIds: ["a"],
    settings: { selectedTasks: ["batchbaoku13", "batchbaoku45"] },
  }, "u", { getAllTokens: () => [{ id: "a", name: "A" }] }, {});
  assert.equal(result.status, "skip");
  assert.deepEqual(result.results.map((item) => item.accounts.details[0].reason), [
    "咸王宝库玩法已下线", "咸王宝库玩法已下线",
  ]);
});

test("cloud account mode executes the new tower and event jobs through their real registries", async () => {
  const calls = [];
  const manager = {
    getWebSocketStatus: () => "connected",
    disconnect() {},
    async sendMessageWithPromise(_id, cmd) {
      calls.push(cmd);
      if (cmd === "role_getroleinfo") return { role: { roleId: 1 } };
      if (cmd === "mergebox_getinfo") return { mergeBox: { gridMap: {} } };
      if (cmd === "evotower_getinfo") return { evoTower: { lotteryLeftCnt: 0 } };
      if (cmd === "apex_getroleinfo") return { apexRoleInfo: {} };
      return {};
    },
  };
  const selectedTasks = ["batchUseAndMergeItems", "batchApexClaimTasks", "batchApexVote", "batchPkRoomAppoint"];
  const result = await executeScheduledTask({
    tokenIds: ["a"],
    settings: { executionMode: "account", selectedTasks },
  }, "u", { getAllTokens: () => [{ id: "a", name: "A" }] }, manager);
  assert.deepEqual(result.results.map((item) => [item.task, item.status]), [
    ["batchUseAndMergeItems", "ok"], ["batchApexClaimTasks", "skip"],
    ["batchApexVote", "skip"], ["batchPkRoomAppoint", "ok"],
  ]);
  assert.equal(calls.filter((cmd) => cmd === "pkroom_appoint").length, 1);
});

test("BIN reading can be stopped and duplicate credentials preserve existing account metadata", async () => {
  const bin = new Uint8Array([1, 2]).buffer;
  const file = { name: "demo.bin", arrayBuffer: async () => bin };
  const controller = new AbortController();
  const options = { name: "", server: "", wsUrl: "", pendingIds: new Set(), signal: controller.signal };
  const deps = {
    getTokenId: () => "same",
    transformToken: async () => "new-credential",
    onAuthenticating() {},
  };
  const role = await prepareBinToken(file, options, deps);
  const stored = { id: "same", name: "已有账号", remark: "保留备注", token: "old" };
  assert.equal(await saveBinToken(role, {
    gameTokens: [stored],
    updateToken(id, patch) {
      assert.equal(id, stored.id);
      Object.assign(stored, patch);
      return true;
    },
  }, async (id, data) => id === "same" && data === bin), "updated");
  assert.deepEqual(stored, { id: "same", name: "已有账号", remark: "保留备注", token: "new-credential" });
  controller.abort();
  await assert.rejects(prepareBinToken(file, options, deps), { name: "AbortError" });
});

test("auth responses are validated and Chinese errors preserve the server code", () => {
  const error = { code: 403, error: "check token error" };
  assert.throws(() => getAuthUserData(error), /校验失败.*403/);
  assert.throws(() => getAuthUserData({ getData: () => ({}) }), /没有有效 Token/);
  assert.equal(getAuthUserData({ getData: () => ({ roleToken: "fixture" }) }).roleToken, "fixture");
  assert.match(getTokenErrorMessage(new Error("服务器错误: 200400 - 测试")), /200400/);
});

test("battlefield URL validation keeps one SID and rejects untrusted hosts", () => {
  const url = new URL(buildBattlefieldUrl({
    domainName: "https://war.hortorgames.com/agent?sid2=old",
    sid: "a/b",
  }, "demo"));
  assert.equal(url.protocol, "wss:");
  assert.equal(url.hostname, "war.hortorgames.com");
  assert.deepEqual(url.searchParams.getAll("sid2"), ["a/b"]);
  assert.throws(() => buildBattlefieldUrl({
    domainName: "https://war.hortorgames.com.example.com/agent",
    sid: "s",
  }, "demo"), /受信任/);
  assert.equal(getPayloadOpponent({ info: { legions: { x: { id: "1" }, y: { id: 2 } } } }, 1), 2);
});

test("battlefield open is abortable and salt entry waits for the server", async () => {
  const controller = new AbortController();
  let disconnected = 0;
  const socket = { init() {}, disconnect: () => disconnected++ };
  const pending = openBattlefieldSocket(socket, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(disconnected, 1);

  const commands = [];
  let acknowledge;
  const entry = enterSaltBattlefield({
    connected: true,
    waitForPush: () => new Promise((resolve) => { acknowledge = resolve; }),
    send: (cmd, params) => commands.push([cmd, params]),
  }, "bf");
  assert.deepEqual(commands.map(([cmd]) => cmd), ["war_enterbattlefield"]);
  acknowledge({ cmd: "war_enterbattlefieldresp" });
  await entry;
  assert.deepEqual(commands.map(([cmd]) => cmd), ["war_enterbattlefield", "war_getbattlefieldinfo"]);
});

test("weird tower merges a full board before resuming and claims cumulative rewards", async () => {
  const item = { gridConfId: 0, gridItemId: 42 };
  let grid = { 1: { 1: item, 2: item } };
  let keys = 1;
  let claimed = 0;
  let used = 0;
  const run = await runWeirdTowerItems({
    stopped: () => false,
    wait: async () => {},
    log() {},
    async send(cmd, params) {
      if (cmd === "mergebox_getinfo") return { mergeBox: { gridMap: grid, costTotalCnt: used } };
      if (cmd === "evotower_getinfo") return { evoTower: { lotteryLeftCnt: keys } };
      if (cmd === "mergebox_mergeitem") {
        assert.deepEqual(params.sourcePos, { gridX: 1, gridY: 1 });
        grid = {};
        return {};
      }
      if (cmd === "mergebox_openbox") {
        if (Object.keys(grid).length) throw new Error("服务器错误: 12300040 - 棋盘已满");
        keys--;
        used++;
        return {};
      }
      assert.equal(cmd, "mergebox_claimcostprogress");
      claimed++;
      return {};
    },
  });
  assert.equal(run.status, "ok");
  assert.equal(used, 1);
  assert.equal(claimed, 1);
});

test("weird tower skips closed activities and stops promptly when cancelled", async () => {
  for (const code of [200160, 2100010]) {
    let calls = 0;
    const closed = await runWeirdTowerItems({
      stopped: () => false,
      log() {},
      async send() {
        calls++;
        throw new Error(`服务器错误: ${code} - 活动未开放`);
      },
    });
    assert.equal(closed.status, "skip");
    assert.equal(calls, 1);
  }
  assert.equal((await runWeirdTowerItems({ stopped: () => true, async send() {
    assert.fail("should not send commands");
  } })).status, "skip");
});

test("Apex claims only completed rewards and skips already received rewards", async () => {
  const info = { taskProgress: { 1: 2 }, taskClaimedMap: { 1: true } };
  let writes = 0;
  const inputs = {
    stopped: () => false,
    log() {},
    rateLimit: (_action, task) => task(0),
    async send(cmd, params) {
      if (cmd === "apex_getroleinfo") return { apexRoleInfo: info };
      assert.equal(cmd, "apex_taskclaim");
      assert.deepEqual(params, { confId: 2 });
      writes++;
      info.taskClaimedMap[2] = true;
      return { apexRoleInfo: info };
    },
  };
  assert.equal((await claimApexEventTasks(inputs)).status, "ok");
  assert.equal((await claimApexEventTasks(inputs)).status, "skip");
  assert.equal(writes, 1);
});

test("Apex voting sends no write when there are no tickets", async () => {
  const result = await voteInApexEvent({
    stopped: () => false,
    rateLimit: (_action, task) => task(0),
    async send(cmd) {
      assert.equal(cmd, "apex_getroleinfo");
      return { apexRoleInfo: { voteItemCnt: 0 } };
    },
  });
  assert.equal(result.status, "skip");
});

test("Apex votes for the eligible leader once and checks the round's server receipt", async () => {
  const now = Date.parse("2026-11-01T16:00:00Z");
  const info = { voteItemCnt: 12, voteMap: {} };
  let writes = 0;
  const inputs = {
    now,
    stopped: () => false,
    rateLimit: (_action, task) => task(0),
    async send(cmd, params) {
      if (cmd === "apex_getroleinfo") return { apexRoleInfo: structuredClone(info) };
      if (cmd === "apex_getvotelist") return { apexVoteList: [{ teamId: "leader", name: "榜首" }] };
      assert.equal(cmd, "apex_vote");
      assert.deepEqual(params, { round: 6, teamId: "leader", voteCnt: 12 });
      writes++;
      info.voteMap[6] = { leader: { cnt: 12 } };
      return { apexRoleInfo: info };
    },
  };
  assert.equal((await voteInApexEvent(inputs)).status, "ok");
  assert.equal((await voteInApexEvent(inputs)).status, "skip");
  assert.equal(writes, 1);
});

test("the PK appointment notification is treated as success without a dated history request", async () => {
  const result = await appointPkRoom({
    stopped: () => false,
    async send(cmd) {
      assert.equal(cmd, "pkroom_appoint");
      throw new Error("服务器错误: 11900050 - 感谢您预约本场比赛");
    },
  });
  assert.equal(result.status, "ok");
});
