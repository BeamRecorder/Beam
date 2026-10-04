import type { Ref } from 'vue';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotDocument } from '~/api/types/screenshot';

export interface ScreenshotThumbnailHost {
  document: Ref<ScreenshotDocument | null>;
  state: Ref<ScreenshotState | null>;
  blocked(): boolean;
  save(): Promise<unknown>;
}
