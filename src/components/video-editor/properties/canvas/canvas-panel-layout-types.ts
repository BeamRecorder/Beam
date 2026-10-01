import type { WatermarkSettings } from '../../canvas/output-canvas';
export interface CanvasPanelLayoutProps {
  still?: boolean;
  showBackground: boolean;
  activeKind: 'image' | 'video' | 'color' | 'gradient';
  blurPercent: number;
  watermark?: WatermarkSettings;
}
