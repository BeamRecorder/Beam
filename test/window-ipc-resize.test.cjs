const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function fixture() {
  const events = new Map();
  const timers = new Map();
  const sizes = [];
  const sender = {};
  let size = [672, 268];
  let timerId = 0;
  let policies = 0;
  const window = {
    getSize: () => size,
    setSize: (...next) => {
      size = next;
      sizes.push(next);
    },
    setResizable: () => assert.fail('Programmatic resizing must preserve the native transparency policy'),
  };
  const filename = require.resolve('../apps/desktop/electron/window/window-ipc.cjs');
  const module = { exports: {} };
  const dependencies = {
    'node:path': path,
    electron: {
      BrowserWindow: { fromWebContents: (contents) => (contents === sender ? window : null) },
      screen: {},
      app: { isPackaged: false },
    },
    './capture-preparation-ipc.cjs': { registerCapturePreparationIpc: () => ({}) },
    './hud-popover-size.cjs': { resizeHudPopover: () => {} },
    './window-visibility.cjs': { registerWindowVisibilityIpc: () => {} },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    __dirname: path.dirname(filename),
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    setInterval: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
  });
  module.exports.registerWindowIpc(
    { on: (channel, handler) => events.set(channel, handler), handle: () => {} },
    () => ({ applyModePolicy: () => policies++ }),
  );
  return {
    events,
    sender,
    timers,
    sizes,
    size: () => size,
    policies: () => policies,
    resize: (width, height) => events.get('window:setSizeSmooth')({ sender }, width, height),
    tick: () => [...timers.values()].forEach((callback) => callback()),
  };
}

test('smooth resizing reaches its target without enabling native resizing on a transparent window', () => {
  const f = fixture();
  f.resize(800.4, 420.4);
  for (let frame = 0; frame < 12; frame++) f.tick();
  assert.deepEqual(f.size(), [800, 420]);
  assert.equal(f.sizes.length, 12);
  assert.equal(f.timers.size, 0);
  assert.equal(f.policies(), 1);
});

test('a near-identical height resizes immediately without changing the window policy', () => {
  const f = fixture();
  f.resize(750, 270);
  assert.deepEqual(f.sizes, [[750, 270]]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.policies(), 0);
});

test('a replacement resize cancels the previous animation and preserves the native surface', () => {
  const f = fixture();
  f.resize(800, 420);
  f.tick();
  f.tick();
  f.resize(616, 76);
  assert.equal(f.timers.size, 1);
  for (let frame = 0; frame < 12; frame++) f.tick();
  assert.deepEqual(f.size(), [616, 76]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.policies(), 1);
});

test('an unrelated sender cannot start a resize animation', () => {
  const f = fixture();
  f.events.get('window:setSizeSmooth')({ sender: {} }, 800, 420);
  assert.deepEqual(f.sizes, []);
  assert.equal(f.timers.size, 0);
});
