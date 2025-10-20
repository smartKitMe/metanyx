import { formatTimestamp } from './meta.js';

function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log('无记录');
    return;
  }
  const calcWidth = (title, values, max) => {
    let w = title.length;
    for (const v of values) {
      const len = String(v ?? '').length;
      if (len > w) w = len;
    }
    return Math.min(w, max);
  };
  const cols = columns.map((c) => ({ ...c }));
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
    const line = cols.map((c) => fmt(r[c.key], c.width, c.align)).join(' | ');
    console.log(line);
  }
}

const entryColumns = [
  { key: 'name', title: 'Name', align: 'left', max: 30 },
  { key: 'type', title: 'Type', align: 'left', max: 8 },
  { key: 'size', title: 'Size', align: 'right', max: 12 },
  { key: 'ext', title: 'Ext', align: 'left', max: 8 },
  { key: 'mtime_human', title: 'MTime', align: 'left', max: 19 },
  { key: 'ctime_human', title: 'CTime', align: 'left', max: 19 },
  { key: 'atime_human', title: 'ATime', align: 'left', max: 19 },
  { key: 'full_path', title: 'Path', align: 'left', max: 80 },
];

const opsColumns = [
  { key: 'op', title: 'Op', align: 'left', max: 10 },
  { key: 'path', title: 'Path', align: 'left', max: 80 },
  { key: 'result', title: 'Result', align: 'left', max: 80 },
];

export function renderEntries(rows, { json } = {}) {
  const normalized = (rows || []).map((r) => ({
    ...r,
    mtime_human: r.mtime_human ?? formatTimestamp(r.mtime_ms),
    ctime_human: r.ctime_human ?? formatTimestamp(r.ctime_ms),
    atime_human: r.atime_human ?? formatTimestamp(r.atime_ms),
  }));
  if (json) {
    console.log(JSON.stringify(normalized, null, 2));
  } else {
    printTable(normalized, entryColumns);
  }
}

export function renderOps(rows, { json } = {}) {
  const normalized = (rows || []).map((r) => ({
    op: r.op,
    path: r.path,
    result: r.result ?? '',
  }));
  if (json) {
    console.log(JSON.stringify(normalized, null, 2));
  } else {
    printTable(normalized, opsColumns);
  }
}