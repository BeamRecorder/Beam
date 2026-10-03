import { afterEach, expect, it, vi } from 'vitest';
import { timelineSurfacePalette } from '../timeline-surface-palette';

afterEach(() => vi.restoreAllMocks());
const element = document.createElement('canvas');
const style = (values: Record<string, string>) =>
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (key: string) => values[key] ?? ` ${key} `,
  } as CSSStyleDeclaration);

it('reads each timeline role and readable foreground from the host theme', () => {
  style({});
  expect(timelineSurfacePalette(element)).toMatchObject({
    video: '--color-timeline-video',
    image: '--color-timeline-image',
    shape: '--color-timeline-shape',
    audio: '--color-timeline-audio',
    zoom: '--color-timeline-zoom',
    annotation: '--color-timeline-caption',
    blur: '--color-timeline-blur',
    highlight: '--color-timeline-highlight',
    itemText: '--color-timeline-item-text',
    text: '--text-primary',
    labelText: '--color-timeline-media-label-text',
  });
});
it('parses radius, saturation and disabled alpha without category-specific heights', () => {
  style({ '--radius-sm': '6px', '--timeline-item-tint': '100%', '--timeline-disabled-opacity': '0.45' });
  const palette = timelineSurfacePalette(element);
  expect(palette).toMatchObject({ radius: 6, tint: 1, disabledOpacity: 0.45 });
  expect(palette).not.toHaveProperty('effectHeight');
  expect(palette).not.toHaveProperty('effectInset');
});
it('refreshes colors from the current host surface rather than retaining the first theme', () => {
  const computed = style({ '--color-timeline-zoom': '#8d2467' });
  expect(timelineSurfacePalette(element).zoom).toBe('#8d2467');
  computed.mockReturnValue({ getPropertyValue: () => '#7b1e5a' } as unknown as CSSStyleDeclaration);
  expect(timelineSurfacePalette(element).zoom).toBe('#7b1e5a');
});
