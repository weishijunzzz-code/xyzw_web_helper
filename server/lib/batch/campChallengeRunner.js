const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const AREA_ORDER = [2, 1, 3];
const MAX_ATTACKS = 10; // Existing protocol fallback; explicit server exhaustion takes precedence.
const volatile = new Set(['challengeCnt', 'failCnt', 'attackCnt', 'defeated', 'updatedAt', 'created', 'time']);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !volatile.has(key)).map(key => [key, stable(value[key])]));
}
export function campCalendar(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
  return { key: `${parts.year.slice(-2)}${parts.month}${parts.day}`, weekday: String(new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`).getUTCDay()) };
}
export function campVictory(response) {
  const result = response?.battleData?.result;
  if (typeof result?.isWin === 'boolean') return result.isWin;
  if (result?.isWin === 0 || result?.isWin === 1) return result.isWin === 1;
  const hp = result?.accept?.ext?.curHP;
  return typeof hp === 'number' && Number.isFinite(hp) && hp >= 0 ? hp === 0 : null;
}
function formation(preset, info) {
  const role = info?.role || info?.body?.role || info?.data?.role;
  const root = preset?.presetTeamInfo;
  const slot = root?.useTeamId;
  const teams = root?.presetTeamInfo || root;
  const selected = teams?.[String(slot)];
  if (!role || slot == null || !selected?.teamInfo) throw new Error('无法确认当前存档阵容');
  const battleTeam = {};
  for (const [position, hero] of Object.entries(selected.teamInfo)) {
    const id = Number(hero?.heroId ?? hero?.id);
    if (Number.isFinite(id) && id > 0) battleTeam[position] = id;
  }
  if (!Object.keys(battleTeam).length) throw new Error('当前阵容没有可确认的英雄');
  const weapon = selected.lordWeaponId ?? role.lordWeaponId;
  if (weapon == null) throw new Error('无法确认当前武器');
  if (selected.lordWeaponId != null && role.lordWeaponId != null && String(selected.lordWeaponId) !== String(role.lordWeaponId)) throw new Error('存档武器与角色武器不一致，无法确认模拟阵容');
  // Do not replace a configured pet with an empty string.
  const pet = selected.petUId ?? selected.petUid ?? role.petUId ?? role.petUid;
  const storedPet = selected.petUId ?? selected.petUid;
  const activePet = role.petUId ?? role.petUid;
  if (storedPet != null && activePet != null && String(storedPet) !== String(activePet)) throw new Error('存档宠物与角色宠物不一致，无法确认模拟阵容');
  const params = { battleTeam, lordWeaponId: weapon, ...(pet != null ? { petUId: pet } : {}) };
  return { slot: String(slot), params, fingerprint: JSON.stringify(stable({ slot: String(slot), params, selected })) };
}
const exhausted = error => /(?:挑战次数|进攻次数).*(?:不足|用尽|用完|耗尽|上限)|今日.*挑战.*(?:上限|用完)/.test(error.message || '');
const staleTarget = error => /200760|目标.*(?:不存在|已击败)|界面.*变化/.test(error.message || '');
const rejected = error => /服务器错误|server error/i.test(error.message || '') || error.serverRejected === true;

export async function runCampChallenge({ send, settings = {}, stopped = () => false, log = () => {}, now = () => new Date(), wait = sleep }) {
  const day = campCalendar(now());
  const stats = { initialUsed: null, finalUsed: null, maxAttacks: MAX_ATTACKS, remaining: null, wins: 0, losses: 0, unknown: 0, quotaConfirmed: false, stateConfirmed: true, battles: [] };
  let reason = ''; let originalSlot = null; let switched = false; let board = null; let fatal = false;
  const unstable = new Set();
  let lastObservedUsed = null;
  function checkDay() {
    if (campCalendar(now()).key !== day.key) { const error = new Error('运行跨日，已停止本轮营地挑战'); error.crossDay = true; throw error; }
    if (stopped()) { const error = new Error('用户停止，保留剩余机会'); error.stopped = true; throw error; }
  }
  async function read(command, params = {}, timeout = 8000) {
    checkDay();
    const response = await send(command, params, timeout);
    if (response?.code != null && response.code !== 0) { const error = new Error(`服务器错误: ${response.code} - ${response.hint || response.error || '未知错误'}`); error.serverRejected = true; throw error; }
    return response;
  }
  async function readFormation() {
    const preset = await read('presetteam_getinfo');
    const role = await read('role_getroleinfo', {}, 15000);
    return formation(preset, role);
  }
  async function readBoard() {
    const response = await read('club_getinfo');
    checkDay();
    if (!response?.club?.oppoMap) throw new Error('今日比赛对手信息缺失');
    const opponent = response.club.oppoMap[day.weekday] || null;
    if (!opponent && !response?.siege?.attackMap) return { used: null, opponent: null, defenders: {} };
    if (!response?.siege?.attackMap) throw new Error('今日次数信息缺失，无法确认剩余机会');
    const entry = response.siege.attackMap[day.key];
    const used = entry == null ? 0 : entry.attackCnt;
    if (!Number.isInteger(used) || used < 0) throw new Error('今日挑战次数无效');
    if (lastObservedUsed != null && used < lastObservedUsed) throw new Error('今日次数发生回退，服务端状态尚未同步');
    if (opponent && (!opponent.defenders || typeof opponent.defenders !== 'object')) throw new Error('今日目标信息缺失');
    const snapshot = opponent ? structuredClone(opponent) : null;
    const result = { used, opponent: snapshot, defenders: snapshot?.defenders || {} };
    lastObservedUsed = used;
    stats.initialUsed ??= used;
    stats.stateConfirmed = true;
    stats.finalUsed = used; stats.remaining = Math.max(0, MAX_ATTACKS - used);
    if (used >= MAX_ATTACKS) stats.quotaConfirmed = true;
    return result;
  }
  function progress(a, b) { return a.used !== b.used || JSON.stringify(a.defenders) !== JSON.stringify(b.defenders); }
  async function verify(before) {
    let latest = null;
    for (let round = 0; round < 2; round++) {
      try { latest = await readBoard(); if (progress(before, latest) || stats.quotaConfirmed) return { board: latest, changed: true }; }
      catch (error) { if (error.crossDay || error.stopped) throw error; log(`战后复核${round + 1}失败：${error.message}`, 'warning'); }
      if (round === 0) await wait(1000);
    }
    if (!latest) { stats.finalUsed = null; stats.remaining = null; stats.stateConfirmed = false; }
    return { board: latest || before, changed: false };
  }
  async function spar(roleId) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await read('fight_startpvp', { targetId: Number(roleId) }, 10000);
        return campVictory(result);
      } catch (error) {
        if (error.crossDay || error.stopped) throw error;
        if (String(error.message).includes('400340') && attempt === 0) { await wait(11000); continue; }
        log(`模拟不可用：${error.message}`, 'warning'); return null;
      }
    }
    return null;
  }
  function targetKey(nodeId, defender, ours, enemy) { return JSON.stringify([nodeId, String(defender.roleId), ours.fingerprint, stable(enemy)]); }
  async function choose(ours) {
    for (const area of AREA_ORDER) {
      const candidates = Object.entries(board.defenders).filter(([node, target]) => Math.ceil(Number(node) / 10) === area && !target.defeated && Number(target.roleId) > 0).sort((a, b) => Number(a[0]) - Number(b[0]));
      for (const [nodeId, defender] of candidates) {
        checkDay();
        let enemy;
        try { enemy = await read('club_gettargetteam', { targetId: defender.roleId }, 5000); }
        catch (error) { if (error.crossDay || error.stopped) throw error; log(`目标${defender.name || nodeId}数据不可用：${error.message}`, 'warning'); continue; }
        if (!enemy || typeof enemy !== 'object') continue;
        const key = targetKey(nodeId, defender, ours, enemy);
        if (unstable.has(key)) continue;
        let victories = 0;
        for (let i = 0; i < 3; i++) {
          if (await spar(defender.roleId) !== true) break;
          victories++;
          if (i < 2) await wait(500);
        }
        log(`区域${area} ${defender.name || nodeId}：模拟连续获胜 ${victories}/3`, 'info');
        if (victories === 3) return { nodeId, defender, enemy, key };
      }
      log(`区域${area}全部目标已评估，无合格目标，检查下一区域`, 'info');
    }
    return null;
  }
  try {
    board = await readBoard();
    if (!board.opponent) { reason = '今日非营地比赛日'; return { status: 'skip', reason, camp: stats }; }
    if (stats.quotaConfirmed) return { status: 'ok', reason: '服务端确认今日挑战次数已用尽，本轮无需新增挑战', camp: stats };
    let ours = await readFormation();
    originalSlot = ours.slot;
    const desired = String(settings.arenaFormation || 1);
    if (ours.slot !== desired) {
      await read('presetteam_saveteam', { teamId: Number(desired) }, 5000);
      switched = true;
      ours = await readFormation();
      if (ours.slot !== desired) throw new Error('阵容切换未得到服务端确认');
    }
    let unstableRounds = 0;
    while (!stats.quotaConfirmed) {
      checkDay();
      board = await readBoard();
      if (stats.quotaConfirmed) break;
      if (!board.opponent) { reason = '比赛对手已不可用，保留剩余机会'; break; }
      ours = await readFormation();
      if (ours.slot !== desired) throw new Error('存档阵容发生变化，已停止');
      const target = await choose(ours);
      if (!target) { reason = '无三局模拟全胜的合格目标，保留剩余机会'; break; }
      const fresh = await readBoard();
      const currentOurs = await readFormation();
      const currentDefender = fresh.defenders[target.nodeId];
      if (stats.quotaConfirmed) break;
      const targetChanged = !currentDefender || currentDefender.defeated || JSON.stringify(currentDefender) !== JSON.stringify(target.defender);
      const enemy = targetChanged ? null : await read('club_gettargetteam', { targetId: currentDefender.roleId }, 5000);
      if (targetChanged || currentOurs.fingerprint !== ours.fingerprint || targetKey(target.nodeId, currentDefender, currentOurs, enemy) !== target.key) {
        if (++unstableRounds >= 2) { reason = '连续两轮阵容或目标状态变化，停止并保留机会'; break; }
        continue;
      }
      unstableRounds = 0;
      checkDay();
      const battle = { nodeId: Number(target.nodeId), roleId: String(currentDefender.roleId), name: currentDefender.name || String(target.nodeId), simulatedWins: 3 };
      let outcome = null; let attackError = null;
      stats.stateConfirmed = false; stats.finalUsed = null; stats.remaining = null;
      try {
        const response = await read('club_attack', { nodeId: Number(target.nodeId), targetId: currentDefender.roleId, challengeCnt: currentDefender.challengeCnt || 0, failCnt: currentDefender.failCnt || 0, useItem: false, teamSetParams: currentOurs.params }, 8000);
        outcome = campVictory(response);
      } catch (error) { attackError = error; }
      if (attackError && exhausted(attackError)) {
        stats.quotaConfirmed = true; stats.stateConfirmed = true; stats.finalUsed = fresh.used; stats.remaining = 0; reason = '服务端确认挑战次数已用尽'; break;
      }
      if (attackError?.crossDay || attackError?.stopped) throw attackError;
      if (attackError && rejected(attackError) && !staleTarget(attackError)) {
        reason = `服务端拒绝挑战：${attackError.message}`; fatal = true;
        const checked = await verify(fresh); board = checked.board; break;
      }
      if (attackError && staleTarget(attackError)) {
        const checked = await verify(fresh); board = checked.board;
        if (!checked.changed) { reason = '目标已变化，但连续两轮无法确认新状态'; break; }
        continue;
      }
      if (outcome === true) { stats.wins++; battle.status = 'ok'; }
      else if (outcome === false) { stats.losses++; battle.status = 'error'; unstable.add(target.key); }
      else { stats.unknown++; battle.status = 'unverified'; }
      battle.reason = attackError?.message;
      stats.battles.push(battle);
      log(`实战${battle.name}：${outcome === true ? '胜利' : outcome === false ? '失败' : '结果未确认'}`, outcome === true ? 'success' : 'warning');
      const checked = await verify(fresh); board = checked.board;
      if (outcome === null) { reason = '实战结果未确认，已复核服务端状态，禁止自动重发'; break; }
      if (!checked.changed) { reason = stats.stateConfirmed ? '连续两轮复核无进展，保留机会并停止' : '连续两轮无法读取战后状态，停止并保留机会'; break; }
    }
    if (!reason && stats.quotaConfirmed) reason = '服务端确认今日挑战次数已用尽';
  } catch (error) {
    reason = error.message;
    fatal = !error.crossDay && !error.stopped;
  } finally {
    if (switched && originalSlot != null) {
      try { await send('presetteam_saveteam', { teamId: Number(originalSlot) }, 5000); }
      catch (error) { log(`还原阵容失败：${error.message}`, 'warning'); reason += `；还原阵容失败：${error.message}`; fatal = true; }
    }
  }
  const status = stats.unknown || !stats.stateConfirmed ? 'unverified' : stats.losses ? (stats.wins ? 'partial' : 'error') : fatal ? (stats.wins ? 'partial' : 'error') : stats.quotaConfirmed ? 'ok' : 'incomplete';
  log(`${reason}；确认胜利${stats.wins}，失败${stats.losses}，未确认${stats.unknown}，剩余${stats.remaining ?? '未知'}`, status === 'ok' ? 'success' : 'warning');
  return { status, reason, camp: stats };
}
