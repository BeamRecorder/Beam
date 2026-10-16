import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import { createDefaultClipAppearance } from '../../shared/composition-defaults';
import { createComposition } from '../../commands/clip-engine';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { generateRecordingZooms } from '../recording-zoom-generation';
import { buildAutomaticZoomElements } from '../zoom-suggestions';

const point = (
  timeMs: number,
  cx: number,
  cy: number,
  interactionType: CursorTelemetryPoint['interactionType'] = 'click',
): CursorTelemetryPoint => ({ timeMs, cx, cy, interactionType, visible: true });

function recording(durationMs: number, telemetry: CursorTelemetryPoint[]) {
  const composition = createComposition(
    [
      {
        id: 'asset',
        kind: 'video',
        name: 'Recording',
        fileName: 'screen.mp4',
        durationMs,
        width: 1920,
        height: 1080,
        src: '/screen.mp4',
        origin: 'session',
        sessionId: 'take',
      },
    ],
    [
      {
        id: 'screen',
        kind: 'screen',
        name: 'Recording',
        assetId: 'asset',
        timelineStartMs: 0,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        enabled: true,
        order: 0,
        trackId: 'screen',
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('screen'),
        isMirrored: false,
        isMirroredY: false,
      },
    ],
  );
  const zooms = generateRecordingZooms(composition, 'take', telemetry, []);
  return { zooms, camera: createCompositionCameraEvaluator({ zooms, telemetry }) };
}

describe('opening recording actions', () => {
  it('covers the first click and both complete drags in the reported 20.8-second sequence', () => {
    // Reduced timing/position trace: the first two actions previously disappeared entirely.
    const telemetry = [
      point(1276, 0.456, 0.469),
      point(1357, 0.456, 0.469, 'mouseup'),
      point(3170, 0.53, 0.398),
      point(4800, 0.598, 0.337, 'move'),
      point(6828, 0.54, 0.447, 'mouseup'),
      point(7640, 0.493, 0.525),
      point(9000, 0.63, 0.562, 'move'),
      point(10537, 0.5, 0.492, 'mouseup'),
      point(13653, 0.889, 0.527),
      point(13720, 0.889, 0.527, 'mouseup'),
      point(17083, 0.935, 0.547),
      point(17148, 0.935, 0.547, 'mouseup'),
      point(20606, 0.628, 0.898),
      point(20710, 0.633, 0.896, 'mouseup'),
    ];
    const { camera, zooms } = recording(20801, telemetry);
    expect(camera.sample(0).scale).toBe(1);
    for (const time of [1276, 3170, 4800, 6828, 7640, 9000, 10537])
      expect(camera.sample(time).scale, `action at ${time}ms`).toBeGreaterThan(1.15);
    expect(zooms.every((zoom) => zoom.linkedClipId === 'screen')).toBe(true);
    expect(zooms.some((zoom) => zoom.id.includes(':20606:'))).toBe(false);
    expect(camera.sample(20801).scale).toBeCloseTo(1, 8);
  });

  it('keeps the opening action when a later, busier group needs a different framing', () => {
    const telemetry = [
      point(586, 0.243, 0.219),
      point(648, 0.243, 0.22, 'mouseup'),
      point(1415, 0.487, 0.469),
      point(1488, 0.487, 0.469, 'mouseup'),
      point(3072, 0.535, 0.389),
      point(4500, 0.729, 0.296, 'move'),
      point(5933, 0.493, 0.462, 'mouseup'),
      point(7371, 0.889, 0.515),
      point(7469, 0.889, 0.515, 'mouseup'),
      point(11004, 0.934, 0.52),
      point(11122, 0.934, 0.52, 'mouseup'),
      point(14411, 0.451, 0.615),
      point(14489, 0.451, 0.615, 'mouseup'),
      point(15114, 0.468, 0.589),
      point(15849, 0.504, 0.572, 'mouseup'),
      point(17586, 0.466, 0.45),
      point(18554, 0.408, 0.403, 'mouseup'),
      point(20048, 0.464, 0.867),
    ];
    const { camera } = recording(20200, telemetry);
    for (const time of [586, 1415, 3072, 4500, 5933, 11004, 15114, 17586])
      expect(camera.sample(time).scale, `action at ${time}ms`).toBeGreaterThan(1.05);
    expect(camera.sample(0).scale).toBe(1);
    expect(camera.sample(20200).scale).toBeCloseTo(1, 6);
  });

  it.each([0, 25, 586, 1276, 3170])('does not discard an early action at %d ms', (time) => {
    const telemetry = [point(time, 0.5, 0.5), point(time + 3000, 0.6, 0.5, 'mouseup')];
    const zooms = buildAutomaticZoomElements({ telemetry, sessionId: 'take', durationMs: 12000 });
    expect(zooms).toHaveLength(1);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    expect(camera.sample(0).scale).toBe(1);
    expect(camera.sample(time + 1500).scale).toBeGreaterThan(1.2);
    expect(camera.sample(time + 3000).scale).toBeGreaterThan(1.2);
  });
});
