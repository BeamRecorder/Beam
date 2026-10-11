import type { ScreenshotPanel } from './screenshot-types';

export type ScreenshotGroupDisabledReason =
  | 'busy'
  | 'locked'
  | 'unsupported'
  | 'selectTwoToGroup'
  | 'selectOneMoreToGroup'
  | 'alreadyGrouped'
  | 'selectGroupToUngroup';

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
  groupDisabledReason?: ScreenshotGroupDisabledReason;
  ungroupDisabledReason?: ScreenshotGroupDisabledReason;
  canUndo: boolean;
  canRedo: boolean;
}
