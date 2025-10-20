import fs from 'node:fs';
import { initDb, closeDb, upsertEntry } from '../db.js';
import { normalizeAbsolute, readMeta } from '../utils/meta.js';
import { renderOps } from '../utils/print.js';
import { performSearch, extractFilePaths } from '../utils/search.js';

// 修改元数据支持：
// - touch: 更新 mtime/ctime 为当前时间（读取后写回数据库，不改文件本身）
// - rename: 重命名文件（在文件系统执行，并更新数据库记录）
// - chmod: 修改权限（在文件系统执行，并更新数据库记录）
// - time: 通过增量语法修改 atime/mtime（ctime 由系统维护，最终以系统为准）
// options: { action: 'touch'|'rename'|'chmod'|'time', dbPath, extra, filters, json }
export async function execute({ action, dbPath, extra, filters, json }) {
  const absDbPath = dbPath ? normalizeAbsolute(dbPath) : normalizeAbsolute('metanyx.db');

  let db;
  const ops = [];
  try {
    db = await initDb(absDbPath);

    if (action === 'touch') {
      // 基于数据库过滤选择目标（仅 file）
      const { rows } = await performSearch(db, { targetPath: undefined, mode: 'search', filters });
      const targets = extractFilePaths(rows);
      if (!targets.length) {
        ops.push({ op: 'touch', path: '', result: '无匹配文件' });
      }
      for (const absTarget of targets) {
        const stat = await fs.promises.lstat(absTarget);
        const meta = await readMeta(absTarget, stat);
        meta.mtime_ms = Date.now();
        meta.ctime_ms = Date.now();
        await upsertEntry(db, meta);
        ops.push({ op: 'touch', path: absTarget, result: '记录时间戳已更新' });
      }
    } else if (action === 'rename') {
      // rename 需要提供新的名称，通过过滤选中唯一文件时生效；多文件将按同名规则覆盖
      const newName = extra?.newName;
      if (!newName) throw new Error('rename 需要提供 extra.newName');
      const { rows } = await performSearch(db, { targetPath: undefined, mode: 'search', filters });
      const targets = extractFilePaths(rows);
      if (!targets.length) {
        ops.push({ op: 'rename', path: '', result: '无匹配文件' });
      }
      for (const absTarget of targets) {
        const dir = absTarget.substring(0, absTarget.lastIndexOf('/'));
        const newPath = `${dir}/${newName}`;
        await fs.promises.rename(absTarget, newPath);
        const newStat = await fs.promises.lstat(newPath);
        const meta = await readMeta(newPath, newStat);
        await upsertEntry(db, meta);
        ops.push({ op: 'rename', path: newPath, result: '已重命名' });
      }
    } else if (action === 'chmod') {
      const mode = extra?.mode;
      if (typeof mode !== 'number') throw new Error('chmod 需要提供数字类型 extra.mode');
      const { rows } = await performSearch(db, { targetPath: undefined, mode: 'search', filters });
      const targets = extractFilePaths(rows);
      if (!targets.length) {
        ops.push({ op: 'chmod', path: '', result: '无匹配文件' });
      }
      for (const absTarget of targets) {
        await fs.promises.chmod(absTarget, mode);
        const newStat = await fs.promises.lstat(absTarget);
        const meta = await readMeta(absTarget, newStat);
        await upsertEntry(db, meta);
        ops.push({ op: 'chmod', path: absTarget, result: `权限=${mode}` });
      }
    } else if (action === 'time') {
      const { rows } = await performSearch(db, { targetPath: undefined, mode: 'search', filters });
      const targets = extractFilePaths(rows);
      if (!targets.length) {
        ops.push({ op: 'time', path: '', result: '无匹配文件' });
      }
      const deltaAll = extra?.time_all ? parseDelta(extra.time_all) : 0;
      const deltaM = extra?.mtime ? parseDelta(extra.mtime) : 0;
      const deltaA = extra?.atime ? parseDelta(extra.atime) : 0;

      for (const fp of targets) {
        const stat = await fs.promises.lstat(fp);
        const currentM = stat.mtimeMs;
        const currentA = stat.atimeMs;
        const newM = currentM + deltaAll + deltaM;
        const newA = currentA + deltaAll + deltaA;
        const newAtimeDate = new Date(newA);
        const newMtimeDate = new Date(newM);
        await fs.promises.utimes(fp, newAtimeDate, newMtimeDate);
        const newStat = await fs.promises.lstat(fp);
        const meta = await readMeta(fp, newStat);
        await upsertEntry(db, meta);
        ops.push({ op: 'time', path: fp, result: `atime=${newAtimeDate.toISOString()} mtime=${newMtimeDate.toISOString()}` });
      }
      ops.push({ op: 'time', path: '', result: '完成（ctime 以系统为准）' });
    } else {
      throw new Error(`未知 wri 操作: ${action}`);
    }
  } catch (err) {
    console.error('wri 动作执行失败:', err);
    process.exitCode = 1;
  } finally {
    if (db) closeDb(db);
  }
  renderOps(ops, { json });
}

function parseDelta(expr) {
  if (!expr) return 0;
  const m = String(expr).trim();
  const regex = /([+-]?\d+)(d|h|m|s|ms)/g;
  let match;
  let total = 0;
  while ((match = regex.exec(m)) !== null) {
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const factor = unit === 'd' ? 24*60*60*1000
      : unit === 'h' ? 60*60*1000
      : unit === 'm' ? 60*1000
      : unit === 's' ? 1000
      : unit === 'ms' ? 1
      : 0;
    total += val * factor;
  }
  return total;
}