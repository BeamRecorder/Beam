import { expect, it } from 'vitest';
import { safariFramePalette } from './safari-frame-palette';

it.each(['#000000', '#121212', '#123456', '#ffffff00'])('derives Auto from the frame RGB color %s', (color) => {
  const palette = safariFramePalette(color);
  expect(palette.address).toBe(color === '#ffffff00' ? '#f7f7f7' : '#303030');
});
it.each(['#ffffff', '#c0c0c0', '#FFFF00'])('keeps a bright frame address field light in Auto: %s', (color) => {
  expect(safariFramePalette(color).text).toBe('#565656');
});
it('keeps explicit Light and Dark modes independent of the chosen frame color', () => {
  expect(safariFramePalette('#000000', 'light').address).toBe('#f7f7f7');
  expect(safariFramePalette('#ffffff', 'dark').address).toBe('#303030');
  expect(safariFramePalette('#ff7733', 'dark').text).toBe('#e5e5e5');
});
it.each([
  { color: '#ffffff', theme: 'dark' as const, icons: 'rgba(75, 75, 75, .93)' },
  { color: '#000000', theme: 'light' as const, icons: 'rgba(235, 235, 235, .93)' },
])('keeps toolbar icons readable on $color with a $theme address field', ({ color, theme, icons }) => {
  expect(safariFramePalette(color, theme).icons).toBe(icons);
});
it.each(['invalid', '#123', '#123456zz'])('rejects an invalid frame color in Auto: %s', (color) => {
  expect(() => safariFramePalette(color)).toThrow('Invalid Safari frame color');
});
