const assert = require('node:assert/strict');
const test = require('node:test');
const sources = require('../electron/source-picker/development-sources.json');
const {
  isDevelopmentSourceDataEnabled,
  initialPickerState,
  reducePickerState,
} = require('../electron/source-picker/source-picker-state.cjs');
const {
  createDevelopmentSourceProvider,
  developmentTargetBounds,
} = require('../electron/source-picker/development-source-provider.cjs');
const { isHudSourcePickerOwner } = require('../electron/source-picker/source-picker-ipc.cjs');

test('development data requires an exact unpackaged opt-in', () => {
  assert.equal(isDevelopmentSourceDataEnabled(false, { DEV_CROSSPLATFORM: '1' }), true);
  assert.equal(isDevelopmentSourceDataEnabled(true, { DEV_CROSSPLATFORM: '1' }), false);
  for (const value of [undefined, '0', 'true', ''])
    assert.equal(isDevelopmentSourceDataEnabled(false, { DEV_CROSSPLATFORM: value }), false);
});
test('source selection state is independent of development data and validates kinds', () => {
  for (const kind of ['screen', 'window']) {
    const state = initialPickerState(kind, sources);
    assert.equal(state.kind, kind);
    assert.equal(state.development, false);
    assert.equal(state.selectedId, null);
  }
  assert.throws(() => initialPickerState('region'), /Invalid/);
});
test('hover and selection are separate; arbitrary or wrong-kind IDs are rejected', () => {
  let state = initialPickerState('window', sources, true);
  state = reducePickerState(state, { type: 'hover', id: 'demo-window-1' });
  assert.equal(state.selectedId, null);
  state = reducePickerState(state, { type: 'select', id: 'demo-window-2' });
  state = reducePickerState(state, { type: 'hover', id: 'demo-window-3' });
  assert.equal(state.selectedId, 'demo-window-2');
  assert.equal(reducePickerState(state, { type: 'confirm' }), state);
  assert.equal(reducePickerState(state, { type: 'kind', kind: 'screen' }).selectedId, null);
  for (const action of [
    null,
    'confirm',
    { type: 'invalid' },
    { type: 'hover', id: 'window:1' },
    { type: 'select', id: 'demo-screen-1' },
    { type: 'select', id: null },
    { type: 'hover' },
    { type: 'kind', kind: 'region' },
  ])
    assert.throws(() => reducePickerState(state, action), /Invalid|Unknown/);
});
for (const selectedId of [null, 'demo-window-1', 'demo-window-2']) {
  test(`pointer exit clears the preview without changing selection ${selectedId}`, () => {
    const state = {
      ...initialPickerState('window', sources),
      selectedId,
      highlightedId: 'demo-window-3',
      error: 'Gone',
    };
    const cleared = reducePickerState(state, { type: 'hover', id: null });
    assert.equal(cleared.highlightedId, null);
    assert.equal(cleared.selectedId, selectedId);
    assert.equal(cleared.error, null);
  });
}
test('development geometry preserves aspects and negative origins within the display', async () => {
  const display = { x: -1920, y: -200, width: 1920, height: 1080 };
  for (const source of sources) {
    const bounds = developmentTargetBounds(source, display);
    assert.ok(bounds.x >= display.x && bounds.y >= display.y);
    assert.ok(bounds.x + bounds.width <= display.x + display.width);
    assert.ok(bounds.y + bounds.height <= display.y + display.height);
    if (source.kind === 'screen') {
      assert.deepEqual(bounds, display);
      continue;
    }
    assert.ok(Math.abs(bounds.width / bounds.height - source.aspect) < 0.01);
    assert.equal(bounds.x, display.x + Math.round((display.width - bounds.width) / 2));
    assert.equal(bounds.y, display.y + 24);
  }
  const provider = createDevelopmentSourceProvider(display);
  const data = await provider.list();
  assert.equal(data.length, 24);
  assert.equal(provider.development, true);
  assert.deepEqual((await provider.preview(data[0])).bounds, display);
});
test('screen confirmation preserves full native bounds independently of preview layout', async () => {
  for (const display of [
    { x: 0, y: 0, width: 1280, height: 720 },
    { x: -1920, y: -1080, width: 1920, height: 1080 },
    { x: 100, y: 0, width: 600, height: 900 },
  ]) {
    const provider = createDevelopmentSourceProvider(display);
    const data = await provider.list();
    for (const source of data.filter((item) => item.kind === 'screen')) {
      assert.deepEqual(developmentTargetBounds(source, display), display);
      assert.deepEqual(source.bounds, display);
      assert.deepEqual((await provider.preview(source)).bounds, display);
    }
  }
});
test('only exact HUD entry URLs may request source selection', () => {
  assert.equal(isHudSourcePickerOwner('http://localhost:6500/html/index.html', '/beam', false), true);
  assert.equal(isHudSourcePickerOwner('file:///beam/dist/html/index.html', '/beam', true), true);
  for (const url of [
    'http://localhost:6500/html/editor.html',
    'http://localhost:6500/',
    'http://localhost:6500/index.html',
    'http://localhost:6500/html/index.html?cameraOverlay=1',
    'http://localhost:6500/html/index.html#hud',
    'http://localhost:6500/?screenRegion=1',
    'http://evil.test/',
    'file:///other/index.html',
    'invalid',
  ])
    assert.equal(isHudSourcePickerOwner(url, '/beam', false), false);
  assert.equal(isHudSourcePickerOwner('http://localhost:6500/', '/beam', true), false);
  assert.equal(isHudSourcePickerOwner('file:///beam/dist/index.html', '/beam', true), false);
  assert.equal(isHudSourcePickerOwner('file:///beam/dist/html/index.html?quickSnipCrop=1', '/beam', true), false);
});
