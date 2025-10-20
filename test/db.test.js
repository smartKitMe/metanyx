import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb, closeDb, upsertEntry, countEntries, getByPath, listUnderPath, searchEntries } from '../src/db.js';
import { readMeta } from '../src/utils/meta.js';

function withTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metanyx-'));
  return dir;
}

async function mkFile(dir, name, content = 'hello') {
  const fp = path.join(dir, name);
  await fs.promises.writeFile(fp, content);
  const stat = await fs.promises.lstat(fp);
  const meta = await readMeta(fp, stat);
  return { fp, meta };
}

describe('db ops', () => {
  it('initDb and upsert/count/get/list/search', async () => {
    const dbFile = path.join(withTempDir(), 'test.db');
    const db = await initDb(dbFile);

    const { fp: f1, meta: m1 } = await mkFile(withTempDir(), 'a.txt', 'a');
    const { fp: f2, meta: m2 } = await mkFile(withTempDir(), 'b.js', 'b');

    await upsertEntry(db, m1);
    await upsertEntry(db, m2);

    const cnt = await countEntries(db);
    expect(cnt).toBe(2);

    const g1 = await getByPath(db, m1.full_path);
    expect(g1?.name).toBe('a.txt');

    const list1 = await listUnderPath(db, path.dirname(m1.full_path));
    expect(Array.isArray(list1)).toBe(true);

    const searchJs = await searchEntries(db, { ext: '.js' });
    expect(searchJs.some((r) => r.ext === '.js')).toBe(true);

    closeDb(db);
  });
});