import type { Ref } from 'vue';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
export interface ScreenshotExportHost {
  document: Ref<ScreenshotDocument | null>;
  state: Ref<ScreenshotState | null>;
  busy: Ref<boolean>;
  error: Ref<string>;
  copied: Ref<boolean>;
  finishText(): void;
  save(): Promise<unknown>;
  fail(reason: unknown): void;
  copiedToast(): void;
}
