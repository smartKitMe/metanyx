import { initDb, closeDb } from '../db.js';
import { normalizeAbsolute, formatTimestamp } from '../utils/meta.js';
import { renderEntries } from '../utils/print.js';
import { performSearch } from '../utils/search.js';

// options:
// - dbPath
// - mode: 'single' | 'list' | 'search'
// - fields: array of fields to show
// - filters: { name, ext, under, mtime_from, mtime_to, ctime_from, ctime_to, size_min, size_max, type }
// - table: boolean, render as table
// - json: boolean, force JSON output
export async function execute({ dbPath, mode, fields, filters, table, json }) {
  const absDbPath = dbPath ? normalizeAbsolute(dbPath) : normalizeAbsolute('metanyx.db');
  const showFields = Array.isArray(fields) && fields.length > 0 ? fields : null;
  const renderTable = json ? false : (table === undefined ? true : !!table);

  let db;
  try {
    db = await initDb(absDbPath);

    const { rows } = await performSearch(db, { targetPath: undefined, mode, filters });

    const decorated = rows.map((r) => ({
      ...r,
      mtime_human: formatTimestamp(r.mtime_ms),
      ctime_human: formatTimestamp(r.ctime_ms),
      atime_human: formatTimestamp(r.atime_ms),
    }));

    const out = showFields ? decorated.map((r) => pickFields(r, showFields)) : decorated;

    renderEntries(out, { json: !renderTable ? true : false });
  } catch (err) {
    console.error('view 动作执行失败:', err);
    process.exitCode = 1;
  } finally {
    if (db) closeDb(db);
  }
}

function pickFields(obj, fields) {
  const o = {};
  for (const f of fields) {
    o[f] = obj[f];
  }
  return o;
}