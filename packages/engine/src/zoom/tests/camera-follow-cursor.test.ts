import { describe, expect, it, vi } from 'vitest';
import { cameraFollowLeadMs, createCameraFollowCursor } from '../camera-follow-cursor';
import type { AppliedZoom, ZoomElement, ZoomFocus } from '../zoom-types';
import type { CompositionCameraInputs } from '../composition-camera-types';
import type { CursorTelemetryPoint } from '../../capture/capture-session';

const center = { cx: 0.5, cy: 0.5 };
const element: ZoomElement = {
  id: 'a',
  sessionId: 'take',
  startMs: 0,
  endMs: 5000,
  depth: 3,
  focus: center,
  mode: 'auto',
};
const zoom: AppliedZoom = { elementId: 'a', focus: center, scale: 2, strength: 1, mode: 'auto', tilt: 0 };
const points: CursorTelemetryPoint[] = [
  { timeMs: 0, cx: 0.2, cy: 0.3 },
  { timeMs: 1000, cx: 0.8, cy: 0.7, visible: true },
];
const sampler = (telemetry = points, extra: Partial<CompositionCameraInputs> = {}) =>
  createCameraFollowCursor({ zooms: [element], telemetry, ...extra }, telemetry, () => true);

describe('recorded camera anticipation', () => {
  it.each([0, 0.55, 1])('bounds the lookahead for responsiveness %s', (response) => {
    expect(cameraFollowLeadMs(response)).toBeGreaterThanOrEqual(125);
    expect(cameraFollowLeadMs(response)).toBeLessThanOrEqual(200);
  });
  it('uses a shorter lead for a faster spring', () => {
    expect(cameraFollowLeadMs(0)).toBeGreaterThan(cameraFollowLeadMs(1));
  });
  it('anticipates a recorded continuous movement without extrapolating it', () => {
    const at = sampler();
    const fraction = (500 + cameraFollowLeadMs(0.55)) / 1000;
    expect(at(zoom, 500)).toEqual({
      cx: expect.closeTo(0.2 + 0.6 * fraction, 12),
      cy: expect.closeTo(0.3 + 0.4 * fraction, 12),
    });
    expect(at(zoom, 2000)).toEqual({ cx: 0.8, cy: 0.7 });
  });
  it.each([{ telemetry: [] }, { telemetry: [{ timeMs: 0, ...center, visible: false }] }])(
    'holds when no visible sample exists: %j',
    ({ telemetry }) => {
      expect(sampler(telemetry)(zoom, 100)).toBeNull();
    },
  );
  it('honors the first recorded action gate before looking ahead', () => {
    const gate = vi.fn(() => false);
    const at = createCameraFollowCursor({ zooms: [element], telemetry: points }, points, gate);
    expect(at(zoom, 500)).toBeNull();
    expect(gate).toHaveBeenCalledWith('a', 500);
  });
  it('holds a quiet pointer exactly', () => {
    const at = sampler([
      { timeMs: 0, ...center },
      { timeMs: 1000, ...center },
    ]);
    expect(at(zoom, 500)).toEqual(center);
  });
  it('uses the first visible sample before recording data begins', () => {
    expect(sampler([{ timeMs: 1000, ...center }])(zoom, 0)).toEqual(center);
  });
  it('does not reveal a hidden first sample early', () => {
    expect(sampler([{ timeMs: 1000, ...center, visible: false }])(zoom, 0)).toBeNull();
  });
  it('handles repeated timestamps without division by zero', () => {
    expect(
      sampler([
        { timeMs: 0, ...center },
        { timeMs: 0, cx: 0.6, cy: 0.4 },
      ])(zoom, 0),
    ).toEqual({ cx: 0.6, cy: 0.4 });
  });
  it('never interpolates toward hidden sentinel coordinates', () => {
    const telemetry = [
      { timeMs: 0, ...center },
      { timeMs: 1000, cx: -1000, cy: -1000, visible: false },
    ];
    expect(sampler(telemetry)(zoom, 950)).toEqual(center);
  });
  it('does not anticipate through hide/show boundaries even when the future endpoint is visible', () => {
    const telemetry = [
      { timeMs: 0, ...center },
      { timeMs: 500, cx: 0.6, cy: 0.4 },
      { timeMs: 550, cx: -1, cy: -1, visible: false },
      { timeMs: 560, cx: 0.9, cy: 0.1, visible: true },
    ];
    const at = sampler(telemetry);
    expect(at(zoom, 450)).toEqual({ cx: 0.6, cy: 0.4 });
    expect(at(zoom, 550)).toBeNull();
    expect(at(zoom, 560)).toEqual({ cx: 0.9, cy: 0.1 });
  });
  it('keeps a hidden cursor hidden until the actual show timestamp', () => {
    const at = sampler([
      { timeMs: 0, ...center, visible: false },
      { timeMs: 1000, ...center },
    ]);
    expect(at(zoom, 950)).toBeNull();
    expect(at(zoom, 1000)).toEqual(center);
  });
  it('does not cross an outgoing hold into the next action', () => {
    const at = sampler(points, { zooms: [{ ...element, endMs: 600 }] });
    expect(at(zoom, 550)).toEqual({ cx: 0.56, cy: expect.closeTo(0.54, 12) });
    expect(at(zoom, 750)).toEqual({ cx: expect.closeTo(0.65, 12), cy: expect.closeTo(0.6, 12) });
  });
  it('does not cross a screen edit or source-clock jump', () => {
    const at = sampler(points, {
      followEndMsAt: () => 600,
      mapTelemetryTime: (time) => (time < 600 ? time : time + 10000),
    });
    expect(at(zoom, 550)).toEqual({ cx: expect.closeTo(0.5599994, 12), cy: expect.closeTo(0.5399996, 12) });
  });
  it('does not predict backward when a source clock returns an earlier time', () => {
    const at = sampler(points, { mapTelemetryTime: (time) => (time <= 500 ? time : 0) });
    expect(at(zoom, 500)).toEqual(center);
  });
  it('applies trim and playback rate on both ends of the prediction', () => {
    const at = sampler(points, { mapTelemetryTime: (time) => 200 + time * 2 });
    const fraction = (200 + (100 + cameraFollowLeadMs(0.55)) * 2) / 1000;
    expect(at(zoom, 100)).toEqual({
      cx: expect.closeTo(0.2 + 0.6 * fraction, 12),
      cy: expect.closeTo(0.3 + 0.4 * fraction, 12),
    });
  });
  it('maps predicted source coordinates using current geometry, without anticipating a clip transform', () => {
    const mapFocus = vi.fn((focus: ZoomFocus) => ({ cx: focus.cx / 2, cy: focus.cy / 2 }));
    const at = sampler(points, { mapFocus });
    const result = at(zoom, 500)!;
    expect(result.cx).toBeGreaterThan(0.25);
    expect(mapFocus).toHaveBeenCalledWith(expect.any(Object), zoom, 500);
  });
  it.each([undefined, 'unknown'])('works without a known hold identity: %s', (elementId) => {
    expect(sampler()({ ...zoom, elementId }, 500)!.cx).toBeGreaterThan(0.5);
  });
  it('normalizes invalid optional response settings at the factory boundary', () => {
    expect(
      sampler(points, { autoFollow: { responsiveness: NaN, safeZone: 0.5, directionLock: true } })(zoom, 500)!.cx,
    ).toBeGreaterThan(0.5);
  });
});
