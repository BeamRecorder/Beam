import type { QuickSnipDeviceMenu } from './quick-snip';

export interface QuickSnipSettingsAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuickSnipSettingsContent {
  visible: boolean;
  side: 'above' | 'below';
  anchorX: number;
  device: QuickSnipDeviceMenu | null;
}
