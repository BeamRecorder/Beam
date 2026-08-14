import type { CursorClickEffects, CursorMotionSettings } from './cursor-settings';

export const CURSOR_TYPES = [
  'automatic',
  'default',
  'beachball',
  'busy',
  'cell',
  'contextualmenu',
  'copy',
  'cross',
  'handgrabbing',
  'handopen',
  'handpointing',
  'help',
  'makealias',
  'move',
  'notallowed',
  'poof',
  'resizenorth',
  'resizenortheast',
  'resizenortheastsouthwest',
  'resizenorthsouth',
  'resizenorthwest',
  'resizenorthwestsoutheast',
  'resizeright',
  'resizesouth',
  'resizesoutheast',
  'resizesouthwest',
  'resizeup',
  'resizeupdown',
  'resizewest',
  'resizewesteast',
  'screenshotselection',
  'screenshotwindow',
  'textcursor',
  'textcursorvertical',
  'zoomin',
  'zoomout',
] as const;

export type CursorType = (typeof CURSOR_TYPES)[number];
export type CursorShadowDirection = 'all' | 'bottom' | 'bottom-right' | 'top-left';

export interface CursorPresentationSettings {
  selectedCursor: CursorType;
  size: number;
  color: string;
  shadow: {
    enabled: boolean;
    blur: number;
    color: string;
    direction: CursorShadowDirection;
  };
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
}

export const createDefaultCursorPresentation = (): CursorPresentationSettings => ({
  selectedCursor: 'automatic',
  size: 45,
  color: '#000000',
  shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
  clickEffects: {
    left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
    right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
  },
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
});
