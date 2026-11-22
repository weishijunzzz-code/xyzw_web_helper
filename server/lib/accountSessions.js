// Conservative allowlist: unknown commands may mutate game state.
export const READ_ONLY_COMMANDS = new Set([
  'role_getroleinfo', 'tower_getinfo', 'evotower_getinfo', 'presetteam_getinfo',
  'club_getinfo', 'club_gettargetteam', 'mergebox_getinfo', 'apex_getroleinfo',
  'apex_getvotelist',
]);
export const isReadOnlyCommand = cmd => READ_ONLY_COMMANDS.has(String(cmd).toLowerCase());

const queues = new WeakMap();
export async function acquireAccount(manager, userId, tokenId) {
  let accounts = queues.get(manager);
  if (!accounts) { accounts = new Map(); queues.set(manager, accounts); }
  const key = JSON.stringify([userId, tokenId]);
  const previous = accounts.get(key) || Promise.resolve();
  let unlock;
  const current = new Promise(resolve => { unlock = resolve; });
  accounts.set(key, current);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (accounts.get(key) === current) accounts.delete(key);
    unlock();
  };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const permanent = error => error.permanent === true || /not found|账号不存在|账号已删除|invalid credentials|权限不足/i.test(error.message);
export function createAccountSession(manager, userId, tokenId, { wait = sleep, now = Date.now } = {}) {
  let ready = false;
  let submitted = false;
  let unacknowledged = false;
  let attempts = [];
  const uncertainCommands = new Set();
  const session = {
    beginTask() { ready = false; submitted = false; unacknowledged = false; attempts = []; },
    metadata() { return { attempts: structuredClone(attempts), submitted, unacknowledged }; },
    async ensure() {
      if (ready && manager.getWebSocketStatus(tokenId) === 'connected') return;
      const remaining = 3 - attempts.length;
      if (remaining <= 0) { const error = new Error('账号本轮连接尝试已用尽'); error.stage = 'preflight'; error.retryEligible = false; throw error; }
      for (let attempt = 0; attempt < remaining; attempt++) {
        const entry = { attempt: attempts.length + 1, stage: 'connection', startedAt: new Date().toISOString() };
        attempts.push(entry);
        try {
          if (entry.attempt > 1) {
            await wait(entry.attempt === 2 ? 5000 : 15000);
            await manager._refreshCredentials?.(tokenId, userId);
          }
          if (manager.getWebSocketStatus(tokenId) !== 'connected') {
            manager.disconnect(tokenId);
            await manager.connect(tokenId, userId);
            const started = now();
            while (manager.getWebSocketStatus(tokenId) !== 'connected') {
              if (now() - started >= 30000) throw new Error('等待账号连接超时');
              await wait(500);
            }
          }
          entry.stage = 'role';
          const response = await manager.sendMessageWithPromise(tokenId, 'role_getroleinfo', {}, 10000, { retry: false });
          const role = response?.role || response?.body?.role || response?.data?.role;
          if (!role || typeof role !== 'object' || !Object.keys(role).length) throw new Error('角色信息为空，账号尚未就绪');
          entry.status = 'ok';
          ready = true;
          // Refresh shared cached context, but optional query failures never authorize a business replay.
          for (const cmd of ['tower_getinfo', 'evotower_getinfo', 'presetteam_getinfo']) {
            try { await manager.sendMessageWithPromise(tokenId, cmd, {}, 5000, { retry: false }); }
            catch {
              const data = manager.gameData?.get(tokenId);
              const key = ({ evotower_getinfo: 'evoTowerInfo', presetteam_getinfo: 'presetTeam' })[cmd];
              if (data && key) data[key] = null;
            }
          }
          return;
        } catch (error) {
          ready = false;
          entry.status = 'error'; entry.reason = error.message;
          manager.disconnect(tokenId);
          if (permanent(error) || attempt === remaining - 1 || submitted) {
            error.stage = 'preflight'; error.retryEligible = !submitted && !permanent(error);
            throw error;
          }
        }
      }
    },
    async send(cmd, params, timeout) {
      const fingerprint = JSON.stringify([cmd, params || {}]);
      if (uncertainCommands.has(fingerprint)) throw new Error('上一请求结果未确认，禁止自动重发');
      if (!ready || manager.getWebSocketStatus(tokenId) !== 'connected') await session.ensure();
      if (!isReadOnlyCommand(cmd)) submitted = true;
      // No nested transport retries; the account session owns retry decisions.
      try { return await manager.sendMessageWithPromise(tokenId, cmd, params, timeout, { retry: false }); }
      catch (error) {
        if (!/服务器错误|server error/i.test(error.message)) {
          ready = false;
          if (!isReadOnlyCommand(cmd)) uncertainCommands.add(fingerprint);
        }
        throw error;
      }
    },
    sendWithoutReply(cmd, params) {
      if (!ready || manager.getWebSocketStatus(tokenId) !== 'connected') throw new Error('账号未就绪，未发送业务命令');
      if (!isReadOnlyCommand(cmd)) {
        const fingerprint = JSON.stringify([cmd, params || {}]);
        if (uncertainCommands.has(fingerprint)) throw new Error('上一请求结果未确认，禁止自动重发');
        submitted = true; unacknowledged = true; uncertainCommands.add(fingerprint);
      }
      return manager.sendMessage(tokenId, cmd, params);
    },
    invalidate() { ready = false; },
    close() { ready = false; manager.disconnect(tokenId); },
  };
  return session;
}
