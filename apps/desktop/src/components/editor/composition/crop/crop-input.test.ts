import { expect, it } from 'vitest';
import { cropPixels } from '@beam/engine/layout/crop/crop-pixels';
import { changeCropInput, cropInputSize, cropInputValue } from './crop-input';
import type { CropField } from './crop-types';

const pixels = { left: 10, right: 20, top: 8, bottom: 16, width: 70, height: 56 };
it('recovers original source dimensions from the retained rectangle and all four edges', () => {
  expect(cropInputSize(pixels)).toEqual({ width: 100, height: 80 });
  expect(cropInputSize({ left: 0, right: 0, top: 0, bottom: 0, width: 1, height: 1 })).toEqual({ width: 1, height: 1 });
});
it.each(['top', 'bottom', 'left', 'right', 'width', 'height'] as CropField[])(
  'edits %s in px and percent with identical source pixels',
  (field) => {
    const axis = ['left', 'right', 'width'].includes(field) ? 100 : 80;
    const px = changeCropInput(pixels, field, '12', 'px'),
      percent = changeCropInput(pixels, field, (12 * 100) / axis, '%');
    expect(px).toEqual(percent);
    expect(cropPixels(px!, cropInputSize(pixels))[field]).toBe(12);
    expect(cropInputValue(pixels, field, 'px')).toBe(pixels[field]);
  },
);
it('clamps edges and dimensions to valid source pixels without collapsing the crop', () => {
  expect(cropPixels(changeCropInput(pixels, 'left', 500, '%')!, cropInputSize(pixels)).width).toBe(1);
  expect(cropPixels(changeCropInput(pixels, 'height', 0, 'px')!, cropInputSize(pixels)).height).toBe(1);
  expect(cropPixels(changeCropInput(pixels, 'width', 200, '%')!, cropInputSize(pixels)).right).toBe(0);
});
it.each(['', ' ', 'invalid', NaN, Infinity])('ignores invalid or empty input %s', (value) => {
  expect(changeCropInput(pixels, 'left', value, 'px')).toBeNull();
});
it('does not recrop an unchanged rounded percentage of a single source pixel', () => {
  const value = { ...pixels, left: 1, width: 16363 };
  expect(cropInputValue(value, 'left', '%')).toBe(0.01);
  expect(changeCropInput(value, 'left', 0.01, '%')).toBeNull();
  expect(changeCropInput(pixels, 'left', 10, 'px')).toBeNull();
});
