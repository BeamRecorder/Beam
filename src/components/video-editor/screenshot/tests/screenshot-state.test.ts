import { describe, expect, it } from 'vitest';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { ProjectEditorPresentation } from '~/api/types/capture-api';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { moveScreenshotLayer, screenshotPresetSettings, screenshotShape, screenshotState } from '../screenshot-state';

const makePreset = (): EditorPresetSettings => ({
  editor: { schemaVersion: 1 },
  devices: { cameraId: 'legacy-camera' },
  export: { format: 'png', quality: 0.8, resolution: '1080p' },
  quickSnip: { automaticZoom: true },
});

const makeDocument = (overrides: Partial<ScreenshotDocument> = {}): ScreenshotDocument => ({
  id: 'screen-1',
  name: 'Captured screen',
  width: 3024,
  height: 1964,
  source: 'project-media://screenshot/screen-1/source.png',
  preset: makePreset(),
  state: null,
  ...overrides,
});

const makeLegacyPreset = (): EditorPresetSettings => {
  const background = { id: 'legacy-color', name: 'Legacy color', kind: 'color' as const, color: '#123456' };
  const cursor = { size: 61, color: '#abcdef', clickEffects: { left: { enabled: true } } };
  const appearance = { ...createDefaultClipAppearance('screen'), cornerRadius: 'lg' as const, shadowColor: '#654321' };
  return {
    editor: {
      schemaVersion: 1,
      presentation: {
        canvas: {
          ...DEFAULT_OUTPUT_CANVAS,
          preset: 'custom',
          width: 1280,
          height: 720,
          showBackground: true,
          watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true, text: 'custom', customText: 'Old brand' },
        },
        selectedBackgroundId: background.id,
        background,
        blurPercent: 38,
        cursor: cursor as unknown as ProjectEditorPresentation['cursor'],
      },
      visual: {
        screen: {
          transform: { x: 0.12, y: 0.18, width: 0.72, height: 0.64 },
          appearance,
          isMirrored: true,
          isMirroredY: false,
          playbackRate: 1,
          transitions: { entry: null, exit: null },
          cameraLayoutPreset: 'custom',
          cameraFramingPreset: 'circle',
        },
      },
    },
    devices: { cameraId: 'legacy-camera', microphoneId: 'legacy-microphone' },
    export: { format: 'webp', quality: 0.72, resolution: 'custom' },
    quickSnip: { automaticZoom: false },
  };
};

const makeState = (): ScreenshotState => ({
  canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: 'custom', width: 900, height: 600 },
  background: null,
  blurPercent: 12,
  image: {
    id: 'screenshot',
    kind: 'image',
    name: 'Captured screen',
    assetId: 'screen-1',
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 1,
    transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
  },
  shapes: [],
  format: 'png',
  quality: 0.9,
});

describe('screenshotState', () => {
  it('starts at native capture resolution when the preset selects a named output size', () => {
    const state = screenshotState(makeDocument());

    expect(state.canvas).toMatchObject({ preset: 'custom', width: 3024, height: 1964 });
    expect(state.image).toMatchObject({
      id: 'screenshot',
      kind: 'image',
      assetId: 'screen-1',
      name: 'Captured screen',
    });
  });

  it('uses the custom canvas dimensions saved in the preset', () => {
    const preset = makePreset();
    preset.export.resolution = 'custom';
    preset.editor.presentation = {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: 'custom', width: 1440, height: 900 },
      selectedBackgroundId: null,
      cursor: {} as ProjectEditorPresentation['cursor'],
    };

    expect(screenshotState(makeDocument({ preset })).canvas).toMatchObject({
      preset: 'custom',
      width: 1440,
      height: 900,
    });
  });

  it('retains legacy screen presentation, background and export preferences', () => {
    const preset = makeLegacyPreset();
    const state = screenshotState(makeDocument({ preset }));

    expect(state.canvas).toMatchObject({ width: 1280, height: 720, showBackground: true });
    expect(state.canvas.watermark).toMatchObject({ enabled: true, text: 'custom', customText: 'Old brand' });
    expect(state.background).toEqual(preset.editor.presentation?.background);
    expect(state.blurPercent).toBe(38);
    expect(state.image).toMatchObject({
      transform: { x: 0.12, y: 0.18, width: 0.72, height: 0.64 },
      isMirrored: true,
      isMirroredY: false,
    });
    expect(state.image.appearance).toEqual({
      ...createDefaultClipAppearance('image'),
      ...preset.editor.visual?.screen?.appearance,
    });
    expect(state.format).toBe('webp');
    expect(state.quality).toBe(0.72);
  });

  it('clones and prefers a previously saved screenshot state', () => {
    const saved = makeState();
    const restored = screenshotState(makeDocument({ state: saved }));

    expect(restored).toMatchObject(saved);
    expect(restored.composition?.map((layer) => layer.id)).toEqual(['__background__', 'screenshot', '__watermark__']);
    expect(restored).not.toBe(saved);
    expect(restored.image).not.toBe(saved.image);
  });

  it('keeps device, Quick Snip and legacy cursor preferences when preparing screenshot preset settings', () => {
    const previous = makeLegacyPreset();
    const state = makeState();
    const settings = screenshotPresetSettings(state, previous);

    expect(settings.devices).toEqual(previous.devices);
    expect(settings.quickSnip).toEqual(previous.quickSnip);
    expect(settings.editor.presentation?.cursor).toBe(previous.editor.presentation?.cursor);
    expect(settings.editor.presentation?.canvas).toEqual(state.canvas);
    expect(settings.export).toEqual({ format: state.format, quality: state.quality, resolution: 'custom' });
  });
});

describe('screenshotShape', () => {
  it.each([
    ['rectangle', 'shape'],
    ['arrow', 'arrow'],
  ] as const)('creates a %s layer with the matching shared style family', (preset, family) => {
    const shape = screenshotShape(preset, 'new-layer');

    expect(shape).toMatchObject({
      id: 'new-layer',
      kind: 'shape',
      name: preset,
      family,
      preset,
      enabled: true,
    });
    expect(shape.transform).toEqual({ x: 0.3, y: 0.3, width: 0.4, height: preset === 'arrow' ? 0.16 : 0.3 });
  });
});

describe('moveScreenshotLayer', () => {
  const initial = { x: 0.2, y: 0.25, width: 0.3, height: 0.4 };

  it('moves a selected layer by normalized pointer deltas and keeps part of it visible', () => {
    const moved = moveScreenshotLayer(initial, 0.1, -0.05);
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved).toMatchObject({ y: 0.2, width: 0.3, height: 0.4 });
    expect(moveScreenshotLayer(initial, -2, -2)).toEqual({ x: -0.29, y: -0.39, width: 0.3, height: 0.4 });
    expect(moveScreenshotLayer(initial, 2, 2)).toEqual({ x: 0.99, y: 0.99, width: 0.3, height: 0.4 });
  });

  it('enforces the minimum size while resizing from the top-left corner', () => {
    expect(moveScreenshotLayer(initial, 1, 1, 'top-left')).toEqual({
      x: 0.48,
      y: 0.63,
      width: 0.02,
      height: 0.02,
    });
  });

  it('caps a resized layer at twice the canvas size', () => {
    expect(moveScreenshotLayer(initial, 3, 3, 'bottom-right')).toEqual({
      x: 0.2,
      y: 0.25,
      width: 2,
      height: 2,
    });
  });
});
