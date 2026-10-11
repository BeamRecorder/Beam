import { describe, expect, it } from 'vitest';
import { commands } from '../src/commands';
import { commandState, seekSeconds } from '../src/scene-state';

describe('composition seek clock', () => {
  it.each([
    [0, 0],
    [1800, 1.8],
    [7000, 7],
    [-1, 0],
    [8000, 7],
  ])('maps %s ms to %s seconds', (input, seconds) => {
    expect(seekSeconds(input)).toBe(seconds);
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite seek time %s', (input) => {
    expect(() => seekSeconds(input)).toThrow('Seek time must be finite');
  });
});

describe.each(commands)('$command frontier', (cue) => {
  it('holds an empty row before its cue', () => {
    expect(commandState(cue, cue.start - 0.01)).toEqual({ typed: '', caret: false, complete: false, visible: false });
  });
  it('keeps the caret exactly at the character frontier', () => {
    const state = commandState(cue, cue.start + 0.1);
    expect(state.typed.length).toBeGreaterThan(0);
    expect(cue.command.startsWith(state.typed)).toBe(true);
    expect(state.caret).toBe(true);
    expect(state.complete).toBe(false);
    expect(state.visible).toBe(true);
    expect(commandState(cue, cue.start + 0.25).caret).toBe(false);
  });
  it('keeps the full submitted command without a caret', () => {
    expect(commandState(cue, cue.end)).toEqual({ typed: cue.command, caret: false, complete: true, visible: true });
    expect(commandState(cue, 6.4).typed).toBe(cue.command);
  });
  it('resets behind the fade and closes the loop', () => {
    expect(commandState(cue, 6.75)).toEqual(commandState(cue, 0));
    expect(commandState(cue, 7)).toEqual(commandState(cue, 0));
  });
});
