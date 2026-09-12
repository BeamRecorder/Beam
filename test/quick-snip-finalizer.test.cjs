const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createQuickSnipFinalizer, safeName } = require('../electron/quick-snip/quick-snip-finalizer.cjs');
function fixture(t, render) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-snip-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userPaths = {
    quickSnipStudio: path.join(root, 'studio'),
    quickSnipRaw: path.join(root, 'raw'),
    quickSnipWork: path.join(root, 'work'),
  };
  const manifestPath = path.join(userPaths.quickSnipWork, 'project', 'session', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, '{}');
  const projectStore = {},
    rawProjectStore = {};
  return {
    root,
    userPaths,
    projectStore,
    rawProjectStore,
    session: { projectId: 'project-id', manifestPath },
    finalize: createQuickSnipFinalizer({ userPaths, projectStore, rawProjectStore, render }),
  };
}
test('delegates Studio compositing with the selected preset and live progress', async (t) => {
  let received;
  const f = fixture(t, async (options) => {
    received = options;
    options.onProgress(0.4);
    return { path: options.target, projectId: 'project-id' };
  });
  const values = [];
  const configuration = { mode: 'studio', format: 'mp4', name: 'Demo', preset: { id: 'named' } };
  const result = await f.finalize({ session: f.session, configuration, onProgress: (value) => values.push(value) });
  assert.equal(received.store, f.projectStore);
  assert.equal(received.configuration.preset.id, 'named');
  assert.equal(result.path, path.join(f.userPaths.quickSnipStudio, 'Demo.mp4'));
  assert.deepEqual(values, [0.4]);
  assert.equal(fs.existsSync(f.session.manifestPath), true);
});
test('supports WebM and avoids overwriting a previous output', async (t) => {
  const f = fixture(t, async (options) => ({ path: options.target }));
  fs.mkdirSync(f.userPaths.quickSnipStudio);
  fs.writeFileSync(path.join(f.userPaths.quickSnipStudio, 'Demo.webm'), 'keep');
  const result = await f.finalize({
    session: f.session,
    configuration: { mode: 'studio', format: 'webm', name: 'Demo' },
  });
  assert.equal(path.basename(result.path), 'Demo 2.webm');
});
test('raw rendering uses its own project store and removes work after success', async (t) => {
  let store;
  const f = fixture(t, async (options) => {
    store = options.store;
    return { path: options.target };
  });
  await f.finalize({ session: f.session, configuration: { mode: 'raw', format: 'mp4' } });
  assert.equal(store, f.rawProjectStore);
  assert.equal(fs.existsSync(f.session.manifestPath), false);
});
test('raw work is removed after renderer failure and the error is preserved', async (t) => {
  const f = fixture(t, async () => {
    throw new Error('Encoder unavailable');
  });
  await assert.rejects(f.finalize({ session: f.session, configuration: { mode: 'raw' } }), /Encoder unavailable/);
  assert.equal(fs.existsSync(f.session.manifestPath), false);
});
test('passes cancellation through to the renderer and preserves Studio projects', async (t) => {
  const abort = new AbortController();
  abort.abort();
  const f = fixture(t, async ({ signal }) => {
    assert.equal(signal, abort.signal);
    throw new Error('Canceled');
  });
  await assert.rejects(
    f.finalize({ session: f.session, configuration: { mode: 'studio' }, signal: abort.signal }),
    /Canceled/,
  );
  assert.equal(fs.existsSync(f.session.manifestPath), true);
});
test('rejects missing project identity and sanitizes output names', async (t) => {
  const f = fixture(t, () => assert.fail('must not render'));
  await assert.rejects(f.finalize({ session: {}, configuration: {} }), /no project/);
  assert.equal(safeName(''), 'Quick Snip');
  assert.equal(safeName('Demo / clip').includes('/'), false);
});
