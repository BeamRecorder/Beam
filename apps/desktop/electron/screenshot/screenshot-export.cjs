const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

/** Timings use one native monotonic clock; clipboard completion is always awaited. */
async function publishScreenshot(services, event, { id, bytes, format, copy }) {
  const { store, nativeImage, clipboard, ClipboardItem, dialog, BrowserWindow, outputDirectory } = services;
  const clock = services.clock ?? (() => performance.now());
  const started = clock();
  const timings = {};
  const measure = (stage, action) => {
    const start = clock();
    try {
      return action();
    } finally {
      timings[stage] = clock() - start;
    }
  };
  const measureAsync = async (stage, action) => {
    const start = clock();
    try {
      return await action();
    } finally {
      timings[stage] = clock() - start;
    }
  };
  const result = (status, output = null) => {
    timings.total = clock() - started;
    return { status, path: output, timings };
  };
  try {
    const { document, buffer } = measure('validate', () => {
      const document = store.read(id);
      if (
        !['png', 'webp'].includes(format) ||
        !(bytes instanceof ArrayBuffer) ||
        !bytes.byteLength ||
        bytes.byteLength > 100_000_000
      )
        throw new Error('Invalid screenshot export.');
      const buffer = Buffer.from(bytes);
      const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!(format === 'png' ? png : webp)) throw new Error('Screenshot encoding does not match its format.');
      return { document, buffer };
    });
    const image = measure('pngDecode', () => {
      const image = format === 'png' ? nativeImage.createFromBuffer(buffer) : null;
      if (image?.isEmpty()) throw new Error('Screenshot image is invalid.');
      return image;
    });
    if (copy === true) {
      if (!image) throw new Error('Clipboard images must be encoded as PNG.');
      await measureAsync('clipboardWrite', () =>
        clipboard.write([new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) })]),
      );
      return result('copied');
    }
    const selected = await measureAsync('saveDialog', () =>
      dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        defaultPath: path.join(
          services.directories ? services.directories.exportDirectory() : outputDirectory,
          `${document.name.replace(/[:.]/g, '-')}.${format}`,
        ),
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      }),
    );
    if (selected.canceled || !selected.filePath) return result('cancelled');
    await measureAsync('fileWrite', async () => {
      const temporary = `${selected.filePath}.${randomUUID()}.tmp`;
      const handle = await fs.promises.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(buffer);
        await handle.close();
        await fs.promises.rename(temporary, selected.filePath);
      } finally {
        await handle.close();
        await fs.promises.rm(temporary, { force: true });
      }
    });
    services.directories?.rememberExport(selected.filePath);
    return result('saved', selected.filePath);
  } catch (reason) {
    console.info('[Beam Screenshot publish]', {
      ...result('error'),
      error: reason instanceof Error ? reason.message : String(reason),
    });
    throw reason;
  }
}
module.exports = { publishScreenshot };
