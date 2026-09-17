const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { buildDefaultCaptureConfig } = require('../capture/capture-config.cjs');
const { isCaptureCancellation } = require('../capture/capture-cancellation.cjs');
const { readClipboardPng } = require('../clipboard/image-clipboard.cjs');

function registerScreenshotIpc({
  ipcMain,
  store,
  presetStore,
  captureEngine,
  BrowserWindow,
  dialog,
  clipboard,
  nativeImage,
  openEditor,
  isTrustedRenderer,
  canCapture,
  outputDirectory,
  platform = process.platform,
  prepareCapture,
}) {
  let busy = false;
  const authorize = (event) => {
    if (!isTrustedRenderer(event.sender.getURL())) throw new Error('Screenshot sender is not authorized.');
  };
  const capture = async (options, event) => {
    if (busy || !canCapture(event)) throw new Error('Another capture is already active.');
    if (!options || !['display', 'window'].includes(options.screenKind)) throw new Error('Invalid screenshot source.');
    busy = true;
    let pending;
    try {
      // Portal IDs describe a selection intent. Screenshots do not need video
      // codec/audio capability discovery before opening the native picker.
      const portal =
        platform === 'linux' &&
        options.screenId === (options.screenKind === 'window' ? 'portal:window' : 'portal:monitor');
      const catalog = portal ? null : await captureEngine.request('discover');
      const config = buildDefaultCaptureConfig(
        catalog,
        { ...options, cursor: false, systemAudio: false },
        { platform, defaultOutputRoot: outputDirectory },
      );
      await prepareCapture?.(event);
      pending = store.create();
      const dimensions = await captureEngine.request('screenshot', {
        config: {
          screen: config.screen,
          region: config.region,
          output: pending.path,
          excludedWindowHandles: config.excludedWindowHandles ?? [],
        },
      });
      const document = presetStore.read();
      const preset = document.presets.find((item) => item.id === document.activePresetId);
      return store.complete(pending.id, dimensions, preset.settings);
    } catch (error) {
      if (pending) store.remove(pending.id);
      if (isCaptureCancellation(error)) return null;
      throw error;
    } finally {
      busy = false;
    }
  };
  const handle = (channel, action) =>
    ipcMain.handle(channel, (event, ...args) => {
      authorize(event);
      return action(event, ...args);
    });
  handle('screenshot:capture', (event, options) => capture(options, event));
  handle('screenshot:get', (_event, id) => store.read(id));
  handle('screenshot:discard-image', (_event, { id, source }) => store.discardImage(id, source));
  handle('screenshot:pick-image', async (event, id) => {
    store.read(id);
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return store.importImage(id, selected.filePaths[0]);
  });
  handle('screenshot:paste-clipboard-image', (_event, id) => {
    const image = readClipboardPng(clipboard);
    return image ? store.importClipboardImage(id, image) : null;
  });
  handle('screenshot:list', () => store.list());
  handle('screenshot:save', (_event, { id, state, history }) => store.save(id, state, history));
  handle('screenshot:open', (event, id, options) => {
    store.read(id);
    return openEditor(id, options, event.sender);
  });
  handle('screenshot:export', async (event, { id, bytes, format, copy }) => {
    const document = store.read(id);
    if (
      !['png', 'webp'].includes(format) ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > 100_000_000
    )
      throw new Error('Invalid screenshot export.');
    const buffer = Buffer.from(bytes);
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!(format === 'png' ? png : webp)) throw new Error('Screenshot encoding does not match its format.');
    // Electron NativeImage decodes PNG/JPEG; Chromium encodes WebP directly for files.
    const image = format === 'png' ? nativeImage.createFromBuffer(buffer) : null;
    if (image?.isEmpty()) throw new Error('Screenshot image is invalid.');
    if (copy === true) {
      if (!image) throw new Error('Clipboard images must be encoded as PNG.');
      clipboard.writeImage(image);
      return null;
    }
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      defaultPath: path.join(outputDirectory, `${document.name.replace(/[:.]/g, '-')}.${format}`),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled || !result.filePath) return null;
    const temporary = `${result.filePath}.${randomUUID()}.tmp`;
    const handle = await fs.promises.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(buffer);
      await handle.close();
      await fs.promises.rename(temporary, result.filePath);
    } finally {
      await handle.close();
      await fs.promises.rm(temporary, { force: true });
    }
    return result.filePath;
  });
  return { capture, isBusy: () => busy };
}

module.exports = { registerScreenshotIpc };
