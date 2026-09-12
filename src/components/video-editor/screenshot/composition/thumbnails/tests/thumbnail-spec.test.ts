import { describe, expect, it } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import { DEFAULT_OUTPUT_CANVAS } from '../../../../canvas/output-canvas';
import { screenshotLayers } from '../../../screenshot-layers';
import { screenshotShape } from '../../../screenshot-state';
import { screenshotThumbnailSpecs } from '../thumbnail-spec';

const image = () =>
  ({
    id: 'screenshot',
    kind: 'image',
    name: 'Captured screen',
    assetId: 'asset-1',
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 1,
    transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
    appearance: { frame: 'none' },
    isMirrored: false,
    isMirroredY: false,
  }) as ScreenshotState['image'];

const cursorAsset: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://cursor.svg',
  format: 'svg',
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 4, y: 2 },
};
const cursorPack: CursorPackDescriptor = {
  id: 'pack-1',
  name: 'Test cursors',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: 'pointer',
  cursors: [cursorAsset],
  automaticMap: {},
};
const cursor = () =>
  ({
    id: 'cursor-1',
    name: 'Pointer',
    enabled: true,
    position: { x: 0.4, y: 0.5 },
    size: 24,
    rotation: 0,
    selection: { mode: 'fixed', packId: cursorPack.id, cursorId: cursorAsset.id },
    color: '#123456',
    shadowEnabled: true,
    shadowBlur: 4,
    shadowColor: '#000000',
    shadowDirection: 'bottom',
  }) as NonNullable<ScreenshotState['cursors']>[number];

const state = (overrides: Partial<ScreenshotState> = {}): ScreenshotState =>
  ({
    canvas: {
      ...DEFAULT_OUTPUT_CANVAS,
      preset: 'custom',
      width: 1600,
      height: 900,
      showBackground: true,
      watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true, showLogo: true },
    },
    background: {
      id: 'wallpaper',
      name: 'Wallpaper',
      kind: 'image',
      path: 'project-media://wallpaper.png',
      extension: 'png',
    },
    blurPercent: 30,
    image: image(),
    shapes: [screenshotShape('rectangle', 'shape-1')],
    cursors: [cursor()],
    format: 'png',
    quality: 0.9,
    ...overrides,
  }) as ScreenshotState;

describe('screenshot thumbnail specifications', () => {
  it('creates one isolated spec per composition layer and resolves layer-specific assets', () => {
    const specs = screenshotThumbnailSpecs(state(), 'project-media://capture.png', [cursorPack]);
    const byId = new Map(specs.map((spec) => [spec.id, spec]));

    expect([...byId.keys()]).toEqual(['__background__', 'screenshot', 'shape-1', 'cursor-1', '__watermark__']);
    expect(byId.get('__background__')?.sourceUrl).toBe('project-media://wallpaper.png');
    expect(byId.get('screenshot')?.sourceUrl).toBe('project-media://capture.png');
    expect(byId.get('cursor-1')).toMatchObject({ cursorPack, cursorAsset });
    expect(byId.get('__watermark__')?.sourceUrl).toContain('brand/BeamIcon.webp');
    expect(byId.get('shape-1')?.state.shapes.map((shape) => shape.id)).toEqual(['shape-1']);
    expect(byId.get('shape-1')?.state.cursors).toEqual([]);
    expect(byId.get('cursor-1')?.state.shapes).toEqual([]);
    expect(byId.get('cursor-1')?.state.cursors?.map((item) => item.id)).toEqual(['cursor-1']);
  });

  it('keys each preview by its visible content and ignores placement-only changes', () => {
    const initial = state();
    const initialSpecs = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    const initialKeys = new Map(initialSpecs.map((spec) => [spec.id, spec.key]));

    initial.shapes[0]!.transform.x = 0.7;
    const movedSpecs = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    expect(movedSpecs.find((spec) => spec.id === 'shape-1')?.key).toBe(initialKeys.get('shape-1'));

    initial.shapes[0]!.fillColor = '#ff00ff';
    const restyledSpecs = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    expect(restyledSpecs.find((spec) => spec.id === 'shape-1')?.key).not.toBe(initialKeys.get('shape-1'));
    expect(restyledSpecs.find((spec) => spec.id === 'screenshot')?.key).toBe(initialKeys.get('screenshot'));
  });

  it('changes only the image preview when its source or crop changes', () => {
    const initial = state();
    const first = screenshotThumbnailSpecs(initial, 'project-media://capture-a.png', [cursorPack]);
    initial.image.crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    const cropped = screenshotThumbnailSpecs(initial, 'project-media://capture-b.png', [cursorPack]);

    expect(cropped.find((spec) => spec.id === 'screenshot')?.key).not.toBe(
      first.find((spec) => spec.id === 'screenshot')?.key,
    );
    expect(cropped.find((spec) => spec.id === 'shape-1')?.key).toBe(first.find((spec) => spec.id === 'shape-1')?.key);
  });

  it('keys a cursor preview by its selected asset and appearance', () => {
    const initial = state();
    const first = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    initial.cursors![0]!.color = '#abcdef';
    const changed = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);

    expect(changed.find((spec) => spec.id === 'cursor-1')?.key).not.toBe(
      first.find((spec) => spec.id === 'cursor-1')?.key,
    );
    expect(changed.find((spec) => spec.id === 'screenshot')?.key).toBe(
      first.find((spec) => spec.id === 'screenshot')?.key,
    );
  });

  it('does not invalidate isolated content for visibility, opacity, blend, or lock controls', () => {
    const initial = state();
    initial.composition = screenshotLayers(initial).map(({ id, opacity, blendMode, locked }) => ({
      id,
      opacity,
      blendMode,
      locked,
    }));
    const first = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    const firstKeys = new Map(first.map((spec) => [spec.id, spec.key]));

    for (const layer of initial.composition!) {
      layer.opacity = 0;
      layer.blendMode = 'multiply';
      layer.locked = true;
    }
    initial.shapes[0]!.enabled = false;
    initial.image.enabled = false;
    initial.canvas.showBackground = false;
    initial.canvas.watermark!.enabled = false;

    const changed = screenshotThumbnailSpecs(initial, 'project-media://capture.png', [cursorPack]);
    expect(new Map(changed.map((spec) => [spec.id, spec.key]))).toEqual(firstKeys);
  });

  it('uses fallback information when a cursor pack is not yet available', () => {
    const spec = screenshotThumbnailSpecs(state(), 'capture.png', []).find((item) => item.id === 'cursor-1')!;

    expect(spec.cursorPack).toBeUndefined();
    expect(spec.cursorAsset).toBeUndefined();
  });
});
