const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  applyHyprlandWindowRules,
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

test('applyHyprlandWindowRules returns silently when environment is not Hyprland', () => {
  assert.doesNotThrow(() => {
    applyHyprlandWindowRules({});
    applyHyprlandWindowRules({ XDG_RUNTIME_DIR: '/tmp' });
    applyHyprlandWindowRules({ HYPRLAND_INSTANCE_SIGNATURE: 'sig' });
  });
});

test('applyHyprlandWindowRules connects to socket and writes window rule', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const net = require('node:net');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hypr-test-'));
  const sig = 'mock_signature';
  const hyprDir = path.join(tmpDir, 'hypr', sig);
  fs.mkdirSync(hyprDir, { recursive: true });
  const socketPath = path.join(hyprDir, '.socket.sock');

  let receivedData = '';
  const server = net.createServer((c) => {
    c.on('data', (d) => {
      receivedData += d.toString();
      c.write('ok');
    });
  });

  await new Promise((resolve) => server.listen(socketPath, resolve));

  try {
    applyHyprlandWindowRules({
      XDG_RUNTIME_DIR: tmpDir,
      HYPRLAND_INSTANCE_SIGNATURE: sig,
    });

    // Wait for the client connection and message write
    for (let i = 0; i < 20; i++) {
      if (receivedData.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.match(receivedData, /_G\.beam_overlay_rule = hl\.window_rule/);
    assert.match(receivedData, /border_size = 0/);
    assert.match(receivedData, /no_shadow = true/);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
