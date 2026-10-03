import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createComposition } from '@beam/engine/commands/clip-engine';
import type { ClipComposition, MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import type { CursorTelemetryPoint } from '@beam/engine/capture/capture-session';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { generateRecordingZooms } from '@beam/engine/zoom/recording-zoom-generation';

const asset = (id: string, sessionId: string): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.webm`,
  durationMs: 60_000,
  width: 1_920,
  height: 1_080,
  src: `/media/${id}.webm`,
  origin: 'session',
  sessionId,
});

const screen = (id: string, assetId: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'screen',
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (clips: VisualClip[], assets: MediaAsset[]): ClipComposition => createComposition(assets, clips);

const click = (timeMs: number, cx = 0.25, cy = 0.75): CursorTelemetryPoint => ({
  timeMs,
  cx,
  cy,
  interactionType: 'click',
});

const manualZoom = (id: string, startMs: number, endMs: number, sessionId = 'session'): ZoomElement => ({
  id,
  sessionId,
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

describe('generateRecordingZooms', () => {
  it('maps trimmed source telemetry into the clip timeline using playback rate and offset', () => {
    const result = generateRecordingZooms(
      composition(
        [
          screen('trimmed-screen', 'screen-asset', {
            timelineStartMs: 4_000,
            timelineDurationMs: 2_000,
            sourceInMs: 3_000,
            sourceDurationMs: 4_000,
            playbackRate: 2,
          }),
        ],
        [asset('screen-asset', 'session')],
      ),
      'session',
      [click(2_999), click(4_000, 0.4, 0.6), click(7_001)],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      linkedClipId: 'trimmed-screen',
      startMs: 4_000,
      endMs: 5_000,
      focus: { cx: 0.4, cy: 0.6 },
      mode: 'auto',
      sessionId: 'session',
    });
  });

  it('places generated zooms around the click while respecting reserved timeline space', () => {
    const result = generateRecordingZooms(
      composition([screen('screen', 'screen-asset')], [asset('screen-asset', 'session')]),
      'session',
      [click(1_000)],
      [manualZoom('reserved', 0, 750)],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ linkedClipId: 'screen', startMs: 750, endMs: 1_750 });
  });

  it('generates only for screen assets belonging to the requested recording session', () => {
    const result = generateRecordingZooms(
      composition(
        [screen('current-screen', 'current-asset'), screen('other-screen', 'other-asset')],
        [asset('current-asset', 'session'), asset('other-asset', 'other-session')],
      ),
      'session',
      [click(1_000)],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ linkedClipId: 'current-screen', sessionId: 'session' });
    expect(result.every((zoom) => zoom.linkedClipId !== 'other-screen')).toBe(true);
  });
});

it('keeps generated IDs unique across recording copies and retained detached zooms', () => {
  const comp = composition(
    [screen('one', 'asset'), screen('two', 'asset', { timelineStartMs: 6000 })],
    [asset('asset', 'session')],
  );
  const reserved = { ...manualZoom('auto:session:1000:one', 3000, 4000), mode: 'auto' as const, linkedClipId: null };
  const generated = generateRecordingZooms(comp, 'session', [click(1000)], [reserved]);
  expect(generated).toHaveLength(2);
  expect(new Set([reserved, ...generated].map((zoom) => zoom.id)).size).toBe(3);
  expect(generated.map((zoom) => zoom.linkedClipId)).toEqual(['one', 'two']);
});

it('maps automatic lenses to the output canvas and preserves trim/rate/linking', () => {
  const comp = composition(
    [
      screen('lens', 'asset', {
        sourceInMs: 1000,
        timelineStartMs: 3000,
        playbackRate: 2,
        sourceDurationMs: 5000,
        timelineDurationMs: 2500,
        transform: { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
      }),
    ],
    [asset('asset', 'session')],
  );
  const result = generateRecordingZooms(comp, 'session', [click(3000, 0.5, 0.5)], [], {
    style: 'glass',
    canvas: { width: 1920, height: 1080, showBackground: false },
  });
  expect(result[0]).toMatchObject({
    effect: 'glass',
    mode: 'manual',
    generation: 'automatic',
    linkedClipId: 'lens',
    focus: { cx: 0.45, cy: 0.5 },
  });
  expect(result[0]!.startMs).toBeGreaterThanOrEqual(3000);
  expect(result[0]!.endMs).toBeLessThanOrEqual(5500);
  expect(
    generateRecordingZooms(comp, 'session', [click(3000)], [], {
      style: '3d',
      canvas: { width: 1920, height: 1080, showBackground: false },
    })[0]!.projection,
  ).toBe('3d');
  comp.clips[0]!.enabled = false;
  expect(generateRecordingZooms(comp, 'session', [click(3000)], [])).toEqual([]);
});
