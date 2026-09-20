import { Router } from 'express';

export function saltFieldRoutes(saltFieldService) {
  const r = Router();

  // 启动单个账号创地
  r.post('/start', async (req, res) => {
    const { tokenId, tokenName } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    try {
      const result = await saltFieldService.start(tokenId, req.userId, tokenName);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  // 停止
  r.post('/stop', (req, res) => {
    const { tokenId } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    res.json(saltFieldService.stop(tokenId));
  });

  // 全部状态
  r.get('/status', (_req, res) => {
    res.json(saltFieldService.getAllStatus());
  });

  // 获取参与盐场的账号列表
  r.get('/enabled', (req, res) => {
    res.json({ tokenIds: saltFieldService.getEnabledTokens(req.userId) });
  });

  // 设置参与盐场的账号列表
  r.post('/enabled', (req, res) => {
    const { tokenIds } = req.body;
    const list = saltFieldService.setEnabledTokens(req.userId, tokenIds);
    res.json({ ok: true, tokenIds: list });
  });

  return r;
}
