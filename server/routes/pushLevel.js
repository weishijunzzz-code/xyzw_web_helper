import { Router } from 'express';

export function pushLevelRoutes(pushLevelService) {
  const r = Router();

  // 开始推关
  // body: { tokenId, maxFail }
  r.post('/start', async (req, res) => {
    const { tokenId, maxFail } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
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
    res.json(pushLevelService.stop(tokenId));
  });

  // 单个账号状态
  r.get('/status/:tokenId', (req, res) => {
    res.json(pushLevelService.getStatus(req.params.tokenId));
  });

  // 全部状态
  r.get('/status', (_req, res) => {
    res.json(pushLevelService.getAllStatus());
  });

  return r;
}
