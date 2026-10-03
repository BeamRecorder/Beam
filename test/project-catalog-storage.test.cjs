const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openCatalogDatabase } = require('../electron/projects/project-catalog-storage.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-catalog-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, '.project-catalog.sqlite') };
}
test('a corrupt derived database is recreated without touching authoritative metadata', (t) => {
  const { root, file } = fixture(t);
  const metadata = path.join(root, 'project.json');
  fs.writeFileSync(metadata, 'authoritative project');
  fs.writeFileSync(file, 'broken cache');
  const db = openCatalogDatabase(file);
  try {
    db.exec('CREATE TABLE proof (value TEXT)');
    assert.equal(fs.readFileSync(metadata, 'utf8'), 'authoritative project');
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    db.close();
  }
});
for (const suffix of ['', '-wal', '-shm']) {
  test(`rejects a linked cache${suffix} without changing the linked file`, (t) => {
    const { root, file } = fixture(t);
    const target = path.join(root, 'important.json');
    fs.writeFileSync(target, 'keep this document');
    try {
      fs.symlinkSync(target, file + suffix);
    } catch (error) {
      if (error.code === 'EPERM') return t.skip('Symlink creation unavailable');
      throw error;
    }
    assert.throws(() => openCatalogDatabase(file), /Invalid project catalogue cache/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep this document');
  });
}
test('filesystem failures remain actionable and do not remove the cache path', (t) => {
  const { file } = fixture(t);
  fs.mkdirSync(file);
  assert.throws(() => openCatalogDatabase(file), /Invalid project catalogue cache/);
  assert.equal(fs.statSync(file).isDirectory(), true);
});
