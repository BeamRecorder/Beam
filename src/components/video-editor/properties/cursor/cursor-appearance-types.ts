import type { CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import type { ShadowDirection } from './shadow-types';

export interface CursorAppearanceProps {
  selection: CursorSelection;
  packs: CursorPackDescriptor[];
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  still?: boolean;
}
export interface CursorAppearanceEmits {
  imported: [pack: CursorPackDescriptor];
  'update:selection': [value: CursorSelection];
  'preview:selection': [value: CursorSelection | null];
  'update:cursorSize': [value: number];
  'update:cursorColor': [value: string];
  'update:enableShadow': [value: boolean];
  'update:shadowBlur': [value: number];
  'update:shadowColor': [value: string];
  'update:shadowDirection': [value: ShadowDirection];
}
