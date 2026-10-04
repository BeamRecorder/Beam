import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { createTimeline } from '../src/timeline';

beforeEach(() => {
  const html = readFileSync('index.html', 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
});
afterEach(() => gsap.globalTimeline.clear());

describe('Ai-Native choreography', () => {
  it('has a paused, finite 15-second clock with real reference imagery', () => {
    const timeline = createTimeline();
    expect(timeline.paused()).toBe(true);
    expect(timeline.duration()).toBe(15);
    expect(document.querySelectorAll('.official-plate')).toHaveLength(3);
    expect(timeline.getChildren().every((tween) => tween.repeat() !== -1)).toBe(true);
  });
  it('keeps the exact same official interfaces through the question and analysis', () => {
    const timeline = createTimeline();
    const devices = [...document.querySelectorAll('.device')];
    timeline.time(5);
    expect(Number(gsap.getProperty('#question', 'opacity'))).toBe(1);
    timeline.time(8.5);
    expect(Number(gsap.getProperty('#insight', 'opacity'))).toBe(1);
    expect([...document.querySelectorAll('.device')]).toEqual(devices);
  });
  it('returns to identical poses after backward seeks, including the first and last frames', () => {
    const timeline = createTimeline();
    for (const timestamp of [0, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5, 15]) {
      timeline.time(timestamp);
      const pose = document.body.innerHTML;
      timeline.time(timestamp === 15 ? 0 : 15);
      timeline.time(timestamp);
      expect(document.body.innerHTML).toBe(pose);
    }
  });
});
