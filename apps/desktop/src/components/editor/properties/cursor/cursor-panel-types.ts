import type { CursorPackDescriptor, CursorSelection } from '@beam/engine/capture/cursor-pack';
import type {
  CursorAutoHideSettings,
  CursorClickEffects,
  CursorMotionSettings,
  CursorRippleStyle,
} from '@beam/engine/capture/cursor-settings';
import type { ShadowDirection } from '@beam/runtime/cursor/shadow-types';

export type CursorPanelProps = {
  selection: CursorSelection;
  packs: CursorPackDescriptor[];
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
  autoHide: CursorAutoHideSettings;
};

export type CursorPanelEmits = {
  'update:selection': [value: CursorSelection];
  'preview:selection': [value: CursorSelection | null];
  'update:cursorSize': [value: number];
  'update:cursorColor': [value: string];
  'update:enableShadow': [value: boolean];
  'update:shadowBlur': [value: number];
  'update:shadowColor': [value: string];
  'update:shadowDirection': [value: ShadowDirection];
  'update:clickEffects': [value: CursorClickEffects];
  'update:motion': [value: CursorMotionSettings];
  'update:autoHide': [value: CursorAutoHideSettings];
};

export type GlobalRippleStyle = Exclude<CursorRippleStyle, 'none'>;
