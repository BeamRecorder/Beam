import type { TimelineCanvasPalette } from '@beam/runtime/timeline/timeline-canvas-types';

export function timelineSurfacePalette(element: HTMLElement): TimelineCanvasPalette {
  const style = getComputedStyle(element);
  const color = (key: string) => style.getPropertyValue(key).trim();
  return {
    background: color('--color-bg-field'),
    text: color('--text-primary'),
    border: color('--color-timeline-item-border'),
    selected: color('--color-timeline-selection'),
    video: color('--color-track-video'),
    annotation: color('--color-track-annotation'),
    blur: color('--color-track-blur'),
    audio: color('--color-track-audio'),
    zoom: color('--color-track-cursor'),
    highlight: color('--color-track-annotation'),
    labelBackground: color('--color-timeline-media-label'),
    labelText: color('--color-timeline-media-label-text'),
    curve: color('--text-secondary'),
    radius: parseFloat(color('--radius-sm')),
    effectInset: parseFloat(color('--timeline-effect-item-inset')),
    effectHeight: parseFloat(color('--timeline-effect-item-height')),
    tint: parseFloat(color('--timeline-item-tint')) / 100,
    disabledOpacity: Number(color('--timeline-disabled-opacity')),
  };
}
