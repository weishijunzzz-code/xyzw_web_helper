import { Router } from 'express';

export function forceOnlineRoutes(forceOnlineService) {
  const r = Router();

  // 获取开启强制在线的账号列表
  r.get('/enabled', (req, res) => {
    res.json({ tokenIds: forceOnlineService.getEnabledTokens(req.userId) });
  });

  // 批量设置开启强制在线的账号列表
  r.post('/enabled', (req, res) => {
    const { tokenIds } = req.body;
    const list = forceOnlineService.setEnabledTokens(req.userId, tokenIds);
    // 立即对新开启的号发起保活
    for (const id of list) forceOnlineService.ensureOnline(id).catch(() => {});
    res.json({ ok: true, tokenIds: list });
  });

  // 开/关单个账号
  r.post('/set', async (req, res) => {
    const { tokenId, enabled, tokenName } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    try {
      const result = await forceOnlineService.setOne(tokenId, req.userId, !!enabled, tokenName);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  // 全部状态
  r.get('/status', (_req, res) => {
    res.json(forceOnlineService.getAllStatus());
  });

  return r;
}
