import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campCalendar, campVictory, runCampChallenge } from '../server/lib/batch/campChallengeRunner.js';
import { accountSummary, persistedResult } from '../server/lib/executionResults.js';
import { executeSelectedTasks } from '../server/lib/taskExecutor.js';

function fixture(options = {}) {
  let date = new Date('2026-11-17T04:00:00Z');
  const day = campCalendar(date);
  const state = { used: options.used ?? 9, defenders: Object.fromEntries((options.nodes || [11]).map(node => [node, { name: `目标${node}`, roleId: node + 100, defeated: false, challengeCnt: 0, failCnt: 0 }])), reads: 0, attacks: [], simulations: [], waits: [], slot: 1, pet: 'pet-9' };
  const calls = [];
  const preset = () => ({ presetTeamInfo: { useTeamId: state.slot, presetTeamInfo: { 1: { teamInfo: { 0: { heroId: 101 } }, lordWeaponId: 8, petUId: state.pet }, 2: { teamInfo: { 0: { heroId: 102 } }, lordWeaponId: 8, petUId: state.pet } } } });
  const send = async (cmd, params = {}) => {
    calls.push({ cmd, params: structuredClone(params) });
    if (cmd === 'presetteam_getinfo') return preset();
    if (cmd === 'role_getroleinfo') return { role: { roleId: 1, lordWeaponId: options.roleWeapon ?? 8, petUId: state.pet } };
    if (cmd === 'presetteam_saveteam') { state.slot = params.teamId; return {}; }
    if (cmd === 'club_getinfo') {
      state.reads++;
      options.onRead?.(state);
      return structuredClone({ club: { oppoMap: options.nonMatch ? {} : { [day.weekday]: { name: '对手', defenders: state.defenders } } }, siege: { attackMap: { [day.key]: { attackCnt: state.used } } } });
    }
    if (cmd === 'club_gettargetteam') return { teamInfo: { heroId: params.targetId } };
    if (cmd === 'fight_startpvp') {
      state.simulations.push(params.targetId);
      if (options.spar) return options.spar(params.targetId, state);
      return { battleData: { result: { isWin: !(options.simLoss || []).includes(params.targetId - 100) } } };
    }
    if (cmd === 'club_attack') {
      state.attacks.push(params.nodeId);
      if (options.attack) return options.attack(params, state);
      state.used++;
      state.defenders[params.nodeId].defeated = true;
      return { battleData: { result: { isWin: true } } };
    }
    throw new Error(`Unexpected ${cmd}`);
  };
  return { state, calls, run: settings => runCampChallenge({ send, settings, now: () => date, wait: async ms => state.waits.push(ms) }), setDate(value) { date = new Date(value); } };
}
test('二区 first three losing targets cannot hide a winning fourth candidate', async () => {
  const f = fixture({ nodes: [1, 11, 12, 13, 14], simLoss: [11, 12, 13] });
  const result = await f.run();
  assert.deepEqual(f.state.attacks, [14]);
  assert.equal(f.state.simulations.filter(id => id === 114).length, 3);
  assert.equal(result.status, 'ok');
});
test('full 二区 evaluation precedes 一区 and 三区 remains last fallback', async () => {
  const first = fixture({ nodes: [1, 11, 12, 21], simLoss: [11, 12] });
  await first.run(); assert.deepEqual(first.state.attacks, [1]);
  assert(first.state.simulations.indexOf(101) > first.state.simulations.indexOf(112));
  const third = fixture({ nodes: [1, 11, 21], simLoss: [1, 11] });
  await third.run(); assert.deepEqual(third.state.attacks, [21]);
});
test('no qualifying target preserves every remaining chance and is incomplete', async () => {
  const f = fixture({ nodes: [1, 11, 21], used: 0, simLoss: [1, 11, 21] });
  const result = await f.run();
  assert.equal(result.status, 'incomplete'); assert.equal(result.camp.remaining, 10); assert.equal(f.state.attacks.length, 0);
  assert.equal(persistedResult({ results: [{ status: 'incomplete' }] }).status, 'incomplete');
});
test('more than three remaining wins are executed until server quota is exhausted', async () => {
  const f = fixture({ nodes: Array.from({ length: 10 }, (_, i) => i + 11), used: 0 });
  const result = await f.run();
  assert.equal(f.state.attacks.length, 10); assert.equal(result.camp.wins, 10); assert.equal(result.camp.remaining, 0); assert.equal(result.status, 'ok');
});
test('real defeat after winning simulations refreshes counters and tries other 二区 targets first', async () => {
  const f = fixture({ nodes: [1, 11, 12], used: 8, attack(params, state) {
    if (params.nodeId === 11) { state.defenders[11].failCnt++; return { battleData: { result: { isWin: false } } }; }
    state.used++; state.defenders[params.nodeId].defeated = true; return { battleData: { result: { isWin: true } } };
  } });
  const result = await f.run();
  assert.deepEqual(f.state.attacks, [11, 12, 1]); assert.equal(result.camp.losses, 1); assert.equal(result.camp.wins, 2); assert.equal(result.camp.remaining, 0); assert.equal(result.status, 'partial');
});
test('battle response timeout is reconciled without replay even if server already consumed the chance', async () => {
  const f = fixture({ attack(params, state) { state.used++; state.defenders[params.nodeId].defeated = true; throw new Error('请求超时'); } });
  const result = await f.run();
  assert.equal(f.state.attacks.length, 1); assert.equal(result.camp.finalUsed, 10); assert.equal(result.status, 'unverified'); assert.equal(result.camp.unknown, 1);
});
test('missing result and unchanged board stop after two verification rounds, never count as victory', async () => {
  const f = fixture({ used: 0, attack() { return {}; } });
  const result = await f.run();
  assert.equal(f.state.attacks.length, 1); assert.equal(result.camp.wins, 0); assert.equal(result.camp.remaining, 10); assert.equal(result.status, 'unverified');
  assert.equal(f.state.reads, 5);
});
test('known result with no observable progress stops without pretending quota exhausted', async () => {
  const f = fixture({ used: 0, attack() { return { battleData: { result: { isWin: true } } }; } });
  const result = await f.run(); assert.equal(result.status, 'incomplete'); assert.equal(result.camp.remaining, 10); assert.match(result.reason, /无进展/); assert.equal(f.state.attacks.length, 1);
});
test('simulation unavailability never falls back to random battle; explicit rate limiting retries once', async () => {
  let limited = false;
  const unavailable = fixture({ spar() { return {}; } });
  assert.equal((await unavailable.run()).status, 'incomplete'); assert.equal(unavailable.state.attacks.length, 0);
  const rate = fixture({ spar() { if (!limited) { limited = true; return { code: 400340, hint: '限频' }; } return { battleData: { result: { isWin: true } } }; } });
  assert.equal((await rate.run()).status, 'ok'); assert(rate.state.waits.includes(11000)); assert.equal(rate.state.simulations.length, 4);
});
test('stale defeated target is re-evaluated, never attacked with cached challenge parameters', async () => {
  const f = fixture({ nodes: [11, 12], onRead(state) { if (state.reads === 3) state.defenders[11].defeated = true; } });
  await f.run(); assert.deepEqual(f.state.attacks, [12]);
});
test('stored formation, heroes, weapon and pet agree and the original slot is restored', async () => {
  const f = fixture(); const result = await f.run({ arenaFormation: 2 });
  assert.equal(result.status, 'ok'); assert.equal(f.state.slot, 1);
  const params = f.calls.find(c => c.cmd === 'club_attack').params.teamSetParams;
  assert.deepEqual(params, { battleTeam: { 0: 102 }, lordWeaponId: 8, petUId: 'pet-9' });
});
test('server-declared exhaustion is authoritative; already exhausted days do not launch a challenge', async () => {
  const full = fixture({ used: 10 }); assert.equal((await full.run()).status, 'ok'); assert.equal(full.state.attacks.length, 0);
  const rejected = fixture({ attack() { throw new Error('服务器错误: 123 - 今日营地挑战次数已用完'); } });
  const result = await rejected.run(); assert.equal(result.status, 'ok'); assert.equal(result.camp.quotaConfirmed, true); assert.equal(result.camp.remaining, 0);
});
test('Shanghai calendar and non-match days are handled without spending attempts', async () => {
  assert.deepEqual(campCalendar(new Date('2026-11-16T17:00:00Z')), { key: '261117', weekday: '2' });
  const f = fixture({ nonMatch: true }); assert.equal((await f.run()).status, 'skip'); assert.equal(f.state.attacks.length, 0);
});
test('crossing midnight during simulation prevents any attack on the next day', async () => {
  const f = fixture({ spar() { f.setDate('2026-11-17T16:01:00Z'); return { battleData: { result: { isWin: true } } }; } });
  const result = await f.run(); assert.equal(result.status, 'incomplete'); assert.match(result.reason, /跨日/); assert.equal(f.state.attacks.length, 0);
});
test('structured challenge outcome survives reward status overwrite and handled free-simulation errors', async () => {
  const deps = { tokens: { value: [{ id: 'a', name: '账号' }] }, tokenStatus: { value: {} }, shouldStop: { value: false }, logs: [], addLog() {}, tokenStore: { async sendMessageWithPromise() { throw new Error('400340'); } } };
  const result = await executeSelectedTasks({ tokenIds: ['a'], settings: { selectedTasks: ['batchCampChallenge'] } }, deps, { campChallenge: { async batchCampChallenge() {
    try { await deps.tokenStore.sendMessageWithPromise('a', 'fight_startpvp'); } catch {}
    deps.accountOutcomes.a = { status: 'incomplete', reason: '无合格目标', camp: { initialUsed: 0, finalUsed: 0, remaining: 10, wins: 0, losses: 0, unknown: 0 } };
    deps.tokenStatus.value.a = 'completed';
  } } });
  assert.equal(result.status, 'incomplete'); assert.equal(result.results[0].accounts.details[0].camp.remaining, 10);
  assert.equal(accountSummary(result.results[0].accounts.details).status, 'incomplete');
});


