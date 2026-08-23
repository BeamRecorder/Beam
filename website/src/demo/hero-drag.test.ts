import { describe, expect, it } from 'vitest';
import { heroDragFrame, HERO_CURSOR_HOTSPOTS, HERO_DRAG_DURATION_MS, clamp01 } from './hero-drag';

describe('heroDragFrame', () => {
  it('keeps the player at rest before the entrance choreography starts', () => {
    const frame = heroDragFrame(0);

    expect(frame.cursorKind).toBeNull();
    expect(frame.cursorOpacity).toBe(0);
    expect(frame.playerTranslateY).toBe(0);
    expect(frame.playerScale).toBe(1);
  });

  it('slides the pointer from the copy side onto the player', () => {
    const frame = heroDragFrame(0.25);

    expect(frame.cursorKind).toBe('pointer');
    expect(frame.cursorOpacity).toBe(1);
    expect(frame.cursorX).toBeGreaterThan(-6);
    expect(frame.cursorX).toBeLessThan(50);
    expect(frame.cursorY).toBeGreaterThan(46);
    expect(frame.cursorY).toBeLessThan(50);
    expect(frame.playerTranslateY).toBe(0);
  });

  it('hovers with the open hand before grabbing', () => {
    expect(heroDragFrame(0.45).cursorKind).toBe('hand');
    expect(heroDragFrame(0.45).cursorOpacity).toBe(1);
  });

  it('drags the player downward with the grabbing hand', () => {
    const early = heroDragFrame(0.6);
    const mid = heroDragFrame(0.72);
    const late = heroDragFrame(0.84);

    expect(early.cursorKind).toBe('grabbing');
    expect(early.playerTranslateY).toBeGreaterThan(0);
    expect(early.playerScale).toBeLessThan(1);
    expect(mid.playerTranslateY).toBeGreaterThan(early.playerTranslateY);
    expect(late.playerTranslateY).toBeGreaterThan(mid.playerTranslateY);
    expect(late.playerScale).toBeLessThan(mid.playerScale);
  });

  it('keeps the cursor attached to the dragged player and releases it', () => {
    const held = heroDragFrame(0.9);

    expect(held.cursorKind).toBe('grabbing');
    expect(held.cursorOpacity).toBeGreaterThan(0.01);
    expect(held.playerTranslateY).toBeCloseTo(34, 0);
    expect(held.cursorY).toBeCloseTo(50 + 34, 0);

    const released = heroDragFrame(0.96);
    expect(released.cursorKind).toBeNull();
    expect(released.cursorOpacity).toBe(0);
  });

  it('springs the player back to rest at the end', () => {
    const frame = heroDragFrame(1);

    expect(frame.cursorKind).toBeNull();
    expect(frame.cursorOpacity).toBe(0);
    expect(frame.playerTranslateY).toBe(0);
    expect(frame.playerScale).toBe(1);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(heroDragFrame(-1)).toEqual(heroDragFrame(0));
    expect(heroDragFrame(2)).toEqual(heroDragFrame(1));
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });

  it('keeps the drag monotonic once it starts', () => {
    const samples = [0.56, 0.6, 0.7, 0.8, 0.86].map((p) => heroDragFrame(p).playerTranslateY);

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });

  it('exposes a positive duration and macOS cursor hotspots for every kind', () => {
    expect(HERO_DRAG_DURATION_MS).toBeGreaterThan(0);
    expect(HERO_CURSOR_HOTSPOTS.pointer.x).toBeLessThan(16);
    expect(HERO_CURSOR_HOTSPOTS.hand).toEqual({ x: 16, y: 16 });
    expect(HERO_CURSOR_HOTSPOTS.grabbing).toEqual({ x: 16, y: 16 });
  });
});
