const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createQuickSnipFinalizer, safeName } = require('../electron/quick-snip/quick-snip-finalizer.cjs');

function fixture(t, render) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-snip-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDirectory = path.join(root, 'instant', 'project-id');
  const projectIds = [];
  const projectStore = {
    directoryFor: (id) => {
      projectIds.push(id);
      return path.join(root, 'instant', id);
    },
  };
  const session = { projectId: 'project-id' };
  return {
    root,
    projectDirectory,
    projectIds,
    projectStore,
    session,
    finalize: createQuickSnipFinalizer({ projectStore, render }),
  };
}

test('writes Instant exports into the project exports folder with preset and progress', async (t) => {
  let received;
  const f = fixture(t, async (options) => {
    received = options;
    options.onProgress(0.4);
    return { path: options.target, projectId: 'project-id' };
  });
  const values = [];
  const configuration = { mode: 'instant', format: 'mp4', name: 'Demo', preset: { id: 'named' } };
  const result = await f.finalize({ session: f.session, configuration, onProgress: (value) => values.push(value) });

  assert.deepEqual(f.projectIds, ['project-id']);
  assert.equal(received.store, f.projectStore);
  assert.equal(received.configuration.mode, 'instant');
  assert.equal(received.configuration.preset.id, 'named');
  assert.equal(result.path, path.join(f.projectDirectory, 'exports', 'Demo.mp4'));
  assert.deepEqual(values, [0.4]);
});

test('supports WebM and avoids overwriting an existing project export', async (t) => {
  const f = fixture(t, async (options) => ({ path: options.target, projectId: 'project-id' }));
  const exportsDirectory = path.join(f.projectDirectory, 'exports');
  fs.mkdirSync(exportsDirectory, { recursive: true });
  fs.writeFileSync(path.join(exportsDirectory, 'Demo.webm'), 'keep');

  const result = await f.finalize({
    session: f.session,
    configuration: { mode: 'instant', format: 'webm', name: 'Demo' },
  });

  assert.equal(result.path, path.join(exportsDirectory, 'Demo 2.webm'));
});

test('uses the current session project directory rather than another project', async (t) => {
  const f = fixture(t, async (options) => ({ path: options.target, projectId: options.configuration.projectId }));
  const session = { projectId: 'another-project' };

  const result = await f.finalize({
    session,
    configuration: { mode: 'instant', format: 'mp4', name: 'Demo' },
  });

  assert.deepEqual(f.projectIds, ['another-project']);
  assert.equal(result.path, path.join(f.root, 'instant', 'another-project', 'exports', 'Demo.mp4'));
  assert.equal(fs.existsSync(path.join(f.projectDirectory, 'exports', 'Demo.mp4')), false);
});

test('passes cancellation through to the renderer and leaves project data intact', async (t) => {
  const abort = new AbortController();
  abort.abort();
  const f = fixture(t, async ({ signal }) => {
    assert.equal(signal, abort.signal);
    throw new Error('Canceled');
  });

  await assert.rejects(
    f.finalize({ session: f.session, configuration: { mode: 'instant' }, signal: abort.signal }),
    /Canceled/,
  );
  assert.equal(fs.existsSync(path.join(f.projectDirectory, 'exports')), true);
});

test('rejects missing project identity and sanitizes output names', async (t) => {
  const f = fixture(t, () => assert.fail('must not render'));

  await assert.rejects(f.finalize({ session: {}, configuration: {} }), /no project/);
  assert.equal(safeName(''), 'Quick Snip');
  assert.equal(safeName('Demo / clip').includes('/'), false);
});
