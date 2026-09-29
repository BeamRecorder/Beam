import type { Effects, Title } from './editorTypes';
export const defaultEffects: Effects = {
  opacity: 1, volume: 1, brightness: 0, saturation: 1, scale: 1,
  x: 0.5, y: 0.5, autoZoom: true, fadeInMs: 0, fadeOutMs: 0,
};
export const defaultTitle: Title = {
  text: 'Title', font: 'Sans', bold: false, italic: false,
  size: 6.6, color: 0xffffffff, shadow: true, background: false,
};
