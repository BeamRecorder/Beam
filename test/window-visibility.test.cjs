const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registerWindowVisibilityIpc } = require('../apps/desktop/electron/window/window-visibility.cjs');

function fixture() {
  const ipc = new EventEmitter();
  const owners = new Map();
  registerWindowVisibilityIpc(ipc, (event) => owners.get(event.sender));
  const createWindow = () => {
    const window = new EventEmitter();
    const sent = [];
    window.visible = false;
    window.minimized = false;
    window.destroyed = false;
    window.isVisible = () => window.visible;
    window.isMinimized = () => window.minimized;
    window.isDestroyed = () => window.destroyed;
    window.webContents = { isDestroyed: () => false, send: (...args) => sent.push(args) };
    owners.set(window.webContents, window);
    return { window, sent, observe: () => ipc.emit('window:observe-visibility', { sender: window.webContents }) };
  };
  return { ipc, createWindow };
}

test('reports native hidden/show/minimized/restore state to its own renderer only', () => {
  const f = fixture();
  const a = f.createWindow();
  const b = f.createWindow();
  a.observe();
  a.window.visible = true;
  a.window.emit('show');
  a.window.minimized = true;
  a.window.emit('minimize');
  a.window.minimized = false;
  a.window.emit('restore');
  a.window.visible = false;
  a.window.emit('hide');
  assert.deepEqual(
    a.sent,
    [false, true, false, true, false].map((value) => ['window:visibility', value]),
  );
  assert.deepEqual(b.sent, []);
});

test('a reloaded renderer receives a snapshot without duplicating native listeners', () => {
  const a = fixture().createWindow();
  a.observe();
  a.observe();
  assert.equal(a.window.listenerCount('hide'), 1);
  a.window.visible = true;
  a.window.emit('show');
  assert.deepEqual(
    a.sent,
    [false, false, true].map((value) => ['window:visibility', value]),
  );
  a.window.emit('closed');
  for (const name of ['show', 'hide', 'minimize', 'restore']) assert.equal(a.window.listenerCount(name), 0);
});

test('ignores unknown senders and destroyed windows or renderer targets', () => {
  const f = fixture();
  f.ipc.emit('window:observe-visibility', { sender: {} });
  const a = f.createWindow();
  a.window.destroyed = true;
  a.observe();
  assert.equal(a.window.listenerCount('show'), 0);
  a.window.destroyed = false;
  a.observe();
  a.window.destroyed = true;
  a.window.emit('hide');
  a.window.destroyed = false;
  a.window.webContents.isDestroyed = () => true;
  a.window.emit('show');
  assert.deepEqual(a.sent, [['window:visibility', false]]);
});
