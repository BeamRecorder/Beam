import type { TransitionCategory } from './transition-catalog-types';

/** Gallery organization never changes the persisted identities of existing presets. */
export const TRANSITION_CATEGORIES = [
  {
    id: 'basics',
    labelKey: 'categoryBasics',
    presets: [
      { id: 'fade', labelKey: 'crossfade', preset: { kind: 'fade' } },
      { id: 'fade-black', labelKey: 'fadeBlack', preset: { kind: 'fade-black' } },
      { id: 'fade-white', labelKey: 'fadeWhite', preset: { kind: 'fade-white' } },
      { id: 'dip-color', labelKey: 'dipColor', preset: { kind: 'dip-color', color: '#202024' } },
    ],
  },
  {
    id: 'zooms',
    labelKey: 'categoryZooms',
    presets: [
      { id: 'zoom-in', labelKey: 'zoomIn', preset: { kind: 'zoom', direction: 'in' } },
      { id: 'zoom-out', labelKey: 'zoomOut', preset: { kind: 'zoom', direction: 'out' } },
      { id: 'cross-zoom', labelKey: 'crossZoom', preset: { kind: 'cross-zoom' } },
      { id: 'zoom-bounce', labelKey: 'zoomBounce', preset: { kind: 'zoom-bounce' } },
    ],
  },
  {
    id: 'panels',
    labelKey: 'categoryPanels',
    presets: [
      { id: 'split', labelKey: 'split', preset: { kind: 'split' } },
      { id: 'push-panels', labelKey: 'pushPanels', preset: { kind: 'push-panels' } },
      { id: 'sliding-panels', labelKey: 'slidingPanels', preset: { kind: 'sliding-panels' } },
    ],
  },
  {
    id: 'shapes',
    labelKey: 'categoryShapes',
    presets: [
      { id: 'circle-reveal', labelKey: 'circleReveal', preset: { kind: 'circle-reveal' } },
      { id: 'diamond-wipe', labelKey: 'diamondWipe', preset: { kind: 'diamond-wipe' } },
      { id: 'linear-wipe', labelKey: 'linearWipe', preset: { kind: 'linear-wipe' } },
    ],
  },
  {
    id: 'color',
    labelKey: 'categoryColor',
    presets: [
      { id: 'color-fade', labelKey: 'colorFade', preset: { kind: 'color-fade', color: '#777777' } },
      { id: 'gradient-wipe', labelKey: 'gradientWipe', preset: { kind: 'gradient-wipe' } },
      { id: 'color-flash', labelKey: 'colorFlash', preset: { kind: 'color-flash', color: '#ffffff' } },
    ],
  },
  {
    id: 'dynamic',
    labelKey: 'categoryDynamic',
    presets: [
      { id: 'whip-pan', labelKey: 'whipPan', preset: { kind: 'whip-pan' } },
      { id: 'slide-left', labelKey: 'slideLeft', preset: { kind: 'slide', direction: 'left' } },
      { id: 'slide-right', labelKey: 'slideRight', preset: { kind: 'slide', direction: 'right' } },
      { id: 'slide-up', labelKey: 'slideUp', preset: { kind: 'slide', direction: 'up' } },
      { id: 'slide-down', labelKey: 'slideDown', preset: { kind: 'slide', direction: 'down' } },
      { id: 'push', labelKey: 'push', preset: { kind: 'push' } },
      { id: 'camera-shake', labelKey: 'cameraShake', preset: { kind: 'camera-shake' } },
      { id: 'blur', labelKey: 'blur', preset: { kind: 'blur' } },
    ],
  },
  {
    id: 'digital',
    labelKey: 'categoryDigital',
    presets: [
      { id: 'rgb-split', labelKey: 'rgbSplit', preset: { kind: 'rgb-split' } },
      { id: 'digital-glitch', labelKey: 'digitalGlitch', preset: { kind: 'digital-glitch' } },
      { id: 'pixel-blocks', labelKey: 'pixelBlocks', preset: { kind: 'pixel-blocks' } },
    ],
  },
] as const satisfies readonly TransitionCategory[];
