import type { CaptionStyle, ClipAppearance, VisualClip } from './composition-types';

export const createDefaultClipAppearance = (kind: VisualClip['kind'], showBackground = false): ClipAppearance => ({
  cornerRadius: kind === 'screen' ? (showBackground ? 'md' : 'none') : 'sm',
  shadowSize: 'md',
  shadowBlur: kind === 'screen' ? 40 : 20,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: kind === 'screen' ? 'bottom' : 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
});

export const createDefaultCaptionStyle = (fontSize = 42): CaptionStyle => ({
  color: '#ffffff',
  fontSize,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 4,
  backdropBlur: 0,
  outlineColor: '#000000',
  outlineWidth: 6,
  extrusionDepth: 4,
  placement: 'bottom',
});
