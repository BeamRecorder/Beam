import { describe, expect, it } from 'vitest';
import { createGlassHighlight, fitGlassContour, glassHighlightsAt, GLASS_MAX_POINTS } from './glass-highlight';
import { createManualZoom, manualCameraZoom } from './manual-zoom';
import { validateGlassHighlight } from './glass-highlight-schema.js';
import { validateZoomElement, validateStillZoom } from './zoom-schema.js';
import { zoomAtTime } from './zoom-playback';
import { createRenderDocument } from '../document/render-document';
import { validateRenderDocument } from '../document/render-document-validation';
import { createStillDocument, validateStillDocument } from '../screenshot/still-document';
import { createStillCommands } from '../screenshot/still-commands';
import { screenshotLayers } from '../screenshot/screenshot-layers';
import type { ZoomElement } from './zoom-types';

const lens = (): ZoomElement => ({
  ...createManualZoom('lens', 0, 1000),
  effect: 'glass',
  glass: createGlassHighlight(),
});
describe('portable glass zoom authoring', () => {
  it('preserves legacy cameras and excludes lenses from camera motion and connected transitions', () => {
    expect(zoomAtTime([lens()], 500)).toBeNull();
    const camera = createManualZoom('camera', 1100, 3000);
    expect(zoomAtTime([lens(), camera], 1500)).toEqual(zoomAtTime([camera], 1500));
    expect(manualCameraZoom(camera)).toMatchObject({ scale: 1.5, tiltX: 0, tiltY: 0 });
    expect(manualCameraZoom({ ...camera, projection: '3d' }).tiltX).not.toBe(0);
  });
  it('evaluates bounded fade, short clips, opacity, disabled lenses and empty freehand masks without playback state', () => {
    const value = lens();
    expect(glassHighlightsAt([value], -1, 1920, 1080)).toEqual([]);
    expect(glassHighlightsAt([value], 0, 1920, 1080)).toEqual([]);
    expect(glassHighlightsAt([value], 1000, 1920, 1080)).toEqual([]);
    const sample = glassHighlightsAt([value], 500, 1920, 1080)[0]!;
    expect(sample).toMatchObject({ center: { x: 960, y: 540 }, radius: 324, strength: 1, magnification: 1.5 });
    expect(glassHighlightsAt([value], 125, 1920, 1080)[0]!.strength).toBe(0.5);
    expect(glassHighlightsAt([value], 500, 1920, 1080)).toEqual([sample]);
    value.endMs = 100;
    expect(glassHighlightsAt([value], 50, 200, 100)[0]!.strength).toBe(1);
    value.glass!.transitionMs = 0;
    expect(glassHighlightsAt([value], 0, 200, 100)[0]!.strength).toBe(1);
    for (const patch of [
      { enabled: false },
      { effect: 'camera' },
      { glass: undefined },
      { glass: { ...createGlassHighlight(), opacity: 0 } },
      { glass: { ...createGlassHighlight(), shape: 'freehand', path: [] } },
    ])
      expect(glassHighlightsAt([{ ...value, ...patch } as ZoomElement], 50, 200, 100)).toEqual([]);
  });
  it('fits non-square, off-canvas contours and keeps a bounded resolution-independent JSON path', () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({
      x: 0.5 + 0.2 * Math.cos((i / 2000) * Math.PI * 2),
      y: 0.5 + 0.3 * Math.sin((i / 2000) * Math.PI * 2),
    }));
    const fitted = fitGlassContour(points, 1920, 1080)!;
    expect(fitted.path).toHaveLength(GLASS_MAX_POINTS);
    expect(fitted.focus).toEqual({ cx: 0.5, cy: 0.5 });
    expect(fitted.size).toBeCloseTo(768 / 1080);
    expect(fitted.path.every((point) => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1)).toBe(true);
    const outside = fitGlassContour(
      [
        { x: -2, y: -2 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
      ],
      100,
      100,
    )!;
    expect(outside.focus).toEqual({ cx: 0.5, cy: 0.5 });
    for (const [contourPoints, width, height] of [
      [[], 100, 100],
      [
        [
          { x: 0.2, y: 0.2 },
          { x: 0.5, y: 0.5 },
          { x: 0.8, y: 0.8 },
        ],
        100,
        100,
      ],
      [Array(8193).fill({ x: 0, y: 0 }), 100, 100],
      [
        [
          { x: NaN, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
        100,
        100,
      ],
      [points, 0, 100],
      [points, 100, Infinity],
      [
        [
          { x: 0, y: 0 },
          { x: 0.001, y: 0 },
          { x: 0, y: 0.001 },
        ],
        100,
        100,
      ],
    ] as const)
      expect(fitGlassContour(contourPoints, width, height)).toBeNull();
  });
  it('validates the same glass JSON at video and still protocol boundaries', () => {
    const zoom = lens();
    const document = createRenderDocument(undefined, 1920, 1080, 30);
    document.zooms = [zoom];
    validateRenderDocument(document);
    const still = createStillDocument('image', 'image.png', 1920, 1080);
    const commands = createStillCommands();
    const added = commands.execute(still, {
      type: 'still.layer.add',
      payload: { ...zoom, endMs: 1, kind: 'zoom', name: 'Lens' },
    });
    validateStillDocument(added);
    expect(screenshotLayers(added.state).find((layer) => layer.id === zoom.id)?.kind).toBe('zoom');
    const changed = commands.execute(added, {
      type: 'still.layer.patch',
      payload: { layerId: zoom.id, patch: { depth: 4 } },
    });
    expect(changed.state.zooms![0]!.depth).toBe(4);
    expect(added.state.zooms![0]!.depth).toBe(2);
    const hidden = commands.execute(changed, {
      type: 'still.layer.enable',
      payload: { layerId: zoom.id, enabled: false },
    });
    expect(hidden.state.zooms![0]!.enabled).toBe(false);
    const removed = commands.execute(hidden, { type: 'still.layer.delete', payload: { layerId: zoom.id } });
    expect(removed.state.zooms).toEqual([]);
    expect(hidden.state.zooms).toHaveLength(1);
  });
  it('rejects invalid or unbounded settings, preserving optional fields for legacy cameras', () => {
    validateGlassHighlight(createManualZoom('old', 0, 1000));
    validateGlassHighlight(lens());
    for (const [key, value] of [
      ['shape', 'rectangle'],
      ['size', 0],
      ['size', 5],
      ['path', null],
      ['path', [{ x: 0, y: 0 }]],
      ['path', Array(129).fill({ x: 0, y: 0 })],
      [
        'path',
        [
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: 0 },
        ],
      ],
      ['refraction', NaN],
      ['rim', 2],
      ['bevel', 0],
      ['dispersion', -1],
      ['shadow', 2],
      ['opacity', 2],
      ['transitionMs', 1001],
    ])
      expect(() =>
        validateGlassHighlight({ ...lens(), glass: { ...createGlassHighlight(), [key as string]: value } }),
      ).toThrow();
    for (const patch of [
      { effect: 'bad' },
      { glass: null },
      { glass: undefined },
      { focus: { cx: -1, cy: 0 } },
      { mode: 'auto' },
    ])
      expect(() => validateGlassHighlight({ ...lens(), ...patch })).toThrow();
    for (const patch of [
      { id: '' },
      { sessionId: null },
      { startMs: -1 },
      { endMs: 0 },
      { depth: 8 },
      { mode: 'bad' },
      { enabled: 'yes' },
      { projection: 'bad' },
      { tiltIntensity: NaN },
    ])
      expect(() => validateZoomElement({ ...lens(), ...patch })).toThrow();
    const still = { ...lens(), kind: 'zoom', name: 'Lens', endMs: 1 };
    validateStillZoom(still);
    for (const patch of [
      { kind: 'image' },
      { mode: 'auto', effect: 'camera' },
      { startMs: 0.1 },
      { endMs: 2 },
      { name: null },
      { enabled: undefined },
      { animations: [] },
      { keyframes: [] },
      { transitions: {} },
    ])
      expect(() => validateStillZoom({ ...still, ...patch })).toThrow();
  });
});
