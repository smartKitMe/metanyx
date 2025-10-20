import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function normalizeAbsolute(p) {
  return path.resolve(p);
}

export function exists(p) {
  return fs.existsSync(p);
}

export function hashFile(fp) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(fp);
    const hash = crypto.createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', () => resolve(null));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function readMeta(fp, stat) {
  const name = path.basename(fp);
  const type = stat.isDirectory() ? 'dir' : 'file';
  const ext = type === 'file' ? path.extname(name) : '';
  const hash = type === 'file' ? await hashFile(fp) : null;
  return {
    full_path: fp,
    name,
    type,
    size: stat.size,
    mtime_ms: stat.mtimeMs,
    ctime_ms: stat.ctimeMs,
    atime_ms: stat.atimeMs,
    mode: stat.mode,
    ext,
    hash,
  };
}

export async function scanDir(dir, onEntry) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const child = path.join(dir, ent.name);
    const stat = await fs.promises.lstat(child);
    const meta = await readMeta(child, stat);
    await onEntry(meta);
    if (ent.isDirectory()) {
      await scanDir(child, onEntry);
    }
  }
}

export function formatTimestamp(ms) {
  if (typeof ms !== 'number') return null;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 新增：解析人类可读的日期时间字符串到毫秒（本地时区）
// 支持格式：
// - YYYY-MM-DD
// - YYYY-MM-DD HH:mm
// - YYYY-MM-DD HH:mm:ss
// - YYYY-MM-DDTHH:mm[:ss]
// - 特殊值：now
// bound: 'from' | 'to'，用于缺省时间的补全策略
export function parseTimeString(input, bound = 'from') {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (!s) return undefined;
  if (s.toLowerCase() === 'now') return Date.now();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, y, mo, d] = m;
    const year = Number(y), month = Number(mo) - 1, day = Number(d);
    if (bound === 'to') {
      return new Date(year, month, day, 23, 59, 59, 999).getTime();
    }
    return new Date(year, month, day, 0, 0, 0, 0).getTime();
  }

  // YYYY-MM-DD[ T]HH:mm[:ss]
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [_, y, mo, d, hh, mm, ss] = m;
    const year = Number(y), month = Number(mo) - 1, day = Number(d);
    const h = Number(hh), min = Number(mm);
    if (ss !== undefined) {
      const sec = Number(ss);
      const ms = bound === 'to' ? 999 : 0;
      return new Date(year, month, day, h, min, sec, ms).getTime();
    } else {
      // 无秒：from -> :00:00.000；to -> :59:59.999
      if (bound === 'to') {
        return new Date(year, month, day, h, min, 59, 999).getTime();
      }
      return new Date(year, month, day, h, min, 0, 0).getTime();
    }
  }

  // 回退：尝试原生解析（支持 ISO 如 2024-10-20T12:34:56Z）
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;

  // 无法解析，返回 undefined（调用处可给出错误提示）
  return undefined;
}