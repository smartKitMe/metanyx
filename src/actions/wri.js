import fs from 'node:fs';
import path from 'node:path';
import { normalizeAbsolute, formatTimestamp } from '../utils/meta.js';
import { performSearch } from '../utils/search.js';
import { initDb, closeDb } from '../db.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let utimesNative = null;
let utimesCompat = null;
try { utimesNative = require('@ronomon/utimes'); } catch (e) {}
try { utimesCompat = require('utimes'); } catch (e) {}

function getTimeImpl() {
  if (utimesNative && typeof utimesNative.utimes === 'function') return '@ronomon/utimes';
  if (utimesCompat && utimesCompat.utimes) return 'utimes';
  return 'fs.promises.utimes';
}

function parseDelta(deltaStr) {
  // 支持形如 +10d, -3h, +30m, -45s, +500ms 的增量
  // 也支持复合：+1h30m
  if (!deltaStr) return 0;
  const m = String(deltaStr).trim();
  const sign = m.startsWith('-') ? -1 : 1;
  const s = m.replace(/^[-+]/, '');
  const re = /(\d+)(d|h|m|s|ms)/g;
  let total = 0;
  let match;
  while ((match = re.exec(s)) !== null) {
    const val = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') total += val * 24 * 60 * 60 * 1000;
    else if (unit === 'h') total += val * 60 * 60 * 1000;
    else if (unit === 'm') total += val * 60 * 1000;
    else if (unit === 's') total += val * 1000;
    else if (unit === 'ms') total += val;
  }
  return sign * total;
}

async function setTimes(p, { atimeMs, mtimeMs }) {
  // 优先使用 @ronomon/utimes，其次使用 utimes 包，最后降级到 fs.utimes
  if (utimesNative && typeof utimesNative.utimes === 'function') {
    await new Promise((resolve, reject) => {
      // btime 传 undefined，避免修改创建时间
      utimesNative.utimes(p, undefined, mtimeMs, atimeMs, (err) => (err ? reject(err) : resolve()));
    });
    return;
  }
  if (utimesCompat && utimesCompat.utimes) {
    await utimesCompat.utimes(p, { mtime: mtimeMs, atime: atimeMs });
    return;
  }
  await fs.promises.utimes(p, new Date(atimeMs), new Date(mtimeMs));
}

async function applyTimes(p, { mtimeDelta, atimeDelta }) {
  const stat = fs.statSync(p);
  const atimeMs = stat.atimeMs + (atimeDelta || 0);
  const mtimeMs = stat.mtimeMs + (mtimeDelta || 0);
  await setTimes(p, { atimeMs, mtimeMs });
}

async function touchCtime(p) {
  // 通过安全重命名触发 ctime 变化：重命名到临时名，再改回
  const dir = path.dirname(p);
  const base = path.basename(p);
  const temp = path.join(dir, `.${base}.ctime_touch_${Date.now()}`);
  // 确保临时名不存在
  await fs.promises.rename(p, temp);
  await fs.promises.rename(temp, p);
}

export async function execute({ dbPath, filters, extra, json, op }) {
  const dbAbs = normalizeAbsolute(dbPath || 'metanyx.db');
  let db;
  try {
    db = await initDb(dbAbs);
    const { rows } = await performSearch(db, { targetPath: undefined, mode: 'search', filters: filters || {} });
    const action = op || extra?.action;

    if (action === 'time') {
      const implMsg = `[wri] time impl: ${getTimeImpl()}`;
      if (json) console.error(implMsg); else console.log(implMsg);

      const mtimeDelta = parseDelta(extra?.mtime || extra?.time_all);
      const atimeDelta = parseDelta(extra?.atime || extra?.time_all);
      const ctimeTouch = !!extra?.ctime_touch;

      const results = [];
      for (const t of rows) {
        try {
          await applyTimes(t.full_path, { mtimeDelta, atimeDelta });
          if (ctimeTouch) {
            await touchCtime(t.full_path);
          }
          const s = fs.statSync(t.full_path);
          results.push({
            full_path: t.full_path,
            atime_ms: s.atimeMs,
            mtime_ms: s.mtimeMs,
            ctime_ms: s.ctimeMs,
          });
        } catch (e) {
          results.push({ full_path: t.full_path, error: String(e) });
        }
      }
      if (json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const r of results) {
          if (r.error) {
            console.log(`${r.full_path} -> ERROR: ${r.error}`);
          } else {
            const ah = formatTimestamp(r.atime_ms);
            const mh = formatTimestamp(r.mtime_ms);
            const ch = formatTimestamp(r.ctime_ms);
            console.log(`${r.full_path} -> atime=${ah} mtime=${mh} ctime=${ch}`);
          }
        }
      }
      return;
    }

    if (action === 'touch') {
      const implMsg = `[wri] touch impl: fs.promises.utimes`;
      if (json) console.error(implMsg); else console.log(implMsg);

      const results = [];
      for (const t of rows) {
        try {
          const now = new Date();
          await fs.promises.utimes(t.full_path, now, now);
          const s = fs.statSync(t.full_path);
          results.push({ full_path: t.full_path, atime_ms: s.atimeMs, mtime_ms: s.mtimeMs, ctime_ms: s.ctimeMs });
        } catch (e) {
          results.push({ full_path: t.full_path, error: String(e) });
        }
      }
      if (json) console.log(JSON.stringify(results, null, 2));
      else {
        for (const r of results) {
          if (r.error) {
            console.log(`${r.full_path} -> ERROR: ${r.error}`);
          } else {
            const ah = formatTimestamp(r.atime_ms);
            const mh = formatTimestamp(r.mtime_ms);
            const ch = formatTimestamp(r.ctime_ms);
            console.log(`${r.full_path} -> touched atime=${ah} mtime=${mh} ctime=${ch}`);
          }
        }
      }
      return;
    }

    if (action === 'chmod') {
      const mode = extra?.mode;
      if (typeof mode !== 'number') {
        console.error('chmod 需要使用 --chmod 指定权限');
        process.exit(1);
      }
      const results = [];
      for (const t of rows) {
        try {
          await fs.promises.chmod(t.full_path, mode);
          results.push({ full_path: t.full_path, mode });
        } catch (e) {
          results.push({ full_path: t.full_path, error: String(e) });
        }
      }
      if (json) console.log(JSON.stringify(results, null, 2));
      else results.forEach((r) => console.log(r.error ? `${r.full_path} -> ERROR: ${r.error}` : `${r.full_path} -> chmod ${mode}`));
      return;
    }

    if (action === 'rename') {
      const newName = extra?.newName;
      if (!newName) {
        console.error('rename 需要使用 --new-name 指定新文件名');
        process.exit(1);
      }
      const results = [];
      for (const t of rows) {
        try {
          const dir = path.dirname(t.full_path);
          const dest = path.join(dir, newName);
          await fs.promises.rename(t.full_path, dest);
          results.push({ from: t.full_path, to: dest });
        } catch (e) {
          results.push({ full_path: t.full_path, error: String(e) });
        }
      }
      if (json) console.log(JSON.stringify(results, null, 2));
      else results.forEach((r) => console.log(r.error ? `${r.full_path} -> ERROR: ${r.error}` : `${r.full_path} -> renamed`));
      return;
    }

    console.error(`未知 wri 操作: ${action}`);
    process.exit(1);
  } finally {
    if (db) closeDb(db);
  }
}