import { describe, expect, it } from 'vitest';
import { durationSeconds, renderCommand, renderState, seekSeconds } from '../src/scene-state';

describe('Composition clock', () => {
  it.each([NaN, Infinity, -Infinity])('rejects invalid seek %s', (time) =>
    expect(() => seekSeconds(time)).toThrow(RangeError),
  );
  it.each([
    [-1, 0],
    [0, 0],
    [2100, 2.1],
    [8000, 8],
    [9000, 8],
  ])('clamps %s ms to %s seconds', (input, expected) => expect(seekSeconds(input)).toBe(expected));
  it('matches the declared loop duration', () => expect(durationSeconds).toBe(8));
});

describe('Local rendering choreography', () => {
  it.each([NaN, Infinity, -Infinity])('rejects invalid clock %s', (time) =>
    expect(() => renderState(time)).toThrow(RangeError),
  );
  it.each([-2, 0, 0.499])('stays empty before the command starts at %s', (time) => {
    expect(renderState(time)).toMatchObject({
      typed: '',
      caret: false,
      phase: 'idle',
      progress: 0,
      percentage: 0,
      frame: 0,
    });
  });
  it('types exactly one valid motion command before rendering begins', () => {
    expect(renderState(1.9).typed).toBe(renderCommand);
    expect(renderCommand).toBe('beam-cli motion scene.json output.mp4');
    expect(renderState(1.9).phase).toBe('idle');
    expect(renderState(1.9).caret).toBe(false);
  });
  it('reveals command characters progressively', () => {
    const first = renderState(0.9).typed;
    const next = renderState(1.2).typed;
    expect(first.length).toBeGreaterThan(0);
    expect(next.startsWith(first)).toBe(true);
    expect(next.length).toBeLessThan(renderCommand.length);
  });
  it('has seekable caret phases only while typing', () => {
    expect(renderState(0.5).caret).toBe(true);
    expect(renderState(0.72).caret).toBe(false);
    expect(renderState(2.1).caret).toBe(false);
  });
  it.each([
    [2.1, 'rendering'],
    [3.8, 'rendering'],
    [5.599, 'rendering'],
    [5.6, 'finalizing'],
    [5.999, 'finalizing'],
    [6, 'saved'],
    [7.2, 'saved'],
  ] as const)('shows %s as %s', (time, phase) => expect(renderState(time).phase).toBe(phase));
  it('never declares success until the file has finalized', () => {
    expect(renderState(5.6)).toMatchObject({ progress: 1, percentage: 100, frame: 6, phase: 'finalizing' });
    expect(renderState(6)).toMatchObject({ progress: 1, percentage: 100, frame: 6, phase: 'saved' });
  });
  it('advances bounded progress and frame count while rendering', () => {
    const states = [2.1, 3, 4, 5, 5.6].map(renderState);
    expect(states[0]!.percentage).toBe(0);
    expect(states.at(-1)!.percentage).toBe(100);
    for (let index = 1; index < states.length; index++) {
      expect(states[index]!.progress).toBeGreaterThan(states[index - 1]!.progress);
      expect(states[index]!.frame).toBeGreaterThanOrEqual(states[index - 1]!.frame);
      expect(states[index]!.frame).toBeLessThanOrEqual(6);
    }
  });
  it('returns the same state after reverse seeks', () => {
    const first = renderState(3.2);
    renderState(7.2);
    renderState(0);
    expect(renderState(3.2)).toEqual(first);
  });
  it.each([7.8, 8, 100])('resets at the closed loop boundary %s', (time) =>
    expect(renderState(time)).toEqual(renderState(0)),
  );
});
