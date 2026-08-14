import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { createCompositionSnapshot } from '../snapshot';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipComposition } from '~/media/shared/composition-types';

const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Screen recording',
      fileName: null,
      durationMs: 4_000,
      width: 1920,
      height: 1080,
      src: 'project-media://asset/screen.mp4',
      origin: 'session',
    },
  ],
  clips: [
    {
      id: 'screen',
      kind: 'screen',
      name: 'Screen recording',
      assetId: 'screen-asset',
      timelineStartMs: 0,
      timelineDurationMs: 4_000,
      sourceInMs: 0,
      sourceDurationMs: 4_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
    },
  ],
});

const base = () => ({
  duration: 4,
  width: 1920,
  height: 1080,
  fps: 30,
  canvas: DEFAULT_OUTPUT_CANVAS,
  background: null,
  blurPercent: 0,
  editorData: null,
  zooms: [],
  composition: composition(),
  cursorSettings: {
    selectedCursor: 'automatic' as const,
    size: 24,
    color: '#000000',
    shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' as const },
    clickEffects: {
      left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
      right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
    },
    motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  },
});

describe('createCompositionSnapshot', () => {
  it('rejects a composition without an available screen source', () => {
    const input = base();
    input.composition.assets[0].src = '';
    expect(() => createCompositionSnapshot(input)).toThrow('session video is unavailable');
  });

  it('clamps invalid render metadata and duration without inventing cursor data', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      duration: -1,
      width: 0,
      height: -8,
      fps: 0,
      composition: { ...composition(), assets: [{ ...composition().assets[0], width: null, height: null }] },
    });
    expect(snapshot.render).toEqual({ sourceWidth: 1, sourceHeight: 1, fps: 1 });
    expect(snapshot.duration).toBe(0);
    expect(snapshot.cursor.available).toBe(false);
  });

  it('keeps output dimensions independent from source dimensions', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      canvas: { preset: '4:5', width: 1, height: 1, showBackground: false },
    });
    expect(snapshot.render).toMatchObject({ sourceWidth: 1920, sourceHeight: 1080 });
    expect(snapshot.canvas).toMatchObject({ width: 1080, height: 1350, showBackground: false });
  });

  it('normalizes motion settings in the export snapshot', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      cursorSettings: {
        ...base().cursorSettings,
        motion: { preset: 'custom', smoothing: 2, springMassMultiplier: 0.1, motionBlur: -1 },
      },
    });
    expect(snapshot.cursorSettings.motion).toEqual({
      preset: 'custom',
      smoothing: 1,
      springMassMultiplier: 0.5,
      motionBlur: 0,
    });
  });

  it('keeps an immutable copy of zooms and composition', () => {
    const zooms = [
      {
        id: 'z',
        sessionId: 's',
        startMs: 0,
        endMs: 10,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1 as const,
        mode: 'manual' as const,
      },
    ];
    const input = base();
    const snapshot = createCompositionSnapshot({ ...input, zooms });
    zooms[0].focus.cx = 0.1;
    input.composition.clips[0].timelineDurationMs = 1_000;
    expect(snapshot.zooms[0].focus.cx).toBe(0.5);
    expect(snapshot.composition.clips[0].timelineDurationMs).toBe(4_000);
  });

  it('copies reactive editor data and composition without retaining Vue proxies', () => {
    const editorData = reactive({
      tracks: [],
      cursor: {
        available: true,
        events: [{ event: 'shape' as const, sessionNs: 1, shapeId: 'arrow', hotspot: { x: 2, y: 3 } }],
        telemetry: [{ timeMs: 1, cx: 0.2, cy: 0.3 }],
        shapes: { arrow: { src: 'project-media://cursor/arrow.png', hotspot: { x: 2, y: 3 } } },
        catalog: {},
        missing: ['cursor.json'],
      },
    });
    const reactiveComposition = reactive(composition());
    const snapshot = createCompositionSnapshot({
      ...base(),
      editorData: editorData as never,
      composition: reactiveComposition,
    });
    editorData.cursor.events[0].hotspot.x = 9;
    reactiveComposition.clips[0].timelineDurationMs = 1_000;
    expect(snapshot.cursor.events[0]).toMatchObject({ hotspot: { x: 2, y: 3 } });
    expect(snapshot.composition.clips[0].timelineDurationMs).toBe(4_000);
  });

  it('does not create a second video or render-layer representation', () => {
    const snapshot = createCompositionSnapshot(base()) as unknown as Record<string, unknown>;
    expect(snapshot.video).toBeUndefined();
    expect(snapshot.layers).toBeUndefined();
    expect(snapshot.composition).toBeDefined();
  });
});
