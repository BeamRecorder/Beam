import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';

export type ScreenshotDockToolId =
  | 'arrow'
  | 'text'
  | 'shape'
  | 'drawing'
  | 'image'
  | 'highlight'
  | 'blur'
  | 'zoom'
  | 'cursor'
  | 'canvas'
  | 'group'
  | 'ungroup';
export interface ScreenshotDockTool extends PopoverMenuItem {
  id: ScreenshotDockToolId;
  hint?: string;
}
