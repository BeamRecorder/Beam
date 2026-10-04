import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';

export interface ScreenshotCompositionGroupBlock {
  key: string;
  groupId?: string;
  layers: ScreenshotLayer[];
}
export interface ScreenshotCompositionGroupProps {
  groupId?: string;
  name: string;
  count: number;
  selected: boolean;
  disabled?: boolean;
  dropTarget?: boolean;
  blockKey?: string;
  rootInsertion?: 'before' | 'after';
}
