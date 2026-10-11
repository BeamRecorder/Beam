import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotClipboardSource } from './screenshot-layer-clipboard-types';
import type { Ref } from 'vue';
export interface ScreenshotEditingShortcutOptions {
  state: Ref<ScreenshotState | null>;
  selectedIds: Ref<string[]>;
  selectedId: Ref<string | null>;
  source: () => ScreenshotClipboardSource | null;
  disabled: () => boolean;
  selectMany: (ids: string[], primary?: string | null) => void;
  showSelection: (id: string | null) => void;
  remove: (id: string) => void;
  group: () => boolean;
  ungroup: () => boolean;
  copy: () => boolean | Promise<boolean>;
  cut: () => boolean | Promise<boolean>;
  paste: () => boolean;
  fail: (error: unknown) => void;
}
