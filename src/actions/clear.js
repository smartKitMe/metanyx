import { initDb, closeDb, countEntries } from '../db.js';
import { normalizeAbsolute } from '../utils/meta.js';

// 清理数据库 entries 表的所有数据
// options: { dbPath }
export async function execute({ dbPath }) {
  const absDbPath = dbPath ? normalizeAbsolute(dbPath) : normalizeAbsolute('metanyx.db');
  let db;
  try {
    db = await initDb(absDbPath);
    const before = await countEntries(db);
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM entries', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    const after = await countEntries(db);
    console.log(`数据库已清空 entries（之前 ${before} 条，现在 ${after} 条）`);
  } catch (err) {
    console.error('clear 动作执行失败:', err);
    process.exitCode = 1;
  } finally {
    if (db) closeDb(db);
  }
}