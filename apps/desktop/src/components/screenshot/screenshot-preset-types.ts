import type { Ref } from 'vue';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { BackgroundMedia } from '@beam/engine/shared/background-types';
export interface ScreenshotPresetHost {
  document: Ref<ScreenshotDocument | null>;
  state: Ref<ScreenshotState | null>;
  presets: Ref<EditorPresetDocument | null>;
  backgroundLibrary: Ref<BackgroundMedia[]>;
  busy: Ref<boolean>;
  t(key: string): string;
  fail(error: unknown): void;
}
