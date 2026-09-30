const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { scheduleHudAuxiliaryWarmup } = require('../electron/window/hud-auxiliary-warmup.cjs');

function fixture(visible = false) {
  const window = new EventEmitter();
  let destroyed = false;
  let accepting = true;
  let calls = 0;
  window.isVisible = () => visible;
  window.isDestroyed = () => destroyed;
  return {
    window,
    options: { hudWindow: window, canAcceptWork: () => accepting, prepare: () => calls++ },
    calls: () => calls,
    show() {
      visible = true;
      window.emit('show');
    },
    hide() {
      visible = false;
    },
    destroy() {
      destroyed = true;
    },
    shutdown() {
      accepting = false;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('prepares visible HUD auxiliaries immediately without a capture warmup', () => {
  const item = fixture(true);
  const cancel = scheduleHudAuxiliaryWarmup(item.options);
  assert.equal(item.calls(), 1);
  cancel();
});
test('waits for first native presentation and capture warmup in either order', async () => {
  for (const order of ['show-first', 'capture-first']) {
    const item = fixture();
    let resolve;
    const readiness = new Promise((complete) => {
      resolve = complete;
    });
    const cancel = scheduleHudAuxiliaryWarmup({ ...item.options, readiness });
    if (order === 'show-first') item.show();
    else resolve();
    await settle();
    assert.equal(item.calls(), 0);
    if (order === 'show-first') resolve();
    else item.show();
    await settle();
    assert.equal(item.calls(), 1);
    item.show();
    assert.equal(item.calls(), 1);
    cancel();
  }
});
test('canceling before presentation removes its listener', () => {
  const item = fixture();
  const cancel = scheduleHudAuxiliaryWarmup(item.options);
  assert.equal(item.window.listenerCount('show'), 1);
  cancel();
  item.show();
  assert.equal(item.calls(), 0);
  assert.equal(item.window.listenerCount('show'), 0);
});
test('ignores completed preparation after disposal, hiding, destruction or shutdown', async () => {
  for (const change of ['cancel', 'hide', 'destroy', 'shutdown']) {
    const item = fixture(true);
    let resolve;
    const readiness = new Promise((complete) => {
      resolve = complete;
    });
    const cancel = scheduleHudAuxiliaryWarmup({ ...item.options, readiness });
    if (change === 'cancel') cancel();
    else item[change]();
    resolve();
    await settle();
    assert.equal(item.calls(), 0);
    cancel();
  }
});
test('records a rejected preparation signal and allows disposal', async (context) => {
  const item = fixture(true);
  const error = new Error('capture warmup failed');
  const log = context.mock.method(console, 'error', () => {});
  const cancel = scheduleHudAuxiliaryWarmup({ ...item.options, readiness: Promise.reject(error) });
  await settle();
  assert.equal(item.calls(), 0);
  assert.deepEqual(log.mock.calls[0].arguments, ['[HUD auxiliary warmup]', error]);
  cancel();
});
