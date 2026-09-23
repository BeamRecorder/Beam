const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const tar = require('tar');
const { packRuntime, unpackRuntime, verifyRuntime, safeRelative } = require('../scripts/native/runtime-archive.cjs');
const { runtimeEnvironment } = require('../electron/capture/runtime-environment.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(source, 'bin', 'beam-media-engine'), 'private binary', { mode: 0o755 });
  fs.writeFileSync(
    path.join(source, 'inventory.json'),
    JSON.stringify({
      schema_version: 1,
      files: [
        { path: 'bin/beam-media-engine', sha256: crypto.createHash('sha256').update('private binary').digest('hex') },
      ],
    }),
  );
  return { root, source, archive: path.join(root, 'runtime.tar.gz') };
}
test('runtime archives preserve verified files and executable permissions after relocation', async (t) => {
  const f = fixture(t);
  packRuntime(f.source, f.archive);
  const destination = path.join(f.root, 'relocated runtime');
  await unpackRuntime(f.archive, destination);
  verifyRuntime(destination);
  assert.equal(fs.readFileSync(path.join(destination, 'bin/beam-media-engine'), 'utf8'), 'private binary');
  if (process.platform !== 'win32')
    assert.ok(fs.statSync(path.join(destination, 'bin/beam-media-engine')).mode & 0o111);
  fs.writeFileSync(path.join(destination, 'bin/beam-media-engine'), 'corrupt');
  assert.throws(() => verifyRuntime(destination), /SHA-256/);
});
test('unsafe links and malformed inventories never replace an installed runtime', async (t) => {
  const f = fixture(t);
  const installed = path.join(f.root, 'installed');
  fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, 'keep'), 'old');
  fs.writeFileSync(path.join(f.source, 'inventory.json'), '{}');
  tar.c({ sync: true, gzip: true, cwd: f.source, file: f.archive }, ['.']);
  await assert.rejects(() => unpackRuntime(f.archive, installed), /inventory/);
  assert.equal(fs.readFileSync(path.join(installed, 'keep'), 'utf8'), 'old');
  for (const value of ['../escape', '/absolute', 'C:/escape', 'dir\\escape']) assert.equal(safeRelative(value), false);
  if (process.platform !== 'win32') {
    fs.symlinkSync('/tmp', path.join(f.source, 'link'));
    tar.c({ sync: true, gzip: true, cwd: f.source, file: f.archive }, ['.']);
    await assert.rejects(() => unpackRuntime(f.archive, installed), /Unsafe/);
  }
});
test('packaged runtime isolates GStreamer plugins and uses private library paths', (t) => {
  const f = fixture(t);
  fs.renameSync(f.source, path.join(f.root, 'media-runtime'));
  const app = { isPackaged: true, getPath: () => '/user', getVersion: () => '1.2.3' };
  const env = runtimeEnvironment(app, f.root, 'linux');
  assert.equal(env.GST_PLUGIN_SYSTEM_PATH_1_0, '');
  assert.equal(env.LD_LIBRARY_PATH, path.join(f.root, 'media-runtime', 'lib'));
  assert.equal(env.GST_PLUGIN_PATH, path.join(f.root, 'media-runtime', 'plugins'));
  assert.throws(() => runtimeEnvironment(app, path.join(f.root, 'missing')), /missing/);
});
