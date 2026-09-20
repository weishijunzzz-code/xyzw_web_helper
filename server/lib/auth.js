import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'xyzw_' + crypto.randomBytes(16).toString('hex');
const TOKEN_EXPIRE = 7 * 24 * 60 * 60 * 1000;

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_EXPIRE }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
  if (sig !== parts[2]) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.exp < Date.now()) return null;
  return payload;
}

export function createToken(userId, username) {
  return sign({ userId, username });
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const payload = verify(authHeader.slice(7));
  if (!payload) {
    return res.status(401).json({ error: '登录已过期' });
  }
  req.userId = payload.userId;
  req.username = payload.username;
  next();
}
