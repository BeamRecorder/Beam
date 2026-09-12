const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { registerQuickSnipDeviceMenu } = require('../electron/quick-snip/quick-snip-device-menu.cjs');

function fixture() {
  const sender = new EventEmitter();
  const window = { isDestroyed: () => false };
  let state = { state: 'selecting', job: { name: 'job', mode: 'studio' } };
  let handler,
    template,
    popup,
    throwPopup = false,
    throwClose = false;
  let closed = 0;
  const registration = registerQuickSnipDeviceMenu({
    applicationIpc: {
      handle: (_channel, callback) => {
        handler = callback;
      },
    },
    BrowserWindow: { fromWebContents: () => window },
    cropWindow: { owns: (candidate) => candidate === sender },
    controller: { state: () => state },
    Menu: {
      buildFromTemplate: (entries) => {
        template = entries;
        return {
          popup: (options) => {
            if (throwPopup) throw new Error('Menu unavailable');
            popup = options;
          },
          closePopup: () => {
            closed++;
            if (throwClose) throw new Error('Menu already closed');
            popup?.callback();
          },
        };
      },
    },
  });
  const request = {
    kind: 'microphone',
    selectedId: 'mic:2',
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
    invoke: (payload = request, source = sender) => handler({ sender: source }, payload),
    template: () => template,
    popup: () => popup,
    closed: () => closed,
    state: (next) => {
      state = next;
    },
    fail: () => {
      throwPopup = true;
    },
    failClose: () => {
      throwClose = true;
    },
  };
}

test('shows native radio choices for the owning Crop Bar and returns the selected identifier', async () => {
  const f = fixture();
  const result = f.invoke();
  assert.equal(f.popup().window, f.window);
  assert.deepEqual(
    f.template().map(({ label, type, checked }) => ({ label, type, checked })),
    [
      { label: 'Built-in mic', type: 'radio', checked: false },
      { label: 'USB mic', type: 'radio', checked: true },
      { label: 'Off', type: 'radio', checked: false },
    ],
  );
  f.template()[0].click();
  f.popup().callback();
  assert.equal(await result, 'mic:1');
  assert.equal(f.sender.listenerCount('destroyed'), 0);
});

test('rejects unrelated renderers and malformed or unsupported choices before opening a menu', async () => {
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
  ]) {
    await assert.rejects(f.invoke(request), /Invalid|Unsupported/);
  }
  assert.equal(f.template(), undefined);
});

for (const state of ['idle', 'preparing', 'recording', 'canceled']) {
  test(`does not open device menus while ${state}`, async () => {
    const f = fixture();
    f.state({ state, job: { name: 'job', mode: 'studio' } });
    assert.equal(await f.invoke(), null);
    assert.equal(f.template(), undefined);
  });
}

test('ignores Screenshot device requests and closes a menu when selection ends', async () => {
  const f = fixture();
  f.state({ state: 'selecting', job: { name: 'job', mode: 'screenshot' } });
  assert.equal(await f.invoke(), null);
  f.state({ state: 'selecting', job: { name: 'job', mode: 'studio' } });
  const result = f.invoke();
  f.state({ state: 'recording', job: { name: 'job', mode: 'studio' } });
  f.registration.close();
  assert.equal(await result, null);
  assert.equal(f.closed(), 1);
});

test('dismissal, sender destruction and replaced jobs discard stale selections', async () => {
  for (const scenario of ['dismiss', 'destroy', 'replace']) {
    const f = fixture();
    const result = f.invoke();
    if (scenario === 'dismiss') f.popup().callback();
    else if (scenario === 'destroy') f.sender.emit('destroyed');
    else {
      f.state({ state: 'selecting', job: { name: 'next', mode: 'studio' } });
      f.template()[0].click();
    }
    assert.equal(await result, null);
    assert.equal(f.sender.listenerCount('destroyed'), 0);
  }
});

test('reports native popup failures and releases listeners for a retry', async () => {
  const f = fixture();
  f.fail();
  await assert.rejects(f.invoke(), /Menu unavailable/);
  assert.equal(f.sender.listenerCount('destroyed'), 0);
  f.registration.close();
  assert.equal(f.closed(), 0);
});

test('anchors keyboard menus to the focused control without forwarding unrelated request fields', async () => {
  const f = fixture();
  const result = f.invoke({ ...f.request, position: { x: 45, y: 90, window: 'untrusted' } });
  assert.equal(f.popup().x, 45);
  assert.equal(f.popup().y, 90);
  assert.equal(f.popup().sourceType, 'keyboard');
  assert.equal(f.popup().window, f.window);
  f.popup().callback();
  assert.equal(await result, null);
});

test('settles the pending request and releases listeners even if native dismissal fails', async () => {
  const f = fixture();
  const result = f.invoke();
  f.failClose();
  f.registration.close();
  await assert.rejects(result, /Menu already closed/);
  assert.equal(f.sender.listenerCount('destroyed'), 0);
  f.registration.close();
  assert.equal(f.closed(), 1);
});
