import sqlite3 from 'sqlite3';

// 初始化并返回数据库连接
export function initDb(dbPath) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    const initSQL = `
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_path TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- file | dir
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  ctime_ms INTEGER NOT NULL,
  atime_ms INTEGER,
  mode INTEGER NOT NULL,
  ext TEXT,
  hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_full_path ON entries(full_path);
`;
    db.exec(initSQL, (err) => {
      if (err) return reject(err);
      // 确认 atime_ms 列存在（兼容旧库）
      db.all('PRAGMA table_info(entries)', (e2, rows) => {
        if (e2) return reject(e2);
        const hasAtime = Array.isArray(rows) && rows.some((r) => r.name === 'atime_ms');
        if (hasAtime) return resolve(db);
        db.run('ALTER TABLE entries ADD COLUMN atime_ms INTEGER', (e3) => {
          if (e3) return reject(e3);
          resolve(db);
        });
      });
    });
  });
}

export function closeDb(db) {
  db.close();
}

export function upsertEntry(db, meta) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO entries (full_path, name, type, size, mtime_ms, ctime_ms, atime_ms, mode, ext, hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(full_path) DO UPDATE SET
                   name=excluded.name,
                   type=excluded.type,
                   size=excluded.size,
                   mtime_ms=excluded.mtime_ms,
                   ctime_ms=excluded.ctime_ms,
                   atime_ms=excluded.atime_ms,
                   mode=excluded.mode,
                   ext=excluded.ext,
                   hash=excluded.hash`;
    const params = [
      meta.full_path,
      meta.name,
      meta.type,
      meta.size,
      meta.mtime_ms,
      meta.ctime_ms,
      meta.atime_ms,
      meta.mode,
      meta.ext,
      meta.hash,
    ];
    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function countEntries(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) AS count FROM entries', (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

export function getByPath(db, targetPath) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM entries WHERE full_path = ?', [targetPath], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function listUnderPath(db, dirPath) {
  return new Promise((resolve, reject) => {
    const like = dirPath.endsWith('/') ? `${dirPath}%` : `${dirPath}/%`;
    db.all('SELECT * FROM entries WHERE full_path LIKE ? ORDER BY full_path', [like], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function searchEntries(db, filters = {}) {
  const {
    name,
    ext,
    mtime_from,
    mtime_to,
    ctime_from,
    ctime_to,
    size_min,
    size_max,
    type,
    under,
  } = filters;

  const where = [];
  const params = [];

  if (under) {
    const like = under.endsWith('/') ? `${under}%` : `${under}/%`;
    where.push('full_path LIKE ?');
    params.push(like);
  }
  if (name) {
    where.push('name LIKE ?');
    params.push(`%${name}%`);
  }
  if (ext) {
    const e = ext.startsWith('.') ? ext : `.${ext}`;
    where.push('ext = ?');
    params.push(e);
  }
  if (typeof mtime_from === 'number') {
    where.push('mtime_ms >= ?');
    params.push(mtime_from);
  }
  if (typeof mtime_to === 'number') {
    where.push('mtime_ms <= ?');
    params.push(mtime_to);
  }
  if (typeof ctime_from === 'number') {
    where.push('ctime_ms >= ?');
    params.push(ctime_from);
  }
  if (typeof ctime_to === 'number') {
    where.push('ctime_ms <= ?');
    params.push(ctime_to);
  }
  if (typeof size_min === 'number') {
    where.push('size >= ?');
    params.push(size_min);
  }
  if (typeof size_max === 'number') {
    where.push('size <= ?');
    params.push(size_max);
  }
  if (type) {
    where.push('type = ?');
    params.push(type);
  }

  const sql = `SELECT * FROM entries${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY full_path`;
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}