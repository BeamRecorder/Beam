const assert = require('node:assert/strict');
const test = require('node:test');

const { selectLinuxWindowBackend } = require('../electron/window/linux-window-backend.cjs');

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
