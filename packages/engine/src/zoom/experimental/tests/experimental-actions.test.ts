// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExperimentalPoint } from '../experimental-zoom-types';
import type { CursorButtonEvent } from '../../../capture/capture-session';
import { experimentalTelemetry } from '../experimental-zoom-actions';

const point = (
  timeMs = 1000,
  cx = 0.5,
  cy = 0.5,
  interactionType: ExperimentalPoint['interactionType'] = 'click',
  mouseButton?: number,
): ExperimentalPoint => ({ timeMs, cx, cy, interactionType, ...(mouseButton ? { mouseButton } : {}) });
const button = (pressed: boolean, identity = 1): CursorButtonEvent => ({
  event: 'button',
  sessionNs: 1000_000_000,
  button: identity,
  pressed,
  normalizedX: 0.5,
  normalizedY: 0.5,
});
describe('experimental button journal adaptation', () => {
  it('enriches simultaneous buttons once each without changing the journal', () => {
    const events = [
      button(true, 1),
      button(true, 2),
      button(false, 1),
      { event: 'visibility' as const, sessionNs: 1000_000_000, visible: false },
    ];
    const telemetry = [
      point(),
      point(1000, 0.5, 0.5, 'right-click'),
      point(1000, 0.5, 0.5, 'mouseup'),
      point(1000, 0.5, 0.5, 'move'),
      point(1000, 0.5, 0.5, 'click', 3),
      point(1001),
    ];
    const before = structuredClone({ events, telemetry });
    expect(experimentalTelemetry(telemetry, events).map((p) => p.mouseButton)).toEqual([
      1,
      2,
      1,
      undefined,
      3,
      undefined,
    ]);
    expect({ events, telemetry }).toEqual(before);
    expect(experimentalTelemetry(telemetry)).toEqual(telemetry);
  });
  it('requires matching timestamp, position and transition when enriching', () => {
    expect(
      experimentalTelemetry([point(1000, 0.6, 0.5), point(1000, 0.5, 0.5, 'mouseup')], [button(true)]).every(
        (p) => p.mouseButton === undefined,
      ),
    ).toBe(true);
    expect(experimentalTelemetry([], [])).toEqual([]);
  });
});
