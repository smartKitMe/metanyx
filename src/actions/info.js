import fs from 'node:fs';
import { initDb, closeDb, countEntries } from '../db.js';
import { normalizeAbsolute } from '../utils/meta.js';

// 显示当前项目配置信息：数据库路径、是否存在、大小、记录数等
// options: { dbPath }
export async function execute({ dbPath }) {
  const absDbPath = dbPath ? normalizeAbsolute(dbPath) : normalizeAbsolute('metanyx.db');
  const exists = fs.existsSync(absDbPath);
  let size = exists ? (fs.statSync(absDbPath).size) : 0;

  let count = 0;
  let db;
  try {
    if (exists) {
      db = await initDb(absDbPath);
      count = await countEntries(db);
    }

    printTable([
      { key: 'CWD', value: process.cwd() },
      { key: 'DBPath', value: absDbPath },
      { key: 'DBExists', value: exists ? 'yes' : 'no' },
      { key: 'DBSize', value: exists ? String(size) : '' },
      { key: 'DBEntries', value: String(count) },
      { key: 'Node', value: process.version },
      { key: 'Actions', value: 'read, view, wri, clear, info' },
    ]);
  } catch (err) {
    console.error('info 动作执行失败:', err);
    process.exitCode = 1;
  } finally {
    if (db) closeDb(db);
  }
}

function printTable(rows) {
  const cols = [
    { key: 'key', title: 'Key', align: 'left', max: 20 },
    { key: 'value', title: 'Value', align: 'left', max: 120 },
  ];

  const calcWidth = (title, values, max) => {
    let w = title.length;
    for (const v of values) {
      const len = String(v ?? '').length;
      if (len > w) w = len;
    }
    return Math.min(w, max);
  };

  for (const c of cols) {
    c.width = calcWidth(c.title, rows.map((r) => r[c.key]), c.max);
  }

  const fmt = (val, width, align) => {
    let s = String(val ?? '');
    if (s.length > width) {
      s = s.slice(0, Math.max(0, width - 1)) + '…';
    }
    if (align === 'right') return s.padStart(width, ' ');
    return s.padEnd(width, ' ');
  };

  const header = cols.map((c) => fmt(c.title, c.width, 'left')).join(' | ');
  const sep = cols.map((c) => '-'.repeat(c.width)).join('-+-');
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    const line = cols
      .map((c) => fmt(r[c.key], c.width, c.align))
      .join(' | ');
    console.log(line);
  }
}