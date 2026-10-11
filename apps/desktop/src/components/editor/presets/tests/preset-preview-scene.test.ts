import { describe, expect, it } from 'vitest';
import { presetPreviewScene } from '../preset-preview-scene';
import { previewSettings } from './preset-preview-fixtures';
import { BACKGROUND_MEDIA } from '../../composables/backgroundCatalog';

describe('preset preview scene', () => {
  it('uses actual screenshot dimensions and the saved image appearance without mutating settings', () => {
    const settings = previewSettings({ id: 'red', name: 'Red', kind: 'color', color: '#ff0000' });
    const saved = JSON.stringify(settings);
    const scene = presetPreviewScene(settings, 'screenshot', { width: 800, height: 600 });
    expect(scene.canvas).toMatchObject({ preset: 'custom', width: 800, height: 600 });
    expect(scene.visual).toMatchObject({
      kind: 'image',
      rotation: 10,
      isMirrored: true,
      cameraFramingPreset: 'fit',
      appearance: { shadowColor: '#ff0000' },
    });
    expect(scene.background).toEqual(settings.editor.presentation?.background);
    expect(JSON.stringify(settings)).toBe(saved);
  });

  it('honors a fixed screenshot output and screen appearance in a screenshot preset', () => {
    const settings = previewSettings();
    settings.export.resolution = 'custom';
    settings.editor.visual = { screen: settings.editor.visual!.image! };
    settings.editor.presentation!.blurPercent = 45;
    const scene = presetPreviewScene(settings, 'screenshot', { width: 800, height: 600 });
    expect(scene.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(scene.visual.appearance.shadowColor).toBe('#ff0000');
    expect(scene.blurPercent).toBe(45);
  });

  it('uses video screen framing and preserves mirroring, rotation and presentation', () => {
    const settings = previewSettings();
    settings.editor.visual!.screen = {
      ...settings.editor.visual!.image!,
      cameraFramingPreset: 'fill',
      isMirroredY: true,
    };
    const scene = presetPreviewScene(settings, 'video', { width: 800, height: 600 });
    expect(scene.canvas.width).toBe(1920);
    expect(scene.visual).toMatchObject({
      kind: 'screen',
      cameraFramingPreset: 'fill',
      isMirroredY: true,
      rotation: 10,
    });
  });

  it.each(['video', 'screenshot'] as const)('uses the same editor defaults for an empty %s preset', (kind) => {
    const settings = previewSettings();
    settings.editor = { schemaVersion: 1 };
    const scene = presetPreviewScene(settings, kind, { width: 800, height: 600 });
    expect(scene.visual.transform).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(scene.visual.isMirrored).toBe(false);
    expect(scene.visual.isMirroredY).toBe(false);
    expect(scene.visual.rotation).toBeUndefined();
    expect(scene.visual.cameraFramingPreset).toBe(kind === 'video' ? 'custom' : 'fit');
    expect(scene.background).toBeNull();
  });

  it('resolves a catalog background referenced by identity only', () => {
    const settings = previewSettings();
    settings.editor.presentation!.selectedBackgroundId = BACKGROUND_MEDIA[0]!.id;
    expect(presetPreviewScene(settings, 'video', { width: 800, height: 600 }).background).toEqual(BACKGROUND_MEDIA[0]);
  });
});
