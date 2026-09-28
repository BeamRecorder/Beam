const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nativeUiDirectory, launchNativeUi } = require('../electron/lifecycle/native-ui-launcher.cjs');

test('resolves native UI resources for development and packaged apps', () => {
  assert.equal(nativeUiDirectory({ isPackaged: false }, '/repo', '/resources', 'linux', 'x64'),
    '/repo/build/native/linux/x64/native-ui');
  assert.equal(nativeUiDirectory({ isPackaged: true }, '/repo', '/resources', 'linux', 'x64'),
    '/resources/native-ui');
  assert.equal(nativeUiDirectory({ isPackaged: false }, '/repo', '/resources', 'unknown', 'x64'), null);
});

test('reports an incomplete native UI bundle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-launch-'));
  try {
    await assert.rejects(launchNativeUi({ app: { isPackaged: false }, applicationRoot: root,
      platform: 'linux', arch: 'x64', spawnImpl: () => assert.fail('missing bundle must not spawn') }),
    /bundle is incomplete/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('passes editor and shared preference paths to the native process', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-launch-'));
  const directory = nativeUiDirectory({ isPackaged: false }, root, '', 'linux', 'x64');
  let launched = null;
  let detached = false;
  try {
    fs.mkdirSync(path.join(directory, 'ui'), { recursive: true });
    for (const name of ['beam-native', 'ui/app.mjs', 'ui/assets.generated.json']) fs.writeFileSync(path.join(directory, name), 'x');
    const app = { isPackaged: false, getPath: (key) => key === 'videos' ? '/videos' : assert.fail('unexpected app path'),
      getVersion: () => '0.3.3' };
    const started = await launchNativeUi({ app, applicationRoot: root, platform: 'linux', arch: 'x64', spawnImpl: (file, args, options) => {
      launched = { file, args, options };
      const child = new EventEmitter();
      child.unref = () => { detached = true; };
      queueMicrotask(() => child.emit('spawn'));
      return child;
    } });
    assert.equal(started, true);
    assert.equal(detached, true);
    assert.equal(launched.file, path.join(directory, 'beam-native'));
    assert.equal(launched.options.env.BEAM_USER_DIR, '/videos/Beam/user');
    assert.equal(launched.options.env.BEAM_ELECTRON_APP, root);
    assert.equal(launched.options.env.ARGUI_APP_BUNDLE, path.join(directory, 'ui/app.mjs'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
