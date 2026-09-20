import { Router } from 'express';
import { createToken } from '../lib/auth.js';

export function authRoutes(db) {
  const r = Router();

  r.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名2-20个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const existing = db.getUser(username);
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    const user = db.createUser(username, password);
    const token = createToken(user.id, user.username);
    res.json({ token, userId: user.id, username: user.username });
  });

  r.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    const user = db.getUser(username);
    if (!user || !db.verifyPassword(user, password)) return res.status(401).json({ error: '用户名或密码错误' });
    const token = createToken(user.id, user.username);
    res.json({ token, userId: user.id, username: user.username });
  });

  return r;
}
