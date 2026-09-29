import type { IconName } from './icon';

export interface TabOption<T extends string> { id: T; label: string; icon?: IconName }
export interface TabProps<T extends string> {
  id: string; label: string; value: T; options: readonly TabOption<T>[];
  onChange: (value: T) => void; width: number; height?: number; disabled?: boolean;
  contentAlign?: 'start' | 'center';
}
