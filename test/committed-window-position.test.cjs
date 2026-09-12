const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createCommittedWindowPosition,
  POSITION_COMMIT_DELAY_MS,
} = require('../electron/window/committed-window-position.cjs');

function createFixture(platform = 'linux', environment = {}, onCommit) {
  const timers = new Map();
  const moves = [];
  const commits = [];
  let nextTimer = 0;
  const window = {
    bounds: { x: 100, y: 120, width: 380, height: 184 },
    visible: true,
    destroyed: false,
    listeners: new Map(),
    on(event, listener) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    },
    removeListener(event, listener) {
      this.listeners.get(event)?.delete(listener);
    },
    emit(event) {
      for (const listener of this.listeners.get(event) ?? []) listener();
    },
    isVisible() {
      return this.visible;
    },
    isDestroyed() {
      return this.destroyed;
    },
    getBounds() {
      return { ...this.bounds };
    },
  };
  const position = createCommittedWindowPosition({
    window,
    platform,
    environment,
    onMove: (bounds) => moves.push(bounds),
    onCommit: onCommit ?? ((bounds) => commits.push(bounds)),
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });

  return { window, position, timers, moves, commits };
}

function fireTimers(fixture) {
  const pending = [...fixture.timers.values()];
  fixture.timers.clear();
  for (const timer of pending) timer.callback();
}

test('debounces a Linux move burst and commits only the final negative coordinates', () => {
  const fixture = createFixture('linux');
  fixture.window.bounds = { ...fixture.window.bounds, x: -900, y: 40 };
  fixture.window.emit('move');

  assert.deepEqual(fixture.moves, [{ x: -900, y: 40, width: 380, height: 184 }]);
  assert.deepEqual(fixture.commits, []);
  assert.deepEqual(
    [...fixture.timers.values()].map(({ delay }) => delay),
    [POSITION_COMMIT_DELAY_MS],
  );

  fixture.window.bounds = { ...fixture.window.bounds, x: -860, y: 72 };
  fixture.window.emit('move');
  assert.deepEqual(fixture.moves.at(-1), { x: -860, y: 72, width: 380, height: 184 });
  assert.equal(fixture.timers.size, 1);
  assert.deepEqual(fixture.commits, []);

  fireTimers(fixture);
  assert.deepEqual(fixture.commits, [{ x: -860, y: 72, width: 380, height: 184 }]);
});

test('coalesces macOS move aliases and waits for the final debounce timer', () => {
  const fixture = createFixture('darwin');
  fixture.window.bounds = { ...fixture.window.bounds, x: 150, y: 160 };
  fixture.window.emit('move');
  fixture.window.emit('moved');
  const firstTimer = [...fixture.timers.keys()][0];

  assert.deepEqual(fixture.moves, [{ x: 150, y: 160, width: 380, height: 184 }]);
  assert.deepEqual(fixture.commits, []);

  fixture.window.bounds = { ...fixture.window.bounds, x: 200, y: 240 };
  fixture.window.emit('move');
  fixture.window.emit('moved');

  assert.deepEqual(fixture.moves.at(-1), { x: 200, y: 240, width: 380, height: 184 });
  assert.deepEqual(fixture.commits, []);
  assert.equal(fixture.timers.size, 1);
  assert.notEqual([...fixture.timers.keys()][0], firstTimer);
  assert.deepEqual(
    [...fixture.timers.values()].map(({ delay }) => delay),
    [POSITION_COMMIT_DELAY_MS],
  );

  fireTimers(fixture);
  assert.deepEqual(fixture.commits, [{ x: 200, y: 240, width: 380, height: 184 }]);
});

test('flush commits a pending move immediately and cancels its debounce timer', () => {
  const fixture = createFixture('darwin');
  fixture.window.bounds = { ...fixture.window.bounds, x: 240, y: 360 };
  fixture.window.emit('move');

  fixture.position.flush();
  assert.deepEqual(fixture.commits, [{ x: 240, y: 360, width: 380, height: 184 }]);
  assert.equal(fixture.timers.size, 0);

  fireTimers(fixture);
  assert.equal(fixture.commits.length, 1);
});

