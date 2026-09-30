import { expect, it } from 'vitest';
import { rulerTicks, timelineBands, timelineTime, timelineZoom, TIMELINE_MARGIN } from './viewportModel';

it('leaves time before zero visible and maps pixel positions at every zoom', () => {
  for (const pixels of [8, 80, 300]) {
    expect(timelineTime(0, pixels)).toBeLessThan(0);
    expect(timelineTime(TIMELINE_MARGIN, pixels)).toBe(0);
    expect(timelineTime(TIMELINE_MARGIN + pixels, pixels)).toBe(1000);
  }
});
it('draws different subdivisions, a zero label and only viewport ticks', () => {
  const ticks = rulerTicks(0, 1200, 80);
  expect(new Set(ticks.map(tick => tick.height))).toEqual(new Set([4, 8, 12]));
  expect(ticks.find(tick => tick.timeMs === 0)).toMatchObject({ x: TIMELINE_MARGIN, label: '00:00', height: 12 });
  expect(ticks[0].timeMs).toBeLessThan(0);
  expect(ticks.length).toBeLessThan(200);
});
it('keeps band parity anchored while scrolling, including negative time', () => {
  const a = timelineBands(rulerTicks(-160, 1500, 80));
  const b = timelineBands(rulerTicks(800, 1500, 80));
  for (const band of b.filter(band => a.some(other => other.x === band.x))) {
    expect(a.find(other => other.x === band.x)).toEqual(band);
  }
  expect(a.every((band, index) => !index || band.alternate !== a[index - 1].alternate)).toBe(true);
  expect(timelineBands([])).toEqual([]);
  expect(timelineBands([rulerTicks(0, 100, 80)[0]])).toEqual([]);
});
it('rejects invalid geometry and bounds the work even at extreme viewport sizes', () => {
  for (const input of [[NaN, 100, 80], [0, 0, 80], [0, 100, 0], [0, Infinity, 80], [0, -100, 80]]) {
    expect(rulerTicks(...input as [number, number, number])).toEqual([]);
  }
  expect(rulerTicks(0, 1e9, 80)).toHaveLength(512);
});
it('bounds zoom and supports fractional trackpad movement', () => {
  expect(timelineZoom(300, 1)).toBe(300);
  expect(timelineZoom(8, -1)).toBe(8);
  expect(timelineZoom(80, 0.2)).toBeGreaterThan(80);
  expect(timelineZoom(80, -1)).toBeLessThan(80);
  expect(timelineZoom(80, 100)).toBe(timelineZoom(80, 1));
  expect(timelineZoom(NaN, 1)).toBe(80);
  expect(timelineZoom(80, Infinity)).toBe(80);
  expect(timelineZoom(80, 0)).toBe(80);
});
