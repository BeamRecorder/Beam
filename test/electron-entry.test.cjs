const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const code = readFileSync(join(__dirname, '../apps/desktop/electron/entry.cjs'), 'utf8');

function entry(argv, platform = 'linux') {
  const loaded = [];
  runInNewContext(code, {
    process: { argv, platform, resourcesPath: '/beam resources' },
    require: (name) => (name === 'node:path' ? { join } : loaded.push(name)),
  });
  return loaded;
}

test('normal startup loads the desktop main process', () => {
  assert.deepEqual(entry(['beam', '--ozone-platform=x11']), ['./main.cjs']);
});
test('packaged GPU export dispatches only the application-owned host before desktop services', () => {
  assert.deepEqual(entry(['beam', '/untrusted.cjs', '--beam-gpu-export-host', '/job.json']), [
    '/beam resources/beam-cli/ffmpeg-host.cjs',
  ]);
});
test('non-Linux GPU host requests fail instead of starting desktop or another executable', () => {
  for (const platform of ['win32', 'darwin'])
    assert.throws(() => entry(['beam', '--beam-gpu-export-host'], platform), /Linux-only/);
});
test('packaging selects the entry dispatcher and includes the shared Electron adapter', () => {
  const config = require('../package.json');
  assert.equal(config.main, 'apps/desktop/electron/entry.cjs');
  assert.ok(config.build.files.includes('packages/electron-export/src/*.cjs'));
});
