import type { TimelineCanvasPalette } from '@beam/runtime/timeline/timeline-canvas-types';

export function timelineSurfacePalette(element: HTMLElement): TimelineCanvasPalette {
  const style = getComputedStyle(element);
  const color = (key: string) => style.getPropertyValue(key).trim();
  return {
    background: color('--color-bg-field'),
    text: color('--text-primary'),
    itemText: color('--color-timeline-item-text'),
    border: color('--color-timeline-item-border'),
    selected: color('--color-timeline-selection'),
    video: color('--color-timeline-video'),
    image: color('--color-timeline-image'),
    shape: color('--color-timeline-shape'),
    annotation: color('--color-timeline-caption'),
    blur: color('--color-timeline-blur'),
    audio: color('--color-timeline-audio'),
    zoom: color('--color-timeline-zoom'),
    highlight: color('--color-timeline-highlight'),
    labelBackground: color('--color-timeline-media-label'),
    labelText: color('--color-timeline-media-label-text'),
    curve: color('--text-secondary'),
    radius: parseFloat(color('--radius-sm')),
    tint: parseFloat(color('--timeline-item-tint')) / 100,
    disabledOpacity: Number(color('--timeline-disabled-opacity')),
  };
}
