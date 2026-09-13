const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const projectId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const document = {
  schemaVersion: 1,
  text: 'Presenter notes\nSecond line',
  mode: 'line-by-line',
  autoscroll: true,
  scrollSpeed: 70,
  fontSize: 36,
  lineHeight: 1.5,
  textAlign: 'center',
  theme: 'dark',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

function createElectronFixture(savedBounds = null, loadResultForWindow = () => undefined) {
  const windows = [];
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const preferenceState = { extras: savedBounds ? { teleprompterWindow: savedBounds } : {} };
  const patches = [];

  class FakeWindow {
    static getAllWindows() {
      return windows;
    }

    constructor(options) {
      this.options = options;
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
      this.listeners = new Map();
      this.contentListeners = new Map();
      this.sent = [];
      this.visible = false;
      this.destroyed = false;
      this.webContents = {
        on: (event, listener) => {
          const listeners = this.contentListeners.get(event) ?? [];
          listeners.push({ listener, once: false });
          this.contentListeners.set(event, listeners);
        },
        once: (event, listener) => {
          const listeners = this.contentListeners.get(event) ?? [];
          listeners.push({ listener, once: true });
          this.contentListeners.set(event, listeners);
        },
        send: (...args) => this.sent.push(args),
      };
      windows.push(this);
    }

    on(event, listener) {
      this.listeners.set(event, listener);
    }

    once(event, listener) {
      this.listeners.set(event, (...args) => {
        this.listeners.delete(event);
        listener(...args);
      });
    }

    emit(event, ...args) {
      this.listeners.get(event)?.(...args);
    }

    emitContent(event, ...args) {
      const listeners = this.contentListeners.get(event) ?? [];
      this.contentListeners.set(
        event,
        listeners.filter(({ once }) => !once),
      );
      for (const { listener } of listeners) listener(...args);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    getBounds() {
      return { ...this.bounds };
    }

    setBounds(next) {
      this.bounds = { ...this.bounds, ...next };
    }

    setAlwaysOnTop() {}

    show() {
      this.visible = true;
      this.emit('show');
    }

    showInactive() {
      this.visible = true;
      this.emit('show');
    }

    hide() {
      this.visible = false;
      this.emit('hide');
    }

    moveTop() {}

    loadURL() {
      return loadResultForWindow(windows.indexOf(this));
    }

    loadFile() {
      return loadResultForWindow(windows.indexOf(this));
    }

    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }

  const electron = {
    BrowserWindow: FakeWindow,
    screen: {
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => ({ x: 400, y: 300 }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  const preferencesStore = {
    read: () => structuredClone(preferenceState),
    patch: (patch) => {
      patches.push(structuredClone(patch));
      preferenceState.extras = { ...preferenceState.extras, ...(patch.extras || {}) };
      return structuredClone(preferenceState);
    },
  };

  return {
    windows,
    patches,
    preferencesStore,
    restore: () => {
      Module._load = originalLoad;
    },
  };
}

function loadTeleprompterWindow() {
  const modulePath = require.resolve('../electron/teleprompter/teleprompter-window.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('persists teleprompter bounds after native move and resize events', () => {
  const fixture = createElectronFixture();
  const appIconPath = '/app/dist/brand/BeamIcon.png';
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({
      applicationRoot: '/app',
      isPackaged: false,
      preferencesStore: fixture.preferencesStore,
      appIconPath,
    });

    teleprompter.showInactive();
    const window = fixture.windows[0];
    assert.equal(window.options.icon, appIconPath);
    window.setBounds({ x: 355, y: 277, width: 800, height: 500 });
    window.emit('move');
    window.emit('resize');
    window.emit('close');

    assert.deepEqual(fixture.patches.at(-1).extras.teleprompterWindow, {
      x: 355,
      y: 277,
      width: 800,
      height: 500,
    });
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('restores persisted teleprompter x/y and dimensions on the next window', async () => {
  const fixture = createElectronFixture({ x: 355, y: 277, width: 800, height: 500 });
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({
      applicationRoot: '/app',
      isPackaged: false,
      preferencesStore: fixture.preferencesStore,
    });

    const preparing = teleprompter.prepare();
    const window = fixture.windows[0];

    assert.equal(window.options.x, 355);
    assert.equal(window.options.y, 277);
    assert.equal(window.options.width, 800);
    assert.equal(window.options.height, 500);
    let prepared = false;
    void preparing.then(() => {
      prepared = true;
    });
    window.emitContent('did-finish-load');
    await Promise.resolve();
    assert.equal(prepared, false, 'native navigation alone is not renderer readiness');
    assert.equal(teleprompter.markRendererReady(window.webContents), true);
    assert.equal(await preparing, true);
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('checkpoints the live teleprompter before suspend and restores it only for its matching session', async () => {
  const fixture = createElectronFixture({ x: 355, y: 277, width: 800, height: 500 });
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({
      applicationRoot: '/app',
      isPackaged: false,
      preferencesStore: fixture.preferencesStore,
    });
    const context = { projectId, sessionId };
    teleprompter.setSession(context);
    const firstReady = teleprompter.prepare();
    const firstWindow = fixture.windows[0];
    let firstPrepared = false;
    void firstReady.then(() => {
      firstPrepared = true;
    });
    assert.equal(teleprompter.markRendererReady(firstWindow.webContents), true);
    await Promise.resolve();
    assert.equal(firstPrepared, false, 'renderer readiness alone cannot complete prewarming before navigation');
    firstWindow.emitContent('did-finish-load');
    assert.equal(await firstReady, true);
    assert.ok(
      firstWindow.sent.some(([channel, value]) => channel === 'teleprompter:session' && value.sessionId === sessionId),
    );

    teleprompter.showInactive();
    assert.equal(
      firstWindow.sent.filter(([channel]) => channel === 'teleprompter:visibility').at(-1)?.[1],
      true,
      'native visibility is broadcast when the teleprompter is shown',
    );
    const suspending = teleprompter.suspend();
    assert.equal(firstWindow.isVisible(), false, 'suspend hides the native overlay before waiting for its checkpoint');
    assert.deepEqual(
      firstWindow.sent
        .filter(([channel]) => channel === 'teleprompter:visibility')
        .slice(-2)
        .map(([, value]) => value),
      [true, false],
      'native visibility is broadcast for both show and suspend',
    );
    const suspendMessage = firstWindow.sent.find(([channel]) => channel === 'teleprompter:suspend');
    assert.ok(suspendMessage);
    const [, requestId] = suspendMessage;
    assert.match(requestId, /^[0-9a-f-]{36}$/i);

    const viewState = {
      document,
      session: context,
      activeLine: 1,
      scrollTop: 418.5,
      isEditing: true,
      isPaused: true,
      error: '',
    };
    assert.equal(
      teleprompter.acknowledgeSuspend({}, requestId, viewState),
      false,
      'another renderer cannot ack the request',
    );
    assert.equal(
      teleprompter.acknowledgeSuspend(firstWindow.webContents, '00000000-0000-4000-8000-000000000000', viewState),
      false,
      'an unrelated request id cannot complete the checkpoint',
    );
    assert.equal(teleprompter.acknowledgeSuspend(firstWindow.webContents, requestId, viewState), true);
    await suspending;
    assert.equal(firstWindow.isDestroyed(), true);

    const secondReady = teleprompter.prepare();
    const secondWindow = fixture.windows[1];
    assert.deepEqual(teleprompter.resumeState(secondWindow.webContents), viewState);
    secondWindow.emitContent('did-finish-load');
    assert.equal(teleprompter.markRendererReady(secondWindow.webContents), true);
    assert.equal(await secondReady, true);
    assert.equal(secondWindow.isVisible(), true, 'the previously requested visibility is restored after checkpoint');
    assert.equal(
      secondWindow.sent.filter(([channel]) => channel === 'teleprompter:visibility').at(-1)?.[1],
      true,
      'renderer readiness and show publish the final native visibility',
    );
    assert.equal(
      secondWindow.sent.some(([channel]) => channel === 'teleprompter:session'),
      false,
      'the session event must not overwrite the checkpoint restored before renderer readiness',
    );

    teleprompter.setSession({ projectId, sessionId: '33333333-3333-4333-8333-333333333333' });
    assert.equal(
      teleprompter.resumeState(secondWindow.webContents),
      null,
      'a checkpoint cannot cross session contexts',
    );
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('ignores aborted and subframe failures, then retries after a main-frame load failure', async () => {
  const fixture = createElectronFixture();
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
    const failedPreparation = teleprompter.prepare();
    const firstWindow = fixture.windows[0];

    firstWindow.emitContent('did-fail-load', {}, -3, 'aborted', 'http://localhost:6500/teleprompter.html', true);
    firstWindow.emitContent('did-fail-load', {}, -2, 'subframe failed', 'http://localhost:6500/child', false);
    await Promise.resolve();
    assert.equal(firstWindow.isDestroyed(), false);

    firstWindow.emitContent(
      'did-fail-load',
      {},
      -2,
      'main frame failed',
      'http://localhost:6500/teleprompter.html',
      true,
    );
    assert.equal(await failedPreparation, false);
    assert.equal(firstWindow.isDestroyed(), true);

    const retryPreparation = teleprompter.prepare();
    const retryWindow = fixture.windows[1];
    firstWindow.emitContent('did-finish-load');
    firstWindow.emitContent('did-fail-load', {}, -2, 'stale', '', true);
    assert.equal(teleprompter.markRendererReady(firstWindow.webContents), false);
    retryWindow.emitContent('did-finish-load');
    assert.equal(teleprompter.markRendererReady(retryWindow.webContents), true);
    assert.equal(await retryPreparation, true);
    assert.equal(retryWindow.isDestroyed(), false);
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('a retry prepares after the native load promise rejects', async () => {
  const fixture = createElectronFixture(null, (index) =>
    index === 0 ? Promise.reject(new Error('navigation failed')) : undefined,
  );
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
    const failedPreparation = teleprompter.prepare();
    const firstWindow = fixture.windows[0];
    assert.equal(await failedPreparation, false);
    assert.equal(firstWindow.isDestroyed(), true);

    const retryPreparation = teleprompter.prepare();
    const retryWindow = fixture.windows[1];
    retryWindow.emitContent('did-finish-load');
    assert.equal(teleprompter.markRendererReady(retryWindow.webContents), true);
    assert.equal(await retryPreparation, true);
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('destroy resolves an in-progress preparation as unavailable', async () => {
  const fixture = createElectronFixture();
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
    const preparing = teleprompter.prepare();
    const window = fixture.windows[0];

    teleprompter.destroy();

    assert.equal(await preparing, false);
    assert.equal(window.isDestroyed(), true);
  } finally {
    fixture.restore();
  }
});

test('a rapid HUD return cancels the old checkpoint and takes a fresh draft before reloading', async () => {
  const fixture = createElectronFixture();
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
    const context = { projectId, sessionId };
    teleprompter.setSession(context);
    const ready = teleprompter.prepare();
    const window = fixture.windows[0];
    window.emitContent('did-finish-load');
    teleprompter.markRendererReady(window.webContents);
    assert.equal(await ready, true);
    teleprompter.showInactive();

    const oldSuspending = teleprompter.suspend();
    assert.equal(window.isVisible(), false);
    const [, oldRequestId] = window.sent.find(([channel]) => channel === 'teleprompter:suspend');
    const returning = teleprompter.prepare();
    assert.equal(returning, ready, 'returning to the HUD reuses the live renderer instead of reloading it');
    assert.equal(window.isVisible(), true);

    const unsavedView = {
      document: { ...document, text: 'Unsaved draft\nMore notes' },
      session: context,
      activeLine: 1,
      scrollTop: 612,
      isEditing: true,
      isPaused: false,
      error: '',
    };
    assert.equal(
      teleprompter.acknowledgeSuspend(window.webContents, oldRequestId, unsavedView),
      false,
      'the previous request cannot overwrite the live editor after HUD return',
    );
    await oldSuspending;
    assert.equal(window.isDestroyed(), false, 'the cancelled suspension preserves its live renderer');

    const freshSuspending = teleprompter.suspend();
    const [, freshRequestId] = window.sent.filter(([channel]) => channel === 'teleprompter:suspend').at(-1);
    assert.notEqual(freshRequestId, oldRequestId, 'a new suspend asks the renderer for a fresh draft');
    assert.equal(teleprompter.acknowledgeSuspend(window.webContents, freshRequestId, unsavedView), true);
    await freshSuspending;
    assert.equal(window.isDestroyed(), true);

    const reloadedReady = teleprompter.prepare();
    const reloadedWindow = fixture.windows[1];
    assert.deepEqual(teleprompter.resumeState(reloadedWindow.webContents), unsavedView);
    reloadedWindow.emitContent('did-finish-load');
    assert.equal(teleprompter.markRendererReady(reloadedWindow.webContents), true);
    assert.equal(await reloadedReady, true);
    assert.equal(teleprompter.isVisible(), true);
    assert.equal(
      reloadedWindow.sent.some(([channel]) => channel === 'teleprompter:session'),
      false,
      'the saved draft is not replaced by the ordinary session event during reload',
    );
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('show and showInactive cancel an outstanding checkpoint before revealing the current renderer', async () => {
  for (const returnMethod of ['show', 'showInactive']) {
    const fixture = createElectronFixture();
    try {
      const { createTeleprompterWindow } = loadTeleprompterWindow();
      const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
      teleprompter.setSession({ projectId, sessionId });
      const ready = teleprompter.prepare();
      const window = fixture.windows[0];
      window.emitContent('did-finish-load');
      teleprompter.markRendererReady(window.webContents);
      assert.equal(await ready, true);
      teleprompter[returnMethod]();

      const suspending = teleprompter.suspend();
      const [, requestId] = window.sent.find(([channel]) => channel === 'teleprompter:suspend');
      teleprompter[returnMethod]();
      assert.equal(window.isVisible(), true);
      assert.equal(
        teleprompter.acknowledgeSuspend(window.webContents, requestId, {
          document,
          session: { projectId, sessionId },
          activeLine: 0,
          scrollTop: 0,
          isEditing: true,
          isPaused: false,
          error: '',
        }),
        false,
        `${returnMethod} must invalidate the pending checkpoint before showing the teleprompter`,
      );
      await suspending;
      assert.equal(window.isDestroyed(), false);
      teleprompter.destroy();
    } finally {
      fixture.restore();
    }
  }
});

test('a rejected checkpoint keeps the hidden renderer intact for an immediate HUD return', async () => {
  const fixture = createElectronFixture();
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({ applicationRoot: '/app', isPackaged: false });
    teleprompter.setSession({ projectId, sessionId });
    const ready = teleprompter.prepare();
    const window = fixture.windows[0];
    window.emitContent('did-finish-load');
    teleprompter.markRendererReady(window.webContents);
    assert.equal(await ready, true);
    teleprompter.showInactive();

    const suspending = teleprompter.suspend();
    const [, requestId] = window.sent.find(([channel]) => channel === 'teleprompter:suspend');
    assert.equal(
      teleprompter.acknowledgeSuspend(window.webContents, requestId, {
        document,
        session: { projectId, sessionId },
        activeLine: 1,
        scrollTop: -1,
        isEditing: true,
        isPaused: false,
        error: '',
      }),
      true,
    );
    await assert.rejects(suspending, /Invalid teleprompter checkpoint state/);
    assert.equal(window.isDestroyed(), false, 'a rejected checkpoint must not discard the unsaved renderer');
    assert.equal(teleprompter.isVisible(), false);

    const returning = teleprompter.prepare();
    assert.equal(returning, ready);
    assert.equal(fixture.windows.length, 1, 'an immediate return reuses the intact renderer');
    assert.equal(teleprompter.isVisible(), true);
    assert.equal(teleprompter.resumeState(window.webContents), null, 'invalid checkpoint data is never published');
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});
