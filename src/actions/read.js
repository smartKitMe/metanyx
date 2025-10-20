import fs from 'node:fs';
import path from 'node:path';
import { initDb, closeDb, upsertEntry, countEntries } from '../db.js';
import { normalizeAbsolute, exists, readMeta, scanDir, formatTimestamp } from '../utils/meta.js';
import { renderEntries } from '../utils/print.js';

export async function execute({ targetPath, dbPath, json }) {
  const absTarget = normalizeAbsolute(targetPath);
  if (!exists(absTarget)) {
    console.error(`路径不存在: ${absTarget}`);
    process.exit(1);
  }
  const absDbPath = dbPath ? normalizeAbsolute(dbPath) : normalizeAbsolute('metanyx.db');

  let db;
  try {
    db = await initDb(absDbPath);
    const stat = await fs.promises.lstat(absTarget);
    const scanned = [];
    if (stat.isDirectory()) {
      await scanDir(absTarget, async (meta) => {
        if (meta.type === 'file') {
          await upsertEntry(db, meta);
          scanned.push({
            ...meta,
            mtime_human: formatTimestamp(meta.mtime_ms),
            ctime_human: formatTimestamp(meta.ctime_ms),
            atime_human: formatTimestamp(meta.atime_ms),
          });
        }
      });
    } else {
      const meta = await readMeta(absTarget, stat);
      if (meta.type === 'file') {
        await upsertEntry(db, meta);
        scanned.push({
          ...meta,
          mtime_human: formatTimestamp(meta.mtime_ms),
          ctime_human: formatTimestamp(meta.ctime_ms),
          atime_human: formatTimestamp(meta.atime_ms),
        });
      }
    }
    console.log(`写入完成，本次写入文件数: ${scanned.length}`);
    renderEntries(scanned, { json });
  } catch (err) {
    console.error('read 动作执行失败:', err);
    process.exitCode = 1;
  } finally {
    if (db) closeDb(db);
  }
}