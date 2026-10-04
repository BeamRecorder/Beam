const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registerScreenColorIpc } = require('../apps/desktop/electron/capture/screen-color-ipc.cjs');

function fixture(options = {}) {
  const handlers = new Map();
  const app = new EventEmitter();
  const sender = new EventEmitter();
  sender.mainFrame = {};
  sender.isDestroyed = () => options.senderDestroyed ?? false;
  sender.getURL = () => 'file:///beam/dist/html/editor.html';
  const event = { sender, senderFrame: sender.mainFrame };
  const calls = [];
  let resolve;
  let reject;
  const result = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  let workers = 0;
  const engine = {
    request: (...args) => {
      calls.push(args);
      return result;
    },
    forceShutdown: async () => {
      calls.push('shutdown');
      reject(new Error('worker terminated'));
      return { confirmed: true };
    },
  };
  const owner = {
    isDestroyed: () => options.ownerDestroyed ?? false,
    getNativeWindowHandle: () => options.handle ?? Buffer.from([42, 0, 0, 0, 0, 0, 0, 0]),
  };
  registerScreenColorIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    app,
    BrowserWindow: {
      fromWebContents: () => (options.ownerMissing ? null : owner),
    },
    applicationRoot: '/beam',
    isTrustedRenderer: () => options.trusted ?? true,
    canAcceptWork: () => options.accepting ?? true,
    platform: options.platform ?? 'linux',
    createEngine: () => {
      workers++;
      return engine;
    },
  });
  return {
    app,
    sender,
    event,
    calls,
    resolve,
    reject,
    engine,
    workers: () => workers,
    pick: (source = event) => handlers.get('screen-color:pick')(source),
    cancel: (source = event) => handlers.get('screen-color:cancel')(source),
  };
}

test('uses one isolated worker with a main-owned X11 parent and interactive deadline', async () => {
  const f = fixture();
  const pending = f.pick();
  assert.equal(f.workers(), 1);
  assert.deepEqual(f.calls[0], ['pick-screen-color', { parentWindowId: 42 }, { timeoutMs: 120_000 }]);
  f.resolve('#12AbEf');
  assert.equal(await pending, '#12AbEf');
  assert.equal(f.calls.at(-1), 'shutdown');
  assert.equal(f.sender.listenerCount('destroyed'), 0);
  assert.equal(f.sender.listenerCount('did-start-navigation'), 0);
  assert.equal(await f.cancel(), undefined);
});

for (const [name, options] of Object.entries({
  'foreign renderer': { trusted: false },
  'destroyed renderer': { senderDestroyed: true },
  'missing window': { ownerMissing: true },
  'destroyed window': { ownerDestroyed: true },
  shutdown: { accepting: false },
  'unsupported platform': { platform: 'darwin' },
  'short handle': { handle: Buffer.alloc(2) },
  'zero XID': { handle: Buffer.alloc(8) },
  'invalid handle': { handle: '42' },
})) {
  test(`rejects ${name} before launching the worker`, async () => {
    const f = fixture(options);
    await assert.rejects(f.pick());
    assert.equal(f.workers(), 0);
  });
}

test('rejects child-frame requests before launching the worker', async () => {
  const f = fixture();
  await assert.rejects(f.pick({ ...f.event, senderFrame: {} }), /authorized/);
  assert.equal(f.workers(), 0);
});

test('rejects concurrent selections and allows a fresh selection after cleanup', async () => {
  const f = fixture();
  const pending = f.pick();
  await assert.rejects(f.pick(), /already active/);
  assert.equal(f.workers(), 1);
  f.resolve('#123456');
  await pending;
  assert.equal(await f.pick(), '#123456');
  assert.equal(f.workers(), 2);
});

test('returns null for portal cancellation without treating permission failures as cancellation', async () => {
  const f = fixture();
  const pending = f.pick();
  f.reject(Object.assign(new Error('cancelled'), { code: 'portal-cancelled' }));
  assert.equal(await pending, null);
  assert.equal(f.calls.at(-1), 'shutdown');
  const denied = fixture();
  const failure = denied.pick();
  denied.reject(Object.assign(new Error('denied'), { code: 'portal-denied' }));
  await assert.rejects(failure, /denied/);
  assert.equal(denied.calls.at(-1), 'shutdown');
});

for (const color of [null, '#123', 'orange', { color: '#123456' }, '#00000000']) {
  test(`rejects malformed color ${JSON.stringify(color)} and terminates its worker`, async () => {
    const f = fixture();
    const pending = f.pick();
    f.resolve(color);
    await assert.rejects(pending, /invalid sRGB/);
    assert.equal(f.calls.at(-1), 'shutdown');
  });
}

test('only the owning renderer can cancel the pending selection', async () => {
  const f = fixture();
  const pending = f.pick();
  const foreign = new EventEmitter();
  Object.assign(foreign, {
    mainFrame: {},
    isDestroyed: () => false,
    getURL: f.sender.getURL,
  });
  await f.cancel({ sender: foreign, senderFrame: foreign.mainFrame });
  assert.equal(f.calls.length, 1);
  await f.cancel();
  assert.equal(await pending, null);
});

for (const reason of ['destroyed', 'navigate', 'quit']) {
  test(`cancels and disposes the worker on ${reason}`, async () => {
    const f = fixture();
    const pending = f.pick();
    f.sender.emit('did-start-navigation', {}, '/child', false, false);
    assert.equal(f.calls.length, 1);
    if (reason === 'quit') f.app.emit('before-quit');
    else if (reason === 'navigate') f.sender.emit('did-start-navigation', {}, '/new', false, true);
    else f.sender.emit('destroyed');
    assert.equal(await pending, null);
    assert.equal(f.sender.listenerCount('destroyed'), 0);
  });
}

test('ignores a late successful response after the owner requested cancellation', async () => {
  const f = fixture();
  f.engine.forceShutdown = async () => ({ confirmed: true });
  const pending = f.pick();
  await f.cancel();
  f.resolve('#ff0000');
  assert.equal(await pending, null);
});
