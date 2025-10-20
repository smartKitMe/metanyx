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