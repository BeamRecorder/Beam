const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { withDevelopmentRuntime } = require('../scripts/dev/native-runtime.cjs');

function fixture(t, platform = 'linux', suffix = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'shared', 'debug');
  fs.mkdirSync(source, { recursive: true });
  const executable = path.join(source, `capture-engine${suffix}${platform === 'win32' ? '.exe' : ''}`);
  fs.writeFileSync(executable, 'engine-one', { mode: 0o755 });
  if (platform === 'linux')
    fs.writeFileSync(path.join(source, `beam-input-helper${suffix}`), 'helper-one', { mode: 0o755 });
  const cache = path.join(root, 'node_modules', '.cache', 'beam-native');
  return { root, source, executable, cache, platform };
}

for (const platform of ['linux', 'darwin', 'win32']) {
  test(`${platform} launches from a private executable copy and releases only its own files`, async (t) => {
    const f = fixture(t, platform);
    let runtimeDirectory;
    const value = await withDevelopmentRuntime(f.executable, f, async (executable) => {
      assert.notEqual(executable, f.executable);
      runtimeDirectory = path.dirname(executable);
      assert.equal(fs.readFileSync(executable, 'utf8'), 'engine-one');
      if (platform === 'linux')
        assert.equal(fs.readFileSync(path.join(runtimeDirectory, 'beam-input-helper'), 'utf8'), 'helper-one');
      fs.writeFileSync(f.executable, 'engine-two');
      assert.equal(fs.readFileSync(executable, 'utf8'), 'engine-one');
      if (process.platform !== 'win32') assert.ok(fs.statSync(executable).mode & 0o111);
      return 'launched';
    });
    assert.equal(value, 'launched');
    assert.equal(fs.existsSync(runtimeDirectory), false);
    assert.equal(fs.readFileSync(f.executable, 'utf8'), 'engine-two');
  });
}

test('versioned downloaded Linux binaries retain their matching helper', async (t) => {
  const f = fixture(t, 'linux', '-1.2.3');
  await withDevelopmentRuntime(f.executable, f, async (executable) => {
    assert.equal(path.basename(executable), 'capture-engine');
    assert.equal(fs.readFileSync(path.join(path.dirname(executable), 'beam-input-helper'), 'utf8'), 'helper-one');
  });
  assert.deepEqual(fs.readdirSync(f.cache), []);
});

test('parallel launches keep different snapshots and independent cleanup in the same worktree', async (t) => {
  const f = fixture(t);
  const firstReady = Promise.withResolvers();
  const releaseFirst = Promise.withResolvers();
  let firstDirectory;
  const first = withDevelopmentRuntime(f.executable, f, async (executable) => {
    firstDirectory = path.dirname(executable);
    firstReady.resolve();
    await releaseFirst.promise;
    assert.equal(fs.readFileSync(executable, 'utf8'), 'engine-one');
    assert.equal(fs.readFileSync(path.join(firstDirectory, 'beam-input-helper'), 'utf8'), 'helper-one');
  });
  try {
    await firstReady.promise;
    fs.writeFileSync(f.executable, 'engine-two');
    fs.writeFileSync(path.join(f.source, 'beam-input-helper'), 'helper-two');
    await withDevelopmentRuntime(f.executable, f, async (executable) => {
      assert.notEqual(path.dirname(executable), firstDirectory);
      assert.equal(fs.readFileSync(executable, 'utf8'), 'engine-two');
      assert.equal(fs.readFileSync(path.join(path.dirname(executable), 'beam-input-helper'), 'utf8'), 'helper-two');
    });
    assert.equal(fs.existsSync(firstDirectory), true);
  } finally {
    releaseFirst.resolve();
    await first;
  }
  assert.deepEqual(fs.readdirSync(f.cache), []);
});

test('missing engines and missing helpers fail before Electron starts and release partial copies', async (t) => {
  for (const missing of ['capture-engine', 'beam-input-helper']) {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.source, missing));
    await assert.rejects(
      withDevelopmentRuntime(f.executable, f, () => assert.fail('launch with missing binaries')),
      { code: 'ENOENT' },
    );
    assert.deepEqual(fs.readdirSync(f.cache), []);
  }
});

test('Electron launch failure removes its private copies while preserving Cargo artifacts', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    withDevelopmentRuntime(f.executable, f, () => {
      throw new Error('Electron failed');
    }),
    /Electron failed/,
  );
  assert.deepEqual(fs.readdirSync(f.cache), []);
  assert.equal(fs.existsSync(f.executable), true);
  assert.equal(fs.existsSync(path.join(f.source, 'beam-input-helper')), true);
});

test('pre-cancelled native launches do not create a cache or run Electron', async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    withDevelopmentRuntime(f.executable, { ...f, signal: controller.signal }, () => assert.fail('cancelled launch')),
    { name: 'AbortError' },
  );
  assert.equal(fs.existsSync(f.cache), false);
});
