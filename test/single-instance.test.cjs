const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { initializeSingleInstance, shortcutId } = require('../electron/lifecycle/single-instance.cjs');

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

test('a second launch can forward a handled shortcut id without restoring the HUD', () => {
  const app = new EventEmitter();
  const received = [];
  let restored = 0;
  app.requestSingleInstanceLock = () => true;
  initializeSingleInstance({
    app,
    initialize: () => {},
    restoreHud: () => (restored += 1),
    handleShortcut: (id) => {
      received.push(id);
      return true;
    },
  });
  app.emit('second-instance', {}, ['beam', '--beam-shortcut=teleprompter.toggleVisibility']);
  assert.deepEqual(received, ['teleprompter.toggleVisibility']);
  assert.equal(restored, 0);
});

test('a second launch with an unhandled shortcut still restores the HUD', () => {
  const app = new EventEmitter();
  const received = [];
  let restored = 0;
  app.requestSingleInstanceLock = () => true;
  initializeSingleInstance({
    app,
    initialize: () => {},
    restoreHud: () => (restored += 1),
    handleShortcut: (id) => {
      received.push(id);
      return false;
    },
  });
  app.emit('second-instance', {}, ['beam', '--beam-shortcut=unknown.id']);
  assert.deepEqual(received, ['unknown.id']);
  assert.equal(restored, 1);
});

test('a shortcut can start the first Beam instance', () => {
  const app = new EventEmitter();
  const received = [];
  app.requestSingleInstanceLock = () => true;
  initializeSingleInstance({
    app,
    initialize: () => {},
    restoreHud: () => {},
    handleShortcut: (id) => received.push(id),
    commandLine: ['beam', '--beam-shortcut=teleprompter.nextLine'],
  });
  assert.deepEqual(received, ['teleprompter.nextLine']);
});

test('shortcut ids decode safely and malformed arguments are ignored', () => {
  assert.equal(shortcutId(['beam', '--beam-shortcut=hud.startStopRecording']), 'hud.startStopRecording');
  assert.equal(
    shortcutId(['beam', `--beam-shortcut=${encodeURIComponent('hud.startStopRecording')}`]),
    'hud.startStopRecording',
  );
  assert.equal(shortcutId(['beam', '--beam-shortcut=%']), null);
  assert.equal(shortcutId(['beam']), null);
});
