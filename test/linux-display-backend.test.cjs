const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  configureLinuxDisplayBackend,
  x11LaunchArguments,
} = require('../apps/desktop/electron/lifecycle/linux-display-backend.cjs');
function fixture(backend = '') {
  const calls = [];
  return {
    calls,
    app: {
      commandLine: {
        getSwitchValue: () => backend,
        appendSwitch: (...args) => calls.push(['switch', ...args]),
      },
      relaunch: (options) => calls.push(['relaunch', options]),
      exit: (code) => calls.push(['exit', code]),
    },
  };
}
test('an explicitly selected X11 backend proceeds without another launch', () => {
  const f = fixture('x11');
  configureLinuxDisplayBackend(f.app, 'linux', ['/electron', '/beam', '--ozone-platform=x11']);
  assert.deepEqual(f.calls, [['switch', 'ozone-platform', 'x11']]);
});
test('a direct Linux launch relaunches before app startup with the original arguments and X11', () => {
  const f = fixture();
  configureLinuxDisplayBackend(f.app, 'linux', ['/electron', '/beam', '--user-data-dir=/tmp/profile']);
  assert.deepEqual(f.calls, [
    [
      'relaunch',
      {
        args: ['/beam', '--user-data-dir=/tmp/profile', '--ozone-platform=x11'],
      },
    ],
    ['exit', 0],
  ]);
});
test('removes conflicting Wayland flags before relaunching without changing desktop session variables', () => {
  const f = fixture('wayland');
  configureLinuxDisplayBackend(f.app, 'linux', ['/electron', '/beam', '--ozone-platform=wayland', '--trace']);
  assert.deepEqual(f.calls, [
    ['relaunch', { args: ['/beam', '--trace', '--ozone-platform=x11'] }],
    ['exit', 0],
  ]);
});
test('leaves Windows and macOS backend flags alone', () => {
  for (const platform of ['win32', 'darwin']) {
    const f = fixture();
    configureLinuxDisplayBackend(f.app, platform);
    assert.deepEqual(f.calls, []);
  }
});
test('replaces joined and separate backend flags with one startup argument', () => {
  for (const args of [
    [],
    ['--ozone-platform=wayland'],
    ['--ozone-platform', 'wayland'],
    ['--ozone-platform=x11', '--ozone-platform=wayland'],
  ])
    assert.deepEqual(x11LaunchArguments(args), ['--ozone-platform=x11']);
  assert.deepEqual(x11LaunchArguments(['/beam', '--user-data-dir=/tmp/my profile']), [
    '/beam',
    '--user-data-dir=/tmp/my profile',
    '--ozone-platform=x11',
  ]);
});
