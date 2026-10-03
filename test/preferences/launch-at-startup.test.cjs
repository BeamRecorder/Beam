const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createLaunchAtStartup,
  desktopExec,
  initializeLaunchAtStartup,
} = require('../../apps/desktop/electron/preferences/launch-at-startup.cjs');
const { initializeDesktopPreferences } = require('../../apps/desktop/electron/preferences/desktop-preferences.cjs');
const { defaults, normalize } = require('../../apps/desktop/electron/preferences/preferences-store.cjs');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-startup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const app = { isPackaged: true, getPath: () => root, setLoginItemSettings: (value) => calls.push(value) };
  const env = { XDG_CONFIG_HOME: path.join(root, 'config') };
  const service = createLaunchAtStartup({ app, env, platform: 'linux', execPath: '/opt/Beam/beam', ...options });
  return { root, app, calls, env, service, file: path.join(env.XDG_CONFIG_HOME, 'autostart/com.beam.app.desktop') };
}

test('startup is enabled for fresh and legacy preferences and invalid values; explicit false survives normalization', () => {
  assert.equal(defaults().launchAtStartup, true);
  for (const value of [undefined, null, 'false', 0, {}])
    assert.equal(normalize({ launchAtStartup: value }).launchAtStartup, true);
  assert.equal(normalize({ launchAtStartup: false }).launchAtStartup, false);
});
test('Linux creates an atomic XDG autostart entry at the installed executable', (t) => {
  const f = fixture(t);
  f.service.apply({});
  const source = fs.readFileSync(f.file, 'utf8');
  assert.match(source, /Exec="\/opt\/Beam\/beam" --ozone-platform=x11/);
  assert.match(source, /X-GNOME-Autostart-enabled=true/);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['com.beam.app.desktop']);
  assert.equal(f.calls.length, 0);
});
test('Linux disables startup with a user override and can re-enable it', (t) => {
  const f = fixture(t);
  f.service.apply({ launchAtStartup: false });
  assert.match(fs.readFileSync(f.file, 'utf8'), /Hidden=true/);
  assert.doesNotMatch(fs.readFileSync(f.file, 'utf8'), /Exec=/);
  f.service.apply({ launchAtStartup: true });
  assert.doesNotMatch(fs.readFileSync(f.file, 'utf8'), /Hidden=true/);
});
test('Linux uses the persistent AppImage path instead of its temporary mount', (t) => {
  const f = fixture(t);
  const service = createLaunchAtStartup({
    app: f.app,
    env: { ...f.env, APPIMAGE: '/home/user/Applications/Beam 0.4.AppImage' },
    platform: 'linux',
    execPath: '/tmp/.mount_beam/beam',
  });
  service.apply({ launchAtStartup: true });
  assert.match(fs.readFileSync(f.file, 'utf8'), /Exec="\/home\/user\/Applications\/Beam 0\.4.AppImage"/);
});
test('absent and relative XDG paths use the user home rather than the working directory', (t) => {
  const f = fixture(t);
  for (const XDG_CONFIG_HOME of [undefined, '', 'relative']) {
    createLaunchAtStartup({ app: f.app, env: { XDG_CONFIG_HOME }, platform: 'linux', execPath: '/opt/beam' }).apply({});
    assert.equal(fs.existsSync(path.join(f.root, '.config/autostart/com.beam.app.desktop')), true);
  }
});
test('Desktop Entry quoting preserves literal percent signs, quotes, dollar signs and backslashes', () => {
  assert.equal(desktopExec('/opt/Beam two'), '"/opt/Beam two"');
  assert.equal(desktopExec('/opt/100% Beam'), '"/opt/100%% Beam"');
  assert.equal(desktopExec('/opt/a"b$`\\'), '"/opt/a\\\\"b\\\\$\\\\`\\\\\\\\"');
});
test('invalid executable paths cannot inject desktop entry fields', () => {
  for (const executable of ['relative', '/opt/beam\nHidden=false', '/opt/beam\r', '/opt/a\0b', '/opt/a=b'])
    assert.throws(() => desktopExec(executable), /Invalid startup executable/);
});
test('failed publication preserves the previous entry, releases the temp file and permits retry', (t) => {
  const f = fixture(t);
  f.service.apply({});
  const source = fs.readFileSync(f.file, 'utf8');
  const original = fs.renameSync;
  fs.renameSync = () => {
    throw new Error('disk full');
  };
  try {
    assert.throws(() => f.service.apply({ launchAtStartup: false }), /disk full/);
  } finally {
    fs.renameSync = original;
  }
  assert.equal(fs.readFileSync(f.file, 'utf8'), source);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['com.beam.app.desktop']);
  f.service.apply({ launchAtStartup: false });
  assert.match(fs.readFileSync(f.file, 'utf8'), /Hidden=true/);
});
test('unwritable autostart directories fail without marking the preference as applied', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.env.XDG_CONFIG_HOME);
  fs.writeFileSync(path.dirname(f.file), 'blocked');
  assert.throws(() => f.service.apply({}));
  fs.unlinkSync(path.dirname(f.file));
  f.service.apply({});
  assert.equal(fs.existsSync(f.file), true);
});
for (const platform of ['win32', 'darwin']) {
  test(`${platform} uses Electron login items for enabling and disabling, with deduplicated updates`, (t) => {
    const calls = [],
      app = { isPackaged: true, setLoginItemSettings: (options) => calls.push(options) };
    const service = fixture(t, { platform, app, execPath: 'C:\\Program Files\\Beam\\Beam.exe' }).service;
    service.apply({});
    service.apply({});
    service.apply({ launchAtStartup: false });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].openAtLogin, true);
    assert.equal(calls[1].openAtLogin, false);
    assert.deepEqual(
      calls[0],
      platform === 'darwin'
        ? { openAtLogin: true }
        : { openAtLogin: true, enabled: true, path: 'C:\\Program Files\\Beam\\Beam.exe', args: [], name: 'Beam' },
    );
  });
  test(`${platform} failed login registration can be retried`, (t) => {
    let attempts = 0;
    const app = {
      isPackaged: true,
      setLoginItemSettings: () => {
        if (++attempts === 1) throw new Error('denied');
      },
    };
    const service = fixture(t, { platform, app }).service;
    assert.throws(() => service.apply({}), /denied/);
    service.apply({});
    assert.equal(attempts, 2);
  });
}
test('development never registers its Electron binary on any OS', (t) => {
  const f = fixture(t);
  f.app.isPackaged = false;
  for (const platform of ['linux', 'darwin', 'win32', 'unsupported'])
    createLaunchAtStartup({ app: f.app, env: f.env, platform }).apply({});
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(f.calls.length, 0);
});
test('unsupported installed platforms fail explicitly', (t) => {
  assert.throws(() => fixture(t, { platform: 'unsupported' }).service.apply({}), /not supported/);
});
test('initial registration reports OS errors and retains a usable service', (t) => {
  const f = fixture(t),
    original = console.error,
    errors = [];
  const app = {
    isPackaged: true,
    getPath: () => {
      throw new Error('home unavailable');
    },
  };
  console.error = (...values) => errors.push(values);
  try {
    assert.equal(typeof initializeLaunchAtStartup(app, {}).apply, 'function');
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][1]), /home unavailable/);
});
test('desktop initialization repairs old preferences while keeping startup disabled and user settings', (t) => {
  const f = fixture(t);
  f.app.isPackaged = false;
  const file = path.join(f.root, 'preferences.json');
  fs.writeFileSync(file, JSON.stringify({ launchAtStartup: false, extras: { retained: true } }));
  const result = initializeDesktopPreferences(f.app, file);
  assert.equal(result.startupPreferences.launchAtStartup, false);
  assert.equal(result.preferencesStore.read().extras.retained, true);
  assert.equal(typeof result.launchAtStartup.apply, 'function');
});

test('desktop initialization repairs missing preferences and defaults startup on', (t) => {
  const f = fixture(t);
  f.app.isPackaged = false;
  const file = path.join(f.root, 'new/preferences.json');
  const result = initializeDesktopPreferences(f.app, file);
  assert.equal(result.startupPreferences.launchAtStartup, true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(typeof result.launchAtStartup.apply, 'function');
});
test('desktop initialization retains the existing safe repair policy for unavailable preference storage', (t) => {
  const f = fixture(t);
  f.app.isPackaged = false;
  const file = path.join(f.root, 'blocked/preferences.json');
  fs.writeFileSync(path.dirname(file), 'file');
  const result = initializeDesktopPreferences(f.app, file);
  assert.equal(result.startupPreferences.launchAtStartup, true);
  assert.equal(typeof result.launchAtStartup.apply, 'function');
  assert.equal(f.calls.length, 0);
});
