import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'xyzw.db');

import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    ws_url TEXT,
    server TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    import_method TEXT DEFAULT 'manual',
    source_url TEXT,
    avatar TEXT DEFAULT '',
    upgraded_to_permanent INTEGER DEFAULT 0,
    upgraded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    last_used TEXT
  );

  CREATE TABLE IF NOT EXISTS token_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    color TEXT DEFAULT '#1677ff',
    token_ids TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bin_data (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    data BLOB
  );

  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    cron TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'batch_daily',
    token_ids TEXT DEFAULT '[]',
    settings TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    last_run TEXT,
    last_result TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
`);

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

try { sqlite.exec('ALTER TABLE tokens ADD COLUMN user_id TEXT NOT NULL DEFAULT ""'); } catch {}
try { sqlite.exec('ALTER TABLE token_groups ADD COLUMN user_id TEXT NOT NULL DEFAULT ""'); } catch {}
try { sqlite.exec('ALTER TABLE kv ADD COLUMN user_id TEXT NOT NULL DEFAULT ""'); } catch {}
try { sqlite.exec('ALTER TABLE bin_data ADD COLUMN user_id TEXT NOT NULL DEFAULT ""'); } catch {}

try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id)'); } catch {}
try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_groups_user ON token_groups(user_id)'); } catch {}
try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id)'); } catch {}
try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_bin_user ON bin_data(user_id)'); } catch {}

export const db = {
  createUser(username, password) {
    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    sqlite.prepare('INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)').run(id, username, passwordHash, salt, new Date().toISOString());
    return { id, username };
  },

  getUser(username) {
    return sqlite.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
  },

  verifyPassword(user, password) {
    return hashPassword(password, user.salt) === user.password_hash;
  },

  getAllUsers() {
    return sqlite.prepare('SELECT id, username FROM users').all();
  },

  getAllTokens(userId) {
    return sqlite.prepare('SELECT * FROM tokens WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(rowToToken);
  },

  getToken(id, userId) {
    const row = sqlite.prepare('SELECT * FROM tokens WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? rowToToken(row) : null;
  },

  addToken(token, userId) {
    sqlite.prepare(`
      INSERT INTO tokens (id, user_id, name, token, ws_url, server, remark, import_method, source_url, avatar, upgraded_to_permanent, upgraded_at, created_at, updated_at, last_used)
      VALUES (@id, @userId, @name, @token, @wsUrl, @server, @remark, @importMethod, @sourceUrl, @avatar, @upgradedToPermanent, @upgradedAt, @createdAt, @updatedAt, @lastUsed)
    `).run({
      id: token.id,
      userId,
      name: token.name,
      token: token.token,
      wsUrl: token.wsUrl || null,
      server: token.server || '',
      remark: token.remark || '',
      importMethod: token.importMethod || 'manual',
      sourceUrl: token.sourceUrl || null,
      avatar: token.avatar || '',
      upgradedToPermanent: token.upgradedToPermanent ? 1 : 0,
      upgradedAt: token.upgradedAt || null,
      createdAt: token.createdAt || new Date().toISOString(),
      updatedAt: token.updatedAt || null,
      lastUsed: token.lastUsed || new Date().toISOString(),
    });
    return token;
  },

  updateToken(id, updates, userId) {
    const current = this.getToken(id, userId);
    if (!current) return false;
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    sqlite.prepare(`
      UPDATE tokens SET name=@name, token=@token, ws_url=@wsUrl, server=@server, remark=@remark,
        import_method=@importMethod, source_url=@sourceUrl, avatar=@avatar,
        upgraded_to_permanent=@upgradedToPermanent, upgraded_at=@upgradedAt,
        updated_at=@updatedAt, last_used=@lastUsed
      WHERE id=@id AND user_id=@userId
    `).run({
      id,
      userId,
      name: merged.name,
      token: merged.token,
      wsUrl: merged.wsUrl || null,
      server: merged.server || '',
      remark: merged.remark || '',
      importMethod: merged.importMethod || 'manual',
      sourceUrl: merged.sourceUrl || null,
      avatar: merged.avatar || '',
      upgradedToPermanent: merged.upgradedToPermanent ? 1 : 0,
      upgradedAt: merged.upgradedAt || null,
      updatedAt: merged.updatedAt,
      lastUsed: merged.lastUsed || null,
    });
    return true;
  },

  removeToken(id, userId) {
    sqlite.prepare('DELETE FROM tokens WHERE id = ? AND user_id = ?').run(id, userId);
    sqlite.prepare('DELETE FROM bin_data WHERE id = ? AND user_id = ?').run(id, userId);
  },

  clearAllTokens(userId) {
    sqlite.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
    sqlite.prepare('DELETE FROM bin_data WHERE user_id = ?').run(userId);
  },

  storeBinData(id, buffer, userId) {
    sqlite.prepare('INSERT OR REPLACE INTO bin_data (id, user_id, data) VALUES (?, ?, ?)').run(id, userId, Buffer.from(buffer));
  },

  getBinData(id, userId) {
    const row = sqlite.prepare('SELECT data FROM bin_data WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? row.data : null;
  },

  deleteBinData(id, userId) {
    sqlite.prepare('DELETE FROM bin_data WHERE id = ? AND user_id = ?').run(id, userId);
  },

  getKV(key, userId) {
    const row = sqlite.prepare('SELECT value FROM kv WHERE key = ? AND user_id = ?').get(key, userId);
    if (!row) return undefined;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },

  setKV(key, value, userId) {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    sqlite.prepare('INSERT OR REPLACE INTO kv (key, user_id, value) VALUES (?, ?, ?)').run(key, userId, v);
  },

  deleteKV(key, userId) {
    sqlite.prepare('DELETE FROM kv WHERE key = ? AND user_id = ?').run(key, userId);
  },

  getAllGroups(userId) {
    return sqlite.prepare('SELECT * FROM token_groups WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(rowToGroup);
  },

  addGroup(group, userId) {
    sqlite.prepare(`
      INSERT INTO token_groups (id, user_id, name, color, token_ids, created_at, updated_at)
      VALUES (@id, @userId, @name, @color, @tokenIds, @createdAt, @updatedAt)
    `).run({
      id: group.id,
      userId,
      name: group.name,
      color: group.color || '#1677ff',
      tokenIds: JSON.stringify(group.tokenIds || []),
      createdAt: group.createdAt || new Date().toISOString(),
      updatedAt: group.updatedAt || null,
    });
  },

  updateGroup(id, updates, userId) {
    const current = this.getAllGroups(userId).find(g => g.id === id);
    if (!current) return;
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    sqlite.prepare(`
      UPDATE token_groups SET name=@name, color=@color, token_ids=@tokenIds, updated_at=@updatedAt WHERE id=@id AND user_id=@userId
    `).run({
      id,
      userId,
      name: merged.name,
      color: merged.color,
      tokenIds: JSON.stringify(merged.tokenIds || []),
      updatedAt: merged.updatedAt,
    });
  },

  removeGroup(id, userId) {
    sqlite.prepare('DELETE FROM token_groups WHERE id = ? AND user_id = ?').run(id, userId);
  },

  getAllScheduledTasks(userId) {
    return sqlite.prepare('SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(r => ({
      id: r.id, name: r.name, cron: r.cron, taskType: r.task_type,
      tokenIds: JSON.parse(r.token_ids || '[]'), settings: JSON.parse(r.settings || '{}'),
      enabled: !!r.enabled, lastRun: r.last_run, lastResult: r.last_result ? JSON.parse(r.last_result) : null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  },

  addScheduledTask(task, userId) {
    sqlite.prepare(`INSERT INTO scheduled_tasks (id, user_id, name, cron, task_type, token_ids, settings, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      task.id, userId, task.name || '', task.cron, task.taskType || 'batch_daily',
      JSON.stringify(task.tokenIds || []), JSON.stringify(task.settings || {}),
      task.enabled !== false ? 1 : 0, new Date().toISOString()
    );
  },

  updateScheduledTask(id, updates, userId) {
    const fields = [];
    const values = [];
    if (updates.name !== undefined) { fields.push('name=?'); values.push(updates.name); }
    if (updates.cron !== undefined) { fields.push('cron=?'); values.push(updates.cron); }
    if (updates.taskType !== undefined) { fields.push('task_type=?'); values.push(updates.taskType); }
    if (updates.tokenIds !== undefined) { fields.push('token_ids=?'); values.push(JSON.stringify(updates.tokenIds)); }
    if (updates.settings !== undefined) { fields.push('settings=?'); values.push(JSON.stringify(updates.settings)); }
    if (updates.enabled !== undefined) { fields.push('enabled=?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.lastRun !== undefined) { fields.push('last_run=?'); values.push(updates.lastRun); }
    if (updates.lastResult !== undefined) {
      let lastResultStr = JSON.stringify(updates.lastResult);
      // 兜底保护：last_result 超过 1MB 时丢弃日志，只留摘要，防止撑爆列表接口
      if (lastResultStr && lastResultStr.length > 1024 * 1024) {
        const lr = updates.lastResult || {};
        lastResultStr = JSON.stringify({
          success: lr.success,
          error: lr.error,
          summary: lr.summary ? { results: lr.summary.results, totalLogs: lr.summary.totalLogs } : undefined,
          logsTruncated: true,
          note: '日志过大已省略',
        });
      }
      fields.push('last_result=?'); values.push(lastResultStr);
    }
    fields.push('updated_at=?'); values.push(new Date().toISOString());
    values.push(id, userId);
    sqlite.prepare(`UPDATE scheduled_tasks SET ${fields.join(',')} WHERE id=? AND user_id=?`).run(...values);
  },

  removeScheduledTask(id, userId) {
    sqlite.prepare('DELETE FROM scheduled_tasks WHERE id = ? AND user_id = ?').run(id, userId);
  },
};

function rowToToken(row) {
  return {
    id: row.id,
    name: row.name,
    token: row.token,
    wsUrl: row.ws_url,
    server: row.server,
    remark: row.remark,
    importMethod: row.import_method,
    sourceUrl: row.source_url,
    avatar: row.avatar,
    upgradedToPermanent: !!row.upgraded_to_permanent,
    upgradedAt: row.upgraded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsed: row.last_used,
  };
}

function rowToGroup(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    tokenIds: JSON.parse(row.token_ids || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
