import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '../canvas-types';
import { renderPresetPreview } from './render-preset-preview';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { PresetPreviewScene } from './preset-preview-types';

const painters = vi.hoisted(() => ({ background: vi.fn(), media: vi.fn(), screen: vi.fn(), watermark: vi.fn() }));
vi.mock('../composition/background/render-background', () => ({ renderBackground: painters.background }));
vi.mock('../composition/appearance/render-decorated-media', () => ({ drawDecoratedMedia: painters.media }));
vi.mock('../rendering/render-screen', () => ({ drawScreenMedia: painters.screen }));
vi.mock('../rendering/watermark-render', () => ({ drawBeamWatermark: painters.watermark }));
const context = { clearRect: vi.fn() } as unknown as Canvas2DContext;
const assets = { image: { source: {} as HTMLImageElement, width: 800, height: 600 }, background: null, logo: null };
const sceneFixture = (kind: 'image' | 'screen' = 'image'): PresetPreviewScene => ({
  canvas: normalizeOutputCanvas({ preset: 'custom', width: 800, height: 600, showBackground: true }),
  background: { id: 'red', kind: 'color', name: 'Red', color: '#ff0000' },
  blurPercent: 50,
  visual: {
    id: 'preview',
    assetId: 'preview',
    name: 'Beam',
    kind,
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    order: 0,
    enabled: true,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance(kind),
    isMirrored: true,
    isMirroredY: false,
    rotation: 10,
  },
});
beforeEach(() => vi.clearAllMocks());

describe('preset preview painter', () => {
  it('scales background blur and image decoration with real source framing', () => {
    const scene = sceneFixture();
    renderPresetPreview(context, scene, assets, 400, 300);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(painters.background).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ value: scene.background, blurPixels: 12 }),
    );
    expect(painters.media).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ shadowScale: 0.5, mirrored: true, rotation: 10, appearance: scene.visual.appearance }),
    );
    expect(painters.screen).not.toHaveBeenCalled();
    expect(painters.watermark).toHaveBeenCalled();
  });
  it('reuses normal screen geometry at phase zero for video presets', () => {
    const scene = sceneFixture('screen');
    scene.canvas = normalizeOutputCanvas({ showBackground: true });
    renderPresetPreview(context, scene, assets, 480, 270);
    expect(painters.screen).toHaveBeenCalledWith(
      context,
      scene.visual,
      assets.image,
      expect.objectContaining({ width: 480, height: 270 }),
      0,
      0.25,
    );
    expect(painters.media).not.toHaveBeenCalled();
  });
  it('keeps a transparent canvas when the background is disabled', () => {
    const scene = sceneFixture();
    scene.canvas.showBackground = false;
    renderPresetPreview(context, scene, assets, 400, 300);
    expect(painters.background).not.toHaveBeenCalled();
    expect(painters.media).toHaveBeenCalled();
  });
});
