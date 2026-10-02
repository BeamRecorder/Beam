import { describe, expect, it, vi } from 'vitest';
import { readPickerPoint } from '../color-picker-geometry';
import { drawColorTriangle } from '../color-picker-canvas';
const element = (width = 160, height = 160) => {
  const node = document.createElement('div');
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width,
    height,
  } as DOMRect);
  return node;
};
describe('color picker geometry', () => {
  it('keeps unbounded relative coordinates for mouse dragging outside a hue ring', () => {
    expect(readPickerPoint(new MouseEvent('mousemove', { clientX: 200, clientY: 0 }), element())).toEqual({
      x: 190,
      y: -20,
      width: 160,
      height: 160,
    });
  });
  it('uses the first touch and safely ignores empty touch lists', () => {
    const event = new Event('touchmove');
    Object.defineProperty(event, 'touches', {
      configurable: true,
      value: [{ clientX: 30, clientY: 60 }],
    });
    expect(readPickerPoint(event as TouchEvent, element())).toEqual({
      x: 20,
      y: 40,
      width: 160,
      height: 160,
    });
    Object.defineProperty(event, 'touches', { value: [] });
    expect(readPickerPoint(event as TouchEvent, element())).toBeNull();
  });
  it('ignores detached, hidden and empty interaction surfaces', () => {
    const event = new MouseEvent('mousemove');
    expect(readPickerPoint(event, null)).toBeNull();
    expect(readPickerPoint(event, element(0))).toBeNull();
    expect(readPickerPoint(event, element(160, 0))).toBeNull();
  });
  it('does not draw before a canvas exists', () => {
    expect(() => drawColorTriangle(null, '#000000')).not.toThrow();
  });
  it('does not draw when a canvas context is unavailable', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(() => drawColorTriangle(canvas, '#000000')).not.toThrow();
  });
  it('clips and restores a triangle filled with the requested hue', () => {
    const stops = vi.fn();
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: stops })),
      fillStyle: '',
      globalAlpha: 1,
    };
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as never);
    drawColorTriangle(canvas, '#123456');
    expect(stops).toHaveBeenCalledWith(0, '#123456');
    expect(context.clip).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalledTimes(2);
  });
});
