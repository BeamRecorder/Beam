import type { WatermarkSettings } from '@beam/engine/layout/output-canvas';
export interface CanvasPanelLayoutProps {
  still?: boolean;
  showBackground: boolean;
  activeKind: 'image' | 'video' | 'color' | 'gradient';
  blurPercent: number;
  watermark?: WatermarkSettings;
}
