const fs = require('node:fs');

function createBlankScreenshot({ store, presetStore, nativeImage }, { width, height, name }) {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= 8192) || width * height > 16777216)
    throw new Error('Provide valid screenshot dimensions (up to 16 megapixels).');
  const presets = presetStore.read();
  const settings = presets.presets.find((item) => item.id === presets.activePresetId)?.settings;
  if (!settings) throw new Error('Active screenshot preset is unavailable.');
  const preset = {
    ...settings,
    export: { ...settings.export, resolution: 'custom' },
    editor: {
      ...settings.editor,
      presentation: {
        ...settings.editor.presentation,
        canvas: {
          ...settings.editor.presentation.canvas,
          preset: 'custom',
          width,
          height,
          showBackground: false,
        },
      },
    },
  };
  const created = store.create();
  try {
    // A real transparent PNG gives the still editor a decodable empty canvas.
    const pixels = Buffer.alloc(width * height * 4);
    fs.writeFileSync(created.path, nativeImage.createFromBitmap(pixels, { width, height }).toPNG(), {
      flag: 'wx',
      mode: 0o600,
    });
    return store.complete(created.id, { width, height }, preset, name);
  } catch (error) {
    store.remove(created.id);
    throw error;
  }
}

module.exports = { createBlankScreenshot };
