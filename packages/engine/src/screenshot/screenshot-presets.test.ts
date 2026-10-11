// @vitest-environment node
import { expect, it } from 'vitest';
import { createStillDocument } from './still-document';
import { applyScreenshotPreset } from './screenshot-presets';
import { removeScreenshotLayer, SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID } from './screenshot-layers';
import { DEFAULT_WATERMARK } from '../layout/output-canvas';

const state = () => createStillDocument('capture', 'source.png', 1200, 800).state;

it('changes presentation while preserving image identity, crop, rotation, visibility and custom names', () => {
  const current = state();
  current.image = { ...current.image, enabled: false, rotation: 37, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } };
  current.layerNames = { image: 'My capture' };
  const preset = state();
  preset.canvas.width = 1920;
  preset.background = { id: 'color', name: 'Blue', kind: 'color', color: '#123456' };
  preset.blurPercent = 15;
  preset.format = 'webp';
  preset.quality = 0.8;
  preset.image.transform = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
  preset.image.isMirrored = true;
  const next = applyScreenshotPreset(current, preset);
  expect(next).toMatchObject({
    canvas: preset.canvas,
    background: preset.background,
    blurPercent: 15,
    format: 'webp',
    quality: 0.8,
  });
  expect(next.image).toEqual({ ...current.image, transform: preset.image.transform, isMirrored: true });
  expect(next.layerNames).toBe(current.layerNames);
});

it('restores deleted background and watermark at the right ends without mutating the previous composition', () => {
  const current = state();
  removeScreenshotLayer(current, SCREENSHOT_BACKGROUND_ID);
  removeScreenshotLayer(current, SCREENSHOT_WATERMARK_ID);
  const before = structuredClone(current);
  const preset = state();
  preset.canvas.showBackground = true;
  preset.canvas.watermark = { ...DEFAULT_WATERMARK, enabled: true };
  const next = applyScreenshotPreset(current, preset);
  expect(next.composition?.map((layer) => layer.id)).toEqual([
    SCREENSHOT_BACKGROUND_ID,
    'image',
    SCREENSHOT_WATERMARK_ID,
  ]);
  expect(current).toEqual(before);
  expect(applyScreenshotPreset(next, preset).composition).toEqual(next.composition);
});

it('retains existing compositing settings when toggling background and watermark off and on', () => {
  const current = state();
  current.composition![0]!.opacity = 42;
  current.composition![0]!.locked = true;
  current.composition![1]!.blendMode = 'multiply';
  const off = applyScreenshotPreset(current, state());
  expect(off.composition).toEqual(current.composition);
  expect(off.composition![0]).not.toBe(current.composition![0]);
  const preset = state();
  preset.canvas.showBackground = true;
  preset.canvas.watermark = { ...DEFAULT_WATERMARK, enabled: true };
  expect(applyScreenshotPreset(off, preset).composition).toEqual(current.composition);
});

it('supports a legacy document without explicit composition or watermark settings', () => {
  const current = state();
  delete current.composition;
  const preset = state();
  delete preset.canvas.watermark;
  expect(applyScreenshotPreset(current, preset).composition).toBeUndefined();
  preset.canvas.showBackground = true;
  expect(applyScreenshotPreset(current, preset).composition?.map((layer) => layer.id)).toEqual([
    SCREENSHOT_BACKGROUND_ID,
    'image',
    SCREENSHOT_WATERMARK_ID,
  ]);
});
