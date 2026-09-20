import { Router } from 'express';

export function settingsRoutes(db) {
  const r = Router();

  r.get('/:key', (req, res) => {
    const val = db.getKV(req.params.key, req.userId);
    res.json({ key: req.params.key, value: val !== undefined ? val : null });
  });

  r.put('/:key', (req, res) => {
    db.setKV(req.params.key, req.body.value, req.userId);
    res.json({ ok: true });
  });

  r.delete('/:key', (req, res) => {
    db.deleteKV(req.params.key, req.userId);
    res.json({ ok: true });
  });

  r.post('/batch', (req, res) => {
    const { keys } = req.body;
    if (!Array.isArray(keys)) return res.status(400).json({ error: 'keys array required' });
    const result = {};
    for (const key of keys) {
      const val = db.getKV(key, req.userId);
      result[key] = val !== undefined ? val : null;
    }
    res.json(result);
  });

  r.put('/batch/save', (req, res) => {
    const { items } = req.body;
    if (!items || typeof items !== 'object') return res.status(400).json({ error: 'items object required' });
    for (const [key, value] of Object.entries(items)) {
      db.setKV(key, value, req.userId);
    }
    res.json({ ok: true });
  });

  return r;
}
