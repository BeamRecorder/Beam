const fs = require('node:fs/promises');
const { x11DipBounds } = require('./capture/x11-display-geometry.cjs');
const os = require('node:os');
const path = require('node:path');
const { captureWindowExclusions } = require('./capture/capture-window-exclusions.cjs');
const { windowsDisplaySource, linuxDisplaySource } = require('./capture/display-coordinates.cjs');

function portalDisplayBounds(geometry, displays) {
  const position = geometry?.position;
  const size = geometry?.size;
  if (position && size) {
    const matched = displays.find(
      ({ bounds }) =>
        bounds.x === position[0] && bounds.y === position[1] && bounds.width === size[0] && bounds.height === size[1],
    );
    if (matched) return { ...matched.bounds };
  }
  if (displays.length === 1) return { ...displays[0].bounds };
  throw new Error(
    'The selected Portal monitor could not be matched to a desktop display. Its position and size are required for region selection.',
  );
}

function createRegionSelectionPreview({
  captureEngine,
  screen,
  teleprompterWindow,
  BrowserWindow,
  platform = process.platform,
}) {
  let pending = false;
  return {
    async prepare(bounds, sourceId) {
      if (
        sourceId !== undefined &&
        (platform !== 'linux' || typeof sourceId !== 'string' || !/^x11:monitor:\d+:\d+$/.test(sourceId))
      )
        throw new TypeError('Invalid direct X11 region source');
      if (pending) throw new Error('A region preview is already being prepared.');
      pending = true;
      let directory;
      try {
        if (platform === 'linux' && sourceId === undefined && bounds) {
          const resolved = await linuxDisplaySource(
            screen,
            (command, payload) => captureEngine.request(command, payload),
            bounds,
          );
          if (resolved.startsWith('x11:')) sourceId = resolved;
        }
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beam-region-'));
        let source;
        if (platform === 'linux')
          source = sourceId ? { mode: 'source', sourceId } : { mode: 'portal', kind: 'monitor', restoreToken: null };
        else if (platform === 'darwin')
          source = {
            mode: 'source',
            sourceId: `sck:display:${screen.getDisplayMatching(bounds).id}`,
          };
        else {
          const sourceId = await windowsDisplaySource(
            screen,
            (command, payload) => captureEngine.request(command, payload),
            bounds,
          );
          source = { mode: 'source', sourceId };
        }
        const output = path.join(directory, 'preview.png');
        const capabilities = platform === 'linux' ? await captureEngine.request('capabilities') : null;
        const cursor = capabilities?.separateCursor
          ? {
              mode: 'separate',
              captureClicks: false,
              captureShortcuts: false,
              captureShape: true,
            }
          : { mode: capabilities?.embeddedCursor ? 'embedded' : 'disabled' };
        const result = await captureEngine.request('prepare-region-selection', {
          cursor,
          config: {
            screen: source,
            region: null,
            output,
            excludedWindowHandles: captureWindowExclusions(BrowserWindow, platform),
          },
        });
        const selectedBounds =
          platform === 'linux'
            ? sourceId
              ? x11DipBounds(screen, {
                  x: result.display.position[0],
                  y: result.display.position[1],
                  width: result.display.size[0],
                  height: result.display.size[1],
                })
              : portalDisplayBounds(result.display, screen.getAllDisplays())
            : bounds;
        if (
          !Number.isInteger(result.width) ||
          !Number.isInteger(result.height) ||
          result.width <= 0 ||
          result.height <= 0 ||
          result.width * result.height > 100_000_000
        )
          throw new Error('Invalid native region preview dimensions.');
        const stat = await fs.stat(output);
        if (stat.size > 100_000_000) throw new Error('Native region preview is too large.');
        const bytes = await fs.readFile(output);
        if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
          throw new Error('Native region preview is not PNG.');
        return {
          bounds: selectedBounds,
          preview: `data:image/png;base64,${bytes.toString('base64')}`,
          pixelSize: { width: result.width, height: result.height },
        };
      } catch (error) {
        await captureEngine.request('cancel-region-selection');
        throw error;
      } finally {
        pending = false;
        if (directory) await fs.rm(directory, { recursive: true, force: true });
      }
    },
    cancel: () => {
      teleprompterWindow?.clearRegionConstraint();
      return captureEngine.request('cancel-region-selection');
    },
  };
}
module.exports = { createRegionSelectionPreview, portalDisplayBounds };
