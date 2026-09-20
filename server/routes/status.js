import { Router } from 'express';

export function statusRoutes(gameManager) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(gameManager.getAllStatus(req.userId));
  });

  r.get('/:tokenId', (req, res) => {
    const { tokenId } = req.params;
    const status = gameManager.getConnectionStatus(tokenId);
    const gd = gameManager.gameData.get(tokenId) || null;
    res.json({ tokenId, status, gameData: gd });
  });

  r.get('/:tokenId/roleinfo', (req, res) => {
    const gd = gameManager.gameData.get(req.params.tokenId);
    if (!gd?.roleInfo) return res.status(404).json({ error: 'no role info' });
    res.json(gd.roleInfo);
  });

  return r;
}
