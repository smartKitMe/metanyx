import { getByPath, listUnderPath, searchEntries } from '../db.js';
import { normalizeAbsolute } from './meta.js';

const FILTER_KEYS = ['name','ext','under','mtime_from','mtime_to','ctime_from','ctime_to','size_min','size_max','type'];

export function hasAnyFilter(filters = {}) {
  return FILTER_KEYS.some((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
}

export function computeEffectiveMode(targetPath, mode, filters) {
  if (mode) return mode;
  const hasFilter = hasAnyFilter(filters || {});
  if (!targetPath && !hasFilter) return 'search';
  const isDirHint = targetPath ? targetPath.endsWith('/') : false;
  return targetPath ? (isDirHint ? 'list' : 'single') : 'search';
}

export async function performSearch(db, { targetPath, mode, filters }) {
  const absTarget = targetPath ? normalizeAbsolute(targetPath) : null;
  const effectiveMode = computeEffectiveMode(absTarget, mode, filters);

  let rows = [];
  if (effectiveMode === 'single') {
    if (!absTarget) throw new Error('single 模式需要提供 targetPath');
    const row = await getByPath(db, absTarget);
    rows = row ? [row] : [];
  } else if (effectiveMode === 'list') {
    // 支持无 targetPath 的 list：使用 filters.under 作为目录
    let baseDir = absTarget;
    if (!baseDir) {
      const under = filters?.under;
      if (!under) throw new Error('list 模式需要提供 filters.under');
      baseDir = normalizeAbsolute(under);
    }
    rows = await listUnderPath(db, baseDir);
    rows = rows.filter((r) => r.type === 'file');
  } else if (effectiveMode === 'search') {
    const f = { ...(filters || {}) };
    const hasFilter = hasAnyFilter(f);
    // 规范化 under 为绝对路径，以匹配 entries.full_path
    if (f.under) {
      f.under = normalizeAbsolute(f.under);
    }
    if (!hasFilter) {
      rows = await searchEntries(db, {});
    } else {
      if (!f.type) f.type = 'file';
      rows = await searchEntries(db, f);
    }
  } else {
    throw new Error(`未知搜索模式: ${effectiveMode}`);
  }

  return { rows, effectiveMode, absTarget };
}

export function extractFilePaths(rows) {
  return (rows || []).filter((r) => r.type === 'file').map((r) => r.full_path);
}