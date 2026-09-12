const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
function fixture(snapshot, extra = {}) {
  const handlers = new Map(),
    calls = [],
    sender = {};
  const state = snapshot ?? { state: 'processing', job: { mode: 'studio', projectId: 'project' } };
  let currentStatusOwner = sender;
  const controller = {
    state: () => state,
    cancel: async (options) => calls.push(options ? ['cancel', options] : 'cancel'),
    updateSelectionRegion() {},
  };
  const cropWindow = { rendererReady: (owner) => calls.push(['crop-ready', owner]) };
  let controllerDependencies;
  const statusWindow = {
    owns: (owner) => owner === currentStatusOwner,
    snapshot: () => extra.statusSnapshot ?? null,
    hide: () => calls.push('hide'),
    setInteractive: (value) => calls.push(value),
  };
  let fileClipboardOptions = null;
  const source = require.resolve('../electron/quick-snip/quick-snip-service.cjs');
  const previous = Module._load;
  delete require.cache[source];
  Module._load = function (name, ...args) {
    if (name === './quick-snip-controller.cjs')
      return {
        createQuickSnipController: (dependencies) => {
          controllerDependencies = dependencies;
          return controller;
        },
      };
    if (name === './quick-snip-window.cjs') return { createQuickSnipWindow: () => cropWindow };
    if (name === './quick-snip-status-window.cjs') return { createQuickSnipStatusWindow: () => statusWindow };
    if (name === './quick-snip-renderer.cjs')
      return { createQuickSnipRenderer: () => ({ render() {}, destination() {} }) };
    if (name === './quick-snip-finalizer.cjs') return { createQuickSnipFinalizer: () => () => {} };
    if (name === '../clipboard/file-clipboard.cjs')
      return {
        createFileClipboard: (options) => {
          fileClipboardOptions = options;
          return {
            copyFile: (file) => {
              calls.push(['clipboard.copyFile', file]);
              return extra.copyFile ? extra.copyFile(file, options) : { native: true, fallback: null };
            },
          };
        },
      };
    return previous.call(this, name, ...args);
  };
  try {
    const { createQuickSnipService } = require(source);
    createQuickSnipService({
      BrowserWindow: {},
      applicationIpc: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) },
      regionOverlay: {},
      userPaths: {},
      openEditor: async (id) => calls.push(`editor:${id}`),
      ...extra,
    });
  } finally {
    Module._load = previous;
    delete require.cache[source];
  }
  return {
    calls,
    cropWindow,
    controllerDependencies,
    sender,
    fileClipboardOptions: () => fileClipboardOptions,
    replaceStatusOwner: (owner) => {
      currentStatusOwner = owner;
    },
    invoke: (name, payload, owner = sender) => handlers.get(`quick-snip:${name}`)({ sender: owner }, payload),
  };
}
test('main process retains the status window while canceling export and opening the project', async () => {
  const f = fixture();
  await f.invoke('open-editor');
  assert.deepEqual(f.calls, [['cancel', { keepStatus: true }], 'editor:project', 'hide']);
});
test('completed projects open without cancelling and raw jobs cannot open an editor', async () => {
  const f = fixture({ state: 'completed', job: { mode: 'studio' }, result: { projectId: 'finished' } });
  await f.invoke('open-editor');
  assert.deepEqual(f.calls, ['editor:finished', 'hide']);
  const raw = fixture({ state: 'completed', job: { mode: 'raw', projectId: 'raw' } });
  await assert.rejects(raw.invoke('open-editor'), /No retained/);
});
test('rejects unrelated renderers and ignores malformed interactivity messages', async () => {
  const f = fixture();
  await assert.rejects(f.invoke('open-editor', undefined, {}), /not authorized/);
  f.invoke('status-interactive', true, {});
  f.invoke('status-interactive', 'yes');
  assert.deepEqual(f.calls, []);
  f.invoke('status-interactive', true);
  assert.deepEqual(f.calls, [true]);
});

test('keeps the current status renderer until editor presentation succeeds and hides it afterward', async () => {
  let finishPresentation;
  const f = fixture(undefined, {
    openEditor: async (id) => {
      f.calls.push(`editor:${id}`);
      await new Promise((resolve) => {
        finishPresentation = resolve;
      });
    },
  });

  const opening = f.invoke('open-editor');
  await Promise.resolve();
  assert.deepEqual(f.calls, [['cancel', { keepStatus: true }], 'editor:project']);

  finishPresentation();
  await opening;
  assert.deepEqual(f.calls, [['cancel', { keepStatus: true }], 'editor:project', 'hide']);
});

test('keeps Quick Snip status and its error surface when opening the editor fails', async () => {
  const error = new Error('Editor renderer stopped responding.');
  const f = fixture(undefined, {
    openEditor: async (id) => {
      f.calls.push(`editor:${id}`);
      throw error;
    },
  });

  await assert.rejects(f.invoke('open-editor'), error);
  assert.deepEqual(f.calls, [['cancel', { keepStatus: true }], 'editor:project']);
});

test('does not hide a replacement status window after the original request completes', async () => {
  let finishPresentation;
  const f = fixture(undefined, {
    openEditor: async (id) => {
      f.calls.push(`editor:${id}`);
      await new Promise((resolve) => {
        finishPresentation = resolve;
      });
    },
  });

  const opening = f.invoke('open-editor');
  await Promise.resolve();
  f.replaceStatusOwner({ id: 'replacement-status-renderer' });
  finishPresentation();
  await opening;

  assert.deepEqual(f.calls, [['cancel', { keepStatus: true }], 'editor:project']);
});

test('forwards the Crop Bar ready sender to the native renderer gate', () => {
  const f = fixture();
  const rendererSender = { id: 'crop-renderer' };

  f.invoke('crop-ready', undefined, rendererSender);

  assert.deepEqual(f.calls, [['crop-ready', rendererSender]]);
});

test('returns the status snapshot with popover side only to its owning renderer', () => {
  const controllerState = { state: 'processing', job: { mode: 'studio', projectId: 'project' } };
  const statusSnapshot = { ...controllerState, popoverSide: 'below' };
  const f = fixture(controllerState, { statusSnapshot });

  assert.equal(f.invoke('state'), statusSnapshot);
  assert.equal(f.invoke('state', undefined, { id: 'unrelated-renderer' }), controllerState);
});

for (const platform of ['linux', 'win32', 'darwin']) {
  test(`passes ${platform} to the Quick Snip controller`, () => {
    const f = fixture(undefined, { platform });

    assert.equal(f.controllerDependencies.platform, platform);
  });
}

test('validates Linux Quick Snip output paths before delegating to the file clipboard', async (t) => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'my video.webm');
  fs.writeFileSync(file, 'video');
  const copied = [];
  const f = fixture(undefined, {
    platform: 'linux',
    userPaths: { quickSnipStudio: root, quickSnipRaw: path.join(root, 'raw') },
    copyFile: async (target, options) => {
      copied.push({ target, platform: options.platform });
      return { native: true, fallback: null };
    },
  });
  assert.deepEqual(f.fileClipboardOptions().platform, 'linux');
  assert.deepEqual(await f.invoke('copy-file', file), { native: true, fallback: null });
  assert.deepEqual(copied, [{ target: file, platform: 'linux' }]);
  assert.throws(() => f.invoke('copy-file', '/outside.webm'), /invalid/);
  assert.deepEqual(copied, [{ target: file, platform: 'linux' }]);
});
