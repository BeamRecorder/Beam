const assert = require('node:assert/strict');
const test = require('node:test');
const {
  nativeDisplayBounds,
  windowsDisplaySource,
} = require('../apps/desktop/electron/capture/display-coordinates.cjs');

function fixture() {
  const displays = [
    { id: 11, bounds: { x: -1280, y: 0, width: 1280, height: 720 } },
    { id: 22, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  ];
  const calls = [];
  const screen = {
    getAllDisplays: () => displays,
    dipToScreenPoint: (point) => (point.x < 0 ? { x: Math.round(point.x * 1.5), y: Math.round(point.y * 1.5) } : point),
  };
  const request = async (command, point) => {
    calls.push([command, point]);
    return point.x < 0 ? 'wgc:monitor:DISPLAY150' : 'wgc:monitor:DISPLAY100';
  };
  return { displays, calls, screen, request };
}

test('maps a 1920x1080 monitor at 150% to its logical bounds, including a negative origin', async () => {
  const f = fixture();
  assert.deepEqual(await nativeDisplayBounds(f.screen, f.request, 'DISPLAY150', 'win32'), f.displays[0].bounds);
  assert.deepEqual(f.calls, [['resolve-display', { x: -960, y: 540 }]]);
});
test('matches the exact monitor on mixed-DPI desktops instead of relying on catalogue order', async () => {
  const f = fixture();
  assert.deepEqual(await nativeDisplayBounds(f.screen, f.request, 'DISPLAY100', 'win32'), f.displays[1].bounds);
  assert.equal(f.calls.length, 2);
});
test('numeric Electron IDs and macOS IDs require no native coordinate conversion', async () => {
  for (const platform of ['win32', 'darwin']) {
    const f = fixture();
    const result = await nativeDisplayBounds(f.screen, f.request, '11', platform);
    assert.deepEqual(result, f.displays[0].bounds);
    assert.notEqual(result, f.displays[0].bounds);
    assert.deepEqual(f.calls, []);
  }
});
test('returns no bounds for removed displays, invalid IDs and invalid dimensions', async () => {
  const f = fixture();
  for (const id of [null, '', 22, 'x'.repeat(129)])
    assert.equal(await nativeDisplayBounds(f.screen, f.request, id, 'win32'), null);
  assert.deepEqual(f.calls, []);
  assert.equal(await nativeDisplayBounds(f.screen, f.request, 'missing', 'win32'), null);
  assert.equal(await nativeDisplayBounds(f.screen, f.request, 'missing', 'darwin'), null);
  for (const width of [NaN, 0, -1]) {
    f.displays[0].bounds.width = width;
    assert.equal(await nativeDisplayBounds(f.screen, f.request, '11', 'darwin'), null);
  }
});
test('consumes the real Rust string response and rejects malformed native responses', async () => {
  const f = fixture();
  assert.equal(await windowsDisplaySource(f.screen, f.request, f.displays[0].bounds), 'wgc:monitor:DISPLAY150');
  for (const result of [
    null,
    {},
    { sourceId: 'wgc:monitor:DISPLAY150' },
    'sck:display:11',
    'wgc:monitor:',
    'wgc:monitor:' + 'x'.repeat(1024),
  ])
    await assert.rejects(
      windowsDisplaySource(f.screen, async () => result, f.displays[0].bounds),
      /invalid source/,
    );
});
test('preserves native lookup errors rather than selecting another display', async () => {
  const f = fixture();
  await assert.rejects(
    nativeDisplayBounds(
      f.screen,
      async () => {
        throw new Error('native lookup failed');
      },
      'DISPLAY150',
      'win32',
    ),
    /native lookup failed/,
  );
});
