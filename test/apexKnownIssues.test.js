import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadModule } from "./helpers/loadModule.js";

const source = await readFile(
  new URL("../src/components/Apex/ApexChallenge.vue", import.meta.url),
  "utf8",
);
const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile(
  "ApexChallenge.js",
  script,
  ts.ScriptTarget.ES2022,
  true,
);
const names = [
  "fetchPagedList",
  "fetchMatchesPage",
  "ensureBetRows",
  "fetchVoteBoard",
];
const declarations = ast.statements
  .filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((d) =>
        names.includes(d.name.getText(ast)),
      ),
  )
  .map((node) => node.getText(ast))
  .join("\n");

function pageContext(responses) {
  const calls = [];
  const currentVoteBoard = { value: [{ teamId: "previous", rank: 1 }] };
  const context = vm.createContext({
    tokenStore: {
      selectedToken: { id: "test" },
      async sendMessageWithPromise(_id, _cmd, params) {
        calls.push(params.idx);
        const next = responses.shift();
        if (next instanceof Error) throw next;
        assert.ok(next, "Unexpected extra page request");
        return next;
      },
    },
    runApexAction: (_action, task) => task(0),
    ApexAction: { READ: "read" },
    isApexRateLimited: (error) => error.code === 200400,
    MAX_PAGES: 12,
    FIRST_PAGES: 1,
    VOTE_BOARD_MAX: 100,
    TIMEOUT_QUERY: 8000,
    TIMEOUT_READ: 8000,
    fetchingStages: new Set(),
    toMatchRow: (row) => row,
    selectedRound: { value: 1 },
    season: { value: 1 },
    roleInfo: { value: { group: {} } },
    voteScheduleId: { value: 10 },
    getSupportGroupId: () => 1,
    voteBoardComplete: { value: true },
    currentVoteBoard,
    getSupportLevel: () => 1,
    getMyVoteCnt: () => 0,
  });
  vm.runInContext(
    `${declarations}\nglobalThis.subject = { ${names.join(", ")} };`,
    context,
  );
  return { ...context.subject, calls, currentVoteBoard, context };
}
function limited() {
  return Object.assign(new Error("rate limited"), { code: 200400 });
}

test("rate-limited guessing pages remain retryable and resume at loaded row count", async () => {
  const page = pageContext([
    limited(),
    { apexGuessList: [{ id: 1 }], last: false },
    limited(),
    { apexGuessList: [{ id: 2 }], last: true },
  ]);
  const group = {
    scheduleId: 10,
    matches: [],
    exhausted: false,
    hasMore: true,
  };
  await page.ensureBetRows(group, 2);
  assert.equal(group.exhausted, false);
  assert.equal(group.hasMore, true);
  await page.ensureBetRows(group, 2);
  assert.equal(group.matches.length, 1);
  assert.equal(group.exhausted, false);
  await page.ensureBetRows(group, 2);
  assert.equal(group.matches.length, 2);
  assert.deepEqual(page.calls, [0, 0, 1, 1]);
});

test("confirmed empty guessing pages stop further pagination", async () => {
  const page = pageContext([{ apexGuessList: [], last: true }]);
  const group = {
    scheduleId: 10,
    matches: [],
    exhausted: false,
    hasMore: true,
  };
  await page.ensureBetRows(group, 2);
  assert.equal(group.exhausted, true);
  assert.equal(group.hasMore, false);
  assert.deepEqual(page.calls, [0]);
});

test("an in-flight guessing page does not mark the group exhausted", async () => {
  const page = pageContext([]);
  page.context.fetchingStages.add(10);
  const group = {
    scheduleId: 10,
    matches: [],
    exhausted: false,
    hasMore: true,
  };
  await page.ensureBetRows(group, 2);
  assert.equal(group.exhausted, false);
  assert.deepEqual(page.calls, []);
});

test("partial rate-limited vote boards retain the last complete board", async () => {
  const page = pageContext([
    { apexVoteList: [{ teamId: "partial" }], last: false },
    limited(),
  ]);
  const previous = page.currentVoteBoard.value;
  await page.fetchVoteBoard();
  assert.equal(page.currentVoteBoard.value, previous);
  assert.equal(page.context.voteBoardComplete.value, false);
});

