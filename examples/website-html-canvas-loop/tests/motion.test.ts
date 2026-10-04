import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { createMotion } from '../src/motion';
import { cameraZooms } from '../src/camera';
import { seekSeconds, sceneState, TITLE } from '../src/scene-state';

describe('HTML edit state', () => {
  it.each([
    [-100, 0],
    [0, 0],
    [1950, 1.95],
    [12000, 12],
    [20000, 12],
  ])('bounds %s ms to %s', (input, expected) => expect(seekSeconds(input)).toBe(expected));
  it.each([NaN, Infinity, -Infinity])('rejects a non-finite clock %s', (value) =>
    expect(() => seekSeconds(value)).toThrow(TypeError),
  );
  it('types the title but keeps the previous canvas until save', () => {
    expect(sceneState(0).typed).toBe('Hello, HTML.');
    expect(sceneState(1.4).typed).toBe('');
    expect(sceneState(1.7).typed).toBe('Make');
    expect(sceneState(2.9)).toMatchObject({ typed: TITLE, title: 'Hello, HTML.', saved: false });
    expect(sceneState(3.15)).toMatchObject({ typed: TITLE, title: TITLE, saved: true });
  });
  it('synchronizes source and artwork accent at the CSS save boundary', () => {
    expect(sceneState(4.79).accent).toBe('#d7d2c7');
    expect(sceneState(4.8).accent).toBe('#cf4a1d');
    expect(sceneState(11.2)).toEqual(sceneState(0));
    expect(sceneState(12)).toEqual(sceneState(0));
  });
  it('gives each explanatory phase a readable hold and deterministic caret', () => {
    expect(sceneState(3).phase).toBe('Edit the source');
    expect(sceneState(7).phase).toBe('See your canvas update');
    expect(sceneState(9).phase).toBe('Keep the source. Render locally.');
    expect(sceneState(1.55).caret).toBe(true);
    expect(sceneState(1.8).caret).toBe(false);
    expect(sceneState(2.9).caret).toBe(false);
  });
});
describe('native Beam camera', () => {
  it('uses two bounded manual 2D camera zooms with no glass or perspective', () => {
    const zooms = cameraZooms();
    expect(zooms).toHaveLength(2);
    zooms.forEach((zoom) =>
      expect(zoom).toMatchObject({ mode: 'manual', projection: '2d', effect: 'camera', depth: 2, enabled: true }),
    );
    expect(zooms[0]!.endMs).toBeLessThan(zooms[1]!.startMs);
    expect(zooms[1]!.endMs).toBeLessThan(12000);
  });
  it('focuses the actual source and output panels', () => {
    expect(cameraZooms().map((zoom) => zoom.focus.cx)).toEqual([0.3, 0.52]);
  });
  it('returns independent editable zoom records', () => {
    const first = cameraZooms();
    first[0]!.focus.cx = 0.5;
    expect(cameraZooms()[0]!.focus.cx).toBe(0.3);
  });
});
describe('seekable HTML motion', () => {
  let timeline: gsap.core.Timeline;
  const pose = { clock: 0 };
  beforeEach(() => {
    document.body.innerHTML = '<div class="orbit"></div><div class="save-button"></div>';
    timeline = createMotion(pose);
  });
  afterEach(() => {
    timeline.kill();
    document.body.innerHTML = '';
  });
  it('stays paused and maps the exact authored duration', () => {
    expect(timeline.paused()).toBe(true);
    expect(timeline.duration()).toBe(12);
    timeline.seek(12);
    expect(pose.clock).toBe(12);
  });
  it('animates the real HTML orbit and resets under a reverse seek', () => {
    timeline.seek(7.2);
    expect(gsap.getProperty('.orbit', 'rotation')).toBe(180);
    timeline.seek(0);
    expect(gsap.getProperty('.orbit', 'rotation')).toBe(0);
    timeline.seek(6);
    const rotation = gsap.getProperty('.orbit', 'rotation');
    timeline.seek(11);
    timeline.seek(6);
    expect(gsap.getProperty('.orbit', 'rotation')).toBe(rotation);
  });
  it('compresses the save control and lands back at its opening pose', () => {
    timeline.seek(3.14);
    expect(gsap.getProperty('.save-button', 'scaleX')).toBeLessThan(1);
    timeline.seek(12);
    expect(gsap.getProperty('.save-button', 'scaleX')).toBe(1);
    expect(gsap.getProperty('.orbit', 'rotation')).toBe(0);
  });
});
