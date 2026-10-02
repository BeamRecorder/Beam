const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  createRegionSelectionPreview,
  portalDisplayBounds,
} = require('../apps/desktop/electron/region-selection-preview.cjs');
const bounds = { x: -1000, y: 0, width: 1000, height: 800 };
const other = { x: 0, y: 0, width: 1920, height: 1080 };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function harness(platform = 'linux', respond = null) {
  const calls = [];
  let output;
  let cleared = 0;
  const request = async (command, payload) => {
    calls.push([command, payload]);
    if (respond) {
      const result = await respond(command, payload);
      if (result !== undefined) return result;
    }
    if (command === 'capabilities') return { separateCursor: true };
    if (command === 'resolve-display') return { sourceId: 'wgc:monitor:123' };
    if (command === 'prepare-region-selection') {
      output = payload.config.output;
      await fs.writeFile(output, png);
      return {
        width: 2000,
        height: 1600,
        display: { position: [-1000, 0], size: [1000, 800] },
      };
    }
    return {};
  };
  return {
    calls,
    output: () => output,
    cleared: () => cleared,
    preview: createRegionSelectionPreview({
      platform,
      captureEngine: { request },
      BrowserWindow: { getAllWindows: () => [] },
      teleprompterWindow: { clearRegionConstraint: () => cleared++ },
      screen: {
        getAllDisplays: () => [{ bounds }, { bounds: other }],
        getDisplayMatching: () => ({ id: 77 }),
        dipToScreenPoint: (point) => ({ x: point.x * 2, y: point.y * 2 }),
      },
    }),
  };
}
test('Portal geometry selects the matching offset display rather than the primary one', () => {
  assert.deepEqual(
    portalDisplayBounds({ position: [-1000, 0], size: [1000, 800] }, [{ bounds: other }, { bounds }]),
    bounds,
  );
});
test('one display is unambiguous without optional Portal geometry', () => {
  assert.deepEqual(portalDisplayBounds({}, [{ bounds }]), bounds);
});
test('ambiguous or mismatched Portal geometry fails instead of cropping another screen', () => {
  for (const geometry of [null, { position: [99, 0], size: [1000, 800] }, { position: [-1000, 0] }])
    assert.throws(() => portalDisplayBounds(geometry, [{ bounds }, { bounds: other }]), /could not be matched/);
  assert.throws(() => portalDisplayBounds(null, []), /could not be matched/);
});
test('Linux preview requests one monitor selection and transfers real PNG pixels', async () => {
  const { preview, calls, output } = harness();
  const result = await preview.prepare(other);
  assert.deepEqual(result.bounds, bounds);
  assert.deepEqual(result.pixelSize, { width: 2000, height: 1600 });
  assert.equal(result.preview, `data:image/png;base64,${png.toString('base64')}`);
  const config = calls.find(([command]) => command === 'prepare-region-selection')[1];
  assert.deepEqual(config.config.screen, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
  assert.equal(config.cursor.mode, 'separate');
  assert.equal(config.config.region, null);
  assert.equal(
    calls.some(([command]) => command === 'cancel-region-selection'),
    false,
  );
  await assert.rejects(fs.stat(path.dirname(output())), { code: 'ENOENT' });
});
test('macOS and Windows use the chosen native monitor and preserve its bounds', async () => {
  for (const [platform, sourceId] of [
    ['darwin', 'sck:display:77'],
    ['win32', 'wgc:monitor:123'],
  ]) {
    const { preview, calls } = harness(platform);
    assert.deepEqual((await preview.prepare(bounds)).bounds, bounds);
    assert.equal(calls.find(([command]) => command === 'prepare-region-selection')[1].config.screen.sourceId, sourceId);
    if (platform === 'win32') assert.deepEqual(calls[0], ['resolve-display', { x: -1000, y: 800 }]);
  }
});
test('cursor capability chooses embedded or disabled without inventing separate cursor support', async () => {
  for (const [capabilities, mode] of [
    [{ embeddedCursor: true }, 'embedded'],
    [{}, 'disabled'],
  ]) {
    const { preview, calls } = harness('linux', (command) => (command === 'capabilities' ? capabilities : undefined));
    await preview.prepare(bounds);
    assert.equal(calls.find(([command]) => command === 'prepare-region-selection')[1].cursor.mode, mode);
  }
});
test('invalid dimensions and images release the native authorization and temporary file', async () => {
  for (const [width, bytes, message] of [
    [0, png, /dimensions/],
    [100_000_001, png, /dimensions/],
    [100, Buffer.from('bad'), /not PNG/],
  ]) {
    let output;
    const { preview, calls } = harness('linux', async (command, payload) => {
      if (command !== 'prepare-region-selection') return;
      output = payload.config.output;
      await fs.writeFile(output, bytes);
      return {
        width,
        height: 1,
        display: { position: [-1000, 0], size: [1000, 800] },
      };
    });
    await assert.rejects(preview.prepare(bounds), message);
    assert.equal(calls.at(-1)[0], 'cancel-region-selection');
    await assert.rejects(fs.stat(path.dirname(output)), { code: 'ENOENT' });
  }
});
test('preparation failure permits retry and cancel also restores teleprompter placement', async () => {
  let fail = true;
  const { preview, calls, cleared } = harness('linux', (command) => {
    if (command === 'capabilities' && fail) {
      fail = false;
      throw new Error('Portal unavailable');
    }
  });
  await assert.rejects(preview.prepare(bounds), /Portal unavailable/);
  assert.ok((await preview.prepare(bounds)).preview);
  await preview.cancel();
  assert.equal(cleared(), 1);
  assert.equal(calls.at(-1)[0], 'cancel-region-selection');
});
test('concurrent preparation is rejected without canceling the original choice', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { preview } = harness('linux', async (command) => {
    if (command === 'capabilities') await gate;
  });
  const pending = preview.prepare(bounds);
  await assert.rejects(preview.prepare(bounds), /already being prepared/);
  release();
  assert.ok((await pending).preview);
});
