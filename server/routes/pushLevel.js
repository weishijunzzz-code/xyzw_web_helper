import { Router } from 'express';

export function pushLevelRoutes(pushLevelService, db) {
  const r = Router();

  r.get('/accounts', (req, res) => {
    res.json(db.getAllTokens(req.userId).map(({ id, name, server }) => ({ id, name, server })));
  });

  // 开始推关
  // body: { tokenId, maxFail }
  r.post('/start', async (req, res) => {
    const { tokenId, maxFail } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    if (!db.getToken(tokenId, req.userId)) return res.status(404).json({ error: '账号不存在' });
    try {
      const result = await pushLevelService.start(tokenId, req.userId, { maxFail });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  // 停止推关
  r.post('/stop', (req, res) => {
    const { tokenId } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    if (!db.getToken(tokenId, req.userId)) return res.status(404).json({ error: '账号不存在' });
    res.json(pushLevelService.stop(tokenId));
  });

  // 单个账号状态
  r.get('/status/:tokenId', (req, res) => {
    if (!db.getToken(req.params.tokenId, req.userId)) return res.status(404).json({ error: '账号不存在' });
    res.json(pushLevelService.getStatus(req.params.tokenId));
  });

  // 全部状态
  r.get('/status', (req, res) => {
    res.json(pushLevelService.getAllStatus(req.userId));
  });

  return r;
}
