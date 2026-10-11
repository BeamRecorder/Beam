import { describe, expect, it } from 'vitest';
import { HERO_DURATION, HERO_CLICKS, heroPointer, heroSeconds, heroState, heroZooms } from '../src/hero-motion';
import { createZoomTimeEvaluator } from '../../../packages/engine/src/zoom/zoom-playback';

describe('Continuous desktop Instant workflow', () => {
  it.each([-1, NaN, Infinity])('clamps invalid seek %s to the desktop', time => expect(heroSeconds(time)).toBe(0));
  it.each([[0, 0], [6500, 6.5], [24000, 24], [26000, 24]])('seeks %s ms deterministically', (time, seconds) => expect(heroSeconds(time)).toBe(seconds));
  it('opens Beam from its dock before selecting Instant', () => {
    expect(heroState(0)).toMatchObject({ hudOpacity: 0, artworkOpacity: 0, chatOpacity: 0, captureMode: 'studio', dockActive: null });
    expect(heroState(0.8)).toMatchObject({ hudOpacity: 0, dockActive: 'beam' });
    expect(heroState(1.45)).toMatchObject({ hudOpacity: 1, hudScale: 0.65, captureMode: 'studio' });
    expect(heroState(1.8).captureMode).toBe('instant');
  });
  it('previews and selects Nocturne, then previews and selects Sunrise', () => {
    expect(heroState(2.5)).toMatchObject({ menuOpen: true, previewPreset: 0, preset: 'default', menuStart: 2.5 });
    expect(heroState(3.2)).toMatchObject({ menuOpen: true, previewPreset: 1, preset: 'default', previewStart: 3 });
    expect(heroState(3.75)).toMatchObject({ menuOpen: false, preset: 'nocturne' });
    expect(heroState(4.2)).toMatchObject({ menuOpen: true, previewPreset: 0, menuStart: 4.2 });
    expect(heroState(4.9)).toMatchObject({ menuOpen: true, previewPreset: 2, previewStart: 4.6, preset: 'nocturne' });
    for (const t of [5.4, 6, 9, 11.4, 15.5]) expect(heroState(t).preset).toBe('sunrise');
  });
  it('releases the HUD to the dock and keeps the full editor visible', () => {
    expect(heroState(6).hudOpacity).toBe(1);
    expect(heroState(6.325).hudOpacity).toBeCloseTo(0.5);
    expect(heroState(6.75)).toMatchObject({ hudOpacity: 0, artworkOpacity: 1, mediaScale: 0.84, mediaX: 51.2, mediaY: 12 });
    expect(heroState(7).recorderOpacity).toBe(1);
  });
  it('shows export after Stop, then green completion and the copied file', () => {
    expect(heroState(8.99)).toMatchObject({ recording: true, stopped: false, progress: 0 });
    expect(heroState(9)).toMatchObject({ recording: false, stopped: true, progress: 0, completed: false });
    expect(heroState(10.2).progress).toBeCloseTo(0.5);
    expect(heroState(11.399).completed).toBe(false);
    expect(heroState(11.4)).toMatchObject({ completed: true, mascotTime: 0, copied: false });
    expect(heroState(11.9)).toMatchObject({ progress: 1, completed: true, copied: true, statusOpacity: 1 });
  });
  it('switches apps via the dock before pasting and sending the same recording', () => {
    expect(heroState(12.6)).toMatchObject({ dockActive: 'chat', chatOpacity: 0, attachment: 0 });
    expect(heroState(13.45)).toMatchObject({ chatOpacity: 1, chatScale: 0.84, attachment: 0, statusOpacity: 0 });
    expect(heroState(13.45).mediaScale).toBeCloseTo(0.08);
    expect(heroState(14.1).attachment).toBeCloseTo(0.5);
    expect(heroState(14.6)).toMatchObject({ attachment: 1, sent: 0, replies: [0, 0, 0] });
    const draft = heroState(15), sent = heroState(16.85);
    expect(draft.mediaX).toBeCloseTo(draft.chatX + 62 * draft.chatScale);
    expect(draft.mediaY).toBeCloseTo(draft.chatY + 130 * draft.chatScale);
    expect(sent.mediaScale).toBeCloseTo(260 / 640 * sent.chatScale);
    expect(sent.mediaY).toBeCloseTo(sent.chatY + 129 * sent.chatScale);
    expect(sent.replies).toEqual([0, 0, 0]);
  });
  it('holds the pasted draft before sending gently over 850 ms', () => {
    for (const time of [14.55, 15, 15.99]) expect(heroState(time)).toMatchObject({ attachment: 1, sent: 0 });
    expect(heroState(16).sent).toBe(0);
    expect(heroState(16.425).sent).toBeCloseTo(0.5);
    expect(heroState(16.85).sent).toBe(1);
  });
  it.each([17.4, 18.5, 19.6])('reveals reply %s with a full 600 ms entrance', start => {
    const index = [17.4, 18.5, 19.6].indexOf(start);
    expect(heroState(start - 0.001).replies[index]).toBe(0);
    expect(heroState(start + 0.3).replies[index]).toBeCloseTo(0.5);
    expect(heroState(start + 0.601).replies[index]).toBe(1);
  });
  it('scrolls replies and the persistent video as one thread, then holds all three', () => {
    expect(heroState(17.1).chatScroll).toBe(0);
    expect(heroState(17.55).chatScroll).toBeCloseTo(46);
    expect(heroState(20.3).chatScroll).toBe(136);
    for (const time of [18, 19.1, 20.2, 21.5]) {
      const state = heroState(time);
      expect(state.mediaY).toBeCloseTo(state.chatY + (129 - state.chatScroll) * state.chatScale);
    }
    expect(heroState(21.5).replies).toEqual([1, 1, 1]);
  });
  it('minimizes the entire sent attachment with the chat and loops to the same desktop', () => {
    const returning = heroState(22.45);
    expect(returning.chatOpacity).toBeGreaterThan(0);
    expect(returning.chatOpacity).toBeLessThan(1);
    expect(returning.mediaX).toBeCloseTo(returning.chatX + 62 * returning.chatScale);
    expect(returning.artworkOpacity).toBe(returning.chatOpacity);
    expect(heroState(23)).toEqual(heroState(0));
    expect(heroState(HERO_DURATION)).toEqual(heroState(0));
  });
  it.each(HERO_CLICKS)('lands the macOS pointer on its control at $at', click => {
    expect(heroPointer(click.at).x).toBeCloseTo(click.x);
    expect(heroPointer(click.at).y).toBeCloseTo(click.y);
  });
  it('keeps the pointer and native layer synchronized throughout the drag', () => {
    for (const time of [7.2, 7.35, 7.65, 7.8, 8.1]) {
      const state = heroState(time), pointer = heroPointer(time);
      expect(pointer.x - 307.4).toBeCloseTo(26 * 0.84 * state.drag);
      expect(pointer.y - 164.04).toBeCloseTo(16 * 0.84 * state.drag);
    }
  });
  it('returns the pointer to its initial pose before the loop boundary', () => {
    expect(heroPointer(23.8)).toEqual(heroPointer(0));
    expect(heroPointer(24)).toEqual(heroPointer(0));
    for (const time of [-1, 0, 4.5, 11.9, 17.9, 20]) {
      const pointer = heroPointer(time);
      expect(Number.isFinite(pointer.x + pointer.y + pointer.scale)).toBe(true);
    }
  });
  it('uses one gentle native 2D zoom only for the two presets', () => {
    const zooms = heroZooms();
    expect(zooms).toHaveLength(1);
    expect(zooms[0]).toMatchObject({ projection: '2d', effect: 'camera', depth: 1, mode: 'manual', startMs: 1800, endMs: 6000 });
    const camera = createZoomTimeEvaluator(zooms);
    for (const t of [0, 800, 7200, 9000, 12000, 23983, 24000]) expect(camera(t)).toBeNull();
    expect(camera(3200)?.scale).toBeCloseTo(1.25);
    expect(camera(6500)!.scale).toBeLessThan(camera(6000)!.scale);
    expect(zooms).toEqual(heroZooms());
  });
});
