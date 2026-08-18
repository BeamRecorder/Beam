const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createLinuxShortcutSource,
  customPath,
  gnomeAccelerator,
  isGnomeWayland,
} = require('../../electron/preferences/linux-shortcut-source.cjs');

const env = { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };
const app = { isPackaged: true, getPath: () => '/opt/Beam/beam' };
const devApp = { isPackaged: false, getPath: () => '/opt/electron' };
const preferences = {
  shortcuts: {
    'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global' },
    'teleprompter.nextLine': { keys: 'Ctrl+Shift+Right', scope: 'global' },
    'editor.playPause': { keys: 'Space', scope: 'application' },
  },
};

function fakeGsettings(output = "['/user/custom/']\n") {
  const calls = [];
  const execFile = (file, args, _options, callback) => {
    calls.push({ file, args });
    callback(null, args[0] === 'get' ? output : '', '');
  };
  return { calls, execFile };
}

test('detects GNOME Wayland but leaves other Linux sessions alone', () => {
  assert.equal(isGnomeWayland('linux', env), true);
  assert.equal(isGnomeWayland('linux', { ...env, XDG_SESSION_TYPE: 'x11' }), false);
  assert.equal(isGnomeWayland('linux', { ...env, XDG_CURRENT_DESKTOP: 'KDE' }), false);
  assert.equal(isGnomeWayland('darwin', env), false);
  assert.match(customPath('hud.startStopRecording'), /\/beam-[0-9a-f]{16}\/$/);
});

test('maps Beam accelerators to GNOME keybinding syntax', () => {
  assert.equal(gnomeAccelerator('Alt+Shift+R'), '<Alt><Shift>r');
  assert.equal(gnomeAccelerator('Ctrl+Shift+Right'), '<Control><Shift>Right');
  assert.equal(gnomeAccelerator('Super+Space'), '<Super>space');
  assert.equal(gnomeAccelerator('MediaPlayPause'), null);
  assert.equal(gnomeAccelerator('Ctrl+Shift'), null);
});

test('registers only global shortcuts and preserves unrelated GNOME bindings', async () => {
  const fake = fakeGsettings(
    "['/user/custom/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/beam-old/']\n",
  );
  const source = createLinuxShortcutSource({
    app,
    applicationRoot: '/opt/Beam',
    platform: 'linux',
    env,
    execFile: fake.execFile,
  });

  assert.equal(await source.register(preferences), true);
  const sets = fake.calls.filter(({ args }) => args[0] === 'set');
  const list = sets.find(({ args }) => args[2] === 'custom-keybindings');
  assert.match(list.args[3], /\/user\/custom\//);
  assert.doesNotMatch(list.args[3], /beam-old/);
  assert.equal(sets.filter(({ args }) => args[2] === 'binding').length, 2);
  assert.ok(sets.some(({ args }) => args[2] === 'binding' && args[3] === "'<Alt><Shift>r'"));
  assert.ok(sets.some(({ args }) => args[2] === 'command' && args[3].includes('beam-shortcut=hud.startStopRecording')));
});

test('disables the dev Electron sandbox when GNOME launches a shortcut', async () => {
  const fake = fakeGsettings();
  const source = createLinuxShortcutSource({
    app: devApp,
    applicationRoot: '/home/beam',
    platform: 'linux',
    env,
    execFile: fake.execFile,
  });

  await source.register({ shortcuts: { 'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global' } } });
  const command = fake.calls.find(({ args }) => args[0] === 'set' && args[2] === 'command').args[3];
  assert.match(command, /opt\/electron/);
  assert.match(command, /--no-sandbox/);
  assert.match(command, /home\/beam/);
});

test('cleanup removes only Beam-owned bindings', async () => {
  const fake = fakeGsettings(
    "['/user/custom/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/beam-old/']\n",
  );
  const source = createLinuxShortcutSource({
    app,
    applicationRoot: '/opt/Beam',
    platform: 'linux',
    env,
    execFile: fake.execFile,
  });

  await source.cleanup();
  const list = fake.calls.find(({ args }) => args[0] === 'set' && args[2] === 'custom-keybindings');
  assert.equal(list.args[3], "['/user/custom/']");
});

test('falls back when GNOME cannot accept a shortcut', async () => {
  const fake = fakeGsettings();
  fake.execFile = (file, args, options, callback) => {
    fake.calls.push({ file, args });
    callback(args[0] === 'set' ? new Error('gsettings failed') : null, '', '');
  };
  const source = createLinuxShortcutSource({
    app,
    applicationRoot: '/opt/Beam',
    platform: 'linux',
    env,
    execFile: fake.execFile,
  });

  assert.equal(await source.register(preferences), false);
});