test('unconfirmed post-battle state never exposes stale counters as final facts', async () => {
  const f = fixture({ onRead(state) { if (state.attacks.length) throw new Error('读取营地超时'); } });
  const result = await f.run();
  assert.equal(result.status, 'unverified'); assert.equal(result.camp.finalUsed, null); assert.equal(result.camp.remaining, null); assert.equal(result.camp.wins, 1); assert.equal(f.state.attacks.length, 1);
});
test('missing or repeatedly changing formation prevents real challenges', async () => {
  const invalid = fixture(); invalid.state.slot = 99;
  assert.equal((await invalid.run()).status, 'error'); assert.equal(invalid.state.attacks.length, 0);
  const changing = fixture({ onRead(state) { if ([3, 5].includes(state.reads)) state.pet = `pet-${state.reads}`; } });
  const result = await changing.run(); assert.equal(result.status, 'incomplete'); assert.equal(changing.state.attacks.length, 0); assert.match(result.reason, /状态变化/);
});
test('challenge and failure counters are refreshed and simulations are not reused after target changes', async () => {
  const f = fixture({ onRead(state) { if (state.reads === 3) state.defenders[11].failCnt = 2; } });
  assert.equal((await f.run()).status, 'ok');
  const attack = f.calls.find(call => call.cmd === 'club_attack');
  assert.equal(attack.params.failCnt, 2); assert.equal(f.state.simulations.length, 6);
});
test('persistent rate limiting leaves chances intact and explicit victory wins over compatibility HP', async () => {
  const f = fixture({ spar() { return { code: 400340, hint: '切磋限频' }; } });
  assert.equal((await f.run()).status, 'incomplete'); assert.equal(f.state.simulations.length, 2); assert.equal(f.state.attacks.length, 0);
  assert.equal(campVictory({ battleData: { result: { isWin: false, accept: { ext: { curHP: 0 } } } } }), false);
  assert.equal(campVictory({ battleData: { result: { accept: { ext: { curHP: 0 } } } } }), true);
  assert.equal(campVictory({ battleData: { result: {} } }), null);
});


test('mismatched stored and active weapons stop before any simulation or real attack', async () => {
  const f = fixture({ roleWeapon: 9 });
  const result = await f.run();
  assert.equal(result.status, 'error'); assert.match(result.reason, /武器不一致/); assert.equal(f.state.attacks.length, 0); assert.equal(f.state.simulations.length, 0);
});
