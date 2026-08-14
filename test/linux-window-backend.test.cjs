const assert = require('node:assert/strict');
const test = require('node:test');

const {
  configureLinuxWindowBackend,
  hasExplicitOzonePlatform,
  selectLinuxWindowBackend,
} = require('../electron/window/linux-window-backend.cjs');

test('selects X11 when Wayland has an XWayland DISPLAY and no explicit Ozone switch', () => {
  assert.equal(
    selectLinuxWindowBackend({ platform: 'linux', sessionType: 'wayland', display: ':0', hasOzoneSwitch: false }),
    'x11',
  );
});

test('does not override an explicit Ozone platform switch', () => {
  assert.equal(
    selectLinuxWindowBackend({ platform: 'linux', sessionType: 'wayland', display: ':0', hasOzoneSwitch: true }),
    null,
  );
});

test('recognizes only explicit Ozone platform arguments', () => {
  assert.equal(hasExplicitOzonePlatform(['electron', '--inspect']), false);
  assert.equal(hasExplicitOzonePlatform(['electron', '--ozone-platform=wayland']), true);
  assert.equal(hasExplicitOzonePlatform(['electron', '--ozone-platform']), true);
});

test('appends X11 despite Electron reporting an internal Ozone switch', { skip: process.platform !== 'linux' }, () => {
  const appended = [];
  const app = {
    commandLine: {
      hasSwitch: () => true,
      appendSwitch: (...args) => appended.push(args),
    },
  };

  assert.equal(configureLinuxWindowBackend(app, { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' }, ['electron']), 'x11');
  assert.deepEqual(appended, [['ozone-platform', 'x11']]);
});

test('does not override an explicit Wayland Ozone argument', { skip: process.platform !== 'linux' }, () => {
  const appended = [];
  const app = {
    commandLine: {
      hasSwitch: () => false,
      appendSwitch: (...args) => appended.push(args),
    },
  };

  assert.equal(
    configureLinuxWindowBackend(
      app,
      { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' },
      ['electron', '--ozone-platform=wayland'],
    ),
    null,
  );
  assert.deepEqual(appended, []);
});

test('keeps pure Wayland on the native backend when XWayland is unavailable', () => {
  assert.equal(
    selectLinuxWindowBackend({ platform: 'linux', sessionType: 'wayland', display: null, hasOzoneSwitch: false }),
    null,
  );
});

test('does not select a Linux backend for non-Linux platforms', () => {
  assert.equal(
    selectLinuxWindowBackend({ platform: 'win32', sessionType: 'wayland', display: ':0', hasOzoneSwitch: false }),
    null,
  );
  assert.equal(
    selectLinuxWindowBackend({ platform: 'darwin', sessionType: 'x11', display: ':0', hasOzoneSwitch: false }),
    null,
  );
});
