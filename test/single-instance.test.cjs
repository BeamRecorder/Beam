const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { initializeSingleInstance } = require('../electron/lifecycle/single-instance.cjs');

test('a losing Beam instance exits before any application resource is initialized', () => {
  const app = new EventEmitter();
  let quit = 0;
  let initialized = 0;
  app.requestSingleInstanceLock = () => false;
  app.quit = () => {
    quit += 1;
  };
  const acquired = initializeSingleInstance({ app, initialize: () => (initialized += 1), restoreHud: () => {} });
  assert.equal(acquired, false);
  assert.equal(quit, 1);
  assert.equal(initialized, 0);
  assert.equal(app.listenerCount('second-instance'), 0);
});

test('a second launch restores the canonical HUD path without reinitializing Beam', () => {
  const app = new EventEmitter();
  let initialized = 0;
  let restored = 0;
  app.requestSingleInstanceLock = () => true;
  app.quit = () => assert.fail('the owning instance must not quit');
  initializeSingleInstance({
    app,
    initialize: () => (initialized += 1),
    restoreHud: () => (restored += 1),
  });
  app.emit('second-instance');
  assert.equal(initialized, 1);
  assert.equal(restored, 1);
});
