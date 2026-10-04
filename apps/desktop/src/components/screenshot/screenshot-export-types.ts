import type { Ref } from 'vue';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotWorkerOptions } from './export/screenshot-export-types';
import type { ScreenshotExportReport } from './export/screenshot-export-diagnostics-types';
export interface ScreenshotExportHost {
  document: Ref<ScreenshotDocument | null>;
  state: Ref<ScreenshotState | null>;
  busy: Ref<boolean>;
  error: Ref<string>;
  copied: Ref<boolean>;
  encode(source: string, state: ScreenshotState, options?: ScreenshotWorkerOptions): Promise<ArrayBuffer>;
  finishText(): void;
  save(): Promise<unknown>;
  fail(reason: unknown): void;
  notify(report: ScreenshotExportReport, preview?: string): void;
}
