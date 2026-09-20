import { Router } from 'express';

export function tokenRoutes(db, gameManager) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(db.getAllTokens(req.userId));
  });

  r.post('/', (req, res) => {
    const { id: clientId, name, token, wsUrl, server, remark, importMethod, sourceUrl, avatar } = req.body;
    if (!name || !token) return res.status(400).json({ error: 'name and token required' });
    const id = clientId || `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokenData = {
      id, name, token, wsUrl: wsUrl || null, server: server || '',
      remark: remark || '', importMethod: importMethod || 'manual',
      sourceUrl: sourceUrl || null, avatar: avatar || '',
      upgradedToPermanent: false, upgradedAt: null,
      createdAt: new Date().toISOString(), updatedAt: null,
      lastUsed: new Date().toISOString(),
    };
    db.addToken(tokenData, req.userId);
    res.json(tokenData);
  });

  r.post('/import', (req, res) => {
    const { tokens } = req.body;
    if (!Array.isArray(tokens)) return res.status(400).json({ error: 'tokens array required' });
    let count = 0;
    for (const t of tokens) {
      if (t.name && t.token) {
        const id = t.id || `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.addToken({ ...t, id, createdAt: t.createdAt || new Date().toISOString(), lastUsed: new Date().toISOString() }, req.userId);
        count++;
      }
    }
    res.json({ imported: count });
  });

  r.get('/export/all', (req, res) => {
    res.json({ tokens: db.getAllTokens(req.userId), exportedAt: new Date().toISOString(), version: "2.0" });
  });

  r.get('/groups/all', (req, res) => {
    res.json(db.getAllGroups(req.userId));
  });

  r.post('/groups', (req, res) => {
    const { name, color } = req.body;
    const group = {
      id: "group_" + Date.now() + Math.random().toString(36).slice(2),
      name, color: color || '#1677ff', tokenIds: [],
      createdAt: new Date().toISOString(), updatedAt: null,
    };
    db.addGroup(group, req.userId);
    res.json(group);
  });

  r.put('/groups/:gid', (req, res) => {
    db.updateGroup(req.params.gid, req.body, req.userId);
    res.json({ ok: true });
  });

  r.delete('/groups/:gid', (req, res) => {
    db.removeGroup(req.params.gid, req.userId);
    res.json({ ok: true });
  });

  r.get('/:id', (req, res) => {
    const token = db.getToken(req.params.id, req.userId);
    if (!token) return res.status(404).json({ error: 'not found' });
    res.json(token);
  });

  r.put('/:id', (req, res) => {
    const ok = db.updateToken(req.params.id, req.body, req.userId);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json(db.getToken(req.params.id, req.userId));
  });

  r.delete('/:id', (req, res) => {
    gameManager.disconnect(req.params.id);
    db.removeToken(req.params.id, req.userId);
    res.json({ ok: true });
  });

  r.post('/:id/connect', async (req, res) => {
    try {
      const token = db.getToken(req.params.id, req.userId);
      if (!token) return res.status(404).json({ error: 'not found' });
      await gameManager.connect(req.params.id, req.userId);
      res.json({ status: 'connecting' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.post('/:id/disconnect', (req, res) => {
    gameManager.disconnect(req.params.id);
    res.json({ status: 'disconnected' });
  });

  r.post('/:id/send', async (req, res) => {
    try {
      const { cmd, params, timeout } = req.body;
      if (!cmd) return res.status(400).json({ error: 'cmd required' });
      const result = await gameManager.sendMessageWithPromise(req.params.id, cmd, params || {}, timeout || 5000);
      res.json({ result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.post('/:id/bin', (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      db.storeBinData(req.params.id, buf, req.userId);
      res.json({ ok: true, size: buf.length });
    });
  });

  r.get('/:id/bin', (req, res) => {
    const data = db.getBinData(req.params.id, req.userId);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.set('Content-Type', 'application/octet-stream');
    res.send(data);
  });

  return r;
}
