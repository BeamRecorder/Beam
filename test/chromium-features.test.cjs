const assert = require('node:assert/strict');
const { test } = require('node:test');
const { configureChromiumFeatures } = require('../apps/desktop/electron/lifecycle/chromium-features.cjs');

function fixture(enabled = '', disabled = '') {
  const calls = [];
  return {
    calls,
    app: {
      commandLine: {
        getSwitchValue: (key) => (key === 'enable-features' ? enabled : disabled),
        appendSwitch: (...args) => calls.push(args),
      },
    },
  };
}

test('enables Linux WebCodecs hardware encoding and portal shortcuts before ready', () => {
  const f = fixture();
  configureChromiumFeatures(f.app, 'linux');
  assert.deepEqual(f.calls, [['enable-features', 'GlobalShortcutsPortal,AcceleratedVideoEncoder']]);
});

test('preserves unrelated Chromium features and their parameters', () => {
  const f = fixture('OtherFeature:param/value,GlobalShortcutsPortal<Trial');
  configureChromiumFeatures(f.app, 'linux');
  assert.deepEqual(f.calls, [
    ['enable-features', 'OtherFeature:param/value,GlobalShortcutsPortal<Trial,AcceleratedVideoEncoder'],
  ]);
});

test('does not duplicate a parameterized hardware encoding feature', () => {
  const f = fixture('AcceleratedVideoEncoder<Trial:param/value,,GlobalShortcutsPortal');
  configureChromiumFeatures(f.app, 'linux');
  assert.deepEqual(f.calls, [['enable-features', 'AcceleratedVideoEncoder<Trial:param/value,GlobalShortcutsPortal']]);
});

test('respects explicitly disabled hardware encoding without weakening the sandbox or GPU checks', () => {
  const f = fixture('OtherFeature', 'AcceleratedVideoEncoder<Trial,GlobalShortcutsPortal');
  configureChromiumFeatures(f.app, 'linux');
  assert.deepEqual(f.calls, [['enable-features', 'OtherFeature']]);
});

for (const platform of ['win32', 'darwin']) {
  test(`${platform} retains Chromium's default hardware encoder backend`, () => {
    const f = fixture('OtherFeature');
    configureChromiumFeatures(f.app, platform);
    assert.deepEqual(f.calls, []);
  });
}