test("a complete or confirmed empty vote board replaces the previous board", async () => {
  const page = pageContext([
    { apexVoteList: [{ teamId: "complete" }], last: true },
    { apexVoteList: [], last: true },
  ]);
  await page.fetchVoteBoard();
  assert.equal(page.currentVoteBoard.value[0].teamId, "complete");
  assert.equal(page.context.voteBoardComplete.value, true);
  await page.fetchVoteBoard();
  assert.equal(page.currentVoteBoard.value.length, 0);
  assert.equal(page.context.voteBoardComplete.value, true);
});

test("batch guessing processes every open round when schedule windows overlap", async () => {
  const requests = [];
  const rules = {
    ApexScheduleStatus: { Unlocked: 1, Locked: 2 },
    calibrateServerTime: (now) => now,
    getCurrentSeason: () => 1,
    getCurrentRounds: () => [1, 2, 3],
    getGuessTabs: (round) => [
      {
        stage: 4,
        scheduleId: round * 10,
        state: round === 3 ? 4 : 1,
        title: "stage",
      },
    ],
    getAdvanceNum: () => 1,
  };
  const { createTasksApex } = await loadModule(
    new URL("../src/utils/batch/tasksApex.js", import.meta.url),
    {
      "@/utils/apexRules": rules,
      "@/utils/apexRateLimit": {
        ApexAction: { READ: "read", GUESS: "guess" },
        runApexAction: (_action, task) => task(0),
        isApexRateLimited: () => false,
        apexCooldownLeft: () => 0,
      },
    },
  );
  const deps = {
    selectedTokens: { value: ["test"] },
    tokens: { value: [{ id: "test", name: "test" }] },
    tokenStatus: { value: {} },
    isRunning: { value: false },
    shouldStop: { value: false },
    ensureConnection: async () => {},
    releaseConnectionSlot() {},
    connectionQueue: { active: 0 },
    batchSettings: { maxActive: 1 },
    addLog() {},
    message: { success() {} },
    currentRunningTokenId: { value: null },
    tokenStore: {
      closeWebSocketConnection() {},
      async sendMessageWithPromise(_id, cmd, params) {
        if (cmd === "apex_getroleinfo") return { apexRoleInfo: {} };
        if (cmd === "apex_getguesslist") {
          requests.push(params.scheduleId);
          return {
            apexGuessList: [
              [
                { teamId: `a${params.scheduleId}`, cheerCnt: 2 },
                { teamId: `b${params.scheduleId}`, cheerCnt: 1 },
              ],
            ],
            last: true,
          };
        }
        assert.equal(cmd, "apex_guess");
        return {};
      },
    },
  };
  await createTasksApex(deps).batchApexGuess();
  assert.deepEqual(requests, [10, 20]);
  assert.equal(deps.tokenStatus.value.test, "completed");
  assert.equal(deps.isRunning.value, false);
});

test("pagination distinguishes a page-budget stop from a completed result", async () => {
  const page = pageContext([
    { apexVoteList: [{ teamId: "partial" }], last: false },
  ]);
  const result = await page.fetchPagedList({
    cmd: "apex_getvotelist",
    params: {},
    listKey: "apexVoteList",
    timeout: 8000,
    maxPages: 1,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.interrupted, false);
});

test("missing credentials do not turn guessing pages into confirmed empty results", async () => {
  const page = pageContext([]);
  page.context.tokenStore.selectedToken = null;
  const group = {
    scheduleId: 10,
    matches: [],
    exhausted: false,
    hasMore: true,
  };
  await page.ensureBetRows(group, 2);
  assert.equal(group.exhausted, false);
  assert.deepEqual(page.calls, []);
});

test("network failure retains the previous vote board", async () => {
  const page = pageContext([new Error("connection closed")]);
  const previous = page.currentVoteBoard.value;
  await page.fetchVoteBoard();
  assert.equal(page.currentVoteBoard.value, previous);
});
