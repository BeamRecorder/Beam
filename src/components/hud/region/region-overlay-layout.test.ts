import { describe, expect, it } from 'vitest';
import { magnifierPosition, regionControlPosition } from './region-overlay-layout';

const viewport = { width: 1000, height: 800 };
const region = { x: 0.2, y: 0.3, width: 0.4, height: 0.4 };
const size = { width: 300, height: 36 };
describe('region controls', () => {
  it('anchors dimensions above the top left and actions below the crop', () => {
    expect(regionControlPosition(region, viewport, size, 'top')).toEqual({ left: '200px', bottom: '572px' });
    expect(regionControlPosition(region, viewport, size, 'bottom')).toEqual({ left: '200px', top: '572px' });
  });
  it('moves controls inside at the top and bottom screen edges', () => {
    expect(regionControlPosition({ ...region, y: 0 }, viewport, size, 'top').top).toBe('16px');
    expect(regionControlPosition({ ...region, y: 0.6 }, viewport, size, 'bottom').bottom).toBe('16px');
  });
  it('clamps oversized and right edge controls to a visible inset', () => {
    expect(regionControlPosition({ ...region, x: 0.9 }, viewport, size, 'top').left).toBe('684px');
    expect(regionControlPosition(region, { width: 200, height: 30 }, size, 'bottom')).toEqual({
      left: '16px',
      bottom: '16px',
    });
  });
  it.each([36, 54, 98])('keeps Full screen controls inset for a %s px high row', (height) => {
    const fullScreen = { x: 0, y: 0, width: 1, height: 1 };
    const controls = { width: 710, height };
    expect(regionControlPosition(fullScreen, viewport, controls, 'top')).toEqual({ left: '16px', top: '16px' });
    expect(regionControlPosition(fullScreen, viewport, controls, 'bottom')).toEqual({ left: '16px', bottom: '16px' });
  });
  it('uses the measured width of a translated or large dimension row', () => {
    expect(regionControlPosition({ ...region, x: 0.95 }, viewport, { width: 480, height: 36 }, 'top')).toEqual({
      left: '504px',
      bottom: '572px',
    });
  });
  it('reserves the shadow inset before choosing an outside edge', () => {
    expect(regionControlPosition({ ...region, y: 64 / 800 }, viewport, size, 'top')).toEqual({
      left: '200px',
      bottom: '748px',
    });
    expect(regionControlPosition({ ...region, y: 60 / 800 }, viewport, size, 'top')).toEqual({
      left: '200px',
      top: '72px',
    });
    expect(regionControlPosition({ ...region, y: 0.6 }, viewport, { ...size, height: 400 }, 'bottom').bottom).toBe('16px');
  });
});
describe('magnifier placement', () => {
  it('starts below and to the right of the cursor', () => {
    expect(magnifierPosition({ x: 400, y: 400 }, viewport)).toEqual({ left: '424px', top: '424px' });
  });
  it.each([
    ['nw', '232px', '232px'],
    ['ne', '424px', '232px'],
    ['sw', '232px', '424px'],
    ['se', '424px', '424px'],
  ] as const)('follows the %s resize corner', (handle, left, top) => {
    expect(magnifierPosition({ x: 400, y: 400, handle }, viewport)).toEqual({ left, top });
  });
  it('flips at the bottom right and top left edges', () => {
    expect(magnifierPosition({ x: 995, y: 795 }, viewport)).toEqual({ left: '827px', top: '627px' });
    expect(magnifierPosition({ x: 2, y: 2, handle: 'nw' }, viewport)).toEqual({ left: '26px', top: '26px' });
  });
  it('clamps when neither side has enough space', () => {
    expect(magnifierPosition({ x: 70, y: 70 }, { width: 150, height: 150 })).toEqual({ left: '8px', top: '8px' });
  });
});
