import type { CaptionStyle, ClipAppearance, VisualClip } from './composition-types';

export const createDefaultCaptionHighlight = (): CaptionStyle['wordHighlight'] => ({
  enabled: false,
  displayMode: 'sentence',
  fill: 'solid',
  color: '#facc15',
  gradient: {
    type: 'linear',
    angle: 90,
    stops: [
      { id: 'highlight-start', position: 0, color: '#facc15', alpha: 1 },
      { id: 'highlight-end', position: 1, color: '#fb7185', alpha: 1 },
    ],
  },
  effect: 'pop',
  intensity: 55,
  inactiveOpacity: 72,
});

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
  fontFamily: 'sans-serif',
  fontWeight: 800,
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#ffffff',
  fontSize,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 4,
  shape: {
    preset: 'rounded',
    radius: 35,
    color: '#000000',
    opacity: 50,
    blur: 8,
    padding: 30,
  },
  outlineColor: '#000000',
  outlineWidth: 6,
  extrusionDepth: 4,
  placement: 'bottom',
  wordHighlight: createDefaultCaptionHighlight(),
});
