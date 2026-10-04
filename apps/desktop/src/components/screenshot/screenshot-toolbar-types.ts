import type { ScreenshotPanel } from './screenshot-types';

export interface ScreenshotToolbarProps {
  disabled: boolean;
  cropping: boolean;
  canCrop: boolean;
  drawing: boolean;
  editingText: boolean;
  panel: ScreenshotPanel;
  inspectorOpen: boolean;
  canGroup?: boolean;
  canUngroup?: boolean;
  canUndo: boolean;
  canRedo: boolean;
}
