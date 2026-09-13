const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
function fixture(snapshot, extra = {}) {
  const handlers = new Map(),
    calls = [],
    sender = {},
    cropSender = {};
  const state = snapshot ?? { state: 'processing', job: { mode: 'instant', projectId: 'project' } };
  let currentStatusOwner = sender;
  const controller = {
    state: () => state,
    cancel: async (options) => calls.push(options ? ['cancel', options] : 'cancel'),
    updateSelectionRegion() {},
    report: (report) => {
      calls.push(['report', report]);
      return state;
    },
  };
  const cropWindow = {
    owns: (owner) => owner === cropSender,
    rendererReady: (owner) => calls.push(['crop-ready', owner]),
  };
  let controllerDependencies;
  const statusWindow = {
    owns: (owner) => owner === currentStatusOwner,
    snapshot: () => extra.statusSnapshot ?? null,
    rendererReady: (owner) => calls.push(['status-ready', owner]),
    hide: () => calls.push('hide'),
    setInteractive: (value) => calls.push(value),
  };
  let fileClipboardOptions = null;
  let service;
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
    service = createQuickSnipService({
      BrowserWindow: {},
      applicationIpc: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) },
      regionOverlay: {},
      userPaths: {},
      openEditor: async (id) => calls.push(`editor:${id}`),
      openScreenshot: async (id) => calls.push(`screenshot:${id}`),
      ...extra,
    });
  } finally {
    Module._load = previous;
    delete require.cache[source];
  }
  return {
    calls,
    cropWindow,
    service,
    controllerDependencies,
    sender,
    cropSender,
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
test('completed Studio and Instant projects open in the editor without canceling', async () => {
  const f = fixture({ state: 'completed', job: { mode: 'studio' }, result: { projectId: 'finished' } });
  await f.invoke('open-editor');
  assert.deepEqual(f.calls, ['editor:finished', 'hide']);
  const instant = fixture({ state: 'completed', job: { mode: 'instant' }, result: { projectId: 'instant' } });
  await instant.invoke('open-editor');
  assert.deepEqual(instant.calls, ['editor:instant', 'hide']);
});

test('opens completed screenshot projects in the screenshot editor', async () => {
  const f = fixture({
    state: 'completed',
    job: { mode: 'screenshot' },
    result: { projectId: 'still-id' },
  });

  await f.invoke('open-editor');

  assert.deepEqual(f.calls, ['screenshot:still-id', 'hide']);
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

test('forwards the status renderer ready sender to the status window', () => {
  const f = fixture();

  f.invoke('status-ready', undefined, f.sender);

  assert.deepEqual(f.calls, [['status-ready', f.sender]]);
});

test('returns the status snapshot with popover side only to its owning renderer', () => {
  const controllerState = { state: 'processing', job: { mode: 'instant', projectId: 'project' } };
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

test('validates Instant project output paths before delegating to the file clipboard', async (t) => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'my video.webm');
  fs.writeFileSync(file, 'video');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-copy-outside-'));
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const outsideFile = path.join(outsideRoot, 'outside.webm');
  fs.writeFileSync(outsideFile, 'video');
  const copied = [];
  const f = fixture(undefined, {
    platform: 'linux',
    userPaths: { instantProjects: root },
    copyFile: async (target, options) => {
      copied.push({ target, platform: options.platform });
      return { native: true, fallback: null };
    },
  });
  assert.deepEqual(f.fileClipboardOptions().platform, 'linux');
  assert.deepEqual(await f.invoke('copy-file', file), { native: true, fallback: null });
  assert.deepEqual(copied, [{ target: file, platform: 'linux' }]);
  assert.throws(() => f.invoke('copy-file', outsideFile), /invalid/);
  assert.deepEqual(copied, [{ target: file, platform: 'linux' }]);
});

test('accepts screenshot capture stages only from the owning Crop Bar', () => {
  const f = fixture();
  const reports = [
    { type: 'capture-cancelled', name: 'current-job' },
    { type: 'screenshot-captured', name: 'current-job', screenshotId: 'still-id' },
    { type: 'screenshot-rendered', name: 'current-job', preview: 'data:image/jpeg;base64,AA==' },
    { type: 'screenshot', name: 'current-job', screenshotId: 'still-id' },
  ];

  for (const report of reports) {
    assert.throws(() => f.invoke('report', report), /not authorized/);
    assert.throws(() => f.invoke('report', report, {}), /not authorized/);
    f.invoke('report', report, f.cropSender);
  }

  assert.deepEqual(
    f.calls,
    reports.map((report) => ['report', report]),
  );
});

test('resolves a Windows Quick Snip source from the selected display center in physical coordinates', async () => {
  const display = { id: 22, bounds: { x: -1920, y: -120, width: 1920, height: 1080 } };
  const calls = [];
  const f = fixture(undefined, {
    platform: 'win32',
    screen: {
      dipToScreenPoint: (point) => {
        calls.push(['dipToScreenPoint', point]);
        return { x: -2880, y: -180 };
      },
    },
    captureEngine: {
      request: async (command, payload) => {
        calls.push(['captureEngine.request', command, payload]);
        return 'wgc:monitor:\\\\.\\DISPLAY2';
      },
    },
  });

  const sourceId = await f.controllerDependencies.resolveScreenId(display);

  assert.equal(sourceId, 'wgc:monitor:\\\\.\\DISPLAY2');
  assert.deepEqual(calls, [
    ['dipToScreenPoint', { x: -960, y: 420 }],
    ['captureEngine.request', 'resolve-display', { x: -2880, y: -180 }],
  ]);
});

test('resolves a macOS Quick Snip source from the display ID without asking the capture engine', async () => {
  const display = { id: 456, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const f = fixture(undefined, {
    platform: 'darwin',
    screen: {
      dipToScreenPoint: () => assert.fail('macOS does not need DIP conversion for a CGDisplayID'),
    },
    captureEngine: {
      request: () => assert.fail('macOS display source resolution must not use the capture engine'),
    },
  });

  assert.equal(await f.controllerDependencies.resolveScreenId(display), 'sck:display:456');
});

for (const platform of ['win32', 'darwin', 'linux']) {
  test(`hides the ${platform} Crop Bar before screenshot capture proceeds`, async () => {
    const calls = [];
    let visible = true;
    const target = {
      hide: () => {
        calls.push('bar.hide');
        visible = false;
      },
      isDestroyed: () => false,
      isVisible: () => visible,
    };
    const f = fixture(undefined, {
      platform,
      BrowserWindow: { fromWebContents: () => target },
    });

    await f.service.prepareScreenshot({ sender: f.cropSender });
    calls.push('capture');

    assert.deepEqual(calls, ['bar.hide', 'capture']);
    assert.equal(visible, false);
  });
}

test('refuses screenshot capture when the Crop Bar is still visible after hide', async () => {
  const calls = [];
  const target = {
    hide: () => calls.push('bar.hide'),
    isDestroyed: () => false,
    isVisible: () => true,
  };
  const f = fixture(undefined, {
    BrowserWindow: { fromWebContents: () => target },
  });

  const capture = async () => {
    await f.service.prepareScreenshot({ sender: f.cropSender });
    calls.push('capture');
  };

  await assert.rejects(capture(), /Unable to hide the Quick Snip bar for capture/);
  assert.deepEqual(calls, ['bar.hide']);
});
