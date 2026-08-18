import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { createCompositionSnapshot } from '../snapshot';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipComposition } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { MACOS_CURSOR_PACK } from '../../../video-editor/properties/cursor/cursor-packs';

const composition = (): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
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
      appearance: createDefaultClipAppearance('screen'),
      isMirrored: false,
      isMirroredY: false,
    },
  ],
});

const base = (): Parameters<typeof createCompositionSnapshot>[0] => ({
  duration: 4,
  fps: 30,
  canvas: DEFAULT_OUTPUT_CANVAS,
  background: null,
  blurPercent: 0,
  editorData: null,
  zooms: [],
  zoomMotionBlur: { enabled: true, intensity: 0.55 },
  composition: composition(),
  cursorSettings: {
    selection: { packId: MACOS_CURSOR_PACK.id, mode: 'automatic' as const, cursorId: null },
    size: 24,
    color: '#000000',
    shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' as const },
    clickEffects: {
      left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
      right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
    },
    motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  },
  cursorPack: MACOS_CURSOR_PACK,
});

describe('createCompositionSnapshot', () => {
  it('does not fabricate render source dimensions from composition metadata', () => {
    const input = base();
    input.composition.assets[0].src = '';
    input.composition.assets.push({
      id: 'imported-asset',
      kind: 'video',
      name: 'Imported video',
      fileName: 'imported.webm',
      durationMs: 4_000,
      width: 1280,
      height: 720,
      src: 'project-media://asset/imported.webm',
      origin: 'project',
    });
    input.composition.clips.push({
      id: 'imported-video',
      kind: 'video',
      name: 'Imported video',
      assetId: 'imported-asset',
      timelineStartMs: 0,
      timelineDurationMs: 4_000,
      sourceInMs: 0,
      sourceDurationMs: 4_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('video'),
      isMirrored: false,
      isMirroredY: false,
    });

    expect(createCompositionSnapshot(input).render).toMatchObject({ sourceWidth: null, sourceHeight: null });
  });

  it('does not fall back to editor source dimensions', () => {
    const input = base();
    input.composition.assets[0].src = '';

    expect(createCompositionSnapshot(input).render).toMatchObject({
      sourceWidth: null,
      sourceHeight: null,
    });
  });

  it('clamps invalid render metadata and duration without inventing cursor data', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      duration: -1,
      fps: 0,
      composition: { ...composition(), assets: [{ ...composition().assets[0], width: null, height: null }] },
    });
    expect(snapshot.render).toEqual({ sourceWidth: null, sourceHeight: null, fps: 1 });
    expect(snapshot.duration).toBe(0);
    expect(snapshot.cursor.available).toBe(false);
  });

  it('keeps output dimensions independent from source dimensions', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      canvas: { preset: '4:5', width: 1, height: 1, showBackground: false },
    });
    expect(snapshot.render).toMatchObject({ sourceWidth: null, sourceHeight: null });
    expect(snapshot.canvas).toMatchObject({ width: 1080, height: 1350, showBackground: false });
  });

  it('omits the selected background when the output canvas background is disabled', () => {
    const snapshot = createCompositionSnapshot({
      ...base(),
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: false },
      background: {
        id: 'wallpaper-image',
        name: 'Wallpaper image',
        kind: 'image',
        path: 'wallpapers/image/wallpaper.webp',
        extension: 'webp',
      },
    });

    expect(snapshot.background).toBeNull();
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

  it('copies the dedicated zoom motion blur settings into the export snapshot', () => {
    const input = {
      ...base(),
      zoomMotionBlur: { enabled: false, intensity: 0.8 },
    };

    const snapshot = createCompositionSnapshot(input);
    input.zoomMotionBlur.intensity = 0.1;

    expect(snapshot.zoomMotionBlur).toEqual({ enabled: false, intensity: 0.8 });
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

  it('snapshots the resolved cursor pack without retaining its asset references', () => {
    const input = base();
    const pack = {
      ...MACOS_CURSOR_PACK,
      id: 'imported:wide',
      name: 'Wide pack',
      cursors: MACOS_CURSOR_PACK.cursors.map((cursor, index) =>
        index === 0
          ? {
              ...cursor,
              id: 'wide-default',
              intrinsicSize: { width: 40, height: 20 },
              nominalSize: 20,
              hotspot: { x: 5, y: 4 },
            }
          : cursor,
      ),
      defaultCursorId: 'wide-default',
    };
    input.cursorPack = pack;
    input.cursorSettings.selection = { packId: pack.id, mode: 'fixed', cursorId: pack.defaultCursorId };

    const snapshot = createCompositionSnapshot(input);
    pack.cursors[0]!.hotspot.x = 99;
    input.cursorSettings.selection.cursorId = 'mutated';

    expect(snapshot.cursorPack?.cursors[0]?.hotspot).toEqual({ x: 5, y: 4 });
    expect(snapshot.cursorSettings.selection).toEqual({
      packId: 'imported:wide',
      mode: 'fixed',
      cursorId: 'wide-default',
    });
  });

  it('preserves a missing selected pack instead of silently replacing it', () => {
    const input = base();
    input.cursorPack = null;
    input.cursorSettings.selection = { packId: 'imported:missing', mode: 'automatic', cursorId: null };

    const snapshot = createCompositionSnapshot(input);

    expect(snapshot.cursorPack).toBeNull();
    expect(snapshot.cursorSettings.selection.packId).toBe('imported:missing');
  });

  it('does not create a second video or render-layer representation', () => {
    const snapshot = createCompositionSnapshot(base()) as unknown as Record<string, unknown>;
    expect(snapshot.video).toBeUndefined();
    expect(snapshot.layers).toBeUndefined();
    expect(snapshot.composition).toBeDefined();
  });
});
