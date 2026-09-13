import type { Component } from 'vue';
import type { BlurClip } from '~/media/shared/composition-types';

export type BlurSettings = Pick<
  BlurClip,
  'mode' | 'shape' | 'strength' | 'feather' | 'tintOpacity' | 'color' | 'highlightColor'
> & {
  cornerRadius: number;
};
export type BlurPatch = Partial<BlurSettings>;
export interface Choice<T> {
  value: T;
  label: string;
  icon: Component;
}
