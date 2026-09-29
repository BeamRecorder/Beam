import type { AssetRef } from '@argui/host';
import type { IconName } from './icon';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  asset?: AssetRef;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  id?: string;
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  width?: number | '100%';
  maxWidth?: number | '100%';
  height?: number;
  compact?: boolean;
  disabled?: boolean;
  labelLayout?: 'below' | 'beside';
  contentAlign?: 'start' | 'center';
  /** Hide labels natively when each item has less than this many logical pixels. */
  labelMinimumWidth?: number;
}
