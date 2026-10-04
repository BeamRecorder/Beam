import type { Ref } from 'vue';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { useScreenshotHistory } from '../screenshot/useScreenshotHistory';

export interface ScreenshotAuthoringOptions {
  document: Ref<ScreenshotDocument | null>;
  state: Ref<ScreenshotState | null>;
  history: ReturnType<typeof useScreenshotHistory>;
  disabled(): boolean;
  save(): Promise<unknown>;
}