test('flush contains commit errors, logs them, and leaves no timer pending', () => {
  const expectedError = new Error('position write failed');
  const fixture = createFixture('linux', {}, () => {
    throw expectedError;
  });
  fixture.window.bounds = { ...fixture.window.bounds, x: 320, y: 420 };
  fixture.window.emit('move');
  assert.equal(fixture.timers.size, 1);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    assert.doesNotThrow(() => fixture.position.flush());
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(fixture.timers.size, 0);
  assert.deepEqual(warnings, [['[Beam window] Unable to save window position:', expectedError]]);
});

test('Windows remembers on move and commits only when moved fires', () => {
  const fixture = createFixture('win32');
  fixture.window.bounds = { ...fixture.window.bounds, x: 0, y: 0 };
  fixture.window.emit('move');

  assert.deepEqual(fixture.moves, [{ x: 0, y: 0, width: 380, height: 184 }]);
  assert.deepEqual(fixture.commits, []);
  assert.equal(fixture.timers.size, 0);

  fixture.window.emit('moved');
  assert.deepEqual(fixture.commits, [{ x: 0, y: 0, width: 380, height: 184 }]);
});

test('ignores synchronous and asynchronous notifications for programmatic bounds', () => {
  const fixture = createFixture('win32');
  const requested = { x: 700, y: 300, width: 380, height: 184 };
  fixture.position.trackProgrammatic(requested);
  fixture.window.bounds = { ...requested };
  fixture.window.emit('move');
  fixture.window.emit('moved');

  assert.deepEqual(fixture.moves, []);
  assert.deepEqual(fixture.commits, []);
  assert.equal(fixture.timers.size, 0);

  fixture.window.bounds = { ...fixture.window.bounds, x: -45, y: 96 };
  fixture.window.emit('move');
  assert.deepEqual(fixture.moves, [{ x: -45, y: 96, width: 380, height: 184 }]);
  fixture.window.emit('moved');
  assert.deepEqual(fixture.commits, [{ x: -45, y: 96, width: 380, height: 184 }]);

  fixture.window.bounds = { ...requested };
  fixture.window.emit('move');
  fixture.window.emit('moved');
  assert.deepEqual(fixture.moves.at(-1), requested);
  assert.deepEqual(fixture.commits.at(-1), requested);
});

test('ignores Wayland synthetic origin while accepting negative coordinates', () => {
  const fixture = createFixture('linux', { WAYLAND_DISPLAY: 'wayland-0' });
  fixture.window.bounds = { ...fixture.window.bounds, x: 0, y: 0 };
  fixture.window.emit('move');
  assert.deepEqual(fixture.moves, []);
  assert.deepEqual(fixture.commits, []);

  fixture.window.bounds = { ...fixture.window.bounds, x: -120, y: 35 };
  fixture.window.emit('move');
  assert.deepEqual(fixture.moves, [{ x: -120, y: 35, width: 380, height: 184 }]);
  fireTimers(fixture);
  assert.deepEqual(fixture.commits, [{ x: -120, y: 35, width: 380, height: 184 }]);
});

test('accepts the zero origin outside Wayland and ignores hidden or invalid bounds', () => {
  const x11 = createFixture('linux', {});
  x11.window.bounds = { ...x11.window.bounds, x: 0, y: 0 };
  x11.window.emit('move');
  assert.deepEqual(x11.moves, [{ x: 0, y: 0, width: 380, height: 184 }]);

  const hidden = createFixture('linux');
  hidden.window.visible = false;
  hidden.window.bounds = { ...hidden.window.bounds, x: 40, y: 60 };
  hidden.window.emit('move');
  hidden.window.visible = true;
  hidden.window.bounds = { ...hidden.window.bounds, x: Number.NaN, y: 60 };
  hidden.window.emit('move');
  assert.deepEqual(hidden.moves, []);
  assert.deepEqual(hidden.commits, []);
  assert.equal(hidden.timers.size, 0);
});

test('dispose clears pending work and unregisters native move listeners', () => {
  const fixture = createFixture('linux');
  fixture.window.bounds = { ...fixture.window.bounds, x: 44, y: 55 };
  fixture.window.emit('move');
  assert.equal(fixture.timers.size, 1);

  fixture.position.dispose();
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.window.listeners.get('move').size, 0);
  assert.equal(fixture.window.listeners.get('moved').size, 0);

  fixture.window.bounds = { ...fixture.window.bounds, x: 80, y: 90 };
  fixture.window.emit('move');
  fixture.position.flush();
  assert.deepEqual(fixture.moves, [{ x: 44, y: 55, width: 380, height: 184 }]);
  assert.deepEqual(fixture.commits, []);
});
