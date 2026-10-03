const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createIdleHudRenderer, STANDBY_URL } = require('../electron/lifecycle/idle-hud-renderer.cjs');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new EventEmitter();
  const urls = [],
    logs = [];
  let url = 'http://localhost:6512/html/index.html';
  window.visible = true;
  window.destroyed = false;
  window.isVisible = () => window.visible;
  window.isDestroyed = () => window.destroyed;
  window.webContents = { getURL: () => url };
  window.loadURL = async (next) => {
    urls.push(next);
    url = next;
  };
  const controller = { mode: 'hud' };
  const idle = createIdleHudRenderer({
    window,
    controller,
    canSuspend: () => true,
    releaseAuxiliary: async () => true,
    log: (...args) => logs.push(args),
    ...overrides,
  });
  t.after(() => idle.destroy());
  const hide = () => {
    window.visible = false;
    window.emit('hide');
  };
  return { window, controller, idle, urls, logs, hide };
}
test('releases hidden HUD resources after the idle delay and restores the exact session URL', async (t) => {
  let released = 0;
  const f = fixture(t, {
    releaseAuxiliary: async () => {
      released++;
    },
  });
  f.hide();
  t.mock.timers.tick(999);
  await flush();
  assert.equal(f.urls.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(released, 1);
  assert.deepEqual(f.urls, [STANDBY_URL]);
  assert.equal(f.controller.rendererLifecycle.isSuspended(), true);
  await f.idle.resume();
  assert.equal(f.idle.isSuspended(), false);
  assert.equal(f.urls.at(-1), 'http://localhost:6512/html/index.html');
});
for (const condition of ['visible', 'recorder', 'busy', 'destroyed'])
  test(`does not unload a ${condition} HUD`, async (t) => {
    const f = fixture(t, { canSuspend: () => condition !== 'busy' });
    f.hide();
    if (condition === 'visible') f.window.visible = true;
    if (condition === 'recorder') f.controller.mode = 'recorder';
    if (condition === 'destroyed') f.window.destroyed = true;
    t.mock.timers.tick(1000);
    await flush();
    assert.deepEqual(f.urls, []);
  });
test('showing or resuming during an auxiliary checkpoint prevents a late standby navigation', async (t) => {
  let release;
  const f = fixture(t, {
    releaseAuxiliary: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  f.hide();
  t.mock.timers.tick(1000);
  await flush();
  await f.idle.resume();
  f.window.visible = true;
  f.window.emit('show');
  release(true);
  await flush();
  assert.deepEqual(f.urls, []);
});
test('an unsaved auxiliary checkpoint blocks unloading, and can retry later', async (t) => {
  let saved = false;
  const f = fixture(t, { releaseAuxiliary: async () => saved });
  f.hide();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.idle.isSuspended(), false);
  saved = true;
  f.idle.schedule();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.idle.isSuspended(), true);
});
test('concurrent wake requests share one reload and a failed reload remains retryable', async (t) => {
  const f = fixture(t);
  f.hide();
  t.mock.timers.tick(1000);
  await flush();
  let resolve;
  f.window.loadURL = () =>
    new Promise((r) => {
      resolve = r;
    });
  const first = f.idle.resume();
  assert.equal(first, f.idle.resume());
  resolve();
  await first;
  assert.equal(f.idle.isSuspended(), false);
  f.window.webContents.getURL = () => 'http://localhost:6512/html/index.html';
  f.window.visible = false;
  f.idle.schedule();
  t.mock.timers.tick(1000);
  await flush();
  resolve();
  await flush();
  f.window.loadURL = async () => {
    throw Error('load failed');
  };
  await assert.rejects(f.idle.resume(), /load failed/);
  assert.equal(f.idle.isSuspended(), true);
  f.window.loadURL = async () => {};
  await f.idle.resume();
  assert.equal(f.idle.isSuspended(), false);
});
test('disposal cancels work, removes listeners and clears the controller boundary', async (t) => {
  const f = fixture(t);
  f.hide();
  f.idle.destroy();
  t.mock.timers.tick(1000);
  await flush();
  assert.deepEqual(f.urls, []);
  assert.equal(f.window.listenerCount('hide'), 0);
  assert.equal(f.controller.rendererLifecycle, null);
  await f.idle.resume();
  f.idle.schedule();
  assert.deepEqual(f.urls, []);
});
