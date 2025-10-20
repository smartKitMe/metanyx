import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeAbsolute, exists, hashFile, readMeta, formatTimestamp } from '../src/utils/meta.js';

function withTempFile(content = 'hello') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metanyx-'));
  const fp = path.join(dir, 'tmp.txt');
  fs.writeFileSync(fp, content);
  return { dir, fp };
}

describe('utils/meta', () => {
  it('normalizeAbsolute resolves path', () => {
    const p = normalizeAbsolute('.');
    expect(path.isAbsolute(p)).toBe(true);
  });

  it('exists detects files', () => {
    const { dir } = withTempFile();
    expect(exists(dir)).toBe(true);
  });

  it('hashFile computes sha256', async () => {
    const { fp } = withTempFile('abc');
    const h = await hashFile(fp);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('readMeta returns file metadata', async () => {
    const { fp } = withTempFile('xyz');
    const stat = fs.lstatSync(fp);
    const meta = await readMeta(fp, stat);
    expect(meta.type).toBe('file');
    expect(meta.name).toBe('tmp.txt');
    expect(meta.size).toBe(stat.size);
  });

  it('formatTimestamp returns human string', () => {
    const s = formatTimestamp(Date.now());
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(10);
  });
});