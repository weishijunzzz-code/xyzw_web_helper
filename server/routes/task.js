import { Router } from 'express';

export function taskRoutes(gameManager) {
  const router = Router();

  router.post('/connect-all', async (req, res) => {
    const tokens = gameManager.db.getAllTokens(req.userId);
    const results = [];
    for (const t of tokens) {
      try {
        await gameManager.connect(t.id, req.userId);
        results.push({ id: t.id, name: t.name, status: 'connecting' });
      } catch (e) {
        results.push({ id: t.id, name: t.name, status: 'error', error: e.message });
      }
    }
    res.json(results);
  });

  router.post('/disconnect-all', (req, res) => {
    const tokens = gameManager.db.getAllTokens(req.userId);
    for (const t of tokens) {
      gameManager.disconnect(t.id);
    }
    res.json({ ok: true });
  });

  router.post('/batch-send', async (req, res) => {
    const { tokenIds, cmd, params, timeout } = req.body;
    if (!cmd) return res.status(400).json({ error: 'cmd required' });
    const ids = tokenIds || gameManager.db.getAllTokens(req.userId).map(t => t.id);
    const results = [];
    for (const id of ids) {
      try {
        const result = await gameManager.sendMessageWithPromise(id, cmd, params || {}, timeout || 5000);
        results.push({ id, status: 'ok', result });
      } catch (e) {
        results.push({ id, status: 'error', error: e.message });
      }
    }
    res.json(results);
  });

  router.post('/daily/:tokenId', async (req, res) => {
    const { tokenId } = req.params;
    try {
      const gm = gameManager;
      const results = [];

      const cmds = [
        { cmd: 'system_signinreward', name: '签到' },
        { cmd: 'system_claimhangupreward', name: '领取挂机奖励' },
        { cmd: 'system_mysharecallback', name: '分享回调', params: { isSkipShareCard: true, type: 2 } },
        { cmd: 'mail_claimallattachment', name: '领取邮件', params: { category: 0 } },
        { cmd: 'task_claimdailypoint', name: '领取日常积分', params: { taskId: 1 } },
      ];

      for (const c of cmds) {
        try {
          await gm.sendMessageWithPromise(tokenId, c.cmd, c.params || {}, 8000);
          results.push({ name: c.name, status: 'ok' });
          gm.push.taskProgress(tokenId, 'daily', results.length, cmds.length, `${c.name} 完成`);
        } catch (e) {
          results.push({ name: c.name, status: 'error', error: e.message });
          gm.push.taskProgress(tokenId, 'daily', results.length, cmds.length, `${c.name} 失败: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      gm.push.taskComplete(tokenId, 'daily', results);
      res.json(results);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}
