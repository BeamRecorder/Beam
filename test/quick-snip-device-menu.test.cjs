const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { registerQuickSnipDeviceMenu } = require('../electron/quick-snip/quick-snip-device-menu.cjs');
function fixture() {
  const sender = new EventEmitter();
  const window = { isDestroyed: () => false };
  let state = { state: 'selecting', job: { name: 'job', mode: 'studio' } };
  let handler,
    requestShown,
    finish,
    fail = false,
    closed = 0;
  const registration = registerQuickSnipDeviceMenu({
    applicationIpc: {
      handle: (_channel, callback) => {
        handler = callback;
      },
    },
    BrowserWindow: { fromWebContents: () => window },
    cropWindow: { owns: (candidate) => candidate === sender },
    controller: { state: () => state },
    settingsWindow: {
      chooseDevice: (owner, request) => {
        assert.equal(owner, window);
        requestShown = request;
        if (fail) throw new Error('Menu unavailable');
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      hide: () => {
        closed++;
        finish?.(null);
      },
    },
  });
  const request = {
    kind: 'microphone',
    selectedId: 'mic:2',
    position: { x: 50, y: 58 },
    options: [
      { id: 'mic:1', label: 'Built-in mic' },
      { id: 'mic:2', label: 'USB mic' },
      { id: 'no-audio', label: 'Off' },
    ],
  };
  return {
    sender,
    window,
    registration,
    request,
    invoke: (payload = request, owner = sender) => handler({ sender: owner }, payload),
    shown: () => requestShown,
    select: (id) => finish(id),
    closed: () => closed,
    state: (next) => {
      state = next;
    },
    fail: () => {
      fail = true;
    },
  };
}
test('opens shared renderer choices for the owning toolbar and returns the selected device', async () => {
  const f = fixture();
  const result = f.invoke();
  assert.deepEqual(f.shown(), f.request);
  f.select('mic:1');
  assert.equal(await result, 'mic:1');
  assert.equal(f.sender.listenerCount('destroyed'), 0);
});
test('rejects foreign renderers and malformed options before opening the surface', async () => {
  const f = fixture();
  await assert.rejects(f.invoke(f.request, {}), /not authorized/);
  for (const request of [
    null,
    { ...f.request, kind: 'screen' },
    { ...f.request, options: [] },
    { ...f.request, options: [f.request.options[0], f.request.options[0]] },
    { ...f.request, options: [{ id: 'mic', label: '' }] },
    { ...f.request, kind: 'systemAudio' },
    { ...f.request, selectedId: 12 },
    { ...f.request, position: null },
    { ...f.request, position: { x: NaN, y: 0 } },
    { ...f.request, position: { x: 0, y: -1 } },
    { ...f.request, position: { x: 10001, y: 0 } },
  ])
    await assert.rejects(f.invoke(request), /Invalid|Unsupported/);
  assert.equal(f.shown(), undefined);
});
for (const next of ['idle', 'preparing', 'recording', 'canceled'])
  test(`does not open devices during ${next}`, async () => {
    const f = fixture();
    f.state({ state: next, job: { name: 'job', mode: 'studio' } });
    assert.equal(await f.invoke(), null);
    assert.equal(f.shown(), undefined);
  });
test('Screenshot has no device menu and leaving selection closes a pending request', async () => {
  const f = fixture();
  f.state({ state: 'selecting', job: { name: 'job', mode: 'screenshot' } });
  assert.equal(await f.invoke(), null);
  f.state({ state: 'selecting', job: { name: 'job', mode: 'studio' } });
  const pending = f.invoke();
  f.state({ state: 'recording', job: { name: 'job', mode: 'studio' } });
  f.registration.close();
  assert.equal(await pending, null);
  assert.equal(f.closed(), 1);
});
for (const scenario of ['dismiss', 'destroy', 'replace'])
  test(`${scenario} discards stale device selections`, async () => {
    const f = fixture();
    const pending = f.invoke();
    if (scenario === 'dismiss') f.select(null);
    else if (scenario === 'destroy') f.sender.emit('destroyed');
    else {
      f.state({ state: 'selecting', job: { name: 'next', mode: 'studio' } });
      f.select('mic:1');
    }
    assert.equal(await pending, null);
    assert.equal(f.sender.listenerCount('destroyed'), 0);
  });
test('opening failures release ownership for a retry', async () => {
  const f = fixture();
  f.fail();
  await assert.rejects(f.invoke(), /unavailable/);
  assert.equal(f.sender.listenerCount('destroyed'), 0);
  f.registration.close();
  assert.equal(f.closed(), 0);
});
test('only validated renderer fields cross to the popup', async () => {
  const f = fixture();
  const pending = f.invoke({ ...f.request, position: { x: 50, y: 58, window: 'foreign' }, arbitrary: true });
  assert.deepEqual(f.shown(), f.request);
  f.select(null);
  assert.equal(await pending, null);
});
